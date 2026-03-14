# Indicator Fixes & Optimizations Plan
**Date:** 2026-03-05  
**Author:** Team Leader (AI Audit)  
**Project:** QuFLX-v2 (applicable to future versions / forks)  
**Scope:** Full-stack indicator implementation — Backend pipeline, Gateway API, Capability runner, Frontend hooks, stores, and chart components.

---

## 1. Overview

This document captures the findings from a thorough code audit of the QuFLX-v2 indicator implementation stack. It is intended as a **living reference** for this project and as a **blueprint** for future projects that implement a similar technical-indicator pipeline architecture.

### Stack Reviewed

| Layer | Files |
|-------|-------|
| Backend Pipeline | `backend/services/strategy/indicators.py` |
| Regime Detector | `backend/services/strategy/regime_detector.py` |
| Gateway API Route | `backend/services/gateway/routes/indicators.py` |
| Capability Runner | `capabilities_v2/indicator_calculator.py` |
| Frontend Store | `gui/Dashboard/src/store/marketStore.js` |
| Indicator Trigger Hook | `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js` |
| Overlay Renderer Hook | `gui/Dashboard/src/hooks/useOverlayIndicators.js` |
| Oscillator Panel | `gui/Dashboard/src/components/OscillatorPanel.jsx` |
| Oscillator Chart | `gui/Dashboard/src/components/OscillatorChart.jsx` |
| Chart Workspace | `gui/Dashboard/src/components/ChartWorkspace.jsx` |
| Indicator Config | `gui/Dashboard/src/config/chartOptions.js` |
| History Utilities | `backend/utils/history_utils.py` |

---

## 2. Findings Summary

### Completion Status Update (as of 2026-03-14)

- ✅ Implemented: **BUG-1, BUG-2, BUG-3, INC-1, INC-2, INC-3, INC-4, OPT-1, OPT-2, MIN-1, MIN-2**
- ⏸️ Deferred by design: **OPT-3** (monitor-only recommendation; no current functional defect)
- ✅ Verification completed:
  - `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short` → **127/127 passed**
  - Import smoke check for new indicators route architecture → **Import OK**

### Severity Legend
- 🔴 **CRITICAL** — Bug that causes incorrect behavior, silent failures, or production-breaking issues
- 🟠 **INCONSISTENCY** — Misalignment between layers that causes features to silently not work
- 🟡 **OPTIMIZATION** — Performance or architecture improvement
- 🟢 **MINOR** — Code quality, documentation, or housekeeping

| ID | Severity | Title | Effort | Status |
|----|----------|-------|--------|--------|
| BUG-1 | 🔴 Critical | Full indicator recalculation on every tick | Medium | ✅ Done |
| BUG-2 | 🔴 Critical | Dead `ta` library imports in regime_detector | Low | ✅ Done |
| BUG-3 | 🔴 Critical | Deprecated pandas `'1T'` frequency alias | Low | ✅ Done |
| INC-1 | 🟠 Inconsistency | `ema_89` column not exposed to frontend | Low | ✅ Done |
| INC-2 | 🟠 Inconsistency | `indicators` request param never used for filtering | Medium | ✅ Done (contract clarified) |
| INC-3 | 🟠 Inconsistency | `bb_width` scaling ambiguity between library paths | Low | ✅ Done |
| INC-4 | 🟠 Inconsistency | S/R enhancement data silently missing from frontend | Low | ✅ Done |
| OPT-1 | 🟡 Optimization | Subprocess spawn per indicator request | High | ✅ Done (in-process + cache) |
| OPT-2 | 🟡 Optimization | Row-by-row DataFrame iteration in series extraction | Low | ✅ Done |
| OPT-3 | 🟡 Optimization | Multiple independent chart instances for oscillators | Low | ⏸️ Deferred (monitor only) |
| MIN-1 | 🟢 Minor | Silent error swallowing in indicator pipeline methods | Low | ✅ Done |
| MIN-2 | 🟢 Minor | Redundant column mapping code in regime_detector | Low | ✅ Done |

---

## 3. Detailed Findings & Fixes

---

### 🔴 BUG-1: Full Indicator Recalculation on Every Tick

**Severity:** Critical — Performance  
**Files:** `useChartWorkspaceIndicators.js`, `marketStore.js`, `gateway/routes/indicators.py`, `indicator_calculator.py`

