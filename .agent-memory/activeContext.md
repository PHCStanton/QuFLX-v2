# Active Context

## Current Focus
**Phase 5: The UI (Frontend Rebuild) + Streaming UX Polish**

Immediate priority: ensure live streaming behaviour in the Dashboard is correct, observable, and easy to extend:
- Chart candles render correctly for intraday timeframes (1m, 5m, 15m, 1h).
- OTC ticker panel consumes the same `market_data` stream and displays multi-asset quotes.
- Connection / stream status is surfaced clearly to the user.

## Recent Accomplishments
- **Frontend Modularity**:
  - `Dashboard.jsx` orchestrates `Sidebar`, `TopBar`, `AssetPanel`, `ChartWorkspace` cleanly.
  - Zustand store (`marketStore.js`) centralizes UI + market + connection state.

- **Streaming Integration**:
  - `marketStore.js` connects to Gateway via `socket.io-client`.
  - Subscribes to asset-scoped rooms (`market_data:{assetKey}`) and filters `market_data` events.
  - History bootstrap added via `/api/v1/bootstrap-history` with fallback to `/api/v1/history/{asset}`.

- **Chart Behaviour**:
  - `ChartWorkspace.jsx` now:
    - Uses UNIX timestamps (seconds) for intraday candles.
    - Aggregates ticks into candles based on `selectedTimeframe` (1m, 5m, 15m, 1h).
    - Clears and reloads data on asset/timeframe changes with a visible loading overlay.

- **OTC Ticker Panel**:
  - `AssetPanel.jsx` supports List vs Ticker mode.
  - `TickerTape.jsx` renders a vertical OTC ticker list using live `quotesByAssetKey` from the store.

- **Status & Feedback**:
  - `TopBar` badges show WS, Chrome, and stream status based on `/api/v1/status` and `system_status` events.
  - Chart "Live Feed" badge reflects `streamStatus` with a green pulse when streaming.

## Current State
- **Frontend**:
  - Timeframe selection is wired to tick aggregation for supported intraday resolutions.
  - Socket.IO integration is active and stable.
  - OTC ticker and 92% payout list are wired to live data.

- **Backend**:
  - Gateway listens to Redis `market_data`, `trading:signals`, `system_status`.
  - Emits `market_data` events into asset-scoped rooms (`market_data:{asset}`).

## Next Steps
1. **Data Contracts & Validation**
   - Formalize JSON payload shapes for `market_data`, `bootstrap-history`, and `history` responses.
   - Add validation/guards in the gateway and frontend store to fail fast on malformed data.

2. **Separation of Concerns in Frontend**
   - Extract reusable hooks/components from `ChartWorkspace.jsx` (chart lifecycle, tick aggregation, indicator UI).

3. **Stream Status Semantics**
   - Enhance `/api/v1/status` to expose last-tick timestamps and richer stream health signals.
   - Align UI badges and Live Feed indicator with this enriched status.

## Active Files
- `gui/Dashboard/src/store/marketStore.js`
- `gui/Dashboard/src/components/Dashboard.jsx`
- `gui/Dashboard/src/components/AssetPanel.jsx`
- `gui/Dashboard/src/components/ChartWorkspace.jsx`
- `backend/services/gateway/main.py`