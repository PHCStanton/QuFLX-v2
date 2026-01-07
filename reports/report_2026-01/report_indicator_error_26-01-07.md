# Forensic Analysis: Indicator Pipeline Failure
**Date:** 2026-01-07  
**Investigator:** @Agent via Team Leader  
**Severity:** CRITICAL  
**Status:** Root Causes Identified – Awaiting Action Decision

---

## Executive Summary

The QuFLX Dashboard (v2) fails to load technical indicators (oscillators) for selected assets. Despite the main candle chart rendering correctly, indicator panels remain empty and may trigger red error banners. A recent implementation added the missing `indicator_calculator` capability, but the pipeline still fails.

**Root Cause Identified:** Two critical issues in the data flow:
1. **Response Structure Mismatch** – Backend wraps `series` data in an extra `data` layer, causing frontend to receive `undefined`
2. **Chrome Session Requirement** – `runner.py` attempts browser attachment for ALL capabilities, including pure-compute ones

**Recommendation:** Targeted fixes (not a rewrite) since the issues are localized to 2 files with clear boundaries.

---

## CORE_PRINCIPLES Alignment

This analysis follows all CORE_PRINCIPLES:

| Principle | Adherence | Notes |
|-----------|-----------|-------|
| #1 Functional Simplicity | ✅ | Fix is minimal – 2 small changes |
| #2 Sequential Logic | ✅ | Step-by-step trace documented |
| #4 Zero Assumptions | ✅ | Every file verified, no guessing |
| #7 Stop Patching Rule | ✅ | This is NOT a patch cascade – first attempt |
| #8 Zero Silent Failures | ⚠️ | Current code has silent failure (empty `{}`) |
| #9 Fail Fast | ⚠️ | No early validation on response structure |

---

## Data Flow Trace (Sequential Analysis)

### Step 1: Frontend Trigger
**File:** `gui/Dashboard/src/store/marketStore.js` (lines 190-235)

```javascript
loadIndicators: async ({ asset, timeframe, indicators, params }) => {
  // ...gate checks for history status...
  
  const res = await fetch('http://localhost:8000/api/v1/indicators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  const series = data.series || {};  // ← EXPECTATION: series at top level
  
  set((state) => ({
    indicatorSeries: {
      ...state.indicatorSeries,
      [key]: series  // ← Stored in state
    }
  }));
}
```

**Observation:** Frontend expects `response.series` directly. If not found, defaults to empty `{}`.

---

### Step 2: Backend Route Handler
**File:** `backend/services/gateway/routes/indicators.py` (lines 71-78)

```python
# ... subprocess completes ...
out = parse_script_json(output_str)

if not out.get("ok"):
    raise HTTPException(status_code=500, detail=str(out.get("error")))

data = out.get("data", {})
processed = data.get("processed", {})
eligible = processed.get("selected_now", []) + processed.get("already_favorited", [])

return {
    "ok": True, 
    "data": data,  # ← WRONG: Wraps data again!
    "assets": list({a for a in eligible if isinstance(a, str)})
}
```

**❌ CRITICAL BUG #1:** The response wraps `data` inside another `data` key.

**Result:**
- Capability returns: `{"ok": true, "data": {"series": {...}, ...}}`
- Route returns: `{"ok": true, "data": {"series": {...}, ...}, "assets": []}`
- Frontend reads: `response.data.series` → **undefined** (should be `response.series`)

---

### Step 3: Capability Execution
**File:** `capabilities_v2/indicator_calculator.py`

```python
class IndicatorCalculator:
    id = "indicator_calculator"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        csv_path = inputs.get("csv_path")
        # ... load CSV, calculate indicators ...
        
        return CapResult.success(data={
            "asset": asset,
            "timeframe": timeframe,
            "series": series,  # ← Correct structure here
            "count": len(result_df),
            "processed": {
                "selected_now": [],
                "already_favorited": []
            }
        })
```

**Observation:** The capability correctly returns `series` inside `data`. The problem is upstream in the route handler.

---

### Step 4: Runner Execution Environment
**File:** `capabilities_v2/runner.py` (lines 68-86)

```python
try:
    import qf
    ok, _ = qf.attach_chrome_session(port=9222)
    ctx = qf.ctx
except Exception:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    
    opts = Options()
    opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    try:
        driver = webdriver.Chrome(options=opts)
        # ...
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Failed to connect to Chrome: {str(e)}"}))
        sys.exit(1)  # ← FAILS HERE if Chrome not running
```

