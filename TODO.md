# QuFLX Dashboard TODO (Streaming Context + 92% Panel + Ticker Widget)

## A. Historical Context On Chart Start

- [ ] Add a backend endpoint that returns recent historical candles without saving.
  - Target: `backend/services/gateway/main.py`
  - Approach: Execute `capabilities_v2/history_collector.py` in `collect` mode via `capabilities_v2/runner.py`.
  - Output contract: `{ ok, asset, timeframe, count, candles[] }` where each candle is `{ timestamp, open, high, low, close, volume }`.

- [ ] Add frontend “history bootstrap” load for the selected asset.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Behavior:
    - On socket connect: refresh payout assets + load history for current `selectedAsset`.
    - On `setSelectedAsset(asset)`: load history for that asset immediately.
    - Use a fallback path to CSV history endpoint if bootstrap fails.

- [ ] Render historical candles immediately into the chart.
  - Target: `gui/Dashboard/src/components/ChartWorkspace.jsx`
  - Behavior:
    - On asset change: clear chart and show loading.
    - When `historyCandles[selectedAsset]` becomes available: `setData([...mappedCandles])`.
    - Continue with realtime tick aggregation using `update(...)`.

## B. Fix “92% Payout Assets” Panel Not Updating

- [ ] Fix backend parsing for refresh assets.
  - Target: `backend/services/gateway/main.py` (`POST /api/v1/refresh-assets`)
  - Notes:
    - The current capability returns `data.processed.selected_now` and `data.processed.already_favorited` as arrays of asset labels.
    - The endpoint must return `{ assets: string[] }` compatible with `marketStore.refreshAssets()`.

- [ ] Remove hardcoded preset assets from initial UI state.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Behavior:
    - `payoutAssets` starts as `[]`.
    - Assets appear only after “Get Assets” (and/or post-connect refresh).

- [ ] Ensure asset naming stays consistent end-to-end.
  - Targets:
    - `backend/services/gateway/main.py` (asset strings returned)
    - `gui/Dashboard/src/store/marketStore.js` (asset keys used for rooms + filtering)
  - Rule: asset string used in `join_room` must match `data.asset` emitted in `market_data`.

## C. Ensure Newly Selected Assets Stream Like Presets

- [ ] Confirm selection flow triggers Pocket Option UI change.
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Requirement:
    - On click: `socket.emit('select_asset', asset)`
    - Join `market_data:${asset}` room
    - Filter incoming `market_data` by `selectedAsset`

- [ ] Verify room routing is asset-specific.
  - Target: `backend/services/gateway/main.py`
  - Requirement: emit `market_data` event **to room** `market_data:{asset}`.

## D. Provision For Future “Ticker Widget” Integration

The TradingView ticker widgets include:
- `Ticker Tape`: scrolling tape style.
- `Ticker`: horizontal stats row; supports up to **15 symbols**, showing latest price and daily change.
- `Single Ticker`: one symbol only.

- [ ] Refactor the current “92% Payout Assets” panel into a dedicated container component.
  - Target: `gui/Dashboard/src/components/AssetPanel.jsx`
  - Goal: allow swapping between List mode and Ticker Widget mode without changing store logic.

- [ ] Add a “Panel Mode” toggle (List vs Ticker).
  - Targets:
    - `gui/Dashboard/src/store/marketStore.js` (persist selection)
    - `gui/Dashboard/src/components/AssetPanel.jsx` (UI toggle)

- [ ] Define a symbol mapping layer.
  - Target: `gui/Dashboard/src/store/marketStore.js` or a small helper module
  - Reason: TradingView symbols are not the same format as Pocket Option labels.
  - Output: map Pocket Option asset label -> TradingView symbol string.

- [ ] Implement the TradingView widget embed as an isolated React component.
  - Target: `gui/Dashboard/src/components/` (new component when ready)
  - Requirements:
    - Accept `symbols: string[]` (max 15 for the `Ticker` widget)
    - Mount/unmount cleanly (no duplicate scripts)
    - Fail loudly if script fails to load

## E. Validation Checklist

- [ ] Backend: `python -m py_compile` on modified gateway/capability files.
- [ ] Dashboard: `npm run lint` and `npm run build` in `gui/Dashboard`.
- [ ] Manual:
  - Start Dashboard, click “Get Assets”, confirm list updates.
  - Click an asset, confirm chart loads history first and then streams.
  - Confirm stream continues after switching assets.
