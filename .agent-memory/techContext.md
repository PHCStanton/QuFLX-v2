# Technical Context

## Technologies Used
- **Python 3.11+**: Backend services (Collector, Strategy, Gateway, SSID Service, AI).
- **FastAPI**: API Gateway and SSID Service framework.
- **Redis**: Message broker and in-memory database.
- **React + Vite**: Frontend framework.
- **JavaScript (JS/JSX)**: Dashboard codebase (`src/` is JS/JSX — TypeScript not adopted).
- **Zustand**: Frontend state management (multiple stores).
- **Lightweight Charts**: Financial charting library (price + oscillator panes).
- **Pydantic v2**: Data validation and settings management. NOTE: avoid deprecated class-based `Config`; use `model_config = ConfigDict(...)`.
- **Selenium**: Browser automation for data collection (PocketOption WebSocket interception).
- **xAI API (Grok)**: External AI service for text, vision, and voice assistants.
- **Web Speech API (Browser)**: SpeechSynthesis for TTS read-back.
- **pocketoptionapi**: Thin wrapper inside `ssid_service/` for WS-based trade execution.

## Development Setup
1. **Backend / Conda**:
   - Conda env: `QuFLX-v2` — always activate with `conda activate QuFLX-v2`.
   - Run services: `python -m backend.services.[service].main`
   - Backend tests: `python -m pytest -q` (discovers `tests/` and `backend/tests/`).
   - **PowerShell note**: avoid `&&`; run commands on separate lines or use `;`.
2. **Frontend**:
   - `npm install` → `npm run dev` in `gui/Dashboard/`
   - Vite port: `5173` (may shift to `5174+` if in use — check `Local:` URL in output).
3. **Infrastructure**:
   - Redis on default port `6379`.
   - Chrome with DevTools Protocol enabled for the Collector.
4. **Environment Variables** (`.env` at project root):
   - `QFLX_SSID_DEMO` / `QFLX_SSID_REAL`: Persisted Pocket Option SSIDs.
   - `QFLX_SSID_SERVICE_PORT` / `QFLX_SSID_PROXY_TIMEOUT_SECONDS`: SSID service config.
   - `QFLX_ENABLE_OPS=1`: Enable local ops endpoints.
   - `QFLX_OPS_TOKEN`, `QFLX_CHROME_PATH`, `QFLX_CHROME_URL`: Ops config.
   - `XAI_API_KEY`: xAI/Grok API key.

## Frontend Store Architecture (Zustand)
All stores live in `gui/Dashboard/src/store/`:
- **`marketStore.js`**: Market data, tickers, active tab (`activeTab`/`setActiveTab`), socket.IO, asset whitelist, chart/indicator state, stream health, strategy-lab file selection.
- **`settingsStore.js`**: Global/User/AI/per-tab settings. Syncs with `GET/PUT /api/v1/settings`. Separate from `useMarketStore`.
- **`tradingStore.js`**: Live trading state — connection (`isConnected`, `isDemoMode`, `hasDemoSsid`, `hasRealSsid`), balance, trade execution, trade history, OTC assets, `fetchSsidStatus()`.
- **`profileStore.js`**: Multi-profile management. Calls `GET/POST/PUT/DELETE /api/v1/profiles`. Auto-syncs active profile settings via a `settingsStore` subscription.
- **`userStore.js`**: Minimal user identity (display name, avatar).
- **`persistMiddleware.js`**: Shared Zustand `persist` middleware wrapper using `localStorage`. Key prefix: `quflx-v2-*`.

## Gateway API Endpoints Summary
All prefixed with `/api/v1/`:
| Route Prefix | File | Purpose |
|---|---|---|
| `/history` | `history.py` | Bootstrap + fetch OHLC candles |
| `/trading` | `trading.py` | Proxy to ssid_service (connect, trade, balance, switch-mode, ssid-status) |
| `/assets` | `assets.py` | OTC asset listing + refresh (92% payout sweep) |
| `/profiles` | `profiles.py` | Multi-profile CRUD + active profile |
| `/settings` | `settings.py` | Global platform settings (versioned JSON) |
| `/ai` | `ai.py` | AI ask endpoint + conversation management |
| `/ai/voice` | `ai_voice.py` | WebSocket voice relay to xAI realtime |
| `/strategy` | `strategy.py` | Strategy Lab — regime detection, OHLC data upload |
| `/ops` | `ops.py` | Local-only Chrome + Stream controls |
| `/indicators` | `indicators.py` | Indicator series for charts |
| `/alerts` | `alerts.py` | Alert dispatch log access |
| `/screenshots` | `screenshots.py` | Screenshot persistence |
| `/timeframe` | `timeframe.py` | Selenium timeframe sync |
| `/dev-logs` | `dev_logs.py` | Dev log streaming |

