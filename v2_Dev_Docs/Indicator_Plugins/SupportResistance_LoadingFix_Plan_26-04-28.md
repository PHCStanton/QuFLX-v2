# Support/Resistance Indicator — Loading & Refresh Fix Plan
**Date:** 2026-04-28  
**Agents:** @Investigator · @Coder · @Reviewer  
**Status:** ✅ All 4 fixes implemented and reviewed

---

## Executive Summary

The Support/Resistance indicator had four interconnected bugs that caused it to:
1. Not load at all after an asset switch (race condition — history not yet ready)
2. Show stale lines from the previous asset until new data arrived
3. Not respond to the Refresh (REF) button because the frontend cache was never cleared
4. Leave old S/R lines on the chart after asset switch (overlay series not cleared)

All four root causes have been fixed with minimal, targeted changes across 4 files.

---

## Root Cause Map

### BUG-1 — S/R doesn't load after asset switch (CRITICAL)
**File:** `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js`  
**Root Cause:** `historyStatus` was not in the `useEffect` dependency array. The effect fired once on mount (before history was loaded), bailed out at `if (!assetHistoryLoaded) return`, and never re-fired when history finished loading.  
**Fix:** Derived `assetHistoryLoaded = historyStatus?.[selectedAsset] === 'loaded'` and added it to the deps array. The effect now automatically re-fires the moment history transitions to `'loaded'`.

### BUG-2 — Stale S/R lines linger after asset switch (HIGH)
**File:** `gui/Dashboard/src/store/marketStore.js` — `setSelectedAsset()`  
**Root Cause:** `setSelectedAsset` cleared `marketData: {}` but did NOT clear `indicatorSeries`. The old asset's S/R lines remained in the store and were still rendered on the chart.  
**Fix:** Added `indicatorSeries: {}` to the same atomic `set()` call that clears `marketData`.

### BUG-3 — Refresh (REF) button doesn't work reliably (HIGH)
**File:** `gui/Dashboard/src/components/ChartWorkspace.jsx`  
**Root Cause:** `handleForceRefresh` only bumped `refreshKey`. The `useOverlayIndicators` hook uses `lastDataHash` to skip redundant `setData()` calls. Since the frontend `indicatorSeries` state still had the old data, the hash matched and `setData()` was skipped — the chart never updated.  
**Fix:** `handleForceRefresh` now deletes the `asset|timeframe` key from `indicatorSeries` before bumping `refreshKey`. This forces a fresh backend fetch AND clears the hash guard.  
**Also fixed:** `historyStatus` was not being passed to `useChartWorkspaceIndicators` — now it is.

### BUG-4 — Old overlay lines not cleared on asset switch (HIGH)
**File:** `gui/Dashboard/src/hooks/useOverlayIndicators.js`  
**Root Cause:** When `indicatorSeries` was cleared (Fix 2), `seriesForKey` became null. The hook returned early (`if (!seriesForKey) return`) without clearing the chart series data. The old S/R lines (and all other overlays) remained visible on the chart until new data arrived.  
**Fix:** When `seriesForKey` is null AND a series exists in `overlaySeriesRef.current`, all 9 series types are cleared via `setData([])` and `lastDataHash` is reset to `''` to force a full re-render when new data arrives.

---

## Files Changed

| File | Change |
|------|--------|
| `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js` | Added `assetHistoryLoaded` derived bool + added to `useEffect` deps |
| `gui/Dashboard/src/store/marketStore.js` | Added `indicatorSeries: {}` to `setSelectedAsset` clear block |
| `gui/Dashboard/src/components/ChartWorkspace.jsx` | Enhanced `handleForceRefresh` to clear frontend cache; wired `historyStatus` to hook; destructured `setIndicatorSeries` |
| `gui/Dashboard/src/hooks/useOverlayIndicators.js` | Clear all overlay series data when `seriesForKey` is null (asset switch) |

---

## Backend Assessment

The backend S/R calculation (`backend/services/strategy/indicators.py`) is **correct and well-implemented**:

- Fractal pivot detection with `center=True` rolling window (vectorized, no loop)
- `shift(n)` confirmation lag prevents repainting
- `ffill()` forward-fills levels between pivots
- Phase 1–5 enhancements (zone bounds, touch count, freshness, S/R flip) all correctly implemented
- `_df_cache` in `backend/services/gateway/routes/indicators.py` is mtime-keyed — auto-invalidates when CSV changes

**No backend changes required.**

---

## Refresh Button — How It Now Works

1. User clicks REF → `handleForceRefresh()` runs
2. `setIndicatorSeries` deletes the `asset|timeframe` key from the store
3. `useOverlayIndicators` fires (indicatorSeries changed) → `seriesForKey` is null → all series cleared via `setData([])`
4. `refreshKey` is bumped → `useOverlayIndicators` resets all `lastDataHash` values to `''`
5. `useChartWorkspaceIndicators` fires (refreshKey changed) → calls `loadIndicators()`
6. Backend receives request → checks mtime cache → returns data (from cache if CSV unchanged, fresh if CSV changed)
7. `indicatorSeries` updated → `useOverlayIndicators` fires → `seriesForKey` now has data → `setData()` called unconditionally (hash was `''`)

---

## Asset Switch — How It Now Works

1. User selects new asset → `setSelectedAsset()` runs
2. `indicatorSeries: {}` and `marketData: {}` cleared atomically
3. `useOverlayIndicators` fires → `seriesForKey` is null → all overlay series cleared immediately (no stale lines)
4. History loads → `historyStatus[newAsset]` transitions to `'loaded'`
5. `useChartWorkspaceIndicators` fires (assetHistoryLoaded changed) → calls `loadIndicators()`
6. Backend calculates indicators for new asset → returns series data
7. `indicatorSeries` updated → `useOverlayIndicators` fires → new S/R lines rendered

---

## @Reviewer Sign-Off

**Build:** ✅ `vite v5.4.21` — 1982 modules transformed, 0 errors  
**Fixes:** ✅ All 4 fixes correct, minimal, backward-compatible  
**Core Principles:** ✅ No violations — explicit error handling, no silent failures, separation of concerns maintained  
**Breaking Changes:** None
