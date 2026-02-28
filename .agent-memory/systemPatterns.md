# System Patterns

## Architecture Overview
QuFLX v2 uses an **Event-Driven Modular Monolith** architecture with a standalone Live Trading microservice.

- **Central Nervous System**: Redis (Pub/Sub for real-time, Streams for history).
- **Services**:
  - **Collector**: Stateless data miner (Chrome → Redis).
  - **Strategy**: Independent analysis engine (Redis → Redis) — indicators and signals.
  - **Gateway**: API and Socket.IO server (Redis ↔ Frontend). Single entry point for the frontend.
  - **SSID Service**: Dedicated FastAPI microservice (separate process) managing PocketOption WebSocket sessions, trade execution, balance polling, and SSID persistence to `.env`.
  - **AI Service**: Wraps all xAI API calls (chat, vision, voice). Integrated into Gateway lifespan.
- **Frontend**: "Smart Store, Dumb Components" with Zustand stores and Lightweight Charts.

## Key Design Patterns
- **Event Sourcing**: Market state derived from a stream of `Tick` events.
- **Pub/Sub**: Decouples producers (Collector) from consumers (Strategy, Gateway).
- **Adapter Pattern**: Collector adapts Chrome DevTools Protocol; Gateway proxies SSID service.
- **Repository Pattern**: Abstract data access for historical data (Redis Streams, CSV files).
- **Context Injection (AI)**: Backend builds `TradingContext` (candles, indicators, regimes) and injects into xAI requests with optional chart screenshots.
- **AI Prefix Caching**: `conversation_id` maps to `x-grok-conv-id`. Prompt is tiered:
  1. Static System Instructions (Cached)
  2. Semi-static Tool Definitions (Cached)
  3. Dynamic Market Context (User Message)
- **Profile-Settings Sync**: `profileStore.js` subscribes to `settingsStore.settings` changes and auto-saves to the active profile (debounced 800ms). Immediate flush available via `updateProfile()`.

## Data Flow
1. **Ingest**: Collector intercepts WebSocket frame → Normalizes to `Tick`.
2. **Publish**: Collector publishes `Tick` to Redis Stream.
3. **Process**: Strategy Engine reads `Tick` → Updates Indicators → Publishes `IndicatorUpdate` / signals.
4. **Serve**: Gateway receives `Tick` & `IndicatorUpdate` → Emits via Socket.IO / REST.
5. **Visualize**: Frontend Store receives update → Mutates State → Chart re-renders (price, overlays, oscillators).
6. **Advise**: AI Gateway builds `TradingContext` from strategy data + optional chart image → Calls xAI → Returns advisory to UI via `/api/v1/ai/ask` and voice.
7. **Trade**: Frontend → `POST /api/v1/trading/connect` → Gateway proxy → SSID Service → PocketOption WS.

## SSID Persistence Pattern
- SSID Service stores in-memory: `app.state.ssid_demo`, `app.state.ssid_real`.
- Persists to `.env` via `_persist_ssid()` on each successful connect.
- Gateway `ConnectRequest.ssid` allows empty string (validator is no-op for `""`). Empty → SSID service uses `.env` fallback.
- Frontend queries `GET /api/v1/trading/ssid-status` → `{hasDemoSsid, hasRealSsid}` booleans on mount.
- `tradingStore.fetchSsidStatus()` is called from `SettingsPanel` and `LiveTradingPanel` on mount, and after a successful connect.
- UI displays "✓ SSID saved" badge in SettingsPanel and "✓ Saved SSID ready" in LiveTradingPanel when flags are true.

## Profile System Pattern
- Profiles are flat JSON files in `data/profiles/<profileId>.json`.
- `data/profiles/active_profile.json` tracks the active profile ID.
- API: `GET/POST /api/v1/profiles`, `GET/PUT/DELETE /api/v1/profiles/{id}`, `GET/POST /api/v1/profiles/active`.
- Auto-creates a `default` profile (copying current settings) if none exist.
- `profileStore.js` subscribes to `settingsStore` and saves any change to the active profile (debounced).
- Profile names are slugified to create safe file IDs (e.g., "My Profile" → `my-profile`).

## History API Contract Patterns
- **Bootstrap is explicit**: `POST /api/v1/history/bootstrap-history` returns non-200 on failure with `HistoryErrorResponse`.
- **Response shape is unified**: `GET /api/v1/history/{asset}` returns `candles` (legacy `data` kept for compatibility). Frontend prefers `candles`.

