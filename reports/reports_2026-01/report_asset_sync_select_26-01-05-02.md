# Asset Sync & Select Workflow – Implementation Summary and Next Steps
**Date:** 2026-01-05  
**Status:** In Progress – Asset Sync UI enabled, workflow refinement pending  
**Author:** @Team-Leader (with @Investigator, @Coder, @Engineer)

---

## 1. Current Behavior Overview

### 1.1 Key Components

- **Capability layer**
  - `FavoritesWalkSelect` ([capabilities_v2/favorites_walk_select.py](../..//capabilities_v2/favorites_walk_select.py))
    - Orchestrates favorites bar scan and selection based on:
      - `min_pct` payout threshold (default 92).
      - Optional `assets` filter (list of string patterns).
      - `all` flag (select-all mode).
    - Uses `FavoritesBar` to:
      - Reset favorites bar to the left.
      - Scan visible favorites.
      - Click eligible favorites.
      - Scroll right until no more movement.

  - `FavoritesBar` ([capabilities_v2/favorites_bar.py](../..//capabilities_v2/favorites_bar.py))
    - Handles DOM-level Selenium interaction with the Pocket Option favorites bar.
    - Uses `HighPriorityControls` from `local_selenium_utils/selenium_ui_controls.py` to:
      - Scroll favorites left/right.
      - Click favorites reliably (span → anchor traversal, JS fallback, scrollIntoView).

- **Backend gateway**
  - New endpoint: `/api/v1/sync-asset-ui` ([backend/services/gateway/main.py](../..//backend/services/gateway/main.py))
    - Accepts payload: `{ asset: string, min_pct?: int }`.
    - Validates inputs, then invokes the capability runner:
      - `python capabilities_v2/runner.py favorites_walk_select --inputs <JSON>`
      - Inputs: `{ "assets": [asset], "min_pct": min_pct, "all": false }`.
    - Uses `_parse_script_json` to extract the final JSON line from capability stdout.
    - Returns HTTP 200 only when the capability reports `ok: true`.
    - On failure, returns 4xx/5xx with clear `detail`.

- **Dashboard store (frontend)**
  - `syncAssetUi` in `createMarketSlice` ([gui/Dashboard/src/store/marketStore.js](../Dashboard/src/store/marketStore.js))
    - Reads:
      - `selectedAsset`
      - `selectedAssetKey`
      - `payoutAssets`
    - Normalizes asset names via `normalizeAsset` to map from QuFLX internal key to the visible Pocket Option label.
    - Chooses `uiAsset` as:
      - First, match in `payoutAssets` with same normalized key.
      - Fallback to `selectedAsset` string.
    - POSTs to `/api/v1/sync-asset-ui` with `{ asset: uiAsset, min_pct: 92 }`.
    - On HTTP or network error, sets `lastError` with a descriptive message.

- **Dashboard UI**
  - Chart header ([gui/Dashboard/src/components/ChartHeader.jsx](../Dashboard/src/components/ChartHeader.jsx))
    - Existing **timeframe** Sync UI button (calls `/api/v1/sync-timeframe-ui`).
    - New **asset** Sync UI button:
      - Props: `onSyncAsset`, `isSyncingAsset`.
      - Calls `handleSyncAsset` from `ChartWorkspace`.
  - Chart workspace ([gui/Dashboard/src/components/ChartWorkspace.jsx](../Dashboard/src/components/ChartWorkspace.jsx))
    - Wires store + header:
      - Uses `syncAssetUi` and local `isSyncingAsset` state.
      - Handles errors via `lastError` banner.
  - 92% Payout Assets panel ([gui/Dashboard/src/components/AssetPanel.jsx](../Dashboard/src/components/AssetPanel.jsx))
    - Displays `payoutAssets` list.
    - On row click: calls `setSelectedAsset(asset)`.
    - New **panel-level Sync UI button**:
      - Calls `syncAssetUi()` directly.
      - Intended to sync the currently selected asset to Pocket Option in one click.

### 1.2 What Works

- **Favorite-click automation** is now wired end-to-end:
  - QuFLX → backend → `favorites_walk_select` → favorites bar click in Pocket Option.
- The **Sync Asset UI button** successfully:
  - Clicks the correct favorite in Pocket Option based on the selected QuFLX asset.
  - Uses the same robust span→anchor logic and click pipeline already proven in timeframe automation.
- Error handling is **explicit**:
  - HTTP errors from `/api/v1/sync-asset-ui` are translated into `lastError` and surfaced in the UI.
  - Capability-level errors (e.g. no visible favorites, filters eliminating all candidates) are surfaced as 500 with clear `detail`.

### 1.3 Current Limitation (User Observation)

- When selecting an asset in the 92% panel:
  - `setSelectedAsset(asset)` triggers history loading and chart updates.
  - **While the asset is still loading**, the user often **cannot** immediately trigger a reliable sync via `Sync Asset UI`.
  - Practically, the user ends up waiting until the chart has already started/finished loading before clicking Sync.

- Why this is not ideal:
  - The desired workflow is:
    1. Select asset in QuFLX.
    2. Sync Pocket Option asset (favorites click).
    3. Load historical data in QuFLX **with streaming active**, using the freshly synced PO chart for context.
  - Currently, effective usage is reversed:
    1. Select asset → QuFLX starts history load.
    2. Only after chart load can the user safely sync the PO asset.
  - This undermines the goal of having historical context bootstrapped exactly when the PO stream is aligned.

---

## 2. Desired Behavior & Constraints

### 2.1 Desired UX

1. **Immediate sync availability**
   - Right after selecting an asset in the 92% panel or header Combobox, the Sync Asset UI button should be:
     - Clickable.
     - Reliable.
   - The user should not be forced to wait for chart data or history loading.

2. **Safe ordering for history loading**
   - Ideally, the effective order at the system level should become:
     1. User selects asset in QuFLX.
     2. Pocket Option favorites bar is clicked (asset focused there).
     3. Historical data + streaming bootstrap runs against that aligned state.

3. **User control preserved**
   - Sometimes PO or network conditions make it safer to manually stage steps.
   - Users must be able to:
     - Select asset.
     - Decide when to sync.
     - Decide when to reload history, instead of a single opaque “do everything” action.

### 2.2 Operational Constraints

- **CORE_PRINCIPLES.md alignment**
  - Functional simplicity: avoid over-complicated orchestration that is hard to debug.
  - Sequential logic: keep clear, observable steps (select → sync → load history).
  - Incremental testing: each step must be testable in isolation.
  - Zero assumptions: must not hard-code timing assumptions about PO UI (e.g., fixed delays instead of DOM checks).

- **Existing architecture**
  - Backend gateway already has separate endpoints for:
    - Timeframe select & sync.
    - Asset refresh.
    - History bootstrap.
    - Now asset sync.
  - Frontend store is the coordination layer between WebSocket streaming, history, and UI automation calls.

---

## 3. Root Causes of the Current Friction

1. **Selection triggers history load immediately**
   - `setSelectedAsset` in `marketStore` currently:
     - Sets `selectedAsset` and `selectedAssetKey`.
     - Calls `syncSubscriptions(nextAssetKey)` for streaming rooms.
     - Calls `loadHistory(asset)` **immediately**.
   - There is no notion of “wait for sync to PO UI before loading history”.

2. **Sync Asset UI is “out-of-band”**
   - `syncAssetUi` is just another action in the store, not integrated with `setSelectedAsset` or `loadHistory` flow.
   - The user’s mental model (“select → sync → load”) is not represented explicitly in the store’s sequencing.

3. **Race windows between UI states**
   - In practice, Pocket Option chart, QuFLX history, and streaming may each be in their own transitional states.
   - Without a coordinated flow, the “safe window” for syncing vs loading history becomes trial-and-error from the user’s POV.

---

## 4. Recommended Next Steps (Actionable Plan)

### 4.1 Step 1 – Keep Sync Independent of History Loading (Minimal Change)

**Goal:** Ensure the Sync Asset UI button is always usable right after asset selection, regardless of chart loading state.

**Key points:**
- Confirm that the Sync button is **not** disabled by any “loading” or overlay state.
- Ensure `syncAssetUi` uses the asset from the store, which is already updated synchronously by `setSelectedAsset`.

**Actions:**
1. Review any UI conditions that might prevent Sync from being clicked (e.g., overlays that intercept clicks, disabled states tied to history load).
2. If necessary, adjust:
   - The overlay to be pointer-events-none for the top bar area, or
   - The disabled conditions to rely **only** on `isSyncingAsset`.
3. Add a simple log/metric (dev mode only) to confirm Sync can be triggered within milliseconds of selection.

**Benefits:**
- Immediate improvement with virtually no backend changes.
- Maintains full manual control over when to sync.

---

### 4.2 Step 2 – Introduce an Optional "Auto Sync on Select" Mode

**Goal:** When enabled, make the pipeline:

> Select Asset in QuFLX → Sync Pocket Option asset → On success, load history.

**Design:**

1. **New store flag**
   - Add to `createUiSlice` or `createMarketSlice`:
     - `autoSyncAssetOnSelect: boolean` (default `false`).
   - This can later be surfaced as a toggle in the Dashboard (e.g., under Data Source controls).

2. **Composite action: `selectAssetWithSync`**
   - New store method (conceptual sketch):

   ```js
   selectAssetWithSync: async (asset) => {
     if (!asset) return;

     // 1) Update selected asset state immediately for UI feedback
     const nextAssetKey = normalizeAsset(asset);
     set({
       selectedAsset: asset,
       selectedAssetKey: nextAssetKey,
       marketData: {},
     });

     get().syncSubscriptions(nextAssetKey);

     try {
       // 2) Sync Pocket Option favorites first
       await get().syncAssetUi();
     } catch (err) {
       // syncAssetUi already sets lastError; log and abort history load
       console.error('Auto sync on select failed:', err);
       return;
     }

     // 3) Only after successful sync, load history
     try {
       await get().loadHistory(asset);
     } catch (err) {
       console.error('History load after sync failed:', err);
       // loadHistory already sets lastError; no extra state needed here
     }
   };
   ```

3. **Conditional wiring in AssetPanel**
   - When the user clicks an asset row:
     - If `autoSyncAssetOnSelect` is `false` (default):
       - Use existing `setSelectedAsset(asset)` behavior.
     - If `autoSyncAssetOnSelect` is `true`:
       - Call `selectAssetWithSync(asset)` instead.

4. **Error behavior**
   - If `syncAssetUi` fails (e.g., no favorite found, PO not in correct page):
     - `lastError` is set with a human-readable message.
     - `selectAssetWithSync` **does not** call `loadHistory`.
     - The user sees the error and can retry after fixing PO context.

**Benefits:**
- Aligns with the desired safe sequencing without removing manual control.
- Respects separation of concerns:
  - Capability: still just clicks favorites.
  - Backend: just exposes `/sync-asset-ui`.
  - Store: orchestrates selection, sync, and history.

---

### 4.3 Step 3 – Optional Backend Orchestrator (Only if Needed)

If issues persist even after Step 2, consider a backend "asset sync orchestrator" that:

1. Invokes `favorites_walk_select` for the target asset.
2. Verifies that the PO chart has actually switched to the requested asset by checking:
   - The active asset label.
   - Or a combination of DOM markers and payout labels.
3. Only then signals success back to the frontend, which can safely trigger history loading.

**Caution:**
- This adds complexity on the Selenium side and must be balanced against the simplicity principle.
- Should only be pursued after we have:
  - Clear metrics/logs showing that PO sometimes lags behind the favorites click.
  - Evidence that this lag is causing systematic history-load failures.

---

## 5. Proposed Implementation Order

1. **Finalize Stationary Behavior (Now)**
   - Confirm Sync Asset UI is always clickable post-selection.
   - Ensure no frontend loading state prevents the sync action itself.

2. **Implement `autoSyncAssetOnSelect` (Short-Term)**
   - Add store flag + toggle.
   - Implement `selectAssetWithSync`.
   - Wire AssetPanel row click to use this composite method when enabled.
   - Add basic logging in dev mode for:
     - Sync success/failure.
     - Time between selection and history load start.

3. **Observe in Real Usage (Medium-Term)**
   - Use the system in both modes:
     - Manual (two-step).
     - Assisted (auto sync on select).
   - Collect examples where:
     - History loads correctly.
     - History fails when PO is not ready.

4. **Reassess Need for Backend Orchestrator (Later)**
   - If assisted mode plus clear errors prove sufficient → keep it simple.
   - If persistent race conditions remain → design a minimal backend orchestrator around PO DOM verification.

---

## 6. Alignment with CORE_PRINCIPLES

- **Functional Simplicity First**
  - Stepwise plan avoids a large, opaque “do everything” function.
  - Sync, selection, and history remain separate but can be composed in the store.

- **Sequential Logic**
  - Assisted mode formalizes the sequence: select → sync → load history.

- **Incremental Testing**
  - Each step (sync alone, history alone, composite flow) is testable independently.

- **Zero Assumptions**
  - No hard-coded timing; we rely on explicit completion of `syncAssetUi` before history in assisted mode.

- **Code Integrity & Backward Compatibility**
  - Existing manual behavior remains default.
  - Assisted mode is opt-in, minimizing surprise for current workflows.

- **Defensive & Explicit Error Handling**
  - `syncAssetUi` and `loadHistory` already set `lastError` with detailed messages.
  - Composite flow aborts history load on sync failure.

This report should serve as the reference for future work on asset sync behavior. The next implementation step is to add `autoSyncAssetOnSelect` and the `selectAssetWithSync` composite action in the store, then wire it into `AssetPanel` with a clear UI toggle.
