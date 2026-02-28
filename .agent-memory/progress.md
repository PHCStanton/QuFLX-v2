# Project Progress

## Phase 1: Foundation & Data Contracts ✅
- [x] Environment Setup
- [x] Data Models (`Tick`, `Candle`)
- [x] Redis Infrastructure (`RedisPublisher`, `RedisSubscriber`)

## Phase 2: The Miner (Data Collector Service) ✅
- [x] Chrome Connection Manager
- [x] WebSocket Interceptor
- [x] Collector Service
- [x] Verification (End-to-End Data Flow)

## Phase 3: The Brain (Strategy Engine) ✅
- [x] Indicator Engine (`TechnicalIndicatorsPipeline` in `backend/services/strategy/indicators.py`)
- [x] Strategy Service + Signal Generation
- [x] Market Regime Detection (`regime_detector.py`, volatility guards, `detect_regime_series`)
- [x] Strategy documentation: `Indicators_vs_Market_Structures.md`

## Phase 4: The Face (API Gateway) ✅
- [x] FastAPI Setup + Socket.IO Integration
- [x] Historical Data API (Bootstrap + Fallback, explicit HTTP error codes)
- [x] Local Ops Endpoints (`/api/v1/ops/chrome/start`, `/ops/stream/...`)
- [x] History API unified around `candles` response key

## Phase 4.1: Pocket Option Timeframe Sync ✅
- [x] `capabilities_v2/timeframe_menu.py` — low-level dropdown selection with span-to-anchor traversal
- [x] `capabilities_v2/timeframe_select_sync.py` — retries, chart-focus recovery, diagnostics
- [x] Gateway integration via `capabilities_v2/runner.py`
- [x] End-to-end verified with `TopdownSelectTest2`

## Phase 4.2: Pocket Option Topdown v2 (Data Collection) ✅
- [x] `capabilities_v2/collect_history_loop.py` — multi-asset timeframe + history collection
- [x] `capabilities_v2/history_collector.py` — Selenium → WebSocket interceptor → CSV output
- [x] `capabilities_v2/runner.py` — generic CLI entry point for all capabilities
- [x] `capabilities_v2/topdown_select_v2_guide.md` — documentation

## Phase 5: The UI (Frontend) ✅
- [x] Zustand stores: `marketStore`, `settingsStore`, `tradingStore`, `profileStore`, `userStore`
- [x] Core Dashboard layout — Sidebar, TopBar, ChartWorkspace
- [x] Lightweight Charts integration (intraday candles, UNIX timestamps)
- [x] OTC Ticker Panel (list + ticker modes, live quotes)
- [x] Stream status via tick recency + `backend_status` events
- [x] `ChartWorkspace.jsx` modular (<250 LOC)
- [x] TopBar Chrome + Stream controls via Gateway ops endpoints
- [x] Data contracts: history bootstrap explicit errors + unified `candles` shape

## Phase 5.1: Indicators & Overlays ✅
- [x] Overlay indicators on main chart: SuperTrend, Bollinger Bands, EMA Cross-Over (21/50/100), Support/Resistance (pivot fractals)
- [x] `OscillatorChart.jsx` + `OscillatorPanel.jsx` — RSI, MACD, Stochastic, CCI panes
- [x] Time-scale synchronized oscillators with main chart
- [x] `IndicatorSettingsModal.jsx` — per-indicator configuration
- [x] Static chart config in `gui/Dashboard/src/config/chartOptions.js`
- [ ] Oscillator visibility toggle persistence in settings (pending)

## Phase 5.2: AI Integration (Text + Vision) ✅
- [x] `/api/v1/ai/ask` endpoint with `conversation_id` for prefix caching
- [x] Ask AI Modal (quick assist, voice dictation, TTS read-back)
- [x] AI Insights Panel (threaded chat, voice dictation, Speak buttons)
- [x] Screenshot → AI handoff from screenshot editor
- [x] Annotated screenshot persistence (cross-refresh, "Annotated" image source)
- [x] AI Prefix Caching via `x-grok-conv-id` (~85% token savings)
- [x] Persistent `aiohttp.ClientSession` with `TCPConnector` in AI Service
- [ ] TradingContext contract enforcement (pydantic schema + size limits) — pending

## Phase 5.3: Voice Agent ✅
- [x] Backend voice WS relay to xAI realtime API
- [x] Frontend mic controls + transcript handling
- [x] Browser TTS read-back (`useTextToSpeech.js`) + Settings controls
- [x] `useNaturalVoice` hook for xAI Message-to-Audio
- [x] Read-Back Mode (Browser vs xAI Server) in Settings
- [ ] Realtime conversation mode (AI audio output) in Insights — optional, pending

## Phase 5.4: Settings & Configuration Architecture ✅
- [x] Versioned settings schema in `data/settings/settings.json`
- [x] `GET/PUT /api/v1/settings` in Gateway
- [x] `useSettingsStore` (Zustand) — Global/User/AI + per-tab settings
- [x] `settingsClient.js` for HTTP communication
- [x] Alerts & Notifications Settings UI section
- [x] Dynamic env var passing from Gateway to Alert Dispatcher
- [x] History Wait Time normalized to 1–8s (UI + backend validation)

