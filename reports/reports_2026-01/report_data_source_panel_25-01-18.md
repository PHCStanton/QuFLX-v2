# Forensic Analysis: DATA SOURCE Panel & Asset Management
**Date:** 2026-01-18  
**Investigator:** @Team_Leader (via @Investigator)  
**Severity:** HIGH  
**Status:** Root Causes Identified – Implementation Plan Ready

---

## Executive Summary

A comprehensive investigation of the **DATA SOURCE** panel (`AssetPanel.jsx`) and its supporting backend routes (`assets.py`) and store logic (`marketStore.js`) has revealed several critical bugs, architectural inconsistencies, and non-functional UI elements. 

The most severe issue is a **logic error in the backend** that prevents asset refreshing from working at all. Additionally, there is significant **state duplication** and a lack of user feedback for background operations.

---

## Critical Issues

### 1. 🔴 CRITICAL: Backend Variable Name Bug
**Location:** `backend/services/gateway/routes/assets.py` (Line ~56)

**The Problem:**
```python
process_result = await asyncio.to_thread(run_script)
# ...
if process.returncode != 0:  # ❌ ERROR: 'process' is undefined
```
The code defines `process_result` but attempts to check `.returncode` on a non-existent variable `process`. This will raise a `NameError` and cause every `/refresh-assets` request to fail with a 500 error.

**Impact:** Users cannot refresh the 92% Payout Assets list.

---

### 2. 🔴 HIGH: Store State Schema Mismatch
**Location:** `gui/Dashboard/src/store/marketStore.js`

**The Problem:**
The `assetFilterState` in the store is missing the `minPayout` field in its default definition:
```javascript
assetFilterState: {
  maxAssets: 5,
  targetAssets: '',
  targetAssetsMode: 'ignore',
  filterMode: null
  // ❌ Missing minPayout
},
```
However, the `refreshAssets` function and the `AssetPanel` UI both expect and attempt to persist `minPayout` into this object.

**Impact:** Inconsistent filtering behavior and potential silent failures during asset refresh.

---

### 3. 🔴 HIGH: Non-Functional UI Buttons (CORE_PRINCIPLES #8)
**Location:** `gui/Dashboard/src/components/AssetPanel.jsx`

**The Problem:**
- **"Upload CSV"**: The button is rendered but has no `onClick` handler. It is "dead" in the UI.
- **"Live Feed"**: The `active` prop is hardcoded to `true`, and it has no toggle logic. It gives a false impression of system state.

**Impact:** Degraded User Experience and violation of "Zero Silent Failures" principle.

---

## Detailed Findings

### Component Bloat (Principle #6 Violation)
`AssetPanel.jsx` is currently ~290 lines long and handles:
1.  **Orchestration**: Managing top/bottom panel resizing and collapse states.
2.  **Filter Logic**: Local state for `minPayout`, `maxAssetsToStar`, `otcOnly`, and `specificAssets`.
3.  **UI Controls**: Rendering the Data Source ActionButtons.
4.  **Data Visualization**: Rendering the Asset List and Ticker Tape.
5.  **Search**: Implementing client-side filtering for the asset list.

### Deprecated "Zombies" (Principle #1 Violation)
**Location:** `marketStore.js`
The function `syncAssetUi` is explicitly marked as deprecated but still exists, taking up space and mental load:
```javascript
syncAssetUi: async () => {
  console.log('syncAssetUi is deprecated. Please use Manual Mode.');
},
```

---

## Risk Forecast

1.  **Total System Failure**: If the backend bug (Issue #1) is not fixed, the primary value proposition of the Dashboard (92% assets) remains inaccessible.
2.  **State Drift**: The mismatch between local UI state and Store state will lead to "ghost" settings where the UI shows one value but the backend uses another.
3.  **User Frustration**: Dead buttons like "Upload CSV" reduce trust in the platform's reliability.

---

## Recommendations

### Phase 1: Immediate Structural Fixes
- Fix the `process` → `process_result` variable bug in the backend.
- Align the `marketStore` asset filter schema with the UI requirements.

### Phase 2: UI Integrity & Feedback
- Implement/Remove the Upload CSV functionality.
- Add a proper toggle for the Live Feed.
- Integrate toast notifications for `lastError` so users see *why* a refresh failed.

### Phase 3: Architectural Cleanup
- Refactor `AssetPanel.jsx` into three sub-components: `DataSourceControls`, `AssetFilterGroup`, and `AssetListView`.
- Remove all deprecated functions and comments from the store slices.

---

**Investigation Complete**  
*@Team_Leader forensic analysis – 2026-01-18*
