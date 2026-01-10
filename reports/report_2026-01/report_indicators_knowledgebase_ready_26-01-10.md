# Indicator Implementation Assessment Report
**Date:** 2026-01-10  
**Status:** ⚠️ CRITICAL GAPS IDENTIFIED – Action Required  
**Severity:** HIGH  
**Reference:** Knowledge Base Confluence Guide & CORE_PRINCIPLES.md

---

## 1. Executive Summary

This report assesses the QuFLX v2 indicator implementation against the requirements specified in the Knowledge Base document (`docs/KnowledgeBase1.md`). The assessment reveals **critical gaps** that must be addressed before the indicator pipeline can be considered production-ready.

### Key Findings:

| Category | Status | Count |
|----------|--------|-------|
| ✅ Indicators Implemented & Aligned | GREEN | 8 |
| ⚠️ Indicators with Issues | YELLOW | 3 |
| ❌ Missing Critical Indicators | RED | 1 |
| 🔧 Performance Issues | YELLOW | 3 |

---

## 2. Knowledge Base Indicator Requirements

The Knowledge Base specifies these **core indicators** for 1-minute timeframe trading:

| Indicator | KB Parameters | Purpose | Priority |
|-----------|--------------|---------|----------|
| **EMA-16** | Period: 16 | Primary trend filter, dynamic S/R | Core |
| **EMA-165** | Period: 165 | Major trend filter (higher TF bias) | Core |
| **Supertrend** | Period: 7, Multiplier: 3 | Trailing stop + trend direction | Core |
| **ADX** | Period: 14 | Trend strength (not direction) | **CRITICAL** |
| **RSI** | Period: 14 | Overbought/oversold + divergence | Core |
| **Bollinger Bands** | Period: 20, StdDev: 2 | Range detection + breakout/squeeze | Core |
| **MACD** | Fast: 12, Slow: 26, Signal: 9 | Momentum shifts + divergence | Core |
| **CCI** | Period: 14 | Overbought/oversold + momentum | Secondary |
| **ATR** | Period: 14 | Volatility filter + volume proxy | Core |
| **Stochastic** | K: 14, D: 3, Smooth: 3 | Overbought/oversold crossovers | Secondary |

---

## 3. Current Implementation Analysis

### 3.1 File: `backend/services/strategy/indicators.py`

| Indicator | Implemented | Parameters Match KB | Status | Notes |
|-----------|-------------|---------------------|--------|-------|
| EMA-16 | ✅ Yes | ✅ Period: 16 | GREEN | Fully aligned |
| EMA-165 | ✅ Yes | ✅ Period: 165 | GREEN | Fully aligned |
| Supertrend | ✅ Yes | ⚠️ Period: 10, Mult: 3.0 | YELLOW | KB recommends (7, 3) |
| **ADX** | ❌ **NO** | N/A | **RED** | **NOT IMPLEMENTED** |
| RSI-14 | ✅ Yes | ✅ Period: 14 | GREEN | Fully aligned |
| RSI-21 | ✅ Yes | ➕ Extra | GREEN | Additional, not in KB |
| Bollinger Bands | ✅ Yes | ✅ Period: 20, StdDev: 2 | GREEN | Fully aligned |
| MACD | ✅ Yes | ✅ Fast: 12, Slow: 26, Signal: 9 | GREEN | Fully aligned |
| CCI | ⚠️ Buggy | ⚠️ Period: 20 (KB says 14) | **RED** | See CCI Bug Analysis |
| ATR-14 | ✅ Yes | ✅ Period: 14 | GREEN | Fully aligned |
| Stochastic | ✅ Yes | ✅ K: 14, D: 3 | GREEN | Aligned |
| Williams %R | ✅ Yes | ✅ Period: 14 | GREEN | Additional |
| SMA-20 | ✅ Yes | N/A | GREEN | Additional |
| WMA-20 | ✅ Yes | N/A | GREEN | Additional |
| Schaff TC | ✅ Yes | N/A | YELLOW | Performance issue |
| DeMarker | ✅ Yes | N/A | YELLOW | Performance issue |

---

## 4. Critical Issues

### 4.1 ❌ ADX Indicator Missing (CRITICAL)