## Phase 5.5: Alerts & Monitoring ✅
- [x] `otc_alert_dispatch.py` — `MarketScanner` with ADX, RSI, Bollinger, Fractal Pivots
- [x] Weighted Confidence Scoring for alert prioritization
- [x] Semaphore-based concurrency (max 3 parallel AI calls) + 5-min per-asset cooldowns
- [x] `TickLogger` with configurable chunk sizes (default 1000 ticks/file)
- [x] Ticker-Linked whitelisting via Redis `ticker:active` + SocketIO `update_active_ticker`
- [x] Discord notification integration
- [x] `AlertDispatchPage.jsx` — full-featured log viewer
- [x] `How_it_Works.md` — end-user documentation

## Phase 5.6: AI Service Hardening ✅
- [x] Persistent `aiohttp` client session + TCP connector (keep-alive)
- [x] FastAPI lifespan integration for managed AI service lifecycle
- [x] Retries + robust error handling for external LLM calls
- [x] Cache telemetry (cached tokens, savings) in AI service logs

## Phase 5.7: Profile System ✅
- [x] `backend/services/gateway/routes/profiles.py` — CRUD + active profile management
- [x] `data/profiles/` — one JSON file per profile + `active_profile.json`
- [x] Auto-creates `default` profile on first run (seeded from current settings)
- [x] `profileStore.js` — Zustand store with debounced settings sync
- [x] `ProfileMenu.jsx` — profile switcher, creation, rename
- [x] `ProfilePicEditorModal.jsx` — avatar editing
- [x] Settings → Profiles linked: creating/switching profiles updates `settingsStore`

## Phase 5.8: Live Trading (SSID Service) ✅
- [x] `backend/services/ssid_service/` — standalone FastAPI microservice
- [x] `connector.py` — PocketOption WebSocket session management
- [x] `executor.py` — trade execution (call/put, amount, expiration)
- [x] SSID persistence to `.env` (`QFLX_SSID_DEMO`, `QFLX_SSID_REAL`)
- [x] Gateway proxy routes: connect, trade, balance, switch-mode, assets
- [x] `tradingStore.js` — full live trading state management
- [x] `LiveTradingPanel.jsx` — connection bar, balance, Demo/Real toggle, trade form, history

### SSID Persistence Fixes (28-02-2026) ✅
- [x] Fix 1: Gateway allows empty SSID (`.env` fallback via ssid_service)
- [x] Fix 2: `/ssid-status` endpoint on ssid_service (booleans only)
- [x] Fix 3: Gateway proxy for `/ssid-status`
- [x] Fix 4: `tradingStore` SSID status state + `fetchSsidStatus()` action
- [x] Fix 5a: SettingsPanel SSID saved badges (survives tab switches)
- [x] Fix 5b: LiveTradingPanel "✓ Saved SSID ready" indicator
- [x] Fix 6: SettingsPanel "Save & Close" — save + profile flush + toast + navigate
- [x] Fix 7: SettingsPanel "Export Config (JSON)" — browser download

## Phase 5.9: OTC Asset Expansion & Normalization ✅
- [x] Extended OTC categories: Currencies, Cryptocurrencies, Commodities, Stocks, Indices
- [x] Asset label normalization: `EURUSD_otc` → `EURUSDOTC` (UI display)
- [x] Asset dropdown sorted by payout percentage (descending)
- [x] Asset selection synchronized across panels

## Phase 5.10: Strategy Lab Integration ✅
- [x] `StrategyLabPanel.jsx` — CSV upload, file management, regime/entry-signal analysis
- [x] `GET /api/v1/strategy/data/{fileId}` — serves OHLC data for strategy files
- [x] `marketStore.selectedStrategyFileId` — active strategy file tracking
- [x] `ChartWorkspace` renders strategy-lab data when file selected
- [x] `ChartHeader` CSV dropdown for file selection

## Phase 5.11: Statement Analysis ✅
- [x] `StatementAnalysisPage.jsx` — full-page route at `/statement-analysis`
- [x] CSV upload + trading performance metrics + AI coaching insights
- [x] Accessible via "Statements & Logs" group in ProfileMenu

## Phase 5.12: Test Organization ✅
- [x] Moved 10 test files from root → `backend/tests/` (8) and `tests/` (2)
- [x] Moved 7 verify/check/debug/diagnose files → `backend/tests/` (3) and `tests/` (4)
- [x] Fixed all `Path(__file__).resolve().parents[N]` references in moved files
- [x] `pytest.ini` already covers both test directories — no config changes needed

## Phase 6: Integration & Polish (In Progress)
- [ ] Oscillator pane visibility toggle persistence
- [ ] Profile import from exported JSON (round-trip)
- [ ] Risk Manager Panel (placeholder → implementation)
- [ ] Calendar & Journal Panel (placeholder → implementation)
- [ ] System orchestration and resilience testing
- [ ] AI TradingContext contract enforcement (schema + size limits)
- [ ] Comprehensive documentation & onboarding guides
- [ ] Automated integration tests for SSID service, profile sync, trading flow
