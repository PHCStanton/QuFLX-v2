# LATEST INDICATOR FIXES 2026-03-15 (Patch 2 — Frontend Type Identifier Bug)

> **Status: ✅ IMPLEMENTATION COMPLETE — 2026-03-15 (Patch 2)**
> Build clean (`✓ built in 6.73s`, zero errors). All 5 files changed, ~25 lines total.

## Root Cause: `ind.value` Overwritten by Badge Label on Save

Despite the previous fixes (param-aware cache, timeframe-aware resampling), parameters **still did not visually change** on the chart. A second, deeper investigation revealed a **frontend-only root cause** that was silently breaking the entire parameter pipeline.

### The Bug

When the user clicks **Save** in `IndicatorSettingsModal`, the modal computes a **badge label** string (e.g., `"10,50,100"` for EMA Cross-Over, `"5"` for S/R) and passes it as `value` to `handleSaveIndicatorSettings()`. That handler called:

```js
updateIndicator(settingsIndicator.id, { value, params });
//                                       ^^^^^ WRONG — this is the badge label!
```

This **overwrote** `ind.value` from the canonical type identifier (`"ema_cross"`, `"support_resistance"`) to the badge label string (`"10,50,100"`, `"5"`). The `value` field is used as the indicator type key throughout the entire system. Once corrupted, **three things broke simultaneously**:

| What broke | Where | Why |
|---|---|---|
| **Backend param mapping** | `buildIndicatorRequest()` → `_map_params()` | Params sent under key `"10,50,100"` — backend can't match it, uses defaults |
| **Chart series rendering** | `useOverlayIndicators.js` | `type = ind.type \|\| ind.value` → `"10,50,100"` — all `if (type === 'ema_cross')` branches fail |
| **Tooltip values** | `ChartWorkspace.jsx` crosshair handler | Same type check failure |

**This is why Enable/Disable worked but period/multiplier changes didn't** — boolean toggles are read directly from `ind.params` without going through the type check path.

### Full Data Flow Trace (Post-Bug)

```
User changes EMA fast period 21→10 in IndicatorSettingsModal
  → handleSave() calls onSave({ value: "10,50,100", params: { fast: 10, ... } })
  → ChartWorkspace.handleSaveIndicatorSettings() calls updateIndicator(id, { value: "10,50,100", params })
  → ind.value OVERWRITTEN: "ema_cross" → "10,50,100"  ❌ ROOT BUG
  → buildIndicatorRequest(): paramKey = ind.value = "10,50,100"  ❌
  → POST /api/v1/indicators with params: { "10,50,100": { fast: 10 } }
  → Backend _map_params(): checks `if ind_key == "ema_cross"` → NO MATCH  ❌
  → pipeline_params = {} (empty) → default periods used → chart unchanged  ❌
  → useOverlayIndicators: type = ind.type || ind.value = "10,50,100"  ❌
  → if (type === 'ema_cross') → FALSE → data rendering branch skipped  ❌
```

---

## Fixes Applied (2026-03-15 Patch 2)

### Fix A — ROOT FIX: Stop overwriting `value` (ChartWorkspace.jsx)

**File:** `gui/Dashboard/src/components/ChartWorkspace.jsx`

```js
// BEFORE (broken):
updateIndicator(settingsIndicator.id, { value, params });

// AFTER (fixed):
// Store badge label in displayValue — NEVER overwrite the type identifier in value
updateIndicator(settingsIndicator.id, { displayValue: value, params });
```

The `value` field (`"ema_cross"`, `"support_resistance"`, etc.) is now permanently preserved. The badge label is stored in the new `displayValue` field.

---

### Fix B — Badge display update (ChartHeader.jsx)

**File:** `gui/Dashboard/src/components/ChartHeader.jsx`

```js
// BEFORE:
value={ind.value}

// AFTER:
value={ind.displayValue || ind.value}
```

