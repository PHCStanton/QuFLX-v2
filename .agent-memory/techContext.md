# Technical Context

## Technologies Used
- **Python 3.11+**: Backend services (Collector, Strategy, Gateway, future AI Gateway).
- **FastAPI**: API Gateway framework.
- **Redis**: Message broker and in-memory database.
- **React + Vite**: Frontend framework.
- **JavaScript (JS/JSX)**: Dashboard codebase is currently JS/JSX (TypeScript not adopted in `src/`).
- **Zustand**: Frontend state management.
- **Lightweight Charts**: Financial charting library (price chart + planned oscillator panes).
- **Pydantic**: Data validation and settings management.
- **Selenium**: Browser automation for data collection.
- **xAI API (Grok)**: External AI service for text, vision, and voice assistants.
- **Web Speech API (Browser)**: SpeechSynthesis for TTS read-back of AI answers.

## Development Setup
1. **Backend**:
   - `python -m venv venv`
   - `pip install -r requirements.txt`
   - Run services via `python -m backend.services.[service].main`
   - Configure xAI via environment variables (e.g. `XAI_API_KEY`) and never hardcode secrets.
2. **Frontend**:
   - `npm install`
   - `npm run dev`
   - PowerShell note: prefer running commands on separate lines (avoid `&&`).
3. **Infrastructure**:
   - Redis running on default port 6379.
   - Chrome with DevTools Protocol enabled for the Collector.

## Dashboard API Base URL
- Dashboard API clients support `VITE_API_BASE_URL` (fallback `http://localhost:8000`).
- Use this to avoid hardcoding localhost in multi-env builds.

## Dashboard Dev Server Ports
- Vite may move from `5173` to `5174+` if the port is in use. Always use the printed `Local:` URL from the dev server output.

## Local Ops Controls (Gateway)

- Gateway supports local-only ops endpoints for starting Chrome and starting/pausing the Collector.
- Config via environment variables:
  - `QFLX_ENABLE_OPS=1` to enable ops (disabled by default).
  - Optional `QFLX_OPS_TOKEN` to require `X-QFLX-OPS-TOKEN` header.
  - Optional `QFLX_CHROME_PATH` to override Chrome executable detection.
  - Optional `QFLX_CHROME_URL` to control the startup URL.
- Chrome profile directory used by the ops launcher is `Chrome_profile/` at project root.

## Dependencies
- `fastapi`, `uvicorn`, `python-socketio`: Gateway.
- `redis`: Redis client.
- `selenium`: Chrome automation.
- `pandas`, `pandas-ta` (optional), `talib` (optional): Indicator calculation.
- `lightweight-charts`: Frontend charting.
- `xai-sdk` or HTTP client: Integration with xAI chat/vision/voice APIs.

## AI Keys (Backend)
- Backend AI service reads `XAI_API_KEY` (preferred) or `AI_API_KEY` / `GROK_API_KEY` and `AI_MODEL` / `AI_BASE_URL`.
- Realtime voice WS relay uses the same key source (Authorization bearer) and connects to `wss://api.x.ai/v1/realtime`.
- **Grok Prefix Caching**: Backend injects `x-grok-conv-id` into Grok API requests to enable caching of static prompt prefixes (System Prompts).

## AI Speech Read-Back (Frontend)
- AI answer speech uses browser `speechSynthesis` with Settings:
  - `ai.voiceReadBackEnabled`
  - `ai.voiceReadBackRate`
  - `ai.voiceReadBackPitch`
  - `ai.voiceReadBackVoiceURI`

## Settings & Configuration
- Gateway exposes `GET /api/v1/settings` and `PUT /api/v1/settings` as the central API for platform settings, backed by a versioned JSON file in `data/settings/settings.json`.
- Dashboard uses a dedicated Zustand `useSettingsStore` (separate from `useMarketStore`) to manage Global, User Profile, AI Assistant, and per-tab settings in a single, structured object.
- A small `settingsClient` module in the Dashboard handles HTTP communication with the settings endpoints.
 - `automation.historyWaitTime` is now standardized to 1–8 seconds across UI and backend validation.

