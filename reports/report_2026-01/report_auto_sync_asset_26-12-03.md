# Auto Sync Asset – Feature Overview and Current Issues
**Date:** 2026-01-03  
**Status:** Draft – For review before next task  
**Author:** @Team-Leader

---

## 1. Purpose of Auto Sync Asset

The **Auto Sync on Select** feature is designed to keep three layers aligned when the user selects an asset in the QuFLX dashboard:

1. **QuFLX state** – `selectedAsset`, `selectedAssetKey`, subscriptions.
2. **Pocket Option UI** – active asset in the favorites bar and chart.
3. **Backend data** – historical candles + real-time streaming used to populate the chart and indicators.

The intended high-level flow when Auto Sync is enabled is:

> User clicks asset in 92% Payout panel → QuFLX selects asset → Pocket Option favorite is clicked → stream ticks start for that asset → chart history is bootstrapped for the current timeframe.

This report summarizes how the feature is implemented in backend and frontend, and details the issues currently observed.

---

## 2. Backend Implementation

### 2.1 Asset Sync Endpoint – `/api/v1/sync-asset-ui`

**File:** `backend/services/gateway/main.py`

The endpoint:

```python
@app.post("/api/v1/sync-asset-ui")
async def sync_asset_ui(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    if not asset or not isinstance(asset, str):
        raise HTTPException(status_code=400, detail="Asset required")

    min_pct = payload.get("min_pct", 92)
    try:
        min_pct_int = int(min_pct)
    except Exception:
        raise HTTPException(status_code=400, detail="min_pct must be an integer")

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py")
        )

        inputs = {
            "assets": [asset],
            "min_pct": min_pct_int,
            "all": False,
        }

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        result = subprocess.run(
            [
                sys.executable,
                runner_path,
                "favorites_walk_select",
                "--inputs",
                json.dumps(inputs),
                "--verbose",
            ],
            capture_output=True,
            text=True,
            env=env,
        )

        if result.returncode != 0:
            logger.error(f"Sync asset UI failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")

        try:
            out = _parse_script_json(result.stdout)
        except Exception as e:
            logger.error(f"Invalid sync asset UI output: {e} | raw={result.stdout}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            detail = str(out.get("error") or "asset sync failed")
            raise HTTPException(status_code=500, detail=detail)

        data = out.get("data", {})

        return {
            "status": "success",
            "asset": asset,
            "min_pct": min_pct_int,
            "data": data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync asset UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**Behavior:**

- Calls the v2 capability runner with `favorites_walk_select`:
  - Inputs: `{"assets": [asset], "min_pct": min_pct_int, "all": False}`.
  - Uses the enhanced favorites bar logic to:
    - Reset favorites bar.
    - Scan visible favorites and match by label.
    - Click the matching favorite using span→anchor traversal and JS fallback.
- Returns 200 only when the capability reports `ok: true`.
- On any failure (no match, Selenium issue, etc.), returns 4xx/5xx with a descriptive `detail`.

This endpoint is the **only** path the Auto Sync feature uses to click the Pocket Option favorite.

---

## 3. Frontend Implementation

### 3.1 Store: Auto Sync Mode and Core Actions

**File:** `gui/Dashboard/src/store/marketStore.js`

#### 3.1.1 UI slice – Auto Sync Toggle

```javascript
const createUiSlice = (set) => ({
  ...
  autoSyncAssetOnSelect: false,
  toggleAutoSyncAssetOnSelect: () =>
    set((state) => ({ autoSyncAssetOnSelect: !state.autoSyncAssetOnSelect }))
});
```

- `autoSyncAssetOnSelect` controls whether clicking an asset in the 92% panel:
  - Just selects the asset (`setSelectedAsset`), or
  - Runs the full auto-sync flow (`selectAssetWithSync`).

#### 3.1.2 Asset selection and sync actions

- **setSelectedAsset** – manual selection (no automation):

  ```javascript
  setSelectedAsset: async (asset) => {
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey
    });

    get().syncSubscriptions(nextAssetKey);

    try {
      await get().loadHistory(asset);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },
  ```

- **syncAssetUi** – call backend sync endpoint:

  ```javascript
  syncAssetUi: async () => {
    const { selectedAsset, selectedAssetKey, payoutAssets } = get();
    if (!selectedAsset) {
      set({ lastError: 'No selected asset to sync UI' });
      return;
    }

    const source = Array.isArray(payoutAssets) ? payoutAssets : [];
    const normKey = selectedAssetKey || normalizeAsset(selectedAsset);
    const mapped = source.find((a) => normalizeAsset(a) === normKey);
    const uiAsset = mapped || selectedAsset;

    try {
      const response = await fetch('http://localhost:8000/api/v1/sync-asset-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: uiAsset, min_pct: 92 })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail || `Failed to sync asset UI for: ${uiAsset}`;
        console.error('Sync asset UI failed:', detail);
        set({ lastError: detail });
      }
    } catch (err) {
      console.error('Sync asset UI request failed:', err);
      set({ lastError: `Network error syncing asset UI: ${err.message}` });
    }
  },
  ```

  - Maps QuFLX internal asset keys to the human-readable favorites label using `normalizeAsset` both ways.
  - Calls `/api/v1/sync-asset-ui` with the matched label.

- **selectAssetWithSync** – composite Auto Sync flow:

  ```javascript
  selectAssetWithSync: async (asset) => {
    if (!asset) return;

    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey
    });

    get().syncSubscriptions(nextAssetKey);

    try {
      await get().syncAssetUi();
    } catch (err) {
      console.error('Auto sync on select failed:', err);
      return;
    }

    try {
      const ready = await get().awaitStreamingForSelectedAsset(3000, 200);
      if (!ready) {
        const msg = `No streaming ticks detected for ${asset} within 3s after sync. Check Pocket Option chart and connection.`;
        console.error(msg);
        set({ lastError: msg });
        return;
      }
    } catch (err) {
      console.error('Streaming readiness check failed:', err);
    }

    try {
      await get().loadHistory(asset);
    } catch (err) {
      console.error('History load after sync failed:', err);
    }
  },
  ```

  - This is used only when `autoSyncAssetOnSelect` is `true`.
  - Enforces the sequence:

    > select asset → sync Pocket Option favorite → wait for ticks → load history

#### 3.1.3 Streaming readiness helpers

To avoid loading history against a stale or inactive stream, the store adds:

```javascript
hasRecentTicksForSelectedAsset: (windowMs = 5000) => {
  const { selectedAssetKey, marketData } = get();
  if (!selectedAssetKey) return false;
  const ticks = marketData[selectedAssetKey] || [];
  if (!ticks.length) return false;
  const now = Date.now();
  const last = ticks[ticks.length - 1];
  if (!last) return false;
  const ts = typeof last.receivedAt === 'number' ? last.receivedAt : now;
  return now - ts <= windowMs;
},

