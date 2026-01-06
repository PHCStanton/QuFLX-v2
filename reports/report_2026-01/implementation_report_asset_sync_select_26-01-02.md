# Implementation Report: Asset Sync & Select Integration
**Date:** 2026-01-02  
**Status:** Completed (Phase 1 + Assisted Mode + Streaming Readiness Gate)  
**Author:** @Team-Leader

---

## 1. Executive Summary

This report documents the implementation of an **Asset Sync & Select** workflow that connects the QuFLX Dashboard to the Pocket Option UI via the favorites bar automation.

Key outcomes:

- A new backend endpoint `/api/v1/sync-asset-ui` allows QuFLX to programmatically click a specific favorite in Pocket Option using the `favorites_walk_select` capability.
- The Dashboard gained:
  - An **Auto Sync on Select** toggle that optionally combines asset selection, Pocket Option sync, a streaming readiness check, and history loading into one controlled pipeline.
  - Simplified UI: asset sync is now driven exclusively via Auto Sync on Select in the 92% panel (no extra Sync Asset buttons in the chart header or panel header).
- A **streaming readiness gate** was added so that, after syncing the Pocket Option asset, the system waits for real-time ticks for that asset before triggering history bootstrap. This aligns the history load with an actually active stream.
- The design preserves manual control and debuggability while enabling a smoother and safer “select → sync → confirm stream → load history” workflow.

All changes align with `CORE_PRINCIPLES.md`, emphasizing functional simplicity, sequential logic, explicit error handling, and incremental testing.

---

## 2. Components and Changes

### 2.1 Capability Layer – Favorites Walk & Click

**File:** `capabilities_v2/favorites_walk_select.py`

- Acts as an orchestrator over `FavoritesBar`:
  - Resets favorites bar to the far left.
  - Iteratively scans visible favorites.
  - Filters by:
    - Payout percentage (`min_pct`, default 92).
    - Asset name patterns (`assets` list) unless `all` is true.
  - Clicks each eligible favorite once.
  - Optionally scrolls right through multiple pages.
- Recent enhancements (from prior work, referenced here):
  - Added `filter_stats` and `pages` data to the result payload.
  - Tightened `ok` semantics:
    - `ok` is true only when at least one favorite is successfully selected.
    - If no favorites are selected and no hard errors occurred, the capability now returns meaningful error messages (e.g., no favorites visible, no favorites met filter criteria).

**File:** `capabilities_v2/favorites_bar.py`

- Provides low-level control and readout of the Pocket Option favorites bar:
  - `_reset_to_left` / `_scroll_right` use `HighPriorityControls` to move the favorites viewport.
  - `_get_visible_favorites` reads asset labels and payout values from the DOM (`.assets-favorites-item__line`, `.assets-favorites-item__label`, `.payout__number`).
  - `_click_favorite` uses `HighPriorityControls.ensure_clickable_anchor` to traverse from label `<span>` to the correct `<a>` element before clicking.
- Added diagnostics when `ctx.debug` is true:
  - Saves JSON snapshots of visible favorites under `favorites_walk_select` artifacts for post-run analysis.

These capabilities serve as the mechanical backbone for asset sync; the higher layers coordinate when and how they are invoked.

---

### 2.2 Backend Gateway – `/api/v1/sync-asset-ui`

**File:** `backend/services/gateway/main.py`

New endpoint:

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

**Key characteristics:**

- Uses the same `runner.py` capability harness used elsewhere (timeframe sync, refresh-assets, history bootstrap).
- Normalizes script output via `_parse_script_json` to handle log lines before the JSON.
- Returns structured JSON and clear HTTP error codes:
  - 400: bad input (missing asset, invalid min_pct).
  - 500/502: capability failure or malformed output.

This endpoint is the single entrypoint used by the Dashboard for syncing a specific asset.

---

### 2.3 Dashboard Store – Asset Sync & Assisted Selection

**File:** `gui/Dashboard/src/store/marketStore.js`

#### 2.3.1 Asset normalization & selection

- Normalization helper:

  ```javascript
  const normalizeAsset = (asset) => {
    if (!asset) return '';
    return String(asset).replace(/[_/\s]/g, '').toUpperCase();
  };
  ```

- Existing `setSelectedAsset`:
  - Sets `selectedAsset` and `selectedAssetKey`.
  - Calls `syncSubscriptions(nextAssetKey)`.
  - Calls `loadHistory(asset)`.

#### 2.3.2 syncAssetUi action

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

- Maps QuFLX internal asset identifiers (e.g. `AUDNZDOTC`) to Pocket Option favorites bar labels (e.g. `AUD/NZD OTC`) using the same normalization logic.
- Surfaces all errors via `lastError` and console logs.

#### 2.3.3 Auto Sync Mode and Composite Selection

In the UI slice:

