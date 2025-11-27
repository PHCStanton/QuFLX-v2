# QuFLX v2 Implementation Roadmap

**Date**: November 27, 2025
**Status**: Active
**Version**: 1.0.0
**Architecture**: Event-Driven Modular Monolith

## Phase 1: Foundation & Data Contracts (Week 1)
**Goal**: Establish the "Language" of the system and the "Nervous System" (Redis).

- [x] **1.1 Environment Setup**
    - [x] Initialize `v2/` directory structure.
    - [x] Set up Python virtual environment and `requirements.txt` (FastAPI, Redis, Pydantic).
    - [x] Set up React + Vite frontend project with TypeScript.
    - [x] Configure Redis instance (local/docker).

- [x] **1.2 Data Models (The "Language")**
    - [x] Create `backend/models/market_data.py`:
        - [x] `Tick(timestamp, asset, price, source)`
        - [x] `Candle(timestamp, asset, open, high, low, close, volume)`
    - [x] Create `backend/models/events.py`:
        - [x] `SystemEvent(type, payload, timestamp)`
    - [x] Implement Pydantic validation for all models.

- [x] **1.3 Redis Infrastructure (The "Nervous System")**
    - [x] Create `backend/infrastructure/redis_client.py`.
    - [x] Implement `RedisPublisher` class (typed wrapper around redis-py).
    - [x] Implement `RedisSubscriber` class (async listener).
    - [x] **Test**: Write a script that publishes a `Tick` and verifies a subscriber receives it.

## Phase 2: The Miner (Data Collector Service) (Week 2)
**Goal**: Reliably extract data from Chrome and push to Redis. No API, no Frontend.

- [x] **2.1 Chrome Connection Manager**
    - [x] Port `ChromeConnectionManager` from v1 to v2.
    - [x] Strip out all "streaming" logic, keep only connection/attachment logic.

- [x] **2.2 WebSocket Interceptor**
    - [x] Implement `WebSocketListener` that reads Chrome Performance Logs.
    - [x] Implement `FrameParser` that converts raw JSON -> `Tick` objects.

- [x] **2.3 The Collector Service**
    - [x] Create `backend/services/collector/main.py`.
    - [x] Loop: Read Logs -> Parse -> Validate -> Publish to `market_data:raw`.
    - [x] **Test**: Run Collector, open PocketOption, verify `Tick` objects appear in Redis CLI.

## Phase 3: The Brain (Strategy Engine) (Week 3)
**Goal**: Process raw data into actionable insights.

- [ ] **3.1 Indicator Engine**
    - [ ] Create `backend/services/strategy/indicators.py`.
    - [ ] Implement rolling window calculation for SMA, RSI (using `pandas` or `ta-lib`).

- [ ] **3.2 The Strategy Service**
    - [ ] Create `backend/services/strategy/main.py`.
    - [ ] Subscribe to `market_data`.
    - [ ] On new tick/candle: Calculate Indicators -> Check Rules -> Generate Signal.
    - [ ] Publish `Signal` to `trading:signals`.

## Phase 4: The Face (API Gateway) (Week 4)
**Goal**: Connect the outside world (Frontend) to the internal world (Redis).

- [ ] **4.1 FastAPI Setup**
    - [ ] Create `backend/services/gateway/main.py`.
    - [ ] Configure CORS and basic routes (`/health`, `/status`).

- [ ] **4.2 Socket.IO Integration**
    - [ ] Mount `socketio.ASGIApp`.
    - [ ] Create `SocketManager` that subscribes to Redis `market_data:*`.
    - [ ] Forward Redis messages to Socket.IO rooms (`room:EURUSD`).

- [ ] **4.3 Historical Data API**
    - [ ] Implement `/api/v1/history/{asset}` endpoint.
    - [ ] Fetch recent history from Redis Streams (buffer).

## Phase 5: The UI (Frontend Rebuild) (Week 5)
**Goal**: Visualize the data using the "Smart Store" pattern.

- [ ] **5.1 State Management**
    - [ ] Install `zustand`.
    - [ ] Create `useMarketStore`:
        - [ ] `candles: Record<Asset, Candle[]>`
        - [ ] `connectionStatus: 'connected' | 'disconnected'`
    - [ ] Connect Store to Socket.IO client.

- [ ] **5.2 Chart Components**
    - [ ] Install `lightweight-charts`.
    - [ ] Create `<ChartCanvas />` (Wrapper for resize/init).
    - [ ] Create `<CandlestickSeries />` (Dumb component, takes data prop).
    - [ ] Create `<IndicatorPane />` (Renders RSI/MACD).

- [ ] **5.3 Dashboard Layout**
    - [ ] Implement Grid Layout.
    - [ ] Assemble `Dashboard` page using the components.

## Phase 6: Integration & Polish (Week 6)
**Goal**: End-to-end testing and refinement.

- [ ] **6.1 System Orchestration**
    - [ ] Create `docker-compose.yml` (optional) or `start_v2.py` script to launch all services.
    - [ ] Ensure graceful shutdown of all processes.

- [ ] **6.2 Resilience Testing**
    - [ ] Test: Kill Collector -> Gateway should stay up -> Restart Collector -> Data resumes.
    - [ ] Test: Kill Redis -> Services should retry connection.

- [ ] **6.3 Documentation**
    - [ ] Update `README.md`.
    - [ ] Document API endpoints and Redis channel structure.