awaitStreamingForSelectedAsset: async (timeoutMs = 3000, pollMs = 200) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (get().hasRecentTicksForSelectedAsset(timeoutMs)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
},
```

And in the WebSocket handler:

```javascript
socket.on('market_data', (data) => {
  const validation = validateMarketData(data);
  if (!validation.valid) {
    console.warn('Invalid market data ignored:', validation.error, data);
    return;
  }

  const { asset: assetKey, price, timestamp } = validation;

  set((state) => {
    const currentData = state.marketData[assetKey] || [];
    const newData = [...currentData, { price, timestamp, receivedAt: Date.now() }].slice(-100);

    const baseline = state.quotesByAssetKey[assetKey]?.baseline || price;
    const changePct = ((price - baseline) / baseline) * 100;

    return {
      lastTickTimestamp: Date.now(),
      marketData: {
        ...state.marketData,
        [assetKey]: newData
      },
      baselineByAssetKey: {
        ...state.baselineByAssetKey,
        [assetKey]: baseline
      },
      quotesByAssetKey: {
        ...state.quotesByAssetKey,
        [assetKey]: {
          price,
          baseline,
          changePct,
          timestamp
        }
      }
    };
  });
});
```

- `receivedAt` gives a stable, frontend-based time in ms to judge whether ticks are "recent" for the selected asset.

### 3.2 UI: Auto Sync Toggle and Asset Clicks

**File:** `gui/Dashboard/src/components/AssetPanel.jsx`

- The 92% Payout Assets panel shows an **Auto Sync on Select** toggle at the top of the card:

  ```jsx
  <Card className="p-3 rounded-lg flex-1 flex flex-col min-h-0 quflx-section-light">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase font-bold text-gray-400">Auto Sync on Select</span>
        <ToggleSwitch 
          checked={autoSyncAssetOnSelect} 
          onChange={toggleAutoSyncAssetOnSelect} 
        />
      </div>
    </div>
    ...
  ```

- Asset row click handler:

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
      className={...}
    >
      ...
    </div>
  ))
  ```

- The chart header no longer exposes asset sync; it only exposes timeframe sync. Asset sync is controlled exclusively via Auto Sync on Select in the 92% panel.

---

## 4. Current Issues Observed

### 4.1 History 500 / 404 for certain OTC assets

Symptoms:

- When selecting some assets (e.g. `CHF/JPY OTC`, `AUD/CHF OTC`) and timeframes, console shows:

  ```text
  POST /api/v1/bootstrap-history 500 (Internal Server Error)
  GET /api/v1/history/CHF%2FJPY%20OTC?timeframe=1&limit=200 404 (Not Found)
  ```

- At the same time, **real-time candles are visible and updating** on the chart for that asset/timeframe.

Interpretation:

- Streaming is working; ticks are arriving and being aggregated into live candles.
- The history pipeline is failing:
  - `/api/v1/bootstrap-history` uses `HistoryCollector` via capabilities_v2 and returns 500 when:
    - No history events are captured, or
    - The collector encounters another error (e.g. interceptor import failure).
  - `/api/v1/history/{asset}` looks for a CSV under `data/data_output/history/<asset_clean>/<timeframe>.csv` and returns 404 when it doesn’t exist.