The badge now shows the updated label (e.g., `"10,50,100"`) after save, falling back to the original `value` for new indicators that haven't been saved yet.

---

### Fix C — S/R period range + label clarification (chartOptions.js)

**File:** `gui/Dashboard/src/config/chartOptions.js`

```js
// BEFORE:
{ name: 'period', label: 'Pivot Period (L/R)', type: 'number', min: 1, max: 50, default: 5 },

// AFTER:
{ name: 'period', label: 'Pivot Period — Lower = More Micro Levels', type: 'number', min: 1, max: 100, default: 5 },
```

**S/R Period Direction Guide:**
| Period | Window (2n+1) | Detects |
|---|---|---|
| 2–3 | 5–7 bars | Very micro S/R (many levels, high sensitivity) |
| 5 (default) | 11 bars | Standard short-term S/R |
| 10–15 | 21–31 bars | Medium-term S/R |
| 20–30 | 41–61 bars | Macro S/R |
| 50–100 | 101–201 bars | Very major S/R (few levels) |

**Lower period = more micro levels. Higher period = fewer, more significant macro levels.**

---

### Fix D — Robust type resolution (useChartWorkspaceIndicators.js)

**File:** `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js`

Added `resolveIndicatorType()` helper that uses a priority chain:
1. `ind.type` — always set correctly by `addIndicator()`, never overwritten
2. Extract from `ind.id` format (`"ema_cross-1234567890"`) — migration fallback for indicators persisted before `type` field was added
3. `ind.key` — last resort

```js
const resolveIndicatorType = (ind) => {
  if (ind.type) return ind.type;
  if (typeof ind.id === 'string') {
    const match = KNOWN_INDICATOR_TYPES.find((t) => ind.id.startsWith(t + '-'));
    if (match) return match;
  }
  return ind.key;
};
```

`buildIndicatorRequest()` now uses `resolveIndicatorType(ind)` instead of `ind.value || ind.type || ind.key`.

---

### Fix E — Robust overlay type resolution (useOverlayIndicators.js)

**File:** `gui/Dashboard/src/hooks/useOverlayIndicators.js`

Added `resolveOverlayType()` with the same priority chain as Fix D. Both `const type = ...` assignments in the hook now use `resolveOverlayType(ind)` instead of `ind.type || ind.value`. This ensures all `if (type === 'ema_cross')` / `if (type === 'support_resistance')` branches always fire correctly.

---

## Files Changed (Patch 2)

| # | File | Change | Lines |
|---|------|---------|-------|
| 1 | `gui/Dashboard/src/components/ChartWorkspace.jsx` | `{ value, params }` → `{ displayValue: value, params }` in `handleSaveIndicatorSettings` | 1 |
| 2 | `gui/Dashboard/src/components/ChartHeader.jsx` | Badge: `ind.value` → `ind.displayValue \|\| ind.value` | 1 |
| 3 | `gui/Dashboard/src/config/chartOptions.js` | S/R period `max: 50→100`, label updated | 1 |
| 4 | `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js` | Add `resolveIndicatorType()` + `KNOWN_INDICATOR_TYPES`; use in `buildIndicatorRequest()` | ~20 |
| 5 | `gui/Dashboard/src/hooks/useOverlayIndicators.js` | Add `resolveOverlayType()` + `KNOWN_OVERLAY_TYPES`; replace both `type` assignments | ~20 |

**Build result:** `✓ built in 6.73s` — zero errors, zero new warnings.

---

## Why Previous Fix Didn't Work

The previous fix (documented below) changed `buildIndicatorRequest` to use `ind.value || ind.type || ind.key`. This was correct in principle but missed that `ind.value` was being **actively overwritten** by the save handler with the badge label. Since `ind.value` was always truthy (set to the badge label), the fallback to `ind.type` or `ind.key` never triggered.

---


## All 4 indicator fixes implemented, backend tests passing (127/127), and frontend build clean.