**Severity:** CRITICAL  
**Violates:** CORE_PRINCIPLES #1 (Functional Simplicity) – incomplete feature set  
**Impact:** Blocks 3 of 5 market regime strategies from Knowledge Base

The ADX (Average Directional Index) is prominently featured in the Knowledge Base as **essential** for:

1. **Strong Momentum Trending** → ADX > 30–35 and rising
2. **Breakout Conditions** → ADX > 25 and rising
3. **Ranging/Sideways Detection** → ADX < 20

Without ADX, the system cannot properly:
- Distinguish trending vs. ranging markets
- Confirm breakout strength
- Filter continuation trades

**Required Implementation:**

```python
def _calculate_adx(self, df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate ADX (Average Directional Index).
    ADX measures trend strength on a 0-100 scale.
    - ADX > 25: Trending market
    - ADX > 40: Strong trend
    - ADX < 20: Ranging/sideways
    """
    try:
        period = self.params.get('adx_period', 14)
        
        # Calculate +DM and -DM
        high_diff = df['high'].diff()
        low_diff = -df['low'].diff()
        
        plus_dm = high_diff.where((high_diff > low_diff) & (high_diff > 0), 0.0)
        minus_dm = low_diff.where((low_diff > high_diff) & (low_diff > 0), 0.0)
        
        # Calculate ATR if not already present
        if 'atr_14' not in df.columns:
            df = self._calculate_volatility_indicators(df)
        
        atr = df['atr_14']
        
        # Smoothed +DI and -DI
        plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
        minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)
        
        # DX and ADX
        dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan))
        df['adx'] = dx.ewm(span=period, adjust=False).mean()
        df['plus_di'] = plus_di
        df['minus_di'] = minus_di
        
    except Exception as e:
        self.logger.error(f"Error calculating ADX: {str(e)}")
        df['adx'] = np.nan
    
    return df
```

---

### 4.2 ⚠️ CCI Calculation Bug (HIGH)

**Severity:** HIGH  
**Violates:** CORE_PRINCIPLES #1 (Functional Simplicity), #9 (Fail Fast)  
**Reference:** `v2_Dev_Docs/FIX_CCI_TASK.txt`

**Current Issues:**
1. **NaN Propagation** – `mean_dev` starts as NaN for indices 0 to `period-2`
2. **Division by Zero** – Checks `!= 0` but doesn't check `pd.isna()`
3. **O(n²) Performance** – Double nested loop is extremely slow for large datasets
4. **Wrong Period** – Uses period 20, but KB specifies period 14

**Current Buggy Code (lines ~456-475):**
```python
def _calculate_cci(self, df: pd.DataFrame) -> pd.DataFrame:
    try:
        period = self.params['cci_period']  # 20 (should be 14)
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        sma_tp = typical_price.rolling(window=period).mean()
        
        # ❌ PROBLEM: O(n²) double nested loop
        mean_dev = pd.Series(index=df.index, dtype=float)
        for i in range(period - 1, len(df)):
            deviations = []
            for j in range(i - period + 1, i + 1):
                deviations.append(abs(typical_price.iloc[j] - sma_tp.iloc[i]))
            mean_dev.iloc[i] = np.mean(deviations)
        
        cci = pd.Series(index=df.index, dtype=float)
        for i in range(len(df)):
            if mean_dev.iloc[i] != 0:  # ❌ Doesn't check for NaN
                cci.iloc[i] = (typical_price.iloc[i] - sma_tp.iloc[i]) / (0.015 * mean_dev.iloc[i])
            else:
                cci.iloc[i] = 0
        
        df['cci'] = cci
```

**Recommended Fix (Vectorized):**
```python
def _calculate_cci(self, df: pd.DataFrame) -> pd.DataFrame:
    try:
        period = self.params.get('cci_period', 14)  # KB specifies 14
        
        # 1. Calculate typical price
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        
        # 2. SMA of typical price
        sma_tp = typical_price.rolling(window=period).mean()
        
        # 3. Mean deviation (vectorized - O(n) instead of O(n²))
        mean_dev = typical_price.rolling(window=period).apply(
            lambda x: np.mean(np.abs(x - x.mean())), raw=True
        )
        
        # 4. CCI with safe division (handle NaN and zero)
        cci = (typical_price - sma_tp) / (0.015 * mean_dev.replace(0, np.nan))
        
        df['cci'] = cci
        
    except Exception as e:
        self.logger.error(f"Error calculating CCI: {str(e)}")
        df['cci'] = np.nan  # Explicit NaN, not None
    
    return df
```