#### Problem Description

Every time a new candle arrives (approximately every 1 second during live streaming), the `onNewCandle` callback in `useChartWorkspaceIndicators.js` calls `loadIndicators()`. This triggers:

1. HTTP POST to `/api/v1/indicators`
2. Gateway spawns a new Python **subprocess** (`runner.py indicator_calculator`)
3. Subprocess reads the entire CSV from disk
4. Full pandas DataFrame construction from CSV
5. Full `TechnicalIndicatorsPipeline.calculate_indicators()` on all 200+ candles
6. JSON serialization of all 30+ indicator series
7. stdout capture, parsing, and HTTP response

This is an **O(n) full-recalculation on every tick**. With 200 candles and 15+ active indicators, this creates:
- ~200-500ms subprocess spawn latency per call
- Disk I/O on every tick
- CPU spike every second
- Network overhead for large JSON payloads

#### Root Cause

`onNewCandle` is called by `useTickAggregation` on every completed candle aggregation. The hook does not distinguish between a **candle update** (tick within current candle) and a **candle close** (new candle started). Indicators should only be recalculated when a candle **closes**, not on every tick.

#### Fix

**Short-term (Recommended):** Add candle-close detection in `useChartWorkspaceIndicators.js`. Only trigger `loadIndicators()` when the candle timestamp changes (new candle), not when OHLC values update within the same candle.

```javascript
// useChartWorkspaceIndicators.js — onNewCandle
const lastCandleTimeRef = useRef(null);

const onNewCandle = useCallback(async (candle) => {
  if (health !== 'streaming') return;
  
  const tfRaw = String(selectedTimeframe || '').trim().toLowerCase();
  const isHistoryTimeframe = tfRaw.endsWith('m') || tfRaw.endsWith('h') || tfRaw.match(/^\d+$/);
  
  if (candle && isHistoryTimeframe) {
    await appendCandle({ asset: selectedAsset, timeframe: selectedTimeframe, candle });
  }
  
  if (!isHistoryTimeframe || !indicatorRequest.indicators.length) return;
  
  // ✅ FIX: Only recalculate when a NEW candle starts (timestamp changes)
  const candleTime = candle?.time ?? candle?.timestamp;
  if (candleTime === lastCandleTimeRef.current) return; // Same candle, skip
  lastCandleTimeRef.current = candleTime;
  
  loadIndicators({
    asset: selectedAsset,
    timeframe: selectedTimeframe,
    indicators: indicatorRequest.indicators,
    params: indicatorRequest.params,
  });
}, [health, appendCandle, selectedAsset, selectedTimeframe, indicatorRequest, loadIndicators]);
```

**Long-term (Architecture):** Move indicator calculation in-process (no subprocess). See OPT-1.

---

### 🔴 BUG-2: Dead `ta` Library Imports in `regime_detector.py`

**Severity:** Critical — Code Integrity  
**File:** `backend/services/strategy/regime_detector.py` (lines 13-16)

#### Problem Description

`regime_detector.py` imports from the `ta` library at the top of the file:

```python
from ta.trend import ADXIndicator, EMAIndicator, MACD, CCIIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.momentum import RSIIndicator, StochasticOscillator
```

These imports are **never used**. The `calculate_indicators()` function in `regime_detector.py` delegates entirely to `TechnicalIndicatorsPipeline` from `indicators.py` (which uses `pandas_ta`). The `ta` library classes are dead code.

**Impact:**
- Unnecessary dependency on a second TA library (`ta`)
- Potential version conflicts between `ta` and `pandas_ta`
- Misleading code — suggests `ta` is used when it isn't
- Import overhead on every module load

#### Fix

Remove the dead imports from `regime_detector.py`:

```python
# REMOVE these lines:
# from ta.trend import ADXIndicator, EMAIndicator, MACD, CCIIndicator
# from ta.volatility import BollingerBands, AverageTrueRange
# from ta.momentum import RSIIndicator, StochasticOscillator
```

Also verify `ta` can be removed from `requirements.txt` if it's not used elsewhere.

---

### 🔴 BUG-3: Deprecated Pandas `'1T'` Frequency Alias

**Severity:** Critical — Future Breakage  
**File:** `backend/services/strategy/indicators.py`, `resample_to_grid()` method

#### Problem Description

