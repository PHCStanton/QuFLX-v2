# QuFLX v2 Implementation Quality Assessment
**Date:** 2026-01-13  
**Scope:** Backend Indicators, Chart Sync, Parameter Flow

---

## 1. Backend Technical Indicators Pipeline

**Files:** `backend/services/strategy/indicators.py`, `capabilities_v2/indicator_calculator.py`

### Functional Correctness & KB Alignment
**Grade: B+**

- **ADX (period 14):** Correctly implemented with Wilder's smoothing via EWM. Uses ATR from same period. ✅
- **CCI (period 14):** Vectorized correctly using typical price and mean deviation. The 0.015 constant is standard. ✅
- **Supertrend (7,3):** Defaults match KB. However, the fallback (non-pandas-ta) implementation uses a naive for-loop which is slow for large datasets.
- **DeMarker:** Vectorized cleanly with `.clip()` — good modern pandas. ✅
- **Schaff TC:** Correctly chains MACD → Stochastic → PF smoothing. ✅

### Robustness
**Grade: B**

**Strengths:**
- Division by zero guarded with `.replace(0, np.nan)` consistently
- `_safe_float()` handles NaN/None at serialization boundary
- pandas-ta fallbacks exist for all critical indicators

**Weaknesses:**
- **No infinity check** — if price data contains inf, calculations will propagate it silently
- **Schaff/DeMarker fill NaN with 0** — this masks missing data as "neutral" which can mislead trading signals
- SuperTrend fallback loop is O(n) with `.iloc[]` access — will be slow on 1000+ candles
- No explicit validation that `df` has monotonic timestamps

### Performance
**Grade: B-**

- Most calculations are vectorized (good)
- WMA uses `.apply()` with lambda — could use `np.convolve` for 2-3x speedup
- CCI uses `.apply()` for mean deviation — acceptable but slower than pure numpy
- The calculator spawns a **subprocess for every request** — significant overhead (~200-500ms per call on Windows)

### Maintainability
**Grade: B+**

- Clean separation: Pipeline class does math, Calculator does I/O + param mapping
- Param mapping in `indicator_calculator.py` is explicit but brittle — adding new indicators requires touching 3+ places
- Error handling logs but doesn't fail fast — returns original df on error (silent degradation)

---

## 2. Frontend Chart ↔ Oscillator Synchronization

**Files:** `ChartContainer.jsx`, `OscillatorChart.jsx`, `ChartWorkspace.jsx`

### Functional Correctness
**Grade: A-**

- Time-scale sync is **unidirectional main→oscillators** using `subscribeVisibleTimeRangeChange` ✅
- Crosshair sync works bidirectionally (main→osc via `subscribeCrosshairMove`, osc→main via callback) ✅
- Initial sync uses 100ms timeout to ensure charts are ready — pragmatic fix

### Robustness
**Grade: B**

**Strengths:**
- Cleanup is thorough — unsubscribes, clears refs, removes series on unmount
- Data validation: filters null/NaN points before setData
- ResizeObserver handles container size changes

**Weaknesses:**
- **Race condition potential:** If `mainChart` ref changes during oscillator subscription setup, stale handlers could persist
- The dependency array `[mainChart, type, params, indicatorValue, title]` in OscillatorChart's sync effects is overly broad — causes unnecessary unsubscribe/resubscribe cycles
- No error boundary — chart library exceptions could crash the entire workspace

### Performance
**Grade: B+**

- `dataRef` caching avoids re-searching on every crosshair move ✅
- `lastDataHash` prevents redundant `setData` calls ✅
- However, creating new functions in `useMemo`/`useCallback` dependencies rebuilds callbacks on every param change

### UX/Trading Impact
**Grade: B+**

- Price lines for overbought/oversold are correctly styled per indicator type
- SuperTrend color changes based on direction (nice touch)
- **Gap:** No visual feedback when oscillator data is stale vs. loading vs. error

---

## 3. Parameter Changes → Backend Sync & Streaming

**Files:** `IndicatorSettingsModal.jsx`, `ChartWorkspace.jsx`, `useTickAggregation.js`, `routes/indicators.py`

### Functional Correctness
**Grade: B+**

**Flow verified:**
1. IndicatorSettingsModal → `updateIndicator(id, {value, params})` ✅
2. `activeIndicators` state change triggers `loadIndicators` effect ✅
3. POST to `/api/v1/indicators` with params dictionary ✅
4. Backend maps frontend keys to pipeline params correctly for RSI, CCI, MACD, ADX, STC, SuperTrend, EMA, BB ✅

**Event-driven refresh:**
- `onNewCandle` callback fires when candle closes → triggers `loadIndicators` ✅
- **Additionally** 5-second interval runs during streaming (belt-and-suspenders approach)

### Robustness
**Grade: B-**

**Issues:**
- The 5-second polling runs **in addition to** onNewCandle refresh — potential for duplicate/overlapping requests
- `indicatorStatus[key] === 'loading'` check prevents overlap, but if status isn't set atomically, race is possible
- **Bollinger Bands param mismatch:** Frontend sends `stdDev`, but `indicator_calculator.py` expects `std` — **this is a bug**
- No debouncing on param changes — rapid slider adjustments would fire many requests

### Windows Compatibility
**Grade: B**

- `routes/indicators.py` has fallback for `create_subprocess_exec` → `subprocess.run` in thread ✅
- UTF-8 encoding explicitly set in env ✅
- Path handling uses `os.path` (not forward slashes) ✅

### UX Impact
**Grade: B+**

- Badge label preview in settings modal is a nice touch
- "Loading {indicator}..." overlay provides feedback
- **Gap:** No toast/notification on calculation failure — just console.error

---

## Overall Verdict

**Implementation is solid for an MVP/beta** but has several issues that would bite in production trading:

| Area | Grade | Biggest Risk |
|------|-------|--------------|
| Backend Pipeline | B | Silent NaN-fill can produce misleading signals |
| Chart Sync | B+ | Subscription churn on param changes |
| Param Flow | B | Bollinger stdDev→std mapping bug |

### Top 3 Priority Fixes

1. **[HIGH] Fix Bollinger Bands param mapping** — Frontend sends `stdDev`, backend expects `std`. This means BB with non-default std deviation silently uses default value. Quick 1-line fix in `indicator_calculator.py`.

2. **[HIGH] Remove or dedupe the 5-second polling** — With onNewCandle already triggering refresh, the interval is redundant and causes double-computation. Either remove it or add a flag `lastRefreshTime` to skip if <1s since last.

3. **[MEDIUM] Add infinity/NaN validation at pipeline entry** — Before `calculate_indicators`, add: `df = df.replace([np.inf, -np.inf], np.nan)` and log if any inf found. Prevents garbage-in-garbage-out.

### Quick Wins (Low Risk, High Impact)

- Add error boundary around `<OscillatorChart>` components to prevent full crash
- Show toast on indicator load failure instead of silent console.error
- Replace Schaff/DeMarker `.fillna(0)` with `.fillna(np.nan)` — let the frontend decide how to render missing data

---

*Assessment by: Senior Trading Platform Architect*  
*CORE_PRINCIPLES compliance: Mostly adhered. Some silent failure paths remain.*