**❌ CRITICAL BUG #2:** `runner.py` attempts Chrome attachment for ALL capabilities.

`indicator_calculator` is a **pure-compute capability** – it only reads a CSV file and calculates indicators. It does NOT need browser access. If Chrome debugging is unavailable, the subprocess fails before even executing the capability.

---

### Step 5: Data Source Verification

**CSV Files Confirmed Present:**
```
data/data_output/history/AUDUSDOTC/
├── AUDUSDOTC_otc_1m_2026_01_07_19_03_46.csv  ← Latest (97 rows)
├── AUDUSDOTC_otc_1m_2026_01_07_10_24_04.csv
└── AUDUSDOTC_otc_1m_2026_01_07_01_14_45.csv

Sample CSV structure:
timestamp,open,close,high,low
1767813840.0,0.70617,0.70579,0.70635,0.70577
1767813900.0,0.70577,0.70569,0.70593,0.70564
```

**Observation:** CSV files exist with correct column structure (`timestamp`, `open`, `close`, `high`, `low`). The `TechnicalIndicatorsPipeline` can process these correctly.

---

### Step 6: Frontend Rendering
**File:** `gui/Dashboard/src/components/OscillatorChart.jsx`

```javascript
useEffect(() => {
  if (!seriesRef.current) return;
  if (!Array.isArray(data) || data.length === 0) {
    seriesRef.current.setData([]);  // ← Empty data → empty chart
    return;
  }
  // ...render logic...
}, [data]);
```

**File:** `gui/Dashboard/src/components/ChartWorkspace.jsx` (lines 185-195)

```javascript
{oscillatorIndicators.map((ind) => {
  const key = `${selectedAsset}|${selectedTimeframe}`;
  const seriesForKey = indicatorSeries && indicatorSeries[key];
  const data = seriesForKey && seriesForKey[ind.key] ? seriesForKey[ind.key] : [];
  // ...
  return (
    <OscillatorChart
      mainChart={mainChart}
      data={data}  // ← Empty array when series lookup fails
      type={type}
      title={ind.name}
    />
  );
})}
```