## Technical Constraints
- **Latency**: Must process ticks and update charts within ~100ms for a responsive UI.
- **Chrome Dependency**: The Collector requires a running Chrome instance with DevTools Protocol enabled.
- **Redis Availability**: The system cannot function without Redis.
- **External AI Calls**: xAI requests are network-bound and must not block the core trading loop. AI integration should be best-effort and tolerant of latency/failures.
- **Background Service Sync**: Services like Alert Dispatcher depend on Redis channel `ticker:active` for asset whitelisting from the frontend.

## Layout & Resizing Strategy
- **Flexbox Architecture:** The Dashboard uses a nested flexbox layout for dynamic panel sizing.
- **Synchronized Resizing:** Implemented using `ResizeObserver` in `ChartContainer` and `OscillatorChart` to ensure charts re-render and adjust their dimensions immediately when their parent containers change size (e.g., during workspace dragging).
- **Time-Scale Synchronization:** Oscillator charts sync their visible range with the main chart via the `lightweight-charts` API, with an initial sync delay to ensure cross-component readiness.

## Chart & Indicator Conventions
- **Intraday Candles**: Use UNIX timestamps in seconds for `time` values when rendering intraday series.
- **Time Axis**: Enable intraday display using `timeScale.timeVisible` (and keep `secondsVisible` disabled for `1m`).
- **Indicators**:
  - Backend is the canonical source for indicator values and market regimes (via `TechnicalIndicatorsPipeline` and strategy docs).
  - Frontend uses Lightweight Charts to visualize:
    - Overlay indicators (e.g. MAs, Bollinger, Supertrend) on the main pane.
    - Oscillators (e.g. RSI, Stoch, MACD) in separate, time-synchronized panes.

## Coding Standards
- **Python**: PEP 8, Type Hints (mypy), Pydantic models for all data structures and xAI request/response schemas.
- **TypeScript**: Strict mode, functional components, hooks for logic, clear separation between store and view.
- **AI Integration**: All xAI calls go through a dedicated AI Gateway module; no direct HTTP calls to xAI from scattered modules.

## Testing Requirements
- **Unit Tests**: For core logic (parsers, indicators, regime detection, AI Gateway request shaping).
- **Integration Tests**: Verify Redis pub/sub flow and Gateway endpoints (including `/api/v1/ai/ask`).
- **End-to-End Tests**: Verify full pipeline from Chrome to Chart; later, add flows that include Ask-AI interactions to ensure context injection wiring is correct.

## Current Build/QA Commands
- Backend tests: `python -m pytest -q`
- Dashboard lint: `npm run lint`
- Dashboard build: `npm run build`
- Dashboard E2E smoke: `npm run test:qa`

## Known Warnings / Follow-ups
- Pydantic v2 deprecation warnings are present (class-based `Config`); migrate incrementally to `ConfigDict`.
- Vite may warn that `settingsStore.js` is both statically and dynamically imported; this is informational and not a build failure.


## Selenium Capabilities for PocketOption Topdown v2
- v2 Selenium capabilities under `capabilities_v2/` formalize the PocketOption automation layer:
  - `session_foundations.py`: validates that the current Chrome session is on a suitable PocketOption layout and that key UI elements (chart, favorites bar, timeframe control) are present.
  - `favorites_bar.py`: provides `reset_to_left`, `scroll_right`, `get_visible_favorites`, and `click_favorite` actions over the PocketOption favorites bar.
  - `timeframe_menu.py`: encapsulates timeframe dropdown opening and label selection, including alias normalization and iframe-aware search.
  - `timeframe_select_sync.py`: adds retries, chart-focus recovery, and diagnostics around `timeframe_menu` to stabilize timeframe selection.
  - `history_collector.py` + `collect_history_loop.py`: bridge from Selenium-attached Chrome to WebSocket-based candle collection and CSV output.
- `capabilities_v2/runner.py` exposes these via a generic CLI entry point, and the Gateway is expected to call `runner.py` rather than importing Selenium code directly.
