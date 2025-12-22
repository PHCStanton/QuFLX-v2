# System Patterns

## Architecture Overview
QuFLX v2 uses an **Event-Driven Modular Monolith** architecture.
- **Central Nervous System**: Redis (Pub/Sub for real-time, Streams for history).
- **Services**:
    - **Collector**: Stateless data miner (Chrome -> Redis).
    - **Strategy**: Independent analysis engine (Redis -> Redis).
    - **Gateway**: API and WebSocket server (Redis <-> Frontend).
- **Frontend**: "Smart Store, Dumb Components" pattern using Zustand and Lightweight Charts.

## Key Design Patterns
- **Event Sourcing**: The state of the market is derived from a stream of `Tick` events.
- **Pub/Sub**: Decouples producers (Collector) from consumers (Strategy, Gateway).
- **Adapter Pattern**: The Collector acts as an adapter for the Chrome DevTools Protocol.
- **Repository Pattern**: Abstract data access for historical data (Redis Streams).

## Data Flow
1.  **Ingest**: Collector intercepts WebSocket frame -> Normalizes to `Tick`.
2.  **Publish**: Collector publishes `Tick` to Redis Stream.
3.  **Process**: Strategy Engine reads `Tick` -> Updates Indicators -> Publishes `IndicatorUpdate`.
4.  **Serve**: Gateway receives `Tick` & `IndicatorUpdate` -> Emits via Socket.IO.
5.  **Visualize**: Frontend Store receives update -> Mutates State -> Chart Component re-renders.

## Significant Technical Decisions
- **Redis as Backbone**: Chosen for low latency (<1ms) and decoupling capabilities.
- **FastAPI for Gateway**: High performance, async support, and easy WebSocket integration.
- **Zustand for Frontend State**: Simpler and more performant than Redux for high-frequency updates.
- **Lightweight Charts**: Optimized for financial time-series data.

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

- **Status polling & effects**
  - `useEffect` hooks that call store setters or network functions must always:
    - Have explicit dependency arrays.
    - Depend on stable values (e.g. `socket`, simple booleans), not large, frequently changing objects.
  - Treat React "Maximum update depth exceeded" warnings as a signal to inspect dependencies for hidden render → effect → update loops.

- **Verification discipline**
  - After changing any Gateway–Capability integration:
    - Run the capability directly (e.g. `python capabilities_v2/runner.py refresh_assets`) and confirm its stdout format.
    - Hit the corresponding REST endpoint and verify the JSON shape matches what the Dashboard expects.
