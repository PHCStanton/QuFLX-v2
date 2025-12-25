# Active Context

## Current Focus
**Phase 5: UI + Streaming Stable; Designing Indicators + AI Integration**

We are now beyond basic Dashboard wiring. The current focus is to:
- Finalize chart/stream semantics for indicators (overlays + oscillators) using Lightweight Charts.
- Design a clean backend–frontend contract for indicators that reuses the existing Python indicator pipeline.
- Architect the xAI-powered trading assistant (text + vision) and voice agent so they integrate cleanly with the existing Gateway/Strategy stack.

## Recent Accomplishments
- **Streaming & UI Foundation** (Phase 5 baseline):
  - `Dashboard.jsx` orchestrates `Sidebar`, `TopBar`, `AssetPanel`, `ChartWorkspace` cleanly.
  - Zustand store (`marketStore.js`) centralizes UI + market + connection state.
  - Socket.IO integration is stable; intraday candles use UNIX timestamps and tick aggregation by timeframe.
  - OTC ticker panel and 92% payout assets panel are wired to live data.
  - Stream status and health badges are driven by tick recency and backend `backend_status` events.

- **Indicator Infrastructure (Backend)**:
  - `backend/services/strategy/indicators.py` provides a comprehensive `TechnicalIndicatorsPipeline` with trend, momentum, volatility, and band indicators (SMA/EMA/WMA, MACD, Bollinger, RSI, Stoch, Williams %R, ROC, ATR, Supertrend, Schaff TC, DeMarker, CCI).
  - `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md` defines how these indicators map to market regimes (trending with pullbacks, strong momentum, ranging, breakout, reversal) and which indicators are primary vs confluence per regime.

- **Indicator Integration Research (Frontend + Backend)**:
  - `Research/research_lightweight-charts-indicators_2025-12-23.md` documents how to implement indicators with TradingView Lightweight Charts:
    - Helper-based overlays (e.g., `applyMovingAverageIndicator`) attached to the main candlestick series.
    - Separate chart instances for oscillator-style indicators, vertically stacked and time-scale synchronized.
    - Clear rules for locking indicators to timeframe and visible range.

- **AI Integration Research (xAI / Grok)**:
  - `Research/research_ai_integration_vision_files_2025-12-20.md` defines the "Context Injection" architecture for xAI:
    - Data context: JSON snapshot of candles, indicators, positions, regimes.
    - Visual context: base64 chart screenshots captured in the Dashboard and sent with the prompt.
    - File/historical context: on-demand loading of history/logs from controlled directories.
  - We have high-level plans for:
    - An `AI Gateway` backend module that centralizes all xAI calls (chat + vision + voice).
    - A `TradingContext` schema built from existing strategy/indicator modules.
    - Frontend hooks (`useChartCapture`) and an Ask-AI panel that talk to `/api/v1/ai/ask`.

## Current State
- **Backend**:
  - Collector/Strategy/Gateway are functioning as described in `systemPatterns.md`.
  - Indicator pipeline is implemented and documented; regime mapping doc exists but regime detection logic is not yet wired into runtime.
  - AI integration is at the research/specification stage (no production `ai_gateway` module yet).

- **Frontend**:
  - Core Dashboard is stable for streaming and basic visualization.
  - Indicator visualization (overlays + oscillator panes) is designed on paper but not implemented.
  - Ask-AI UI and voice UI are not implemented yet; architecture and UX expectations are documented.

## Next Steps
1. **Implement AI Gateway Skeleton (Backend)**
   - Create an `ai_gateway` service/module responsible for xAI requests (text + vision), including:
     - `ask_text(TradingContext, prompt)` and `ask_vision(TradingContext, prompt, image_base64)`.
     - Model selection, error handling, and usage logging.

2. **Trading Context Builder + Regime Detection**
   - Add a `context_builder` in `backend/services/strategy` that constructs a `TradingContext` from:
     - Recent candles and indicators.
     - Current market regime (using the logic outlined in `Indicators_vs_Market_Structures.md`).
     - Open positions / risk parameters when available.

3. **API Contract for Ask-AI**
   - Add `POST /api/v1/ai/ask` in the Gateway, accepting `prompt`, optional `image_base64`, `asset`, and `timeframe`.
   - Wire this endpoint to `context_builder` + `ai_gateway`.

4. **Frontend Ask-AI Panel + Chart Capture Hook**
   - Implement `useChartCapture()` to grab the current chart canvas and produce base64 PNG.
   - Build an Ask-AI panel in the Dashboard that:
     - Lets the user enter a prompt.
     - Toggles “include chart screenshot” and “include market context”.
     - Displays AI responses (and, later, structured outputs).

5. **Indicator Visualization Implementation**
   - Implement overlay indicators on the main chart (starting with moving averages, Bollinger Bands) using helper functions.
   - Implement a secondary oscillator chart pane for RSI/Stoch/MACD/Schaff etc., synchronized with the main time scale.

6. **Voice Agent Planning**
   - Design a small backend voice gateway that proxies browser WebSocket audio to xAI’s Voice Agent API.
   - Define how voice sessions share the same `TradingContext` and session history as the text assistant.

## Active Files
- Frontend:
  - `gui/Dashboard/src/store/marketStore.js`
  - `gui/Dashboard/src/components/Dashboard.jsx`
  - `gui/Dashboard/src/components/AssetPanel.jsx`
  - `gui/Dashboard/src/components/ChartWorkspace.jsx`
  - (Planned) Ask-AI + voice components and hooks.

- Backend:
  - `backend/services/gateway/main.py`
  - `backend/services/strategy/indicators.py`
  - `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md`
  - `Research/research_lightweight-charts-indicators_2025-12-23.md`
  - `Research/research_ai_integration_vision_files_2025-12-20.md`