## Local Ops Controls (Chrome + Stream)
- Endpoints: `POST /api/v1/ops/chrome/start`, `POST /api/v1/ops/stream/start`, `POST /api/v1/ops/stream/pause`, `GET /api/v1/ops/stream/status`.
- Disabled by default; requires `QFLX_ENABLE_OPS=1`. Local-only enforcement (`127.0.0.1` / `::1`). Optional token gate via `QFLX_OPS_TOKEN`.

## OTC Asset Normalization
- Asset IDs from PocketOption use format `EURUSD_otc`.
- Displayed to user as `EURUSDOTC` (remove underscore, uppercase).
- OTC categories now include: Currencies, Cryptocurrencies, Commodities, Stocks, Indices.
- Asset payout dropdown is sorted by payout percentage descending.
- Asset selection is synchronized between `LiveTradingPanel` and `SettingsPanel`.

## Sidebar & Layout Patterns
- **Sidebar tabs**: `Dashboard`, `Analysis`, `AI Insights`, `Live Trading`, `Risk Manager`, `Strategy Lab`, `Calendar & Journal`, `Settings`.
- `Calendar & Journal` and `Settings` are the final two tabs; `Settings` is pinned last.
- `activeTab` in `marketStore` drives `ContextPanelRouter.jsx`.
- **Supplementary menu routes** (via ProfileMenu dropdown): `Alert Dispatch Logs`, `Statement Analysis`, `Collector`, `Dev Logs`, `Voice Particle`, `Knowledge Base`.

## Strategy Lab Pattern
- Users upload CSV files (OHLC format) via `StrategyLabPanel`.
- Backend parses and registers the file (keyed by UUID) in an in-memory map on the strategy route.
- `marketStore.selectedStrategyFileId` tracks the active strategy file.
- `ChartWorkspace` checks `selectedStrategyFileId` and fetches data from `GET /api/v1/strategy/data/{fileId}` when set, displaying it on the main chart instead of live data.
- `ChartHeader` shows a CSV source dropdown when strategy files are present.

## Ticker-Linked Background Monitoring
- Background services (Alert Dispatcher) follow the frontend "Ticker Tape" whitelist.
- Pattern: Frontend `MarketStore` → SocketIO `update_active_ticker` → Gateway → Redis `ticker:active` → Dispatcher `TickerSubscriber`.
- Ensures cost-efficient AI monitoring limited to assets currently visible to the trader.

## Capability & Runner Pattern
- Selenium automation centralized in `capabilities_v2/`.
- `capabilities_v2/runner.py` is the CLI entry point. Gateway calls `runner.py` — never imports Selenium code directly.
- stdout is semi-structured: status lines + trailing JSON. Backend extracts JSON via `_parse_script_json()`.
- `FavoriteStarSelect` is the single source of truth for 92% payout starring.

## AI & Voice Integration Patterns
- For all xAI calls: backend constructs a concise `TradingContext` from strategy data.
- Chart screenshots captured in Dashboard, sent as base64 to backend, attached to xAI vision requests.
- Voice Assistant WS Bridge: Browser ↔ Backend (local WS for PCM audio) ↔ `wss://api.x.ai/v1/realtime`.
- Ask AI Modal: quick assist entry point, voice dictation, optional TTS read-back.
- AI Insights Panel: long-form conversation workspace.

## Significant Technical Decisions
- **Redis as Backbone**: Low latency (<1ms) and decoupling capabilities.
- **FastAPI for Gateway + SSID Service**: High performance, async, easy WebSocket integration.
- **Zustand multi-store**: Each concern has its own store (`market`, `settings`, `trading`, `profile`, `user`). Prevents `useMarketStore` becoming a God object.
- **Lightweight Charts**: Optimized for financial time-series; clean overlay/oscillator pane separation.
- **SSID Security**: Raw SSID values never returned from the API. Only boolean status indicators are exposed. SSIDs persist only in server-side `.env`.
- **Versioned Settings**: Persisted in `data/settings/settings.json`; exposed via `GET/PUT /api/v1/settings`; mirrored in `useSettingsStore`.

## Verification Discipline
- After changing any Gateway–Capability integration: run capability directly, confirm stdout format, then hit REST endpoint and verify JSON shape.
- After SSID changes: restart Gateway + SSID Service so new routes are registered before testing.
- PowerShell: avoid `&&`; run commands as separate invocations or use `;`.
