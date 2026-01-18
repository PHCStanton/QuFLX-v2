# System Patterns

## Architecture Overview
QuFLX v2 uses an **Event-Driven Modular Monolith** architecture.
- **Central Nervous System**: Redis (Pub/Sub for real-time, Streams for history).
- **Services**:
    - **Collector**: Stateless data miner (Chrome -> Redis).
    - **Strategy**: Independent analysis engine (Redis -> Redis) that calculates indicators and emits signals.
    - **Gateway**: API and WebSocket server (Redis <-> Frontend).
    - (Planned) **AI Gateway**: Dedicated module/service that wraps all xAI API calls (chat, vision, voice) and exposes a stable interface to other backend components.
- **Frontend**: "Smart Store, Dumb Components" pattern using Zustand and Lightweight Charts, with planned Ask-AI and voice assistant panels.

## Key Design Patterns
- **Event Sourcing**: The state of the market is derived from a stream of `Tick` events.
- **Pub/Sub**: Decouples producers (Collector) from consumers (Strategy, Gateway).
- **Adapter Pattern**:
  - The Collector acts as an adapter for the Chrome DevTools Protocol.
  - Indicator adapters (in V1 docs) and future AI Gateway act as adapters between internal data structures and external APIs (xAI).
- **Repository Pattern**: Abstract data access for historical data (Redis Streams).
- **Context Injection (AI)**: AI calls do not introspect the app directly; instead, the backend builds a `TradingContext` (candles, indicators, regimes, positions) and injects it into xAI requests, optionally with chart screenshots.

## Data Flow
1. **Ingest**: Collector intercepts WebSocket frame -> Normalizes to `Tick`.
2. **Publish**: Collector publishes `Tick` to Redis Stream.
3. **Process**: Strategy Engine reads `Tick` -> Updates Indicators -> Publishes `IndicatorUpdate` / signals.
4. **Serve**: Gateway receives `Tick` & `IndicatorUpdate` -> Emits via Socket.IO / REST.
5. **Visualize**: Frontend Store receives update -> Mutates State -> Chart components re-render (price, overlays, planned oscillators).
6. (Planned) **Advise**: AI Gateway builds `TradingContext` from Strategy data + optional chart image -> Calls xAI -> Returns advisory output to Gateway -> Exposed to UI via `/api/v1/ai/ask` and voice.

## History API Contract Patterns

- **Bootstrap is explicit (no silent failures)**
  - `POST /api/v1/history/bootstrap-history` returns non-200 HTTP status codes on failure.
  - Error body uses a structured shape (`HistoryErrorResponse`) so the frontend can display actionable messages.

- **History response shape is unified**
  - `GET /api/v1/history/{asset}` returns `candles` (and keeps legacy `data` for compatibility).
  - Frontend should prefer `candles` and only fall back to `data` during the transition.

## Local Ops Controls (Chrome + Stream)

- **Problem**: The browser UI cannot start OS processes directly.
- **Solution**: Gateway exposes local-only, dev-gated endpoints to start Chrome and start/pause the Collector.
- **Endpoints**:
  - `POST /api/v1/ops/chrome/start`
  - `POST /api/v1/ops/stream/start`
  - `POST /api/v1/ops/stream/pause`
  - `GET /api/v1/ops/stream/status`
- **Guards**:
  - Disabled by default; requires `QFLX_ENABLE_OPS=1`.
  - Local-only client enforcement (`127.0.0.1` / `::1`).
  - Optional token gate via `QFLX_OPS_TOKEN` and `X-QFLX-OPS-TOKEN` header.
- **Semantics**:
  - Start endpoints are idempotent (`already_running`).
  - Pause is implemented as stopping the Collector process (terminate → kill fallback).

## Sidebar & Layout Patterns
- Sidebar tabs follow the set: `Dashboard`, `Analysis`, `AI Insights`, `Live Trading`, `Risk Manager`, `Strategy Lab`, `Calendar & Journal`, `Settings`.
- `Calendar & Journal` and `Settings` are the final two tabs, with `Settings` pinned last.
- All tabs except `Calendar & Journal` and `Settings` are expected to keep the main chart visible on the right while swapping contextual panels on the left; `Calendar & Journal` and `Settings` may use layouts without the chart when appropriate.