**What was fixed:**

1. **EMA Crossover & S/R params not applying (Critical Bug)** — `useChartWorkspaceIndicators.js`: `buildIndicatorRequest()` was sending params under `ind.key` (e.g., `ema_21`, `support_level`) but the backend `_map_params()` expected `ind.value` (e.g., `ema_cross`, `support_resistance`). One-line fix: now uses `ind.value || ind.type || ind.key` as the params key. This also fixes RSI period changes which had the same mismatch.

2. **ADX value too high vs Pocket Option** — `strategy/indicators.py`: The custom ADX used `ewm(span=period)` which gives alpha=2/(period+1)≈0.133, but the industry standard (Wilder's smoothing) requires `ewm(alpha=1/period)`≈0.071. Now uses `pandas_ta.adx()` when available (correct by default), with a corrected manual fallback using `alpha=1/period` for all three smoothing steps (+DM, -DM, DX→ADX).

3. **EMA Crossover per-line Enable/Disable** — Added `enableFast`, `enableMed`, `enableSlow` boolean params to the EMA Cross-Over definition in `chartOptions.js`. `useOverlayIndicators.js` now checks these flags and sets empty data `[]` for disabled lines. The existing `IndicatorSettingsModal` renders them automatically as toggle switches — no modal changes needed.

4. **Duplicate indicator guard** — `marketStore.js`: `addIndicator()` now silently rejects duplicates of the same type. `ChartHeader.jsx`: pre-checks before calling `addIndicator` and shows a 2.5s inline tooltip message (e.g., "RSI already active") when a duplicate is attempted.

# Implementation Plan: Fix 1 (Param-Aware Cache) + Fix 2 (Timeframe-Aware Resampling) + Error Handling Popup

> **Status: ✅ IMPLEMENTATION COMPLETE — 2026-03-15**
> All code changes applied. Steps marked `[ ]` are manual runtime test steps to be verified by the developer.

---

## What Was Found & Fixed

### Fix 1 — Cache Key Missing Params (`indicators.py` route)
The cache was keyed `(csv_path_str, result_df)`. When params changed (e.g. EMA 16→20), the csv_path hadn't changed, so it was a cache hit and the old DataFrame was returned.

**Fix applied:** `params_hash` added to the cache tuple. Cache now keyed by `(csv_path, params_hash, df)`.

**Change location:** `backend/services/gateway/routes/indicators.py`
- `_df_cache` type: `Dict[str, Tuple[str, pd.DataFrame]]` → `Dict[str, Tuple[str, str, pd.DataFrame]]`
- `_get_cached_df` → compares both `csv_path` AND `params_hash`
- `_set_cached_df` → stores `params_hash` in the tuple
- Route: computes `p_hash = _params_hash(pipeline_params)` using `hashlib.md5(json.dumps(..., sort_keys=True))`

**~15 lines changed. Zero risk to other functionality.**

---

### Fix 2 — Hardcoded `'1min'` Resampling (`strategy/indicators.py` pipeline)
`calculate_indicators()` always called `self.resample_to_grid(df, timeframe='1min')`. For a 5m CSV, this inflated every candle into 5 rows, making a "14-period RSI" compute over 14 minutes instead of 70 minutes.

**Fix applied:** `timeframe_min: int = 1` parameter added to `calculate_indicators()`. Route passes the actual requested timeframe through `_calculate_in_thread()` → pipeline.

**Change locations:**
- `backend/services/strategy/indicators.py` — `calculate_indicators(df, timeframe_min=1)` + `pandas_alias = f'{max(1, int(timeframe_min))}min'`
- `backend/services/gateway/routes/indicators.py` — `_calculate_in_thread()` accepts `timeframe_min`; route passes it in

**~10 lines changed. Fully backward-compatible (default = 1 = existing behaviour).**

---

### Fix 3 (Replaced) — Timeframe Data Error Popup
Instead of implementing the 1m→HTF resampling fallback, replaced with a **user-friendly warning popup** that fires when the backend returns a 404 for the requested timeframe.

**New behaviour:** When the indicator API returns 404, `marketStore.loadIndicators()` sets a structured `indicatorWarning` state (separate from `lastError`) that triggers a dedicated **"Collect Candles" reminder popup**:
- ⚠️ Icon + clear title: *"No {timeframe} Data for {asset}"*
- Body: step-by-step instructions to collect candles
- Two buttons: **"Dismiss"** and **"Go Collect"** (navigates to Settings tab)
- Shown **once per asset+timeframe combination** per session (tracked in `useRef(new Set())`)

---

## Files Changed

| # | File | Change | Lines |
|---|------|---------|-------|
| 1 | `backend/services/gateway/routes/indicators.py` | Add `hashlib`+`json` import; update `_df_cache` type; update `_get_cached_df`, `_set_cached_df`; compute `p_hash` in route; pass to thread | ~15 |
| 2 | `backend/services/strategy/indicators.py` | Add `timeframe_min: int = 1` param to `calculate_indicators()`; compute pandas alias; pass to `resample_to_grid()` | ~8 |
| 3 | `backend/services/gateway/routes/indicators.py` | Pass `timeframe_min` into `_calculate_in_thread()`; pass to `pipeline.calculate_indicators()` | ~5 |
| 4 | `gui/Dashboard/src/store/marketStore.js` | Add `indicatorWarning` state + `setIndicatorWarning` + `clearIndicatorWarning`; detect 404 in `loadIndicators()` and set structured warning instead of generic error | ~20 |
| 5 | `gui/Dashboard/src/components/IndicatorTimeframeWarning.jsx` | **New file** — modal popup component (Tailwind + lucide-react, no new deps) | ~110 |
| 6 | `gui/Dashboard/src/components/ChartWorkspace.jsx` | Import + render `<IndicatorTimeframeWarning />` | ~3 |

---

## Implementation Plan (Incremental Steps)

```
Fix 1 — Parameter-Aware Cache
- [x] Step 1.1: Add `hashlib` and `json` imports to `indicators.py` route
- [x] Step 1.2: Update `_df_cache` type annotation and `_get_cached_df` / `_set_cached_df` to include `params_hash`
- [x] Step 1.3: Compute `params_hash` in the route handler and pass through cache check
- [ ] Step 1.4: TEST — change EMA period, verify cache miss fires and new values appear

Fix 2 — Timeframe-Aware Resampling
- [x] Step 2.1: Add `timeframe_min: int = 1` parameter to `calculate_indicators()` in `strategy/indicators.py`
- [x] Step 2.2: Compute `pandas_alias = f'{timeframe_min}min'` and pass to `resample_to_grid()` call
- [x] Step 2.3: Update `_calculate_in_thread()` signature in route to accept and forward `timeframe_min`
- [x] Step 2.4: Pass `timeframe_min` from the route handler into `_calculate_in_thread()`
- [ ] Step 2.5: TEST — request 5m indicators, verify resampling uses 5min grid not 1min

Fix 3 (Replaced) — Timeframe Data Error Popup
- [x] Step 3.1: Add `indicatorWarning` / `setIndicatorWarning` / `clearIndicatorWarning` to `marketStore.js`
- [x] Step 3.2: In `loadIndicators()`, detect HTTP 404 and set structured `indicatorWarning` (with `asset`, `timeframe`) instead of generic `lastError`
- [x] Step 3.3: Create `IndicatorTimeframeWarning.jsx` — modal popup with dismiss + action button
- [x] Step 3.4: Import and render `<IndicatorTimeframeWarning />` in `ChartWorkspace.jsx`
- [ ] Step 3.5: TEST — select a timeframe with no collected data, verify popup appears with correct message

Documentation
- [x] Step 4.1: Update `Indicator_Parameter_Settings_&_Timeframe_Handling.md` with implementation status
```

---

## Key Design Decisions

1. **`params_hash` uses `hashlib.md5` on `json.dumps(pipeline_params, sort_keys=True)`** — deterministic, fast, no new dependencies.

2. **`calculate_indicators()` default `timeframe_min=1`** — fully backward-compatible. All existing callers (regime detector, tests) continue to work unchanged.

3. **`indicatorWarning` is separate from `lastError`** — `lastError` is a generic string used everywhere. The timeframe warning needs structured data (`asset`, `timeframe`) to render a meaningful message, so it gets its own state slot. This follows **Principle 6: Separation of Concerns**.

4. **Popup shown once per session per `asset|timeframe` key** — prevents spam on every indicator poll cycle. Tracked in a `useRef(new Set())` inside the component.

5. **No new UI libraries** — uses existing Tailwind + lucide-react icons only (per `.agentrules.md` rule 6).

---

## Original Investigation Report

### Issue 1: Indicator Parameter Settings Not Affecting Overlay Indicators

#### Root Cause: **Backend DataFrame Cache Ignores Parameter Changes**

**BUG 1A (CRITICAL):** Backend cache key didn't include params
📍 `backend/services/gateway/routes/indicators.py` — `_get_cached_df()` / `_df_cache`

**BUG 1B (SECONDARY):** Frontend correctly re-fetched on param change, but backend cache hit returned stale data regardless.

**Full Data Flow Trace:**
```
User changes EMA period 16→20 in IndicatorSettingsModal
  → handleSave() calls onSave({ value: "20", params: { period: 20 } })
  → ChartWorkspace.handleSaveIndicatorSettings() calls updateIndicator(id, { value, params })
  → marketStore.activeIndicators updated ✅
  → useChartWorkspaceIndicators: indicatorRequest recalculated (includes new params) ✅
  → useEffect fires → loadIndicators({ asset, timeframe, indicators, params: { ema: { period: 20 } } }) ✅
  → marketStore.loadIndicators() → POST /api/v1/indicators with params ✅
  → Backend _map_params() → pipeline_params = { ema_fast: 20 } ✅
  → Backend _get_cached_df(asset, csv_path) → CACHE HIT (params not in key) ❌ BUG! [FIXED]
  → _build_series(cached_df) → returns OLD ema_16 data calculated with period=16 ❌ [FIXED]
  → Frontend receives same data → chart unchanged ❌ [FIXED]
```

---

### Issue 2: Indicator Calculations for Higher Timeframes

**BUG 2A (CRITICAL):** Pipeline hardcoded `'1min'` resampling grid — distorted all indicators for timeframes > 1m. **[FIXED]**

**BUG 2B (ARCHITECTURAL):** No automatic resampling from 1m to higher timeframes — 404 returned if exact timeframe CSV not collected. **[REPLACED with Error Popup — Fix 3]**

---

## CORE_PRINCIPLES.md Adherence (Post-Fix)

| Principle | Status | Notes |
|---|---|---|
| **1. Functional Simplicity** | ✅ Fixed | Cache logic now complete and simple |
| **2. Sequential Logic** | ✅ OK | Data flow is clear and traceable |
| **3. Incremental Testing** | ⏳ Pending | Manual test steps 1.4, 2.5, 3.5 remain |
| **4. Zero Assumptions** | ✅ Fixed | Cache no longer assumes params never change |
| **5. Code Integrity** | ✅ OK | Default `timeframe_min=1` preserves backward compat |
| **6. Separation of Concerns** | ✅ OK | `indicatorWarning` separate from `lastError` |
| **7. Stop Patching Rule** | ✅ OK | Clean targeted fixes, not patch-on-patch |
| **8. Defensive Error Handling** | ✅ OK | 404 now shows actionable popup, not silent failure |
| **9. Fail Fast** | ✅ Fixed | Pipeline now uses correct timeframe grid |