## SSID Service (ssid_service)
- Standalone FastAPI microservice in `backend/services/ssid_service/`.
- **Endpoints**: `POST /connect`, `POST /trade`, `GET /balance`, `POST /switch-mode`, `GET /ssid-status`, `GET /assets`.
- `GET /ssid-status` returns `{hasDemoSsid: bool, hasRealSsid: bool}` — booleans only, no raw SSID exposure.
- SSIDs are persisted to `.env` (`QFLX_SSID_DEMO` / `QFLX_SSID_REAL`) via `_persist_ssid()`.
- `app.state.ssid_demo` / `app.state.ssid_real` hold in-memory copies loaded from `.env` at startup.
- Fallback chain: if `ConnectRequest.ssid == ""`, the service falls back to in-memory env SSID.
- Gateway proxies all ssid_service calls via `_proxy_request()` in `routes/trading.py`.
- Gateway `ConnectRequest.ssid` is `default=""` (empty allowed). Validator skips format check when empty.

## Profile System
- Profiles stored as JSON files in `data/profiles/<profileId>.json`.
- Active profile tracked in `data/profiles/active_profile.json`.
- Each profile contains `{ id, name, settings, createdAt, updatedAt }`.
- `profileStore.js` auto-syncs settings changes (debounced 800ms) to the active profile.
- "Save & Close" in SettingsPanel does an immediate `profileStore.updateProfile()` (no debounce wait) before navigating away.
- Export Config (JSON) triggers a browser download of `QuFLX_Settings_[ProfileName]_[date].json`.

## Test Organization
- `pytest.ini`: `pythonpath = .`, `testpaths = tests backend/tests`, `python_files = test_*.py`.
- `backend/tests/`: Backend unit/integration tests (strategy, API, indicators, ssid, trading proxy).
- `tests/`: Infra/integration/capabilities tests (smoke, Redis checks, capabilities_v2, Selenium debug).
- All moved test files have corrected `Path(__file__).resolve().parents[N]` for accurate root resolution.

## Dashboard API Base URL
- `getApiBaseUrl()` from `api/apiBase.js` uses `VITE_API_BASE_URL` env var (fallback `http://localhost:8000`).
- All store network calls use `getApiBaseUrl()` — never hardcode `localhost`.

## Chart & Indicator Conventions
- **Intraday Candles**: UNIX timestamps in seconds for `time` values.
- **Overlays** (on main pane): SuperTrend, Bollinger Bands, EMA Cross-Over (21/50/100), Support/Resistance (pivot fractals).
- **Oscillators** (separate synced panes): RSI, MACD histogram, Stochastic, CCI — time-scale synchronized with main chart via `lightweight-charts` API.
- `ChartWorkspace.jsx` is the orchestrator (<250 LOC target); logic extracted to hooks and sub-components.
- Static chart options in `gui/Dashboard/src/config/chartOptions.js`.

## Layout & Navigation
- Sidebar tabs: `Dashboard`, `Analysis`, `AI Insights`, `Live Trading`, `Risk Manager`, `Strategy Lab`, `Calendar & Journal`, `Settings`.
- `activeTab` in `marketStore`: drives `ContextPanelRouter.jsx` to render the correct panel.
- `setActiveTab('analysis')` navigates away from Settings after "Save & Close".
- Tabs with "Statements & Logs" grouping in ProfileMenu: `Alert Dispatch Logs`, `Statement Analysis`, `Collector`, `Dev Logs`.

## AI & Grok Integration
- `x-grok-conv-id` header enables Grok API prefix caching (~85% savings on system prompt tokens).
- AI Service uses persistent `aiohttp.ClientSession` with `TCPConnector` (keep-alive), managed via FastAPI lifespan.
- Voice WS relay: Browser ↔ Backend (local WS for PCM audio) ↔ xAI `wss://api.x.ai/v1/realtime`.

## Coding Standards
- **Python**: PEP 8, type hints, Pydantic v2 models. No `&&` in PowerShell commands.
- **JS/JSX**: Functional components, hooks for logic, clear store/view separation.
- **AI Integration**: All xAI calls go through `backend/services/ai/` — no direct HTTP calls from scattered modules.

## Known Warnings / Follow-ups
- Pydantic v2 deprecation: migrate class-based `Config` to `model_config = ConfigDict(...)` incrementally.
- Vite may warn that `settingsStore.js` is both statically and dynamically imported (informational only).
