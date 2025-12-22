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

## G. Proposed Action Plan (2025-12-19)

### Priority 1 – Data Contracts & Validation
- [x] Define and document JSON shape of `market_data` payloads.
- [x] Define and document JSON shape of `bootstrap-history` responses.
- [x] Define and document JSON shape of `history` responses.
- [x] Add validation for these payloads in `backend/services/gateway/main.py`.
- [x] Add defensive field checks for these payloads in `gui/Dashboard/src/store/marketStore.js`.

### Priority 2 – Frontend Separation of Concerns
- [x] Extract chart lifecycle into a dedicated chart container component from `ChartWorkspace.jsx`.
- [x] Extract tick aggregation logic into a dedicated hook that feeds the chart.
- [x] Move indicator and header controls into a separate child component.

### Priority 3 – Connection & Stream Status Clarity
- [x] Extend `/api/v1/status` to expose last tick timestamp and derived stream health.
- [x] Update `TopBar` to reflect granular stream health states.
- [x] Update chart "Live Feed" badge behavior to use the richer stream status.

### Priority 4 – Store Structure Hardening
- [x] Plan reorganization of `marketStore.js` into connection, market, and ticker slices.
- [x] Gradually refactor store implementation to align with the planned slices.
- [x] Review auto-refresh and history collection flows for simplification opportunities.

### Priority 5 – Documentation & Developer Onboarding
- [x] Update in-repo docs to describe the Collector → Redis → Gateway → Dashboard pipeline.
- [x] Document how `marketStore.js` subscribes to rooms and filters `market_data`.
- [x] Document conventions for asset keys and supported timeframes.

## H. Gateway Startup Simplification (2025-12-20) - APPROVED

### Implementation Timeline - Week 1 (Dec 20-27) ✅ COMPLETED
- [x] **Day 1-2**: Remove automatic asset selection from gateway startup
  - Target: `backend/services/gateway/main.py`
  - Remove automatic "AUDNZDOTC" selection code
  - Eliminate startup Selenium operations
  - Verify clean startup in <2 seconds

- [x] **Day 3-4**: Implement health check system
  - Target: `backend/services/gateway/main.py`
  - Add `/check_status` Socket.IO endpoint
  - Verify Redis, Socket.IO, Chrome debugging connectivity
  - Return structured status object

- [x] **Day 5-7**: Frontend status integration
  - Target: `gui/Dashboard/src/store/marketStore.js`
  - Add status checking methods
  - Implement status polling every 5 seconds
  - Create backend readiness state

### Implementation Timeline - Week 2 (Dec 27-Jan 3) ✅ COMPLETED
- [x] **Day 8-10**: Create StatusIndicator component
  - Target: `gui/Dashboard/src/components/StatusIndicator.jsx`
  - Visual backend status display
  - Connection health indicators
  - User-friendly error messages

- [x] **Day 11-12**: Add workflow state management
  - Target: `gui/Dashboard/src/components/AssetPanel.jsx`
  - Disable "Get Asset" until backend ready
  - Add loading states during operations
  - Implement success/error messaging

- [x] **Day 13-14**: Optimize Selenium automation
  - Target: `backend/services/gateway/asset_control.py`
  - Implement explicit wait strategies
  - Add element caching
  - Target: Asset selection <3 seconds

### Implementation Timeline - Week 3 (Jan 3-10) ✅ COMPLETED
- [x] **Day 15-17**: End-to-end testing
  - Test complete manual workflow
  - Performance benchmarking
  - Error scenario validation
  - Document any issues found

- [x] **Day 18-21**: Final validation and documentation
  - Update implementation documentation
  - Verify all CORE_PRINCIPLES compliance
  - Create user guide for new workflow
  - Deploy to production environment

## I. Additional Features Implemented (2025-12-20)

### ✅ Enhanced Asset Management Controls
- **Configurable Asset Limit**: Users can set max assets to star (prevents demo account overload)
- **Specific Asset Targeting**: Target only specified assets for 92% payout eligibility
- **Smart Filtering**: Normalized asset name matching (case/space/slash insensitive)
- **Real-time Metadata**: Shows starred count, skipped assets, and operation statistics

### ✅ UI/UX Improvements
- **StatusIndicator Component**: Visual backend health display with connection indicators
- **Workflow Messaging**: Clear instructions for manual asset selection process
- **Enhanced Controls**: Input fields for max assets and specific asset targeting
- **Disabled State Management**: Buttons disable appropriately when backend not ready

### ✅ Performance Optimizations
- **Reduced Timeouts**: 3-second waits vs 10-second defaults
- **Element Caching**: Cache frequently accessed DOM elements
- **Explicit Waits**: WebDriverWait for better reliability
- **Optimized Delays**: Reduced sleep times from 0.5s to 0.2-0.3s

### ✅ Quality Assurance
- **Comprehensive Error Handling**: Specific exception handling with logging
- **Syntax Validation**: All Python and JavaScript files compile successfully
- **Linting Compliance**: ESLint validation passed with zero errors
- **CORE_PRINCIPLES Compliance**: Maintains functional simplicity and clean architecture
