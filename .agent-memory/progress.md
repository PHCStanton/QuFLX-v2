# Project Progress

## Phase 1: Foundation & Data Contracts (Completed)
- [x] Environment Setup
- [x] Data Models (`Tick`, `Candle`)
- [x] Redis Infrastructure (`RedisPublisher`, `RedisSubscriber`)

## Phase 2: The Miner (Data Collector Service) (Completed)
- [x] Chrome Connection Manager
- [x] WebSocket Interceptor
- [x] Collector Service
- [x] Verification (End-to-End Data Flow)

## Phase 3: The Brain (Strategy Engine) (Completed)
- [x] Indicator Engine (Python-based `TechnicalIndicatorsPipeline`)
- [x] Strategy Service
- [x] Signal Generation

## Phase 4: The Face (API Gateway) (Completed)
- [x] FastAPI Setup
- [x] Socket.IO Integration
- [x] Historical Data API (Bootstrap + Fallback)
- [x] Local Ops Endpoints for Chrome + Stream start/pause (dev-gated)

## Phase 4.1: Pocket Option Timeframe Sync (Completed)
- [x] Wire timeframe sync endpoint in Gateway and Selenium capability (`capabilities_v2/timeframe_menu.py`) to the Dashboard Sync button.
- [x] improve Gateway error messaging for timeframe menu selection failures.
- [x] Extend timeframe menu automation selectors to handle `a`/`span` label elements.
- [x] Capture DOM ground truth for timeframe controls (identified span-to-anchor tangle).
- [x] Implement parent-anchor traversal in `local_selenium_utils/selenium_ui_controls.py`.
- [x] Validate end-to-end Sync flow via `TopdownSelectTest2` with robust sync enabled.

## Phase 5: The UI (Frontend Rebuild) (Core Streaming Complete)
- [x] State Management (Zustand store created and wired to Socket.IO)
- [x] Chart Components (Lightweight Charts integrated with tick aggregation)
- [x] Intraday candle time rendering fixed (UNIX timestamps)
- [x] Dashboard Layout (Modular components created)
- [x] OTC Ticker Panel (List/Ticker modes powered by live quotes)
- [x] Lint/Build Health (`npm run lint` and `npm run build` passing)
- [x] Stream status semantics aligned with tick recency and backend `backend_status` event
- [x] OTC asset refresh flow hardened (OTC-only filter, tooltip UX, status polling simplification)
- [x] Data Contracts & Validation (history bootstrap status codes + unified candles shape)
- [x] Refactor `ChartWorkspace.jsx` into smaller components/hooks
- [x] TopBar Chrome + Stream controls wired to Gateway ops endpoints
- [x] Stream toggle uses tick-driven health for correct restart after pause

## Phase 5.1: Indicators & Market Regimes (Design Completed, Implementation Pending)
- [x] Backend indicator pipeline validated (`backend/services/strategy/indicators.py`).
- [x] Strategy documentation created: `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md` mapping indicators to regimes.
- [x] Frontend/indicator integration research: `Research/research_lightweight-charts-indicators_2025-12-23.md`.
- [x] Implement overlay indicators on main chart using Lightweight Charts helpers.
- [ ] Implement oscillator pane(s) for RSI/Stoch/MACD/etc., time-synchronized with main chart.

## Phase 5.2: AI Integration (Text + Vision) (Research Completed, Implementation Pending)
- [x] AI integration research: `Research/research_ai_integration_vision_files_2025-12-20.md` (context injection, data + vision).
- [x] High-level design for AI Gateway, TradingContext, and Ask-AI endpoint.
- [ ] Implement AI Gateway module wrapping xAI chat/vision APIs.
- [ ] Implement TradingContext builder using existing strategy/indicator data.
- [x] Add `/api/v1/ai/ask` endpoint in Gateway.
- [x] Implement Ask AI Quick Modal + AI Insights Panel thread.
- [x] Remove `window.prompt()` UX and use in-app prompt input.
- [x] Add Screenshot → AI handoff from the screenshot editor.
- [x] Persist latest annotated screenshot across refresh for "Annotated" image source.
- [x] Add clear "AI thinking" indicator in the Ask AI modal.
- [ ] Implement TradingContext contract enforcement (backend schema + size limits).

