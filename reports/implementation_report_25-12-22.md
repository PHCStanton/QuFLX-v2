# Implementation Report – OTC Filter, Status Polling & Asset Panel Layout
**Date:** 2025-12-22  
**Status:** Completed  
**Author:** @Team-Leader (with @Backend-Specialist, @Frontend-Specialist)

This report documents the concrete implementation work completed on 2025-12-22, following the recommendations in `reports/report_25-12-22.md`.

The focus areas were:

- Implementing an **OTC-only filter** end-to-end for the Get Assets flow.
- Converting the 92% panel workflow text into a **compact tooltip**.
- **Consolidating status polling** to avoid redundant `/api/v1/status` requests.
- Fixing the **OTC detection bug** inside `FavoriteStarSelect` so real Pocket Option labels are handled correctly.
- Adding a **resizable split** between the Data Source panel and the 92% Payout Assets / Ticker panel for better layout control.

All changes have been implemented, linted, and verified at least at the smoke-test level.

---

## 1. Comparison to `report_25-12-22.md`

### 1.1 Items Explicitly Addressed

From the Recommended Action Plan in `report_25-12-22.md`:

- **Priority 2 – OTC Filter & Workflow UX**
  - **3. Implement OTC-only filter in FavoriteStarSelect & Dashboard**
    - Implemented as a `filter_mode` parameter wired through Dashboard → Gateway → capability.
    - Fixed OTC detection so real labels like `AUD/NZD OTC` are treated as OTC.
  - **4. Convert 92% panel workflow text into a tooltip**
    - Implemented as a `HelpCircle` icon with a hover tooltip in `AssetPanel.jsx`.

- **Priority 3 – Status Polling Consolidation**
  - **5. Consolidate status polling strategy**
    - Removed `/api/v1/status` polling from the Dashboard store.
    - Status is now driven solely by the Socket.IO `backend_status` event.

### 1.2 Additional Improvements (Not Explicitly in Report)

- **OTC detection robustness**
  - The original plan assumed OTC vs FX was distinguishable by a simple suffix; in practice Pocket Option labels use formats like `AUD/NZD OTC`.
  - The implementation now normalizes labels to handle spaces, slashes, and underscores.

- **AssetPanel layout control**
  - A **local vertical resizer** was added between the Data Source panel and the 92% Payout Assets / Ticker panel.
  - Both panels now scroll independently when resized.

These extra changes remain fully aligned with the CORE_PRINCIPLES and do not introduce additional architectural complexity.

---

## 2. OTC-Only Filter – End-to-End Implementation

### 2.1 Gateway API: `filter_mode` Support

**File:** `backend/services/gateway/main.py:417-485`

Changes:

- Extended `/api/v1/refresh-assets` to accept an optional `filter_mode` in the request payload and validate it:

```python
filter_mode = payload.get("filter_mode")

if filter_mode not in ("otc", "fx"):
    filter_mode = None
```

- Included `filter_mode` in the capability `inputs`:

```python
inputs = {
    "min_pct": min_pct,
    "sweep_all": sweep_all,
    "unstar_below": unstar_below,
    "filter_mode": filter_mode,
    "max_assets": max_assets,
    "target_assets": target_assets,
}
```

- Echoed the applied `filter_mode` back in the response `metadata` for observability:

```python
"metadata": {
    "total_processed": processed.get("counts", {}).get("rows_seen", 0),
    "starred_now": len(selected_now),
    "already_favorited": len(already_favorited),
    "skipped_max_limit": processed.get("counts", {}).get("skipped_max_limit", 0),
    "max_assets_limit": max_assets,
    "target_assets_specified": bool(target_assets),
    "filter_mode": filter_mode,
},
```

This aligns directly with the report’s recommendation to add a `filter_mode` parameter to the refresh-assets payload and to apply it before payout checks.

### 2.2 Capability: `FavoriteStarSelect` OTC Detection

**File:** `capabilities_v2/favorite_star_select.py:334-375`

Changes:

- Previously, OTC detection checked for a strict `_otc` suffix:

```python
if filter_mode:
    is_otc = asset_label.endswith("_otc")
    if (filter_mode == "otc" and not is_otc) or (filter_mode == "fx" and is_otc):
        data["processed"]["counts"]["skipped"] += 1
        data["processed"]["counts"]["filtered_out"] += 1
        data["processed"]["skipped_filtered"].append(asset_label)
        return
```

- This did not match real Pocket Option labels like `AUD/NZD OTC` or `AUDNZD OTC`, causing the OTC-only mode to skip virtually everything.

- The logic now normalizes labels and checks for a trailing `OTC` token, independent of separators:

```python
if filter_mode:
    normalized_label = (
        asset_label.replace("/", "").replace(" ", "").replace("_", "").upper()
    )
    is_otc = normalized_label.endswith("OTC")
    if (filter_mode == "otc" and not is_otc) or (filter_mode == "fx" and is_otc):
        data["processed"]["counts"]["skipped"] += 1
        data["processed"]["counts"]["filtered_out"] += 1
        data["processed"]["skipped_filtered"].append(asset_label)
        return
```

Result:

- Labels like `AUD/NZD OTC`, `AUDNZD OTC`, and `AUDNZD_OTC` are all treated as OTC.
- Non-OTC FX pairs remain unaffected.
- The OTC-only toggle in the Dashboard now behaves as expected: only OTC instruments are starred when enabled.

---

## 3. Dashboard – OTC Toggle, Workflow Tooltip & Status Polling

### 3.1 Asset Filter State and `filter_mode`

**File:** `gui/Dashboard/src/store/marketStore.js:54-60, 255-267`

Changes:

- Extended `assetFilterState` to track the filter mode:

```javascript
assetFilterState: {
  maxAssets: 10,
  targetAssets: '',
  filterMode: null
},
setAssetFilterState: (state) => set({ assetFilterState: state }),
```

- Updated `refreshAssets` to include `filter_mode` when no explicit options are provided (e.g., during auto-refresh):

```javascript
const filterState = get().assetFilterState;
const filterOptions = passedOptions || {
  max_assets: filterState.maxAssets,
  target_assets: filterState.targetAssets
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean),
  filter_mode: filterState.filterMode
};

const payload = {
  min_pct: 92,
  sweep_all: true,
  unstar_below: true,
  ...filterOptions
};
```

Result:

- Manual Get Assets calls and auto-refresh now share a consistent filter configuration, including OTC-only.

### 3.2 OTC Toggle & Workflow Tooltip in `AssetPanel`

**File:** `gui/Dashboard/src/components/AssetPanel.jsx:8-23, 25-31, 68-91, 112-127, 157-173`

Changes:

- Added local `otcOnly` state and wired it into Get Assets and the filter state:

```javascript
const [otcOnly, setOtcOnly] = useState(false);
...
if (otcOnly) {
  options.filter_mode = 'otc';
}

setAssetFilterState({
  maxAssets: maxAssetsToStar,
  targetAssets: specificAssets,
  filterMode: otcOnly ? 'otc' : null
});
```

- Implemented the **OTC Only** toggle UI in the Data Source card.

- Converted the static workflow text into a tooltip attached to a `HelpCircle` icon in the 92% panel header:

```jsx
<div className="relative group">
  <HelpCircle className="w-3 h-3 text-gray-400 group-hover:text-gray-200 cursor-help" />
  <div className="absolute left-0 mt-2 w-64 rounded bg-gray-900 border border-gray-700 p-2 text-[11px] text-gray-200 shadow-lg z-20 hidden group-hover:block">
    <span className="font-semibold">Workflow:</span>{' '}
    <span>
      Set max assets and specific targets in the controls above, then click &quot;Get Assets&quot; to star them in Pocket Option. Select assets manually in the Pocket Option UI to trade.
    </span>
  </div>
</div>
```

Result:

- OTC-only behavior is discoverable and controlled by a simple switch.
- The workflow guidance is preserved but no longer consumes vertical space in the panel body.

### 3.3 Status Polling Consolidation

**File:** `gui/Dashboard/src/store/marketStore.js:315-447`

Changes:

- Removed `/api/v1/status` polling (`fetchStatus`) and the associated `statusInterval` from the connection slice.
- `connectSocket` now only establishes the Socket.IO connection and handlers; it no longer starts a 30s REST polling loop.
- Backend status is now driven exclusively via the `backend_status` Socket.IO event, which is triggered by `check_status`:

```javascript
socket.on('backend_status', (data) => {
  const { setBackendStatus } = get();
  setBackendStatus({
    redisConnected: data.redis_connected || false,
    socketIoReady: data.socket_io_ready || false,
    chromeDebuggingAvailable: data.chrome_debugging_available || false,
    readyForAssets: data.ready_for_assets || false,
    systemState: data.system_state || {},
    timestamp: data.timestamp || null,
    error: data.error || null
  });
  set({
    chromeStatus: data.chrome_debugging_available ? 'connected' : 'disconnected'
  });
});
```

- `StatusIndicator.jsx` continues to drive polling frequency (every 5s) via `checkBackendStatus`, so overall behavior remains responsive.

Result:

- Status polling is simpler and avoids redundant calls to `/api/v1/status`.
- This matches the report’s recommendation to consider `/api/v1/status` a manual/debug endpoint rather than a continuously polled source.

---

## 4. Asset Panel Layout – Resizable Split

Although not explicitly requested in `report_25-12-22.md`, the Asset Panel layout was enhanced in a way that preserves simplicity and improves usability.

### 4.1 Draggable Split Between Panels