---

### 4.3 ⚠️ SuperTrend Parameter Mismatch (MEDIUM)

**Current:** Period: 10, Multiplier: 3.0  
**Knowledge Base:** Period: 7, Multiplier: 3

**Impact:** Slightly slower signal generation, but functionally correct.

**Fix:** Update default in `self.params`:
```python
'supertrend_period': 7,  # Was 10
'supertrend_multiplier': 3.0,
```

---

### 4.4 ⚠️ Performance Issues in DeMarker & Schaff TC (LOW)

Both `_calculate_demarker()` and `_calculate_schaff_trend_cycle()` use explicit for-loops that could be vectorized for better performance.

**Current Pattern (problematic):**
```python
for i in range(1, len(df)):
    if df['high'].iloc[i] > df['high'].iloc[i-1]:
        demax.iloc[i] = ...
```

**Recommended Pattern (vectorized):**
```python
demax = (df['high'].diff()).clip(lower=0)
demin = (-df['low'].diff()).clip(lower=0)
```

---

## 5. Capability & Pipeline Status

### 5.1 CapResult Contract ✅ FIXED

The `CapResult` dataclass now includes `error_code` field:
```python
@dataclass
class CapResult:
    ok: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    error_code: Optional[str] = None  # ✅ Present
    artifacts: Tuple[str, ...] = tuple()
```

### 5.2 Runner Serialization ✅ FIXED

`runner.py` now correctly serializes `error_code`:
```python
output = {
    "ok": result.ok,
    "data": result.data,
    "error": result.error,
    "error_code": result.error_code,  # ✅ Included
    "artifacts": result.artifacts
}
```

### 5.3 Indicator Calculator ✅ OK

The `indicator_calculator.py` capability:
- Correctly sets `requires_browser = False`
- Uses `CapResult.success()` and `CapResult.fail()` helpers
- Extracts series from all available indicators

---

## 6. CORE_PRINCIPLES Compliance Check

| Principle | Status | Notes |
|-----------|--------|-------|
| #1 Functional Simplicity | ⚠️ | ADX missing → incomplete feature set |
| #2 Sequential Logic | ✅ | Pipeline flows correctly |
| #3 Incremental Testing | ⚠️ | Need tests for ADX and fixed CCI |
| #4 Zero Assumptions | ✅ | Column validation present |
| #5 Code Integrity | ⚠️ | CCI bug affects data quality |
| #6 Separation of Concerns | ✅ | Pipeline, Calculator, Runner are separate |
| #7 Stop Patching Rule | ✅ | CCI fix is first attempt, not cascade |
| #8 Zero Silent Failures | ⚠️ | CCI can produce misleading zeros |
| #9 Fail Fast | ⚠️ | CCI doesn't validate NaN properly |

---

## 7. Action Plan

### Phase 1: Critical Fixes (Immediate – 1 hour)

| Priority | Task | Owner | Effort | CORE_PRINCIPLE |
|----------|------|-------|--------|----------------|
| **P0** | Implement ADX indicator | @Coder | 30 min | #1 Simplicity |
| **P0** | Fix CCI calculation (vectorized, period 14) | @Coder | 15 min | #1, #9 Fail Fast |
| **P0** | Update CCI default period to 14 | @Coder | 5 min | #4 Zero Assumptions |
| **P0** | Add ADX to `indicator_calculator.py` series list | @Coder | 5 min | #6 Separation |

### Phase 2: Alignment Fixes (Same Day – 30 min)

| Priority | Task | Owner | Effort |
|----------|------|-------|--------|
| P1 | Update SuperTrend default: period 7 | @Coder | 5 min |
| P1 | Add `adx_period: 14` to params | @Coder | 2 min |
| P1 | Update IndicatorSet dataclass for ADX | @Coder | 5 min |
| P1 | Verify ADX/CCI in frontend indicator list | @Frontend | 10 min |

### Phase 3: Performance Optimization (Next Sprint)

| Priority | Task | Owner | Effort |
|----------|------|-------|--------|
| P2 | Vectorize DeMarker calculation | @Optimizer | 15 min |
| P2 | Vectorize Schaff Trend Cycle | @Optimizer | 15 min |
| P2 | Add unit tests for all indicators | @Tester | 2 hours |

---

## 8. Test Verification Commands

After implementing fixes, run these tests:

```powershell
# 1. Syntax check
python -m py_compile backend/services/strategy/indicators.py

# 2. Direct indicator test (requires history CSV)
python -c "
import pandas as pd
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline

# Load test data
df = pd.read_csv('data/data_output/history/AUDUSDOTC/AUDUSDOTC_otc_1m_2026_01_07_19_03_46.csv')
df.columns = [col.lower() for col in df.columns]

# Calculate
pipeline = TechnicalIndicatorsPipeline()
result = pipeline.calculate_indicators(df)

# Verify new indicators
print('ADX present:', 'adx' in result.columns)
print('CCI present:', 'cci' in result.columns)
print('ADX sample:', result['adx'].dropna().tail(5).tolist())
print('CCI sample:', result['cci'].dropna().tail(5).tolist())
"

# 3. Capability runner test
python capabilities_v2/runner.py indicator_calculator --inputs '{\"csv_path\": \"data/data_output/history/AUDUSDOTC/AUDUSDOTC_otc_1m_2026_01_07_19_03_46.csv\", \"asset\": \"AUDUSDOTC\", \"timeframe\": 1}'
```

---

## 9. Summary

### What's Working ✅
- EMA-16, EMA-165, RSI-14, Bollinger Bands, MACD, ATR-14, Stochastic
- CapResult error_code propagation
- Runner capability mapping
- Indicator calculator with `requires_browser = False`

### What's Broken ❌
- **ADX: Not implemented** (blocks regime detection)
- **CCI: Buggy + wrong period** (O(n²), NaN issues, uses 20 instead of 14)

### What Needs Tuning ⚠️
- SuperTrend period: 10 → 7
- CCI period: 20 → 14

### Estimated Total Fix Time
- **Critical (P0):** 1 hour
- **Alignment (P1):** 30 minutes
- **Optimization (P2):** 2-3 hours

---

## 10. Conclusion

The indicator pipeline is **structurally sound** but has **critical functional gaps**:

1. **ADX is missing** – This is the #1 blocker for Knowledge Base alignment. Without ADX, the system cannot implement the recommended market regime detection strategies.

2. **CCI is buggy** – The current implementation has performance and correctness issues that will produce unreliable signals.