The `resample_to_grid()` method uses `'1T'` as the default timeframe alias:

```python
def resample_to_grid(self, df: pd.DataFrame, timeframe: str = '1T') -> pd.DataFrame:
    ...
    df_resampled = df_resampled.resample(timeframe).asfreq()
```

The `'T'` alias for minutes was **deprecated in pandas 2.2** and will be **removed in pandas 3.0**. The code even has a comment acknowledging this: *"Use 'min' as 1T is deprecated in some versions"* — but the default parameter and the call site in `calculate_indicators()` still use `'1T'`.

**Impact:** Currently produces `FutureWarning` in logs. Will **break** on pandas 3.0+.

#### Fix

```python
# indicators.py — resample_to_grid signature
def resample_to_grid(self, df: pd.DataFrame, timeframe: str = '1min') -> pd.DataFrame:

# indicators.py — calculate_indicators call site
df = self.resample_to_grid(df, timeframe='1min')
```

For multi-timeframe support, map timeframe minutes to the correct alias:
```python
def _timeframe_to_pandas_alias(self, timeframe_min: int) -> str:
    return f'{timeframe_min}min'
```

---

### 🟠 INC-1: `ema_89` Column Not Exposed to Frontend

**Severity:** Inconsistency — Missing Feature  
**File:** `capabilities_v2/indicator_calculator.py`

#### Problem Description

The `TechnicalIndicatorsPipeline` always calculates `ema_89` (the Fibonacci slow EMA used in regime detection). However, the `indicator_names` list in `indicator_calculator.py` does not include `'ema_89'`, so it is never serialized and sent to the frontend.

```python
# Current indicator_names list — ema_89 is MISSING:
indicator_names = [
    'sma_20', 'ema_16', 'wma_20',
    ...
    'ema_21', 'ema_50', 'ema_100'  # ema_89 not here
]
```

**Impact:** The EMA-89 (Fibonacci period) is a key trend indicator used in regime detection but is invisible on the chart.

#### Fix

Add `'ema_89'` to the `indicator_names` list in `indicator_calculator.py`:

```python
indicator_names = [
    'sma_20', 'ema_16', 'ema_89', 'wma_20',  # ✅ Added ema_89
    ...
]
```

Optionally, expose it as a selectable overlay in `chartOptions.js`.

---

### 🟠 INC-2: `indicators` Request Parameter Never Used for Filtering

**Severity:** Inconsistency — API Contract Confusion  
**File:** `capabilities_v2/indicator_calculator.py`

#### Problem Description

The indicator API accepts an `indicators` list parameter (e.g., `["rsi_14", "macd_histogram"]`) suggesting selective calculation. However, `indicator_calculator.py` accepts this parameter but **never uses it to filter** — it always runs the full `TechnicalIndicatorsPipeline.calculate_indicators()` which computes all 30+ indicators regardless.

```python
requested_indicators = inputs.get("indicators", [])
# ... requested_indicators is never used to filter pipeline output
pipeline = TechnicalIndicatorsPipeline(config={'indicator_params': pipeline_params})
result_df = pipeline.calculate_indicators(df)  # Always calculates everything
```

**Impact:**
- API contract is misleading — callers expect selective calculation
- Every request computes all indicators even if only 1 is needed
- Wasted CPU on unused calculations

#### Fix Options

**Option A (Simple):** Remove the `indicators` parameter from the API contract and documentation. Make it explicit that all indicators are always calculated. Update frontend to not send the `indicators` list.

**Option B (Correct):** Implement selective calculation by only running the pipeline methods needed for the requested indicators. This requires refactoring the pipeline into composable sub-pipelines.

**Recommendation:** Option A short-term, Option B as part of OPT-1 refactor.

---

### 🟠 INC-3: `bb_width` Scaling Ambiguity

**Severity:** Inconsistency — Subtle Bug Risk  
**File:** `backend/services/strategy/indicators.py`, `_calculate_trend_indicators()`

#### Problem Description

The `bb_width` column is calculated differently depending on which library is available:

**With `pandas_ta`:**
```python
df['bb_width'] = bb_data[f"BBB_{period}_{std}"] / 100
# BBB is Bandwidth in percentage (e.g., 5.2 = 5.2%), divided by 100 → 0.052
```

**Manual fallback:**
```python
bb_range = df['bb_upper'] - df['bb_lower']
df['bb_width'] = bb_range / df['bb_middle'].replace(0, np.nan)
# Raw ratio (e.g., 0.052)
```

Both produce the same numeric result (ratio form), but the intent is unclear. The regime detector uses `bb_wband < 0.04` for squeeze detection — this threshold is calibrated for ratio form. If the scaling ever changes, the squeeze detection will silently break.

#### Fix

Add explicit documentation and a unit assertion:

```python
# indicators.py — after bb_width calculation
# bb_width is always in RATIO form (not percentage).
# E.g., 0.04 = 4% bandwidth. Regime detector uses < 0.04 for squeeze detection.
assert df['bb_width'].dropna().between(0, 1).all(), "bb_width must be in ratio form [0,1]"
```

---

### 🟠 INC-4: S/R Enhancement Data Silently Missing from Frontend

**Severity:** Inconsistency — Silent Feature Breakage  
**Files:** `capabilities_v2/indicator_calculator.py`, `gui/Dashboard/src/hooks/useOverlayIndicators.js`

#### Problem Description

The backend `TechnicalIndicatorsPipeline._calculate_support_resistance()` computes a rich set of S/R enhancement columns (Phases 1-5):

| Column | Phase | Purpose |
|--------|-------|---------|
| `resistance_zone_upper` | 4 | Zone band top |
| `resistance_zone_lower` | 4 | Zone band bottom |
| `support_zone_upper` | 4 | Zone band top |
| `support_zone_lower` | 4 | Zone band bottom |
| `resistance_freshness` | 5 | `'fresh'` / `'tested'` / `'stale'` |
| `support_freshness` | 5 | `'fresh'` / `'tested'` / `'stale'` |
| `sr_flip` | 3 | Boolean — level just broken |
| `sr_flip_price` | 3 | Price of the flipped level |
| `dist_to_resistance` | 1 | % distance from close to resistance |
| `dist_to_support` | 1 | % distance from close to support |
| `resistance_touch_count` | 2 | Times price tested resistance |
| `support_touch_count` | 2 | Times price tested support |

**None of these are in the `indicator_names` list** in `indicator_calculator.py`. The frontend `useOverlayIndicators.js` reads these keys from `seriesForKey` but always gets empty arrays `[]`.

**Impact:** The following S/R features are **completely non-functional** despite being fully implemented in the backend:
- Zone band visualization (Phase 4)
- Freshness-based line styling (Phase 5)
- S/R flip highlighting (Phase 3)
- Touch count boost in regime scoring (Phase 2)

#### Fix

Add all S/R enhancement columns to `indicator_names` in `indicator_calculator.py`:

```python
indicator_names = [
    # ... existing indicators ...
    'support_level', 'resistance_level',
    # ✅ ADD: S/R Enhancement columns (Phases 1-5)
    'resistance_zone_upper', 'resistance_zone_lower',
    'support_zone_upper', 'support_zone_lower',
    'resistance_freshness', 'support_freshness',
    'sr_flip', 'sr_flip_price',
    'dist_to_resistance', 'dist_to_support',
    'resistance_touch_count', 'support_touch_count',
]
```

Handle special types in `extract_series` for boolean and string columns:

```python
# For boolean columns (sr_flip)
if col_name in ('sr_flip',):
    valid = result_df[['timestamp', col_name]].dropna()
    return [
        {"time": int(float(row['timestamp'])), "value": bool(row[col_name])}
        for _, row in valid.iterrows()
    ]

# For string columns (freshness)
if col_name in ('resistance_freshness', 'support_freshness', 'supertrend_direction'):
    valid = result_df[['timestamp', col_name]].dropna()
    return [
        {"time": int(float(row['timestamp'])), "value": str(row[col_name])}
        for _, row in valid.iterrows()
    ]
```

---

### 🟡 OPT-1: Subprocess Spawn Per Indicator Request

**Severity:** Optimization — Architecture  
**Files:** `backend/services/gateway/routes/indicators.py`, `capabilities_v2/indicator_calculator.py`

#### Problem Description

The indicator endpoint spawns a new Python subprocess for every request via `asyncio.create_subprocess_exec()`. This architecture was likely chosen to isolate the calculation from the gateway process, but it introduces significant overhead:

- **Process creation:** ~50-200ms on Windows
- **Disk I/O:** CSV read on every request
- **Memory:** Full DataFrame allocation per request
- **Serialization:** JSON encode/decode of all series data via stdout

#### Recommended Refactor

Replace subprocess with in-process async calculation:

```python
# gateway/routes/indicators.py — refactored
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
from backend.utils.history_utils import get_recent_history_file
import pandas as pd

@router.post("")
async def calculate_indicators(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    # ... validation ...
    
    csv_path = get_recent_history_file(asset, timeframe_min)
    if not csv_path:
        raise HTTPException(status_code=404, detail=f"History not found for {asset}")
    
    # Run CPU-bound calculation in thread pool (non-blocking)
    def _calculate():
        df = pd.read_csv(csv_path)
        df.columns = [c.lower() for c in df.columns]
        pipeline = TechnicalIndicatorsPipeline(config={'indicator_params': params})
        result_df = pipeline.calculate_indicators(df)
        return _extract_all_series(result_df)
    
    series = await asyncio.to_thread(_calculate)
    return {"ok": True, "series": series, "asset": asset, "timeframe": timeframe}
```

**Expected improvement:** ~500ms → ~50ms per request (10x speedup).

**Additional optimization:** Cache the DataFrame in memory per asset (invalidate on new candle append):

```python
_df_cache: Dict[str, Tuple[str, pd.DataFrame]] = {}  # {asset: (csv_path, df)}

def _get_cached_df(asset, csv_path):
    cached = _df_cache.get(asset)
    if cached and cached[0] == str(csv_path):
        return cached[1]
    df = pd.read_csv(csv_path)
    _df_cache[asset] = (str(csv_path), df)
    return df
```

---

### 🟡 OPT-2: Row-by-Row DataFrame Iteration in Series Extraction

**Severity:** Optimization — Performance  
**File:** `capabilities_v2/indicator_calculator.py`, `extract_series()` function

#### Problem Description

```python
def extract_series(col_name):
    valid = result_df[['timestamp', col_name]].dropna()
    return [
        {"time": int(float(row['timestamp'])), "value": float(row[col_name])}
        for _, row in valid.iterrows()  # ❌ Slow: Python-level row iteration
    ]
```

`iterrows()` is the slowest way to iterate a pandas DataFrame. With 200 candles × 30 indicators = 6,000 iterations, each creating a Python dict.

#### Fix

Use vectorized numpy operations:

```python
def extract_series(col_name):
    if col_name not in result_df.columns:
        return []
    valid = result_df[['timestamp', col_name]].dropna()
    if valid.empty:
        return []
    times = valid['timestamp'].values.astype(float).astype(int)
    values = valid[col_name].values.astype(float)
    return [{"time": int(t), "value": float(v)} for t, v in zip(times, values)]
```

**Expected improvement:** ~5-10x faster series extraction.

---

### 🟡 OPT-3: Multiple Independent Chart Instances for Oscillators

**Severity:** Optimization — Resource Usage  
**File:** `gui/Dashboard/src/components/OscillatorChart.jsx`

#### Problem Description

Each oscillator indicator creates its own `createChart()` instance. With 4-5 oscillators active, the browser maintains 5-6 separate lightweight-charts instances simultaneously, each with its own canvas, resize observer, and time-scale sync subscription.

#### Current State

This is **acceptable** for the current use case — lightweight-charts is efficient and 5-6 instances is manageable. The time-scale sync via `subscribeVisibleTimeRangeChange` works correctly.

#### Future Consideration

If performance becomes an issue with many oscillators, consider a shared chart approach where all oscillators share a single chart instance with multiple price scales. This would require significant refactoring of `OscillatorChart.jsx` and `OscillatorPanel.jsx`.

**Recommendation:** Monitor performance. Only refactor if users report lag with 5+ oscillators active.

---

### 🟢 MIN-1: Silent Error Swallowing in Indicator Pipeline

**Severity:** Minor — Code Quality (Core Principle #8 Violation)  
**File:** `backend/services/strategy/indicators.py`

#### Problem Description

Each `_calculate_*` method has a broad `try/except` that logs the error but returns the DataFrame unchanged — silently continuing with missing indicator columns:

```python
def _calculate_trend_indicators(self, df):
    try:
        # ... calculations ...
    except Exception as e:
        self.logger.error(f"Error calculating trend indicators: {str(e)}")
    return df  # ❌ Returns df with missing columns — silent failure
```

This violates **Core Principle #8: Zero Silent Failures**.

#### Fix

At minimum, ensure expected columns are set to `np.nan` in the except block:

```python
def _calculate_trend_indicators(self, df):
    try:
        # ... calculations ...
    except Exception as e:
        self.logger.error(f"Error calculating trend indicators: {str(e)}", exc_info=True)
        # ✅ Explicitly set expected columns to NaN so downstream code knows they failed
        for col in ['sma_20', 'ema_16', 'ema_89', 'wma_20', 'macd', 'macd_signal', 
                    'macd_histogram', 'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_percent']:
            if col not in df.columns:
                df[col] = np.nan
    return df
```

Consider adding a `warnings` list to the pipeline result so the frontend can display which indicators failed to calculate.

---

### 🟢 MIN-2: Redundant Column Mapping in `regime_detector.py`

**Severity:** Minor — Code Quality  
**File:** `backend/services/strategy/regime_detector.py`

#### Problem Description

The column mapping logic (Pipeline B names → regime detector names) is duplicated between `calculate_indicators()` and `_ensure_regime_columns()`. The `COLUMN_MAP` dict in `_ensure_regime_columns` is the canonical version, but `calculate_indicators()` has its own inline mapping.

#### Fix

Consolidate: `calculate_indicators()` should call `_ensure_regime_columns()` after running the pipeline, rather than duplicating the mapping logic.

```python
def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
    
    if 'adx' not in df.columns or 'ema_16' not in df.columns:
        pipeline = TechnicalIndicatorsPipeline()
        result_df = pipeline.calculate_indicators(df)
    else:
        result_df = df.copy()
    
    # ✅ Delegate all mapping to _ensure_regime_columns (single source of truth)
    return _ensure_regime_columns(result_df)
```

---

## 4. Implementation Priority & Sequence

### Implementation Outcome (14-03-2026)

- **Phase 1:** ✅ Completed
- **Phase 2:** ✅ Completed
- **Phase 3:** ✅ Completed (OPT-1 implemented in `backend/services/gateway/routes/indicators.py`)
- **Remaining recommendation:** OPT-3 remains intentionally deferred unless oscillator performance issues are reported.

### Phase 1 — Quick Wins (< 1 hour total)

| ID | Task | File | Time |
|----|------|------|------|
| BUG-3 | Fix deprecated `'1T'` → `'1min'` | `indicators.py` | 5 min |
| BUG-2 | Remove dead `ta` imports | `regime_detector.py` | 5 min |
| INC-4 | Add S/R columns to `indicator_names` | `indicator_calculator.py` | 15 min |
| INC-1 | Add `ema_89` to `indicator_names` | `indicator_calculator.py` | 5 min |
| OPT-2 | Vectorize `extract_series` | `indicator_calculator.py` | 10 min |
| MIN-2 | Consolidate column mapping | `regime_detector.py` | 10 min |

**Status:** ✅ Completed

### Phase 2 — Medium Fixes (1-2 hours)

| ID | Task | File | Time |
|----|------|------|------|
| BUG-1 | Add candle-close detection to `onNewCandle` | `useChartWorkspaceIndicators.js` | 30 min |
| INC-3 | Add `bb_width` unit documentation | `indicators.py` | 10 min |
| MIN-1 | Explicit NaN assignment in except blocks | `indicators.py` | 20 min |
| INC-2 | Clarify/remove `indicators` filter param | `indicator_calculator.py` | 20 min |

**Status:** ✅ Completed

### Phase 3 — Architecture Refactor (2-4 hours)

| ID | Task | Files | Time |
|----|------|-------|------|
| OPT-1 | In-process indicator calculation (no subprocess) | `gateway/routes/indicators.py`, `indicator_calculator.py` | 3-4 hrs |

**Status:** ✅ Completed (implemented in `backend/services/gateway/routes/indicators.py`)

---

## 5. Testing Checklist

After implementing each fix, verify:

### BUG-1 Fix Verification
- [ ] Add 5 oscillators, start streaming
- [ ] Confirm indicator API is NOT called on every tick (check Network tab)
- [ ] Confirm indicators DO update when a new candle closes
- [ ] Confirm indicators load correctly on initial asset selection

### BUG-3 Fix Verification
- [ ] Run `python -W error -c "from backend.services.strategy.indicators import TechnicalIndicatorsPipeline; p = TechnicalIndicatorsPipeline(); print('OK')"` — no FutureWarning

### INC-4 Fix Verification
- [ ] Enable Support & Resistance overlay
- [ ] Verify zone bands appear on chart (colored dotted lines around S/R levels)
- [ ] Verify freshness styling changes line style (solid/dashed/dotted)
- [ ] Verify S/R flip highlights in orange when a level is broken

### OPT-1 Fix Verification
- [ ] Measure indicator load time before and after (target: < 100ms)
- [x] Verify all indicators still calculate correctly
- [x] Verify no blocking of the gateway event loop

### Verification Notes (executed)
- [x] `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short` → **127/127 passed**
- [x] Import smoke check: `from backend.services.gateway.routes.indicators import router, _invalidate_cache` → **Import OK**

---

## 6. Architecture Principles for Future Projects

Based on this audit, the following principles should be applied to any future project with a similar indicator pipeline:

### 6.1 Indicator Calculation Architecture

```
✅ DO:
- Calculate indicators in-process using asyncio.to_thread() for CPU-bound work
- Cache DataFrames in memory per asset (invalidate on new data)
- Use vectorized numpy/pandas operations for series extraction
- Only recalculate on candle close, not on every tick

❌ DON'T:
- Spawn subprocesses for indicator calculation
- Read CSV from disk on every indicator request
- Use iterrows() for series extraction
- Recalculate all indicators on every streaming tick
```

### 6.2 Indicator Data Contract

```
✅ DO:
- Define a single canonical list of output series keys
- Expose ALL calculated columns to the frontend (don't silently omit)
- Use consistent naming: snake_case for all indicator keys
- Document the unit/scale of each indicator (ratio vs percentage vs raw)

❌ DON'T:
- Accept filter parameters you don't implement
- Use two different TA libraries for the same indicators
- Have different column names between the pipeline and the API output
```

### 6.3 Frontend Indicator Rendering

```
✅ DO:
- Use hash-based change detection to avoid unnecessary setData() calls
- Clean up chart series when indicators are removed
- Handle missing data gracefully (empty arrays, not null/undefined)
- Sync oscillator time scales with the main chart

❌ DON'T:
- Call setData() on every render cycle
- Leave orphaned chart series when indicators are toggled off
- Assume all indicator data keys exist in the series object
```

### 6.4 Error Handling

```
✅ DO:
- Set expected columns to np.nan in except blocks (not silent skip)
- Log errors with exc_info=True for full stack traces
- Return structured error responses from API endpoints
- Show user-friendly error messages in the UI

❌ DON'T:
- Return the original DataFrame unchanged after a calculation error
- Use empty catch blocks
- Let indicator failures crash the entire pipeline
```

---

## 7. File Reference Map

```
QuFLX-v2 Indicator Stack
│
├── Backend
│   ├── backend/services/strategy/indicators.py          ← Core pipeline
│   ├── backend/services/strategy/regime_detector.py     ← Regime detection (uses pipeline)
│   ├── backend/services/gateway/routes/indicators.py    ← HTTP endpoint (in-process pipeline + asyncio.to_thread + _df_cache)
│   ├── capabilities_v2/indicator_calculator.py          ← Subprocess entry point
│   └── backend/utils/history_utils.py                   ← CSV file management
│
└── Frontend
    ├── gui/Dashboard/src/config/chartOptions.js          ← Indicator definitions
    ├── gui/Dashboard/src/store/marketStore.js            ← State + loadIndicators()
    ├── gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js  ← Trigger logic
    ├── gui/Dashboard/src/hooks/useOverlayIndicators.js   ← Overlay rendering
    ├── gui/Dashboard/src/components/OscillatorPanel.jsx  ← Oscillator container
    ├── gui/Dashboard/src/components/OscillatorChart.jsx  ← Oscillator chart instance
    └── gui/Dashboard/src/components/ChartWorkspace.jsx   ← Main chart orchestrator
```

---

*Document generated by Team Leader AI Audit — QuFLX-v2 Platform*  
*Applicable to: QuFLX-v2, QuFLX-v3, and any future projects with similar indicator pipeline architecture*