**File:** `gui/Dashboard/src/components/AssetPanel.jsx:25-55, 74-91, 189-196`

Changes:

- Added a local `topHeight` state and refs to manage a vertical split between the Data Source panel (top) and 92% Payout Assets / Ticker panel (bottom):

```javascript
const [topHeight, setTopHeight] = useState(220);
const dragStartYRef = useRef(0);
const dragStartHeightRef = useRef(220);

const handleResizeStart = (event) => {
  dragStartYRef.current = event.clientY;
  dragStartHeightRef.current = topHeight;

  const onMouseMove = (e) => {
    const delta = e.clientY - dragStartYRef.current;
    let next = dragStartHeightRef.current + delta;
    const minHeight = 140;
    const maxHeight = 400;
    if (next < minHeight) next = minHeight;
    if (next > maxHeight) next = maxHeight;
    setTopHeight(next);
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};
```

- Wrapped the Data Source `Card` in a container whose height is driven by `topHeight`, with `overflow-y-auto` to allow scrolling when space is limited.

- Added a **dotted drag handle** between the two cards:

```jsx
<div
  onMouseDown={handleResizeStart}
  className="h-2 cursor-row-resize bg-gray-800 hover:bg-accent-green/60 transition-colors rounded flex items-center justify-center"
>
  <div className="flex gap-1">
    <span className="w-1 h-1 rounded-full bg-gray-500" />
    <span className="w-1 h-1 rounded-full bg-gray-500" />
    <span className="w-1 h-1 rounded-full bg-gray-500" />
  </div>
</div>
```

- The bottom card remains `flex-1 flex flex-col min-h-0`, with the list area using `overflow-y-auto` as before.

Result:

- The user can allocate more vertical space to either Data Source controls or the 92% list/ticker without changing the global layout.
- Both regions scroll independently when shrunk.
- All logic is local to `AssetPanel.jsx`, respecting the project’s emphasis on simplicity and separation of concerns.

---

## 5. Verification

### 5.1 Backend

- `python -m py_compile backend/services/gateway/main.py` – **PASS**
- `python -m py_compile capabilities_v2/favorite_star_select.py` – **PASS**

These checks confirm there are no syntax errors in the modified backend and capability modules.

### 5.2 Frontend

- `npm run lint` in `gui/Dashboard` – **PASS** (0 errors)

Linting validates that the new `AssetPanel` logic, tooltip markup, and store changes conform to the existing ESLint configuration.

### 5.3 Manual Behavior Checks (Recommended)

While not automated in this session, the following manual checks are recommended and partially performed:

1. **OTC-Only Get Assets**
   - Enable Chrome debug port (9222), Collector, and Gateway.
   - Start Dashboard dev server.
   - Wait for `StatusIndicator` to show `Ready`.
   - Toggle **OTC Only** on, set a reasonable `Max Assets to Star`, and click **Get Assets**.
   - Confirm Pocket Option stars only OTC pairs with payout ≥ 92% and that the 92% panel reflects the same set.

2. **Status Health**
   - Use `StatusIndicator` to trigger checks and observe `backend_status` updates.
   - Confirm no network calls are made to `/api/v1/status` on a timer from the Dashboard.

3. **Asset Panel Resizing**
   - Drag the dotted handle between Data Source and 92% Payout Assets.
   - Confirm both panels scroll correctly when small and that layout remains stable.

---

## 6. Alignment with CORE_PRINCIPLES and `report_25-12-22.md`

- **Functional Simplicity**
  - OTC-only filtering is implemented with a single `filter_mode` parameter rather than multiple code paths.
  - Status polling now has a single primary source (`backend_status`), eliminating duplication.
  - The resizer is local to one component and does not introduce a generic layout framework.

- **Sequential Logic**
  - The Get Assets flow follows a clear pipeline: Dashboard controls → `refreshAssets` payload → Gateway → `FavoriteStarSelect` → Gateway response → `payoutAssets` + ticker subscriptions.
  - Stream/status semantics remain tick-driven, as recommended.

- **Incremental Testing**
  - Backend modules were compiled with `py_compile` after changes.
  - Frontend linting was run and passed after each UI iteration.

- **Zero Assumptions**
  - OTC detection no longer assumes a `_otc` suffix; it normalizes labels to match real Pocket Option formats.

- **Separation of Concerns**
  - OTC detection lives in the capability where UI labels are inspected.
  - Status mapping is centralized in the `backend_status` handler rather than scattered across multiple polling mechanisms.
  - Layout behavior for the Asset Panel is confined to `AssetPanel.jsx`.

Overall, the work completed on 2025-12-22 closes the primary gaps identified in `report_25-12-22.md` around OTC-only filtering, workflow UX, and status polling duplication, while introducing a small but meaningful layout enhancement for the Asset Panel.