## Significant Technical Decisions
- **Redis as Backbone**: Chosen for low latency (<1ms) and decoupling capabilities.
- **FastAPI for Gateway**: High performance, async support, and easy WebSocket integration.
- **Zustand for Frontend State**: Simpler and more performant than Redux for high-frequency updates.
- **Lightweight Charts**: Optimized for financial time-series data and supports clean separation between overlays and oscillator panes.
- **AI Gateway Isolation**: All interactions with xAI are funneled through a single backend module to:
  - Centralize authentication and error handling.
  - Prevent scattering of external API calls.
  - Make it easy to mock and test AI integrations.
 - **Versioned Settings Architecture**: A dedicated, versioned settings object (Global/User/AI + per-tab sections) is persisted in `data/settings/settings.json` via the Gateway, exposed through `GET/PUT /api/v1/settings`, and mirrored by a separate `useSettingsStore` in the Dashboard so configuration is clearly separated from live market state.

## Capability & Status Patterns (QuFLX v2)

- **Capability runner output**
  - Runners may print human-readable status lines (e.g. `✅ Attached to Chrome session: ...`) before JSON.
  - Backend must never assume `stdout` is pure JSON; always extract JSON via a helper (e.g. `_parse_script_json`) that finds the last `{…}` or `[…]` block.
  - Any new Gateway endpoint that shells out to `runner.py` should reuse this pattern to avoid "Invalid script output" / 500 errors.

- **FavoriteStarSelect / refresh-assets contract**
  - `FavoriteStarSelect` is the single source of truth for 92% payout starring; do not reimplement that logic elsewhere.
  - `max_assets <= 0` means "no limit" (process all eligible assets), not "star nothing".
  - Empty `target_assets` (`[]`) means "no filtering"; non-empty lists are matched after normalizing symbols (remove spaces/slashes, uppercase).
  - `/api/v1/refresh-assets` must return `{ "assets": string[], "metadata": { ... } }`, where `assets` are derived from `selected_now` and `already_favorited` only.

- **Stream health & indicators**
  - Backend `streamStatus` currently reflects collector service status, not raw tick flow.
  - UI stream health (Live Feed, Stream badge) should prefer tick-driven logic from `lastTickTimestamp`:
    - Recent ticks → `streaming` (green / pulse).
    - Older ticks → `slow` / `stale`.
    - No ticks → `idle` / `offline`.
  - Chrome badge in the UI should reflect `chromeDebuggingAvailable` (debug port health) rather than generic collector state.
  - Stream control toggles should use tick-driven health for pause/restart correctness.

- **Status polling & effects**
  - `useEffect` hooks that call store setters or network functions must always:
    - Have explicit dependency arrays.
    - Depend on stable values (e.g. `socket`, simple booleans), not large, frequently changing objects.
  - Treat React "Maximum update depth exceeded" warnings as a signal to inspect dependencies for hidden render → effect → update loops.

- **Verification discipline**
  - After changing any Gateway–Capability integration:
    - Run the capability directly (e.g. `python capabilities_v2/runner.py refresh_assets`) and confirm its stdout format.
    - Hit the corresponding REST endpoint and verify the JSON shape matches what the Dashboard expects.
  - PowerShell note: avoid chaining commands with `&&`; run commands as separate invocations.

## AI & Voice Integration Patterns

- **Context Injection**
  - For all xAI calls (text, vision, voice), the backend constructs a concise `TradingContext` from strategy data rather than relying on the frontend for truth.
  - Chart screenshots are captured in the Dashboard and sent as base64 images to the backend, which attaches them to xAI vision requests.

- **Tool/Function Calling**
  - Trading-related actions exposed to xAI are modeled as explicit tools (e.g. `get_market_snapshot`, `simulate_entry`) with clear JSON schemas and server-side validation.
  - xAI may request tool calls; the backend executes them via existing strategy/market modules and feeds the results back into the conversation.

- **Voice Agent Bridge**
  - The voice assistant uses a WebSocket bridge:
    - Browser ↔ Backend (local WebSocket for PCM audio).
    - Backend ↔ xAI Voice Agent API (`wss://api.x.ai/v1/realtime`).
  - The backend voice gateway is stateless per session and integrates with the same `TradingContext` builder and tool layer used by the text assistant.


## PocketOption Topdown v2 Capability Pattern
- Selenium automation for PocketOption is now centralized in `capabilities_v2/` rather than in ad-hoc scripts.
- Low-level UI controls (`session_foundations`, `favorites_bar`, `timeframe_menu`) are composed into higher-level orchestrators (`topdown_select_test_2`, `collect_history_loop`) and a robust control primitive (`timeframe_select_sync`).
- Data collection follows a layered pattern:
  1. Selenium selects asset + timeframe.
  2. Backend WebSocket interceptor (`HistoryCollector`) extracts history and ticks.
  3. Aggregated candles are saved to CSV for offline analysis.
- The Gateway should invoke these capabilities via `capabilities_v2/runner.py` and treat stdout as semi-structured (status lines + trailing JSON), rather than importing Selenium code directly.