In short: **Auto Sync on Select correctly syncs and streaming works, but history CSVs for some OTC assets/timeframes are missing or bootstrap fails**, leading to error banners even though the chart is showing live data.

### 4.2 History availability depends on prior collection

- The Collect History feature (`/api/v1/collect-history` → `CollectHistoryLoop` → `HistoryCollector.collect_and_save`) writes CSVs like:

  - `data/data_output/history/AED_CNY_OTC/30.csv`

- If those CSVs exist for a given `(asset, timeframe)` pair, `/api/v1/history` can serve history successfully.
- If they do not exist, `/api/v1/history` returns 404 and `/bootstrap-history` must collect on-demand (which is less robust for some assets).

This explains why some assets/timeframes behave better after a successful Collect History run.

### 4.3 Timeframe selection robustness in history collection

- The **history collector** relies on the Pocket Option chart being set to the intended timeframe before capturing history.
- The robust solution uses `TimeframeSelectSync` (with retries, chart-focus recovery, etc.), but `CollectHistoryLoop` can be configured either to:
  - Use `TimeframeSelectSync` (`use_tf_sync: true`), or
  - Use `TimeframeMenu` directly (`use_tf_sync: false`).
- If history collection (either batch via `/collect-history` or on-demand via `/bootstrap-history`) is not always using the robust timeframe selection logic, it may occasionally capture history for the wrong timeframe or fail to capture history at all.

### 4.4 Rare streaming readiness false-negatives (partially addressed)

- Initially, the streaming readiness check compared `Date.now()` to the tick’s backend `timestamp`, which might be in seconds or another time base.
- This caused spurious "No streaming ticks detected" errors even when live candles were visible.
- This was addressed by introducing a `receivedAt: Date.now()` field for each tick, and using that in `hasRecentTicksForSelectedAsset`.

Residual risk:

- If the asset key used by `marketData` does not match `selectedAssetKey` for certain edge cases, the readiness check may still be off for those assets.

### 4.5 React "Maximum update depth exceeded" warning

- A separate React warning appears occasionally:

  ```text
  Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.
  ```

- This indicates a potential render loop in one of the Dashboard components (not yet fully analyzed in this report).
- It does not appear to be directly caused by Auto Sync on Select, but any additional state changes (errors, streaming flags) can exacerbate rendering sensitivity.

---

## 5. Summary of Feature Status

- **Working well:**
  - Mapping QuFLX asset → Pocket Option favorite label via `normalizeAsset`.
  - End-to-end asset sync via `/api/v1/sync-asset-ui` and `favorites_walk_select`.
  - Auto Sync flow that updates selection, syncs PO, and waits for streaming ticks.
  - Live candles for OTC assets when streaming is active.

- **Problematic areas:**
  - On-demand history bootstrap (`/api/v1/bootstrap-history` + `/api/v1/history`) for some OTC assets/timeframes.
  - Incomplete or missing CSV history for certain asset/timeframe combinations.
  - Potential inconsistencies in timeframe selection during batch history collection, depending on whether `TimeframeSelectSync` is used.

---

## 6. Next Steps (for follow-up task)

The next Auto Sync task should focus on:

1. **Surface richer error details for history failures**
   - Capture `detail` from `/api/v1/bootstrap-history` and expose it via `lastError` when history fails.
   - This will clarify whether failures are due to:
     - No data collected by `HistoryCollector` for that asset/timeframe.
     - Interceptor/attachment issues.
     - Asset naming mismatches for history.

2. **Align history collection with timeframe automation best practices**
   - Ensure `/api/v1/collect-history` (and, where appropriate, `/api/v1/bootstrap-history`) uses `TimeframeSelectSync` with tuned parameters:
     - `use_tf_sync: true`
     - Reasonable `tf_attempts`, `tf_delay_ms`, `tf_wait_s`, `focus_on_chart`.
   - This re-uses the robust timeframe selection pipeline validated in `implementation_report_topdown_select_25-12-31.md`.

3. **Clarify expectations between live streaming vs. history**
   - Document and, if needed, adjust the UI to make clear:
     - Live candles may exist even when historical CSVs/history bootstrap are missing.
     - Indicators and some analytics depend on historical data; when history is missing, the UI should highlight that clearly.

4. **Optional: asset/timeframe mapping improvements**
   - If history failures concentrate on specific symbols (e.g. CHF/JPY OTC, AUD/CHF OTC), investigate per-asset issues:
     - Verify `HistoryCollector._normalize_asset(asset)` is consistent with favorites labels and history paths.
     - Adjust labeling or introduce an asset mapping layer for history if necessary.

5. **Investigate and fix any React render loops**
   - Identify the specific component triggering "Maximum update depth exceeded" and correct its effect/state logic.
   - This will make the dashboard more stable under frequent asset/timeframe changes.

This report is intended as a snapshot of the current Auto Sync Asset implementation and known issues to guide the next, more focused task.
