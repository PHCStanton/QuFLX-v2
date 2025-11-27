# Active Context

## Current Focus
**Phase 3: The Strategy Engine**

We have successfully completed Phase 2 (The Miner) and are now moving to Phase 3. The goal is to build the "Brain" of the system that consumes raw market data from Redis, calculates technical indicators, and generates trading signals.

## Recent Accomplishments
- **Phase 2 Complete**:
    - Implemented `ChromeConnectionManager` to attach to existing Chrome sessions.
    - Implemented `WebSocketInterceptor` to parse raw WebSocket frames from Chrome performance logs.
    - Implemented `CollectorService` to orchestrate data collection and publish `Tick` objects to Redis channel `market_data`.
    - Verified end-to-end data flow: Chrome -> Collector -> Redis.

## Current State
- **Collector Service**: Running (or ready to run) and publishing ticks to Redis.
- **Redis**: Receiving `Tick` objects on `market_data` channel.
- **Data Models**: `Tick` and `Candle` models are defined in `backend/models/market_data.py`.

## Next Steps (Phase 3)
1.  **Indicator Engine**: Implement technical indicator calculations (SMA, RSI, etc.) using `pandas` or `ta-lib`.
2.  **Strategy Service**: Create a service that:
    - Subscribes to `market_data`.
    - Aggregates ticks into candles (if needed, or uses a separate aggregator).
    - Calculates indicators on new data.
    - Evaluates trading rules.
    - Publishes `Signal` objects to `trading:signals`.

## Active Files
- `backend/services/strategy/` (To be created)
- `backend/models/market_data.py`
- `backend/infrastructure/redis_client.py`