## Phase 5.3: Voice Agent (Dictation + Read-Back) (In Progress)
- [x] Implement backend voice gateway (WebSocket proxy to xAI realtime endpoint).
- [x] Implement frontend mic controls and transcript handling for dictation (Modal + AI Insights).
- [x] Prevent audio payloads from being rendered as text in the UI.
- [x] Add browser TTS read-back for AI outputs (Speak buttons + modal auto-read).
- [x] Fix voice route registration bug in `main.py` (was importing mock instead of real xAI relay).
- [x] Deprecate `voice.py` mock handler to prevent future misalignment.
- [x] Implement `useNaturalVoice` hook for xAI Message-to-Audio (TTS).
- [x] Add Read-Back Mode (Browser vs Server) and xAI Voice selection in Settings.
- [x] Integrate Natural Voice Read-Back into Ask AI Modal and Insights Panel.
- [ ] (Optional) Add realtime conversation mode (AI audio output) in AI Insights.

## Phase 5.4: Settings & Configuration Architecture (Foundation & Scaffolding Complete)
- [x] Define settings architecture across Global, User Profile, AI Assistant, and each Sidebar tab section in `v2_Dev_Docs/Settings_Architecture_Endpoints.md`.
- [x] Implement versioned settings storage in the Gateway using `data/settings/settings.json` and helper functions in `backend/services/gateway/main.py`.
- [x] Add `GET /api/v1/settings` and `PUT /api/v1/settings` endpoints for centralized configuration management.
- [x] Create a dedicated `useSettingsStore` (Zustand) in `gui/Dashboard/src/store/settingsStore.js` that mirrors the documented settings sections and keeps configuration separate from `useMarketStore`.
- [x] Add `gui/Dashboard/src/api/settingsClient.js` to communicate with the new settings endpoints.
- [x] Provision Recommended Platform Settings Scaffolding in `v2_Dev_Docs/Recommended_Platform_Settings_Scaffolding.md`.
- [x] Align sidebar tab ordering so `Calendar & Journal` and `Settings` are the final two tabs, with `Settings` pinned last.
- [x] Normalize History Wait Time setting to 1–8 seconds (UI + backend validation)

## Phase 6: Integration & Polish (Pending)
- [ ] System Orchestration and resilience testing (restart tolerance, degraded modes).
- [ ] Comprehensive Documentation & Onboarding Guides, including AI usage and limitations.
- [ ] Automated tests for indicator visualization and AI workflows.

### Completed Tasks
- [x] Implemented Manual Mode history collection with 15s timeout.
- [x] Fixed subprocess runner path resolution in Gateway.
- [x] Compiled `report_history_rewrite_implementation_26-01-06.md`.
- [x] Updated `History_data_Payload_Aggregation.md` with latest workflow.
- [x] Implemented explicit HTTP status codes for history bootstrap failures.
- [x] Unified history API response shape around `candles`.
- [x] Removed oscillator → main crosshair feedback path.
- [x] Removed all `window.alert()` calls in Dashboard.
- [x] Reduced `ChartWorkspace.jsx` to < 250 lines.
- [x] Eliminated Vite chunk-size warning via manual chunking.

### In Progress
- [x] Implement overlay indicators on main chart (EMA, BBands, SuperTrend, Support/Resistance, EMA Cross-Over).
- [ ] Implement oscillator panes (RSI, MACD histogram) synchronized with main time scale.
- [ ] Harden `/api/v1/ai/ask` contract (schema validation, structured errors, size limits).


## Phase 4.2: Pocket Option Topdown v2 (Timeframe + Data Collection Foundation)
- [x] Implemented `capabilities_v2/timeframe_select_sync.py` for robust timeframe selection with retries and chart-focus recovery.
- [x] Extended `capabilities_v2/topdown_select_test_2.py` to optionally use `timeframe_select_sync` and expose CLI flags (`--use-tf-sync`, `--tf-attempts`, `--tf-wait-s`, etc.).
- [x] Updated `capabilities_v2/collect_history_loop.py` to integrate `timeframe_select_sync` for enforcing a per-asset timeframe before history collection.
- [x] Confirmed that `capabilities_v2/history_collector.py` and `collect_history_loop.py` together provide a v2-native path from Selenium-attached Chrome → WebSocket interceptor → CSV candle output.
- [x] Created `capabilities_v2/topdown_select_v2_guide.md` documenting the topdown v2 flow and capabilities.
- [x] Re-ran `python -m pytest -q` after changes to ensure no regressions.
