# Asset Sync & Select Guide
**Version:** 1.0  
**Last Updated:** 2026-01-02

This guide explains how to use the **Asset Sync & Select** workflow between **QuFLX** and **Pocket Option** using the favorites bar automation.

The goal is to keep the **QuFLX chart asset**, **Pocket Option active asset**, and **historical + streaming data** aligned with as little friction as possible, while still allowing you to control the timing when necessary.

---

## 1. Concepts

### 1.1 What "Sync Asset UI" Does

- Uses a Selenium-based capability (`favorites_walk_select`) to:
  - Walk the Pocket Option favorites bar.
  - Find the asset whose label matches your QuFLX asset (using normalized names).
  - Click the favorite using a robust span→anchor click pipeline.
- The backend endpoint is:
  - `POST /api/v1/sync-asset-ui` with payload `{ asset, min_pct }`.
- In the Dashboard store, this is wrapped in:
  - `syncAssetUi()` → used by both the chart header and the 92% Payout panel.

### 1.2 Why There Are Two Steps

Historically, QuFLX and Pocket Option were decoupled:

1. You would **select an asset** in QuFLX to load history and stream market data.
2. You would **manually click the asset** in Pocket Option favorites.

This separation prevented race conditions where history requests fired before the Pocket Option chart was ready.

The new workflow adds automation, but keeps this philosophy: you can still run **select** and **sync** either separately or in a controlled combined flow.

---

## 2. Manual Workflow (Maximum Control)

This is the most explicit and controllable mode.

1. **Select asset in 92% Payout Assets panel**
   - File: `AssetPanel.jsx`.
   - Click a row in the `92% Payout Assets` list.
   - This calls `setSelectedAsset(asset)` in the store.
   - Store behavior:
     - Updates `selectedAsset` / `selectedAssetKey`.
     - Calls `syncSubscriptions` for streaming.
     - Calls `loadHistory(asset)` to fetch historical data.

2. **Wait for chart / history to start**
   - You will see a loading overlay on the main chart area:
     - "Loading data for {selectedAsset}..."

3. **Sync Pocket Option asset when you decide it's safe**
   - Use either:
     - **Chart Header** → `Sync Asset UI` button next to the timeframe ComboBox, or
     - **92% Payout Assets panel** header → `Sync UI` button.
   - Both call `syncAssetUi()` which hits `/api/v1/sync-asset-ui`.

4. **If something fails**
   - Look at the red error banner above the chart (`lastError`).
   - Typical issues:
     - Pocket Option UI not focused on the trading chart.
     - Favorites bar not visible or DOM changed.
     - Chrome debugging session not attached.

**Use this mode when:**
- You are debugging behavior.
- You want to explicitly stage selection, history loading, and UI sync.

---

## 3. Assisted Workflow – Auto Sync on Select

When you want a smoother, more integrated flow you can enable **Auto Sync on Select**.

### 3.1 Enabling Auto Sync on Select

1. Open the **Dashboard**.
2. In the **Data Source** card (top-left of AssetPanel):
   - You will see a switch labeled **"Auto Sync on Select"**.
   - Turn it **ON**.

This toggles `autoSyncAssetOnSelect` in the UI slice of `marketStore`.

### 3.2 What Changes When It’s ON

With Auto Sync on Select enabled:

- Clicking a row in the `92% Payout Assets` list will:
  1. Update `selectedAsset` / `selectedAssetKey` in the store.
  2. Call `syncSubscriptions` so streaming switches to the new asset.
  3. Call `syncAssetUi()` **first**:
     - Backend triggers `favorites_walk_select` for that single asset.
     - Pocket Option favorites bar is clicked.
  4. Only if the sync succeeds, call `loadHistory(asset)` to fetch candles.

- Implementation hook:

  ```jsx
  filteredPayoutAssets.map((asset) => (
    <div
      key={asset}
      onClick={() => {
        if (autoSyncAssetOnSelect) {
          selectAssetWithSync(asset);
        } else {
          setSelectedAsset(asset);
        }
      }}
      ...
    >
      ...
    </div>
  ))
  ```

- The composite logic lives in `selectAssetWithSync(asset)` in `marketStore`.

### 3.3 Failure Behavior

- If `syncAssetUi()` fails (e.g., no matching favorite, Pocket Option not ready):
  - `selectAssetWithSync` **does not** call `loadHistory`.
  - `lastError` is set with a human-readable reason (from backend `detail`).
  - The asset is still visually selected in QuFLX, but history is not reloaded until sync issues are fixed.

- This preserves the principle: **if sync is not safe, we do not load history based on a potentially wrong PO context**.

---

## 4. Chart Header Sync Controls

Above the main chart, in `ChartHeader`, you have two sync-related buttons:

1. **Sync TF UI**
   - Calls `syncTimeframeUi()`.
   - Uses `/api/v1/sync-timeframe-ui` and `timeframe_menu` capability.

2. **Sync Asset UI**
   - Calls `syncAssetUi()` (same as the panel header button).
   - Useful when:
     - You are in manual mode and want to sync after seeing how history behaves.
     - You want to re-sync after adjusting Pocket Option manually.

Both buttons show a short **"Syncing"** state while the request is in flight.

---

## 5. Recommended Usage Patterns

### 5.1 Stable, Daily Use

- Turn **Auto Sync on Select** ON.
- Flow per trade idea:
  1. Use 92% Payout Assets panel to pick your asset.
  2. Let the system auto-sync PO favorites and then load history.
  3. Use the chart header Sync buttons only for corrections.

### 5.2 Debugging / Edge Case Investigation

- Turn **Auto Sync on Select** OFF.
- Flow:
  1. Select asset → watch history and streaming behavior.
  2. Click Sync Asset UI only when you want to test the PO click behavior.
  3. Compare results, inspect error messages and logs.

---

## 6. Troubleshooting Checklist

1. **Sync Asset button reports errors immediately**
   - Check the red error banner for details.
   - Common fixes:
     - Ensure Chrome debugging port (9222) is open.
     - Ensure the Pocket Option trading chart is visible in the attached window.

2. **No favorites seem to be clicked**
   - Verify the asset name mapping:
     - QuFLX internal asset is normalized (e.g., `AUDNZDOTC`).
     - Favorites bar label matches after normalization (`AUD/NZD OTC`).
   - Ensure the asset is actually starred in Pocket Option favorites.

3. **History doesn’t load after Auto Sync**
   - With Auto Sync enabled, this usually means `syncAssetUi` failed:
     - Check `lastError` text.
     - Resolve the underlying PO UI problem (e.g., wrong page, no favorite).
     - Try again.

4. **Performance or race issues**
   - If you suspect race conditions:
     - Temporarily disable Auto Sync on Select.
     - Use the manual two-step workflow to isolate which step is problematic.

---

## 7. Summary

- You now have **two levels of control** over asset synchronization:
  - **Manual**: select asset and sync when you choose.
  - **Assisted**: Auto Sync on Select, which enforces the sequence
    **select → sync PO favorites → load history**.

- The implementation is designed to:
  - Respect your need for historical context alongside live streaming.
  - Avoid loading history against a misaligned Pocket Option state.
  - Keep the flow debuggable and transparent.

Use Auto Sync on Select when you want speed and convenience; switch back to manual control when you need to diagnose or fine-tune the interaction between QuFLX and Pocket Option.