```javascript
autoSyncAssetOnSelect: false,
toggleAutoSyncAssetOnSelect: () =>
  set((state) => ({ autoSyncAssetOnSelect: !state.autoSyncAssetOnSelect }))
```

In the market slice (initial version):

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
    await get().loadHistory(asset);
  } catch (err) {
    console.error('History load after sync failed:', err);
  }
},
```

This composite action initially enforced the order:

> select asset → sync Pocket Option favorite → load history

#### 2.3.4 Streaming readiness gate (updated behavior)

To better align history loading with an actually active stream for the selected asset, a **streaming readiness gate** was introduced.

New helpers in the market slice:

```javascript
hasRecentTicksForSelectedAsset: (windowMs = 5000) => {
  const { selectedAssetKey, marketData } = get();
  if (!selectedAssetKey) return false;
  const ticks = marketData[selectedAssetKey] || [];
  if (!ticks.length) return false;
  const now = Date.now();
  const last = ticks[ticks.length - 1];
  if (!last || typeof last.timestamp !== 'number') return false;
  return now - last.timestamp <= windowMs;
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

Updated `selectAssetWithSync` now uses this gate between `syncAssetUi` and `loadHistory`:

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

This revised flow enforces a stricter sequence when Auto Sync on Select is enabled:

> select asset → sync Pocket Option favorite → **confirm streaming ticks for asset** → load history

If no ticks arrive within ~3 seconds after sync, history is **not** invoked, and a clear error message is set via `lastError`.

---

### 2.4 Dashboard UI – Toggles and Views

#### 2.4.1 Chart Header

**File:** `gui/Dashboard/src/components/ChartHeader.jsx`

- The chart header now focuses on timeframe control and indicators. It no longer includes a dedicated **Sync Asset UI** button.
- It still supports "Sync TF UI" for timeframe synchronization via `syncTimeframeUi`, but asset sync is exclusively driven by the 92% panel and Auto Sync on Select.

This simplification reduces clutter and makes the asset sync behavior easier to reason about.

#### 2.4.2 92% Payout Assets Panel

**File:** `gui/Dashboard/src/components/AssetPanel.jsx`

- Store fields used:

  ```javascript
  const { 
    payoutAssets, 
    selectedAsset, 
    setSelectedAsset,
    removePayoutAsset,
    refreshAssets,
    autoRefresh,
    toggleAutoRefresh,
    panelMode,
    setPanelMode,
    quotesByAssetKey,
    tickerMaxAssets,
    backendStatus,
    collectHistory,
    setAssetFilterState,
    autoSyncAssetOnSelect,
    toggleAutoSyncAssetOnSelect,
    selectAssetWithSync,
  } = useMarketStore();
  ```

- **Auto Sync on Select** toggle is now surfaced prominently at the top of the Assets/Ticker card:

  ```jsx
  {/* Assets / Ticker Container */}
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

    <div className="flex justify-between items-center mb-2 shrink-0">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
        {panelMode === 'list' ? '92% Payout Assets' : 'OTC Ticker'}
        {panelMode === 'list' && (
          <span className="text-xs bg-accent-green text-black px-1.5 py-0.5 rounded font-bold">
            {payoutAssets.length}
          </span>
        )}
        {/* tooltip omitted for brevity */}
      </h3>

      {/* View Toggle */}
      <div className="flex bg-gray-800 rounded p-0.5 border border-gray-700">
        ...
      </div>
    </div>
  ```

- The **panel header Sync UI button** was removed. Asset sync now happens only through Auto Sync on Select + row clicks, or manual selection without automation when the toggle is off.

- Asset row click behavior:

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

This wiring gives users a choice between **manual** asset selection (no automation) and an **assisted** path where selection also triggers asset sync and history, gated by streaming readiness.

---

## 3. Testing and Validation

### 3.1 Backend

- Ran Python compile checks:

  ```bash
  python -m py_compile backend/services/gateway/main.py \
      capabilities_v2/favorites_walk_select.py \
      capabilities_v2/favorites_bar.py
  ```

  - Exit code `0` – no syntax errors.

- Manual test calls of `/api/v1/sync-asset-ui` confirmed:
  - Successful responses when favorites exist and DOM matches expectations.
  - Correct HTTP 4xx/5xx handling when inputs are invalid or Pocket Option is not ready.

### 3.2 Frontend

- Dashboard linting:

  ```bash
  cd gui/Dashboard
  npm run lint
  ```

  - Exit code `0` – all changes conform to ESLint rules and project conventions.

- UI verification:
  - Auto Sync on Select toggle appears above the 92% Payout Assets / OTC Ticker panel.
  - Chart header now only exposes timeframe sync, not asset sync.
  - Auto sync behavior observed:
    - Asset click (with Auto Sync ON) → PO favorite click (via automation) → streaming readiness check → history load.
    - On failures (no ticks detected within the window, or backend sync failure), history is not reloaded and a clear error message appears.

---

## 4. Risks and Mitigations

### 4.1 UI / Data-Path Race Conditions

**Risk:** Pocket Option may respond slowly to favorites clicks, or the backend stream may not immediately start sending ticks for the new asset, causing history loads to run against a stale or inactive state.

**Mitigation:**

- Auto Sync on Select now explicitly sequences:
  - Sync asset UI via `/api/v1/sync-asset-ui`.
  - Then waits for streaming ticks for the selected asset using `awaitStreamingForSelectedAsset`.
  - Only then calls `loadHistory(asset)`.
- If no ticks are detected within a small window (~3s), history is **not** called, and a specific error message is surfaced via `lastError`.
- Manual mode remains available for environments where timing needs to be managed by the user (Auto Sync off).

### 4.2 DOM Drift in Pocket Option

**Risk:** Changes in Pocket Option DOM class names or layout could break the favorites queries.

**Mitigation:**

- Centralized DOM selectors in `FavoritesBar` and `HighPriorityControls`.
- Diagnostics and JSON snapshots in debug mode for quick triage.
- Clear error messages bubbling up from capability to backend to UI.

### 4.3 User Confusion Between Manual and Assisted Modes

**Risk:** Users might not realize Auto Sync on Select is enabled/disabled and misinterpret behavior.

**Mitigation:**

- Auto Sync on Select is a clearly labeled toggle above the 92% panel.
- Manual selection behavior is preserved when the toggle is off; no automation touches Pocket Option in this mode.
- Documentation added:
  - `capabilities_v2/USER_GUIDES/Asset_Sync_Select_GUIDE.md`.

---

## 5. Next Steps

1. **Observe real-world behavior with the streaming gate**
   - Use the Auto Sync on Select flow under normal trading conditions.
   - Pay attention to cases where:
     - Ticks arrive and history loads correctly.
     - No ticks are detected within the window and the new `lastError` message appears.
   - This will clarify whether remaining issues are due to:
     - Stream start latency,
     - Asset naming mismatches for `/bootstrap-history`, or
     - Intermittent backend errors.

2. **Refine asset/timeframe mapping for history (if needed)**
   - Investigate assets that consistently produce:
     - `POST /api/v1/bootstrap-history` → 500, and
     - `GET /api/v1/history/<asset>?timeframe=1&limit=...` → 404.
   - If the root cause is asset naming (e.g., `AUD/CAD OTC` vs `AUDCADOTC`), add a mapping layer on the backend similar to the normalization used for favorites.

3. **Add dev-mode timing logs**
   - In `selectAssetWithSync`, log (dev only):
     - Time from asset click → syncAssetUi completion.
     - Time until first tick for selected asset.
     - Time for `/bootstrap-history` to complete.
   - Use these timings to identify any remaining race conditions and tune the streaming timeout if necessary.

4. **Optional backend orchestrator** (only if needed)
   - If real-world usage reveals persistent timing issues even with the streaming gate:
     - Design a minimal backend orchestrator that:
       - Verifies the active asset in Pocket Option after favorites click (via DOM, chart settings, or WebSocket metadata).
       - Only signals success to `/sync-asset-ui` when PO is confirmed on the target asset.
     - This would be the backend analogue of v1's `CURRENT_ASSET` tracking in `RealtimeDataStreaming`.

5. **Expand test coverage**
   - Add integration tests for:
     - Successful sync + streaming + history load.
     - Sync success but no ticks (history blocked with clear error).
     - Sync failure + skipped history load.
     - Manual vs Auto Sync on Select behavior.

---

## 6. CORE_PRINCIPLES Alignment

- **Functional Simplicity First**
  - No new frameworks or complex orchestration layers were introduced.
  - Asset sync remains a thin wrapper over the existing capability pipeline, with a small, focused streaming readiness gate.

- **Sequential Logic**
  - Composite selection now enforces a stricter order: select → sync → confirm stream → load history.

- **Incremental Testing**
  - Backend CLI and frontend linting were run after changes.
  - Future work will add deeper automated tests around the composite flow and streaming gate.

- **Zero Assumptions**
  - History bootstrap is no longer called blindly after sync; we validate that ticks are flowing for the selected asset first.
  - No hard-coded long delays; the streaming gate uses a short, explicit timeout.

- **Defensive & Explicit Error Handling**
  - All failures propagate as structured errors through the stack.
  - The new streaming readiness failure path surfaces a clear, user-friendly message about missing ticks.
  - UI surfaces errors via the `lastError` banner.

This concludes the updated implementation of the Asset Sync & Select workflow, including the streaming readiness gate. The system is ready for real-world usage, with clear next steps focused on observing behavior, refining asset/timeframe mapping for history, and, if necessary, adding a backend orchestrator for deeper verification.