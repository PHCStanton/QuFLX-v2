# Active Context

## Current Focus
- **Indicators & Regimes (Next Implementation Wave):** Implement overlays + oscillators on Lightweight Charts using backend-calculated series.
- **AI Assistant (Incremental Integration):** Keep `/api/v1/ai/ask` usable now while building towards an AI Gateway + TradingContext schema enforcement.
- **Voice UX (Dictation + Read-Back):** Voice dictation is in place for Ask AI Modal and AI Insights; browser TTS read-back added for AI outputs.
- **Protocol Robustness:** Maintain explicit HTTP error semantics and consistent API shapes (`candles`) to prevent silent failures.

## Recent Changes
- **History bootstrap now returns correct HTTP status codes** (4xx/5xx) with structured error bodies; removed semantic 200/ok:false failures.
- **History API shape unified around `candles`** (GET includes `candles` and keeps legacy `data` for compatibility).
- **Crosshair sync is unidirectional** (Main → Oscillators); removed oscillator → main pathway.
- **ChartWorkspace refactor completed**:
  - Static options extracted to `gui/Dashboard/src/config/chartOptions.js`.
  - Orchestration moved into focused hooks and small UI components.
  - `ChartWorkspace.jsx` reduced to ~240 LOC (<250 target met).
- **Ask AI UX upgraded (Quick Modal + Panel thread):** removed `window.prompt()` from the Dashboard and added an in-app Ask AI modal with a handoff to AI Insights.
- **Voice dictation wired (Modal + Insights):** realtime WS voice session used for dictation; transcript inserts into prompt flows.
- **AI speech read-back added (Browser TTS):** AI messages can be read aloud via Web Speech API (SpeechSynthesis) with Settings controls.
- **Ask AI response shaping improved:** modal vs insights mode and verbosity now influence backend system prompt and max token limits.
- **Screenshot → AI linkage:** screenshot editor includes an Ask AI action that sends the current canvas (respects crop mode) into Ask AI.
- **Annotated screenshot persistence:** latest annotated screenshot is persisted across refresh and supports “Image Source: Annotated”.
- **Indicators Implemented**:
  - **Support & Resistance**: Pivot-based levels (fractals) rendered as stepped lines (Red/Green).
  - **EMA Cross-Over**: 3-EMA system (21/50/100) with colored lines (Blue/White/Red) for trend identification.
  - Infrastructure in place for further overlays and oscillators.
  - OTC ticker panel and 92% payout assets panel are wired to live data.
  - Stream status and health badges are driven by tick recency and backend `backend_status` events.
- **AI Caching & Token Reduction (Grok API):**
  - Implemented prefix caching using `x-grok-conv-id` header tracking.
  - Restructured prompts to separate static system context from dynamic market data, achieving ~85-90% cache hit rates on system instructions.
  - Added cache telemetry (cached tokens, savings) to AI service logs.
- **Alert Dispatcher Redesign (Concurrency & Filtering):**
  - Fixed AI connection/parsing bugs (endpoint `/ask`, field `answer`).
  - Added Concurrency Control: Max 3 concurrent AI calls via Semaphore + 5-minute per-asset cooldown.
  - Implemented **Ticker Synchronization**: Dispatcher now dynamically whitelists assets by listening to Redis `ticker:active`, synced in real-time with the Frontend Ticker Tape.

- **Pocket Option Timeframe Automation Hardening**:
  - Successfully resolved the "Span-vs-Anchor" click obstruction by implementing automatic parent-anchor traversal in `local_selenium_utils/selenium_ui_controls.py`.
  - Hardened timeframe dropdown detection (`_is_open`) to specifically target the PocketOption `.items__list` container.
  - Verified stability with a successful `TopdownSelectTest2` run confirming `ok: true` for the `M1` timeframe selection on the first attempt.
  - Full implementation details available in `reports/implementation_report_topdown_select_25-12-31.md`.

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
  - History endpoints are now explicit and reliable:
    - `POST /api/v1/history/bootstrap-history` returns non-200 on failure with `HistoryErrorResponse`.
    - `GET /api/v1/history/{asset}` returns `candles` (and legacy `data`) for a single frontend parsing path.
  - Indicator pipeline is implemented and documented; regime mapping doc exists but regime detection logic is not yet wired into runtime.
  - AI integration is partially wired:
    - `/api/v1/ai/ask` exists and supports `conversation_id` for prefix caching.
    - Voice WS relay endpoint exists for realtime voice sessions (currently used for dictation).
    - AI service includes telemetry for token usage and cache performance.
  - Settings architecture foundation implemented:
    - Versioned settings schema with persisted JSON in `data/settings/settings.json`.
    - `GET /api/v1/settings` and `PUT /api/v1/settings` endpoints in the Gateway for centralized configuration.
    - **Recommended Platform Settings Scaffolding** provisioned in `v2_Dev_Docs/Recommended_Platform_Settings_Scaffolding.md`, detailing modular sections for Global, Automation, Analysis, AI Behavioral, and Risk management settings.
  - Local Ops endpoints implemented (local-only, disabled by default):
    - `POST /api/v1/ops/chrome/start`
    - `POST /api/v1/ops/stream/start`
    - `POST /api/v1/ops/stream/pause`
    - `GET /api/v1/ops/stream/status`
  - Pocket Option timeframe sync path is now **stable** and verified.

- **Frontend**:
  - Core Dashboard is stable for streaming and basic visualization.
  - ChartWorkspace is now modular and smaller (<250 LOC) to reduce regression risk.
  - Indicator visualization (overlays + oscillator panes) is still the next major feature implementation.
  - Ask AI is implemented with two UX surfaces:
    - Ask AI modal (quick assist + voice dictation → transcript insert + “thinking” indicator + optional TTS read-back).
    - AI Insights panel (threaded chat + input box + voice dictation + Speak buttons).
  - Screenshot editor includes an Ask AI action to analyze annotated screenshots.
  - Latest annotated screenshot is persisted across refresh to support “Annotated” image source.
  - A dedicated `useSettingsStore` (Zustand) and `settingsClient` are in place to manage Global/User/AI + per-tab settings separately from `useMarketStore`.
  - TopBar **Chrome** and **Stream** badges are now clickable controls backed by Gateway ops endpoints.
  - **MarketStore Sync**: Emits `update_active_ticker` to sync background monitoring (Alert Dispatcher) with frontend UI ticker state.

## Next Steps
1. **Indicator Visualization Implementation (Frontend + Gateway)**
   - Implement oscillator panes (RSI, MACD histogram, Stochastic, CCI) synchronized with main time scale.
   - Refine overlay interactions (e.g., toggle visibility per series).

2. **AI Assistant Backend Hardening (Gateway + AI Service)**
   - Enforce strict request schema for `/api/v1/ai/ask` (pydantic model + size limits).
   - Improve structured error responses and reduce sensitive logging.

3. **Voice Conversation (Optional Upgrade)**
   - If desired, add realtime conversation mode (audio output) in AI Insights.
   - Keep modal voice as dictation-only; use read-back for modal answers.

3. **AI Gateway + TradingContext (Backend)**
   - Introduce a dedicated AI Gateway module and a TradingContext builder.
   - Keep Gateway `/api/v1/ai/ask` as a thin adapter.

4. **Settings modular layout (Frontend)**
   - Implement modular settings UI per `v2_Dev_Docs/Recommended_Platform_Settings_Scaffolding.md`.

## Active Files
- Frontend:
  - `gui/Dashboard/src/store/marketStore.js`
  - `gui/Dashboard/src/store/settingsStore.js`
  - `gui/Dashboard/src/components/Dashboard.jsx`
  - `gui/Dashboard/src/components/AssetPanel.jsx`
  - `gui/Dashboard/src/components/TopBar.jsx`
  - `gui/Dashboard/src/components/SettingsPanel.jsx`
  - `gui/Dashboard/src/utils/useTextToSpeech.js`
  - `gui/Dashboard/README.md`
  - `gui/Dashboard/src/components/ChartWorkspace.jsx`
  - `gui/Dashboard/src/components/ChartWorkspaceOverlays.jsx`
  - `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js`
  - `gui/Dashboard/src/hooks/useChartWorkspaceHeaderControls.js`
  - `gui/Dashboard/src/config/chartOptions.js`
  - (Planned) Settings UI components.

- Backend:
  - `backend/services/gateway/main.py`
  - `backend/services/gateway/routes/ai_voice.py`
  - `backend/services/gateway/routes/ops.py`
  - `backend/services/gateway/routes/history.py`
  - `backend/services/gateway/routes/settings.py`
  - `backend/models/errors.py`
  - `local_selenium_utils/selenium_ui_controls.py`
  - `capabilities_v2/timeframe_menu.py`
  - `backend/services/strategy/indicators.py`
  - `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md`
  - `backend/scripts/otc_alert_dispatch.py` (Redesigned with Ticker Sync)
  - `Research/research_lightweight-charts-indicators_2025-12-23.md`
  - `Research/research_ai_integration_vision_files_2025-12-20.md`


## Topdown v2 Timeframe & Collection Status
- v2 selenium capabilities for PocketOption timeframe automation are now **stable and verified** under `capabilities_v2/`:
  - `timeframe_menu.py` provides low-level dropdown open + label selection with span-to-a traversal.
  - `timeframe_select_sync.py` wraps `timeframe_menu` with retries, chart-focus recovery, and detailed per-label diagnostics.
  - `topdown_select_test_2.py` orchestrates session validation and confirmed robust timeframe selection.
- Full implementation summary in `reports/implementation_report_topdown_select_25-12-31.md`.
- Next incremental steps:
  - Use `collect_history` with `use_tf_sync=true` to build multi-day datasets for v2 strategy and indicator experiments.