**Observation:** When `indicatorSeries[key]` is `{}` (due to Bug #1), `data` becomes `[]`, and the chart renders nothing.

---

## Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INDICATOR PIPELINE FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frontend Request                                                           │
│  ────────────────                                                           │
│  POST /api/v1/indicators                                                    │
│  Body: {asset: "AUDUSDOTC", timeframe: "1m", indicators: ["rsi_14"]}       │
│                        │                                                    │
│                        ▼                                                    │
│  Backend Route (indicators.py)                                              │
│  ─────────────────────────────                                              │
│  1. Parse timeframe → timeframe_min = 1                                     │
│  2. get_recent_history_file("AUDUSDOTC", 1) → CSV path ✅                  │
│  3. Spawn subprocess: runner.py indicator_calculator                        │
│                        │                                                    │
│                        ▼                                                    │
│  Runner.py                                                                  │
│  ─────────                                                                  │
│  1. Try attach Chrome session ← ❌ BUG #2: May fail here                   │
│  2. Load IndicatorCalculator                                                │
│  3. Run capability                                                          │
│                        │                                                    │
│                        ▼                                                    │
│  indicator_calculator.py                                                    │
│  ───────────────────────                                                    │
│  1. pd.read_csv(csv_path) → DataFrame                                       │
│  2. TechnicalIndicatorsPipeline.calculate_indicators(df) ✅                │
│  3. Extract {time, value} series for each indicator ✅                     │
│  4. Return CapResult.success(data={"series": {...}, ...})                   │
│                        │                                                    │
│                        ▼                                                    │
│  Backend Response Construction                                              │
│  ────────────────────────────                                               │
│  return {"ok": True, "data": data, "assets": [...]}                         │
│                        │                                                    │
│                        │  ← ❌ BUG #1: series is at response.data.series   │
│                        │             but frontend expects response.series   │
│                        ▼                                                    │
│  Frontend Store (marketStore.js)                                            │
│  ───────────────────────────────                                            │
│  const series = data.series || {}  ← Gets undefined, defaults to {}         │
│  indicatorSeries[key] = {}         ← Empty object stored                    │
│                        │                                                    │
│                        ▼                                                    │
│  OscillatorChart Component                                                  │
│  ─────────────────────────                                                  │
│  data = indicatorSeries[key][ind.key] ?? []  ← Gets []                     │
│  chart.setData([])                           ← Empty chart rendered         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Bugs Summary

### Bug #1: Response Structure Mismatch (PRIMARY BLOCKER)

| Aspect | Detail |
|--------|--------|
| **Location** | `backend/services/gateway/routes/indicators.py:71-78` |
| **Severity** | CRITICAL |
| **Violates** | CORE_PRINCIPLES #8 (Zero Silent Failures) |
| **Impact** | Frontend always receives empty indicator data |

**Current Code:**
```python
return {
    "ok": True, 
    "data": data,  # ← data already contains {"series": {...}}
    "assets": list({a for a in eligible if isinstance(a, str)})
}
```

**Expected by Frontend:**
```javascript
const series = data.series || {};  // Expects series at top level
```

**Actual Response Structure:**
```json
{
  "ok": true,
  "data": {
    "series": {"rsi_14": [...], "macd": [...]},
    "asset": "AUDUSDOTC",
    "timeframe": 1
  },
  "assets": []
}
```

**Frontend Access Pattern:**
- `response.data` → `{"series": {...}, "asset": ..., "timeframe": ...}`
- `response.data.series` → `{"rsi_14": [...], "macd": [...]}`
- But code does: `response.series` → `undefined` → defaults to `{}`

---

### Bug #2: Chrome Session Requirement for Compute-Only Capability

| Aspect | Detail |
|--------|--------|
| **Location** | `capabilities_v2/runner.py:68-86` |
| **Severity** | HIGH |
| **Violates** | CORE_PRINCIPLES #1 (Functional Simplicity) |
| **Impact** | Indicator calculation fails if Chrome debugging unavailable |

**Current Code:**
```python
try:
    import qf
    ok, _ = qf.attach_chrome_session(port=9222)
    ctx = qf.ctx
except Exception:
    # Falls back to direct Chrome debugger attachment
    driver = webdriver.Chrome(options=opts)  # ← FAILS if Chrome not running
```

**Problem:** `indicator_calculator` only needs to:
1. Read a CSV file
2. Calculate indicators using pandas/numpy
3. Return JSON result

It does NOT need browser access, yet runner.py forces Chrome attachment for ALL capabilities.

---

## Verification Steps Performed

### 1. CSV File Existence ✅
```powershell
Get-ChildItem "data\data_output\history\AUDUSDOTC\" | Select-Object Name
# Result: Multiple timestamped CSV files exist
```

### 2. CSV Column Structure ✅
```
timestamp,open,close,high,low
1767813840.0,0.70617,0.70579,0.70635,0.70577
```
All required columns present (`timestamp`, `open`, `high`, `low`, `close`).

### 3. History Lookup Logic ✅
`get_recent_history_file()` in `backend/utils/history_utils.py` correctly:
- Normalizes asset name
- Finds most recent CSV matching `_{tf_str}_` pattern
- Returns valid `Path` object

### 4. TechnicalIndicatorsPipeline ✅
`backend/services/strategy/indicators.py` correctly:
- Calculates all indicators (RSI, MACD, Bollinger Bands, etc.)
- Uses fallback implementations when `pandas_ta` unavailable
- Returns DataFrame with indicator columns

### 5. Capability Registration ✅
`runner.py` has `indicator_calculator` properly registered:
```python
CAPABILITY_MAP = {
    # ...
    "indicator_calculator": IndicatorCalculator,
}
```

### 6. Frontend Store Logic ✅
`marketStore.js` correctly gates indicator loading on history status:
```javascript
if (historyState === 'not_found' || historyState === 'error' || historyState === 'empty') {
  // ... error handling ...
  return;
}
```

---

## Recommended Fixes

### Fix #1: Backend Response Structure (indicators.py)

**Effort:** 5 minutes  
**Risk:** Low (localized change)

**Change:**
```python
# FROM (lines 71-78):
data = out.get("data", {})
processed = data.get("processed", {})
eligible = processed.get("selected_now", []) + processed.get("already_favorited", [])

return {
    "ok": True, 
    "data": data, 
    "assets": list({a for a in eligible if isinstance(a, str)})
}

# TO:
data = out.get("data", {})

return {
    "ok": True, 
    "series": data.get("series", {}),  # ← Extract series to top level
    "asset": data.get("asset"),
    "timeframe": data.get("timeframe"),
    "count": data.get("count", 0)
}
```

**Why This Works:**
- Frontend expects `response.series` at top level
- This extracts `series` from the nested capability response
- Removes irrelevant `processed` / `eligible` logic (copy-pasted from favorites code)

---

### Fix #2: Skip Browser for Compute-Only Capabilities (runner.py)

**Effort:** 15 minutes  
**Risk:** Low (backward compatible)

**Step 2a: Add capability metadata**
```python
# In indicator_calculator.py:
class IndicatorCalculator:
    id = "indicator_calculator"
    kind = "read"
    requires_browser = False  # ← ADD THIS
```

**Step 2b: Conditionally skip browser in runner.py**
```python
# After loading cap_class:
cap_class = CAPABILITY_MAP.get(args.capability)
if not cap_class:
    # ... error handling ...

# ADD THIS CHECK:
if not getattr(cap_class, 'requires_browser', True):
    # Pure-compute capability – no browser needed
    artifacts_root = os.path.join(str(project_root), "data", "artifacts")
    ctx = Ctx(driver=None, artifacts_root=artifacts_root, debug=args.debug, dry_run=False, verbose=args.verbose)
else:
    # Existing browser attachment logic...
    try:
        import qf
        ok, _ = qf.attach_chrome_session(port=9222)
        # ...
```

**Why This Works:**
- Compute-only capabilities can run without Chrome
- Browser-dependent capabilities (favorites, timeframe, history_collector) still work as before
- Simple opt-in via `requires_browser = False` attribute

---

## Alternative Consideration

### Should We Rewrite? (CORE_PRINCIPLES #7 Check)

| Criteria | Assessment |
|----------|------------|
| More than 2-3 incremental fixes attempted? | ❌ No – this is the first fix attempt |
| Code becoming tangled/duplicated? | ❌ No – issues are localized |
| Technical debt accumulating? | ⚠️ Some (copy-pasted response handling) |
| Same bug resurfacing? | ❌ No – newly identified |
| Fix exceeds 30-40 lines? | ❌ No – ~10 lines total |

**Verdict:** **No rewrite needed.** The fixes are small, targeted, and don't cascade. CORE_PRINCIPLES #7 does NOT trigger.

---

## Test Plan

### After Fix #1:
```powershell
# 1. Start gateway
cd backend/services/gateway
uvicorn main:app --reload --port 8000

# 2. Test endpoint directly
$body = @{
    asset = "AUDUSDOTC"
    timeframe = "1m"
    indicators = @("rsi_14", "macd")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/v1/indicators" -Method POST -Body $body -ContentType "application/json"

# Expected: {"ok": true, "series": {"rsi_14": [...], "macd": [...]}, ...}
```

### After Fix #2:
```powershell
# Test capability directly without Chrome running
python capabilities_v2/runner.py indicator_calculator --inputs '{"csv_path": "data/data_output/history/AUDUSDOTC/AUDUSDOTC_otc_1m_2026_01_07_19_03_46.csv", "asset": "AUDUSDOTC", "timeframe": 1}'

# Expected: {"ok": true, "data": {"series": {...}}}
```

### End-to-End:
1. Start Dashboard (`npm run dev` in `gui/Dashboard`)
2. Select an asset with existing history
3. Add RSI or MACD indicator
4. Verify oscillator chart renders with data

---

## Risk Forecast (If Ignored)

1. **Indicator Feature Remains Broken** – Users cannot view RSI, MACD, or other oscillators
2. **Support Burden** – Users will report "indicators not loading" repeatedly
3. **Feature Cascading** – Any future features depending on indicators will also fail
4. **False Negatives** – Backend reports `ok: true` but frontend shows nothing (silent failure)

---

## Implementation Priority

| Priority | Fix | Owner | Effort |
|----------|-----|-------|--------|
| **P0** | Fix #1: Response structure in indicators.py | @Coder | 5 min |
| **P1** | Fix #2: Skip browser in runner.py | @Engineer | 15 min |

**Total Effort:** ~20 minutes for complete fix

---

## Conclusion

The indicator pipeline failure is caused by two clear, localized bugs:

1. **Response structure mismatch** – Backend wraps `series` in extra `data` layer
2. **Unnecessary Chrome requirement** – Runner forces browser for compute-only capability

Both fixes are minimal (~20 lines total), don't require architectural changes, and don't trigger CORE_PRINCIPLES #7 (Stop Patching Rule). The recommended approach is **targeted fixes**, not a rewrite.

**Next Step:** Toggle to Act Mode to apply the fixes.

---

*Investigation Complete*  
*@Agent forensic analysis – 2026-01-07 20:19 UTC*
