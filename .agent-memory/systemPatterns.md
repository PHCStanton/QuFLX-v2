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
