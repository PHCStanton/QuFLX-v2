# AssetPanel Selection & Streaming Integration Report
**Date:** 2025-11-30
**To:** Team Leader / User
**From:** Engineering Team (Investigator, Architect, Frontend, Backend)

## 1. Forensic Analysis & Current State

### V1 Reference Capabilities
- **`favorites_bar_scroll_select.py`**: A robust script that scrolls the horizontal favorites bar to find and select assets. It composes `FavoriteSelect` (scan visible) and `FavoritesBarScroll` (navigation). It handles pagination and ensures all assets are reachable.
- **`favorite_select.py`**: Scans currently visible favorites for payout thresholds (default 92%).
- **`selenium_ui_controls.py`**: Contains `HighPriorityControls` with methods like `scan_favorites_for_payout`, `scroll_favorites_reset_left`, and `scroll_favorites_right_scoped`. These are production-ready helpers for UI interaction.

### Current V2 Implementation
- **Frontend (`AssetPanel.jsx`, `marketStore.js`)**:
  - `AssetPanel` displays a list of assets (currently hardcoded or fetched via `refreshAssets`).
  - Clicking an asset triggers `setSelectedAsset` in the store.
  - `setSelectedAsset` currently does **two** things:
    1. Emits `subscribe_asset` via Socket.IO (client-side room join).
    2. Calls `POST /api/v1/select-asset` (backend automation).
- **Backend (`gateway/main.py`)**:
  - Has a Socket.IO server and a Redis listener.
  - `POST /api/v1/select-asset` executes `asset_control.py` via subprocess.
  - `asset_control.py` uses Selenium to open the asset dropdown and click the asset.
- **Collector (`collector/main.py`)**:
  - Intercepts WebSocket frames from the *active* Chrome tab.
  - Publishes ticks to Redis channel `market_data`.
  - **Critical Note**: The collector implicitly streams whatever asset is active in the browser. Changing the asset via `asset_control.py` changes the data stream source.

## 2. Architectural Design (Option B: Socket.IO Event)

We recommend fully migrating to **Option B** (Socket.IO Event) to unify the control and data plane, reducing latency and complexity.

### Proposed Data Flow
1.  **User Action**: User clicks "EUR/USD OTC" in `AssetPanel`.
2.  **Frontend Event**: `marketStore` emits `socket.emit('select_asset', 'EUR/USD OTC')`.
    - *UI immediately shows "Loading..." state for the chart.*
3.  **Gateway Handling**:
    - Gateway receives `select_asset` event.
    - **Action**: Calls `AssetControl` (Selenium) to click the asset in the browser.
    - **Feedback**: Emits `asset_selected` event back to frontend upon success.
4.  **PocketOption Reaction**: Browser switches asset; WebSocket stream changes to new asset.
5.  **Collector**:
    - Intercepts new WebSocket frames (which contain the new Asset ID/Name).
    - Publishes ticks to Redis `market_data` (enriched with correct Asset Name).
6.  **Streaming**:
    - Gateway receives Redis message.
    - Broadcasts to Socket.IO room `market_data:EUR/USD OTC`.
7.  **Visualization**:
    - Frontend (subscribed to `market_data:EUR/USD OTC`) receives tick.
    - `ChartWorkspace` updates the chart.

### Risks & Mitigations
-   **Risk**: Selenium action takes time (200-500ms).
    -   *Mitigation*: Optimistic UI updates (highlight immediately), but wait for data stream to update chart.
-   **Risk**: Collector might stream "old" asset ticks for a split second during switch.
    -   *Mitigation*: Frontend filters incoming ticks by `selectedAsset` ID to discard mismatches.
-   **Risk**: Asset not found in dropdown.
    -   *Mitigation*: `AssetControl` must handle errors gracefully and return failure to Gateway, which notifies Frontend to revert selection.

## 3. Frontend Assessment (@Frontend_Specialist)
-   **`AssetPanel.jsx`**: Ready. `onClick` handler exists. Needs to be updated to rely solely on `socket.emit` instead of `fetch`.
-   **`ChartWorkspace.jsx`**: Ready. Listens to `marketData`. Needs to ensure it clears previous data/chart state when `selectedAsset` changes to prevent "ghost" candles.
-   **`marketStore.js`**: Needs refactoring.
    -   Remove `fetch` calls in `setSelectedAsset`.
    -   Add `socket.emit('select_asset', ...)` logic.
    -   Handle `asset_selection_error` events.

## 4. Backend Assessment (@Backend_Specialist)
-   **`gateway/main.py`**:
    -   Needs a new Socket.IO event handler `@sio.event async def select_asset(sid, asset)`.
    -   This handler should invoke `asset_control.py` (or import the class directly for better performance than `subprocess`).
-   **`asset_control.py`**:
    -   Current implementation searches the dropdown.
    -   **Improvement**: Integrate `HighPriorityControls` from V1 to ensure robust interaction (e.g., handling "favorites" vs "all" lists).
-   **`collector/main.py`**:
    -   Generally passive (good).
    -   Ensure `interceptor.py` correctly parses the Asset Name from the WebSocket frame so Redis messages are accurate.

## 5. Recommendations

1.  **Implement `92_Percent_config.json`**:
    -   Create a JSON file to store the list of high-payout assets.
    -   Update this file via a background job (using `favorite_star_select.py` logic) every 5-10 minutes.
    -   `AssetPanel` reads from this config (via API/Socket) instead of scanning every time. This makes the UI load instantly.

2.  **Refine `AssetControl`**:
    -   Instead of generic search, use the V1 `HighPriorityControls` logic to reliably find and click assets, especially if they are already in the favorites bar (faster).

3.  **Direct Import over Subprocess**:
    -   In `gateway/main.py`, import `AssetControl` class directly and run it in a thread pool (to avoid blocking the async loop) instead of `subprocess.run`. This reduces overhead.

4.  **Socket.IO Event Implementation**:
    -   Proceed with Option B. It aligns perfectly with the event-driven architecture.

## 6. Next Steps
1.  **Create `config_files/92_Percent_config.json`** with initial data.
2.  **Update `gateway/main.py`** to handle `select_asset` via Socket.IO.
3.  **Update `marketStore.js`** to use Socket.IO for selection.
4.  **Verify `interceptor.py`** parsing logic.

*Report prepared by QuFLX v2 Engineering Team.*