Both issues are **fixable within 1-2 hours** with targeted changes. No architectural rewrite is needed (CORE_PRINCIPLES #7 does NOT trigger).

**Next Step:** Implement ADX and fix CCI in `backend/services/strategy/indicators.py`, then update `indicator_calculator.py` to include ADX in the output series.

---

---

## 11. Frontend Chart & Indicator Synchronization Assessment

**Added:** 2026-01-10 (Evening Session)  
**Reference:** Perplexity AI Research on TradingView Lightweight Charts  
**Severity:** MEDIUM  
**Status:** ⚠️ PARTIAL IMPLEMENTATION – Enhancements Recommended

---

### 11.1 Context: TradingView Lightweight Charts Sync Limitation

TradingView's Lightweight Charts library creates **independent chart instances** that do not automatically lock or sync with a main price chart. This is by design:

- Time scales, crosshairs, and zooming remain unlinked by default
- Manual code is required to enable synchronization via:
  - `subscribeVisibleLogicalRangeChange` for time scale syncing
  - `subscribeCrosshairMove` for crosshair alignment

**Source:** Perplexity AI research confirmed this behavior and recommended manual sync implementation.

---

### 11.2 Current Implementation Status

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **Main Chart** | `ChartContainer.jsx` | ✅ Implemented | Candlestick chart with resize observer |
| **Oscillator Chart** | `OscillatorChart.jsx` | ✅ Implemented | Separate chart instances per indicator |
| **Time Scale Sync** | `OscillatorChart.jsx` L79-112 | ✅ Implemented | Unidirectional: main → oscillator |
| **Crosshair Sync** | N/A | ❌ Missing | No coordinated hover display |
| **Screenshot Capture** | `ChartWorkspace.jsx` L213-220 | ⚠️ Partial | Main chart only, no oscillators |
| **Price Scale in Screenshot** | N/A | ❌ Missing | Y-axis values not captured |
| **Sync Toggle Button** | N/A | ❌ Missing | No on/off control |
| **Bidirectional Sync** | N/A | ❌ Not Implemented | Oscillator scroll doesn't update main chart |

---

### 11.3 Current Sync Implementation (Working)

The existing sync code in `OscillatorChart.jsx` follows best practices:

```javascript
// Lines 79-112
const mainTimeScale = mainChart.timeScale();
const oscTimeScale = chartRef.current.timeScale();

const sync = (range) => {
  if (!range || range.from == null || range.to == null) return;
  try {
    oscTimeScale.setVisibleRange(range);
  } catch (err) {
    console.error('Failed to sync oscillator time scale', err);
  }
};

mainTimeScale.subscribeVisibleTimeRangeChange(sync);

// Initial sync trigger with 100ms delay
setTimeout(() => {
  sync(mainTimeScale.getVisibleRange());
}, 100);
```

**✅ This matches the Perplexity-recommended pattern.** Main chart drives the visible range, oscillators follow.

---

### 11.4 Gap Analysis

#### Gap 1: Crosshair Sync Missing
**Impact:** MEDIUM (important for AI visual analysis)  
**Status:** ❌ NOT IMPLEMENTED

When hovering over the main chart, oscillators don't show a synchronized crosshair at the same time position.

**Required Implementation:**
```javascript
mainChart.subscribeCrosshairMove((param) => {
  if (!chartRef.current || !seriesRef.current) return;
  if (param.time) {
    chartRef.current.setCrosshairPosition(
      param.seriesData?.get(mainSeries)?.close ?? 0,
      param.time,
      seriesRef.current
    );
  } else {
    chartRef.current.clearCrosshairPosition();
  }
});
```

#### Gap 2: Screenshot Capture Incomplete
**Impact:** HIGH (blocks AI visual analysis)  
**Status:** ⚠️ PARTIAL

Current `captureChart()` only captures the main chart canvas:
```javascript
// ChartWorkspace.jsx L213-220
const captureChart = () => {
  const container = document.getElementById('quflx-chart-screenshot-root');
  const canvas = container.querySelector('canvas');
  return canvas.toDataURL('image/png');
};
```

**Issues:**
1. Oscillator charts NOT included in screenshot
2. Price scale (Y-axis values) NOT visible in capture
3. Drawing objects may not align correctly with cursor position

**Required:** Composite screenshot that includes:
- Main candlestick chart with price scale
- All active oscillator panels
- Drawing annotations (if any)

#### Gap 3: Drawing Object Cursor Alignment
**Impact:** MEDIUM  
**Status:** ⚠️ KNOWN ISSUE

Drawing objects (horizontal lines, zones, labels) may not align correctly with cursor position. This requires investigation of:
- Coordinate transformation between screen and chart space
- Canvas offset calculations
- Price scale mapping accuracy

#### Gap 4: Bidirectional Sync (Optional)
**Impact:** LOW  
**Status:** ❌ Not Implemented (by design)

Currently sync is unidirectional (main → oscillator). If scrolling in oscillator pane, main chart doesn't follow.

**Note:** This is intentional to avoid feedback loops. Bidirectional sync adds complexity with marginal benefit.

---

### 11.5 CORE_PRINCIPLES Compliance (Frontend)

| Principle | Status | Notes |
|-----------|--------|-------|
| #1 Functional Simplicity | ✅ | Current sync is minimal and effective |
| #2 Sequential Logic | ✅ | Clean effect chain: mount → subscribe → sync → cleanup |
| #3 Incremental Testing | ⚠️ | No unit tests for sync logic |
| #4 Zero Assumptions | ⚠️ | Range null check exists, could be stricter |
| #5 Code Integrity | ✅ | No breaking changes needed |
| #6 Separation of Concerns | ✅ | Main chart and oscillator cleanly separated |
| #7 Stop Patching Rule | ✅ | Current state is stable, not a patch cascade |
| #8 Error Handling | ⚠️ | `console.error` in sync catch – should show user toast |
| #9 Fail Fast | ✅ | Range validation prevents bad sync attempts |

---

### 11.6 Recommended Action Plan (Frontend)

#### Phase 1: Critical for AI Analysis (Recommended – Option A)

| Priority | Task | File | Effort | Status |
|----------|------|------|--------|--------|
| **P0** | Add crosshair sync to oscillator charts | `OscillatorChart.jsx` | 30 min | ❌ Pending |
| **P0** | Composite screenshot (chart + oscillators + price scale) | `ChartWorkspace.jsx` | 1 hour | ❌ Pending |
| **P1** | Investigate drawing object cursor alignment | `ChartActions.jsx` | 1 hour | ❌ Pending |

#### Phase 2: Optional Enhancements

| Priority | Task | File | Effort | Status |
|----------|------|------|--------|--------|
| P2 | Add sync toggle button | `ChartHeader.jsx` | 30 min | ❌ Optional |
| P3 | Bidirectional sync with loop prevention | `OscillatorChart.jsx` | 2 hours | ❌ Future |

---

### 11.7 Implementation Notes

#### Crosshair Sync Pattern
To be added in `OscillatorChart.jsx` after the time scale sync setup:

```javascript
// Crosshair sync: main chart → oscillator
const handleCrosshairMove = (param) => {
  if (!chartRef.current || !seriesRef.current) return;
  
  if (param.time) {
    // Get value at this time from oscillator data
    const point = data.find(d => d.time === param.time);
    const value = point ? point.value : 0;
    
    chartRef.current.setCrosshairPosition(value, param.time, seriesRef.current);
  } else {
    chartRef.current.clearCrosshairPosition();
  }
};

mainChart.subscribeCrosshairMove(handleCrosshairMove);

// Cleanup
return () => {
  mainChart.unsubscribeCrosshairMove(handleCrosshairMove);
  // ... existing cleanup
};
```

#### Composite Screenshot Pattern
To replace current `captureChart()` in `ChartWorkspace.jsx`:

```javascript
const captureCompositeChart = async () => {
  const mainContainer = document.getElementById('quflx-chart-screenshot-root');
  const oscillatorContainers = document.querySelectorAll('[data-oscillator-chart]');
  
  // Use html2canvas or similar library to capture:
  // 1. Main chart with price scale visible
  // 2. All oscillator panels
  // 3. Combine into single image
  
  // Alternative: Use lightweight-charts' built-in takeScreenshot() if available
};
```

---

### 11.8 Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-10 | Choose Option A (Minimal Enhancement) | CORE_PRINCIPLES #1: Simplest solution that satisfies requirements |
| 2026-01-10 | Skip bidirectional sync | Low value, high complexity, risk of feedback loops |
| 2026-01-10 | Prioritize crosshair sync | Essential for coordinated AI visual analysis |
| 2026-01-10 | Prioritize composite screenshot | Blocking issue for AI analysis workflow |

---

## 12. Combined Summary (Backend + Frontend)

### Critical Path Items

| Area | Issue | Impact | Effort | Status |
|------|-------|--------|--------|--------|
| Backend | ADX indicator missing | Blocks regime detection | 30 min | ❌ P0 |
| Backend | CCI buggy + wrong period | Unreliable signals | 15 min | ❌ P0 |
| Frontend | Crosshair sync missing | Limits visual analysis | 30 min | ❌ P0 |
| Frontend | Incomplete screenshot | Blocks AI analysis | 1 hour | ❌ P0 |

### Total Estimated Effort
- **Backend Critical Fixes:** 1 hour
- **Frontend Critical Fixes:** 1.5 hours
- **Total:** ~2.5 hours for production-ready state

---

**Report Updated by:** Cline (ACT Mode)  
**Last Updated:** 2026-01-10 18:20 UTC  
**Reference Documents:**
- `docs/KnowledgeBase1.md`
- `v2_Dev_Docs/FIX_CCI_TASK.txt`
- `reports/report_2026-01/report_history_indicator_stability_26-01-08.md`
- `.agents/CORE_PRINCIPLES.md`
- `Research/research_lightweight-charts-indicators_2025-12-23.md`
- Perplexity AI Research (2026-01-10)
