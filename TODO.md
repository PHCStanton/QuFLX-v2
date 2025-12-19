# QuFLX Dashboard TODO (Streaming Context + 92% Panel + Ticker Widget)

## A. Historical Context On Chart Start (COMPLETED)

- [x] Add a backend endpoint that returns recent historical candles without saving.
  - Target: `backend/services/gateway/main.py`
  - Approach: Execute `capabilities_v2/history_collector.py` in `collect` mode via `capabilities_v2/runner.py`.
  - Output contract: `{ ok, asset, timeframe, count, candles[] }` where each candle is `{ timestamp, open, high, low, close, volume }`.

- [x] Add frontend “history bootstrap” load for the selected asset.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Behavior:
    - On socket connect: refresh payout assets + load history for current `selectedAsset`.
    - On `setSelectedAsset(asset)`: load history for that asset immediately.
    - Use a fallback path to CSV history endpoint if bootstrap fails.

- [x] Render historical candles immediately into the chart.
  - Target: `gui/Dashboard/src/components/ChartWorkspace.jsx`
  - Behavior:
    - On asset change: clear chart and show loading.
    - When `historyCandles[selectedAsset]` becomes available: `setData([...mappedCandles])`.
    - Continue with realtime tick aggregation using `update(...)`.

## B. Fix “92% Payout Assets” Panel Not Updating (COMPLETED)

- [x] Fix backend parsing for refresh assets.
  - Target: `backend/services/gateway/main.py` (`POST /api/v1/refresh-assets`)
  - Notes:
    - The current capability returns `data.processed.selected_now` and `data.processed.already_favorited` as arrays of asset labels.
    - The endpoint must return `{ assets: string[] }` compatible with `marketStore.refreshAssets()`.

- [x] Remove hardcoded preset assets from initial UI state.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Behavior:
    - `payoutAssets` starts as `[]`.
    - Assets appear only after “Get Assets” (and/or post-connect refresh).

- [x] Ensure asset naming stays consistent end-to-end.
  - Targets:
    - `backend/services/gateway/main.py` (asset strings returned)
    - `gui/Dashboard/src/store/marketStore.js` (asset keys used for rooms + filtering)
  - Rule: asset string used in `join_room` must match `data.asset` emitted in `market_data`.

## C. Ensure Newly Selected Assets Stream Like Presets (COMPLETED)

- [x] Confirm selection flow triggers Pocket Option UI change.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Requirement:
    - On click: `socket.emit('select_asset', asset)`
    - Ensure subscriptions include selected asset and ticker assets
    - Store incoming `market_data` by `data.asset` for subscribed assets

- [x] Verify room routing is asset-specific.
  - Target: `backend/services/gateway/main.py`
  - Requirement: emit `market_data` event **to room** `market_data:{asset}`.

## F. Recent UI Improvements (COMPLETED)
- [x] Remove bottom StatsPanel to free up vertical space.
- [x] Remove "Check Chrome" and "Connect WS" buttons from TopBar.
- [x] Move "Ask AI" button to TopBar.
- [x] Implement Tick Aggregation for multiple timeframes (1m, 5m, 15m, 1h).
- [x] Unlock timeframe options in ChartWorkspace.

## D. OTC Ticker Tape (COMPLETED)

- [x] Add multi-asset subscriptions for ticker mode.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Behavior:
    - Maintain `subscribedAssetKeys` and sync rooms on connect/refresh/toggle.
    - Subscribe up to `tickerMaxAssets` plus the selected asset.

- [x] Track last price and change per asset.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Output: `quotesByAssetKey[assetKey] = { price, baseline, changePct, timestamp }`.

- [x] Add a panel toggle (List vs Ticker).
  - Target: `gui/Dashboard/src/components/AssetPanel.jsx`

- [x] Implement ticker tape UI.
  - Target: `gui/Dashboard/src/components/TickerTape.jsx`

## E. Validation Checklist

- [x] Backend: `python -m py_compile` on modified gateway/capability files.
- [x] Dashboard: `npm run lint` and `npm run build` in `gui/Dashboard`.
- [x] Manual:
  - Start Dashboard, click “Get Assets”, confirm list updates.
  - Toggle to Ticker mode, confirm OTC prices update as data streams.
  - Click an asset, confirm chart loads history first and then streams.
  - Confirm stream continues after switching assets.
