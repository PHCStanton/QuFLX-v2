# Redis Integration Summary

## Overview

In the **QuFLX v2** architecture, **Redis** serves as the "Central Nervous System," decoupling the high-frequency data collection from analysis and visualization. It operates primarily as a message broker (Pub/Sub) for real-time data and as an in-memory database for buffering recent market history.

This integration ensures that the **Collector** (Selenium/Chrome), **Strategy Engine** ("The Brain"), and **API Gateway** ("The Face") can operate independently without direct dependencies, preventing race conditions and system-wide failures.

## Architecture & Data Flow

### 1. The Data Pipeline (Tick Life-Cycle)

1.  **Ingestion (Collector Service)**:
    *   Intercepts WebSocket frames from the Chrome DevTools Protocol.
    *   Normalizes raw data into a standard `Tick` format.
    *   **Action**: Pushes the tick to a Redis **List** (Buffer) and publishes to a Redis **Channel**.

2.  **Broadcasting (Pub/Sub)**:
    *   **Channel**: `market_data`
    *   **Payload**: JSON-serialized `Tick` object (Asset, Price, Timestamp).
    *   **Consumers**:
        *   **Strategy Engine**: Listens to calculate indicators immediately.
        *   **API Gateway**: Listens to broadcast to Frontend clients via Socket.IO.

3.  **Buffering (Redis Lists)**:
    *   **Key Pattern**: `tick_buffer:{asset}`
    *   **Operation**: `RPUSH` (Right Push) new ticks, `LTRIM` (Left Trim) to maintain a fixed size (e.g., last 1000 ticks).
    *   **Purpose**: Provides immediate access to recent history for new subscribers or for calculating rolling indicators without querying a permanent database.

4.  **Caching (Key-Value)**:
    *   **Key Pattern**: `history:{asset}:{timeframe}`
    *   **Operation**: `SETEX` (Set with Expiry).
    *   **Purpose**: Caches calculated candles (OHLC) to serve historical data requests instantly.

## Integration with WebSockets (Socket.IO)

The **API Gateway** acts as the bridge between Redis and the Frontend.

*   **Redis Listener**: A background `asyncio` task in the Gateway subscribes to the `market_data` Redis channel.
*   **Event Translation**: When a message arrives from Redis:
    1.  The Gateway deserializes the JSON payload.
    2.  It re-emits the data as a **Socket.IO event** (`market_data` or `market_data:{asset}`).
*   **Client Isolation**: Frontend clients join specific "rooms" (e.g., `market_data:AUDNZDOTC`). The Gateway selectively emits events to these rooms, ensuring clients only receive data for the asset they are viewing.

## Benefits of Redis Service

1.  **Decoupling & Stability**:
    *   The **Collector** can crash or restart without disconnecting Frontend users.
    *   The **Strategy Engine** can be updated/redeployed without stopping data collection.

2.  **Low Latency**:
    *   Redis operates in-memory with sub-millisecond read/write speeds, essential for processing high-frequency ticks.

3.  **Scalability**:
    *   Multiple Strategy Engines can subscribe to the same data stream to run parallel algorithms.
    *   Multiple Gateways can be deployed behind a load balancer, all reading from the same Redis instance.

4.  **Data Persistence (Safety Net)**:
    *   The Redis Stream/List acts as a temporary buffer. If the Database Writer lags, data is not lost; it waits in Redis until processed.

5.  **Atomic Operations**:
    *   Redis ensures that operations like "Push to List and Trim" happen atomically, preventing data corruption during concurrent access.

## Key Redis Commands Used

*   `PUBLISH channel message`: Broadcasts real-time ticks.
*   `SUBSCRIBE channel`: Listens for real-time ticks.
*   `RPUSH key value`: Appends data to the history buffer.
*   `LTRIM key start stop`: Cops the buffer to a fixed size.
*   `SETEX key seconds value`: Caches data with a Time-To-Live (TTL).
