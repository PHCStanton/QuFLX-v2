# Product Context

## Project Purpose
QuFLX v2 is a sophisticated automated trading and decision-support platform for PocketOption that leverages WebSocket data streaming, Selenium automation, AI-driven trading strategies, a live trading execution engine, and an xAI-powered assistant (text, vision, and voice). It is a complete rebuild of v1, designed to be modular, event-driven, and scalable.

## Problem Statement
- **Monolithic Complexity**: v1 was tightly coupled, hard to maintain and scale.
- **Frontend Performance**: React struggled with heavy data processing and chart state.
- **Race Conditions**: Direct coupling between data collection and analysis; missing data.
- **Resilience**: A failure in one component (e.g., Chrome) could crash the entire system.
- **Limited Guidance**: v1 offered little in the way of structured, AI-assisted decision support.

## Intended Users
- **Algorithmic Traders**: Developers and traders automating PocketOption strategies.
- **Discretionary Traders**: Manual traders wanting real-time indicator visualization and AI guidance.
- **Data Analysts**: Users needing real-time market data collection and analysis.
- **Trading System Developers**: Engineers building automated or hybrid human+AI trading workflows.

## Core Functionality
- **Data Collection ("The Miner")**: Robust, isolated service to intercept WebSocket data from Chrome.
- **Strategy Engine ("The Brain")**: Independent service to calculate indicators and generate signals.
- **API Gateway ("The Face")**: Centralized entry point for the Frontend, managing REST and Socket.IO.
- **Live Trading Engine**: Dedicated `ssid_service` microservice that manages Pocket Option WebSocket sessions, executes trades (call/put), monitors balances, and persists SSIDs to `.env`.
- **Real-time Visualization**: High-performance React frontend using Lightweight Charts and Zustand.
- **Event-Driven Architecture**: Redis Pub/Sub and Streams as the central nervous system.
- **Indicator & Regime Intelligence**: Mapped from indicators → market structures; used by strategy and UI.
- **AI Trading Assistant (xAI / Grok)**:
  - Text + Vision assistant explaining charts, indicators, and regimes using context injection.
  - Voice agent allowing hands-free interaction via xAI Voice Agent API.
  - AI Prefix Caching using `x-grok-conv-id` for ~85% token cost reduction.
  - Context-Aware Analytics: Ticker-Linked background monitoring for cost efficiency.
- **Smart Alert Dispatching**:
  - Independent monitoring service with technical scanners (ADX, RSI, Bollinger Bands, Fractals).
  - Multi-signal confluence scoring and automated AI confirmation.
  - Real-time tick persistence and Discord notification integration.
- **Profile System**: Multi-profile configuration management. Each profile stores a full copy of platform settings. Profiles are stored as JSON files in `data/profiles/`. Active profile is tracked in `data/profiles/active_profile.json`.
- **Statement Analysis**: Users can upload Pocket Option CSV statements and receive detailed performance analytics with AI coaching insights at `/statement-analysis`.
- **Strategy Lab**: Dedicated panel for uploading and analyzing historical CSV data. Integrates with the main chart to display strategy-lab OHLC data.

## Current Delivery Status (High-Level)
- Gateway, Collector, Strategy, and AI Service are operational.
- Live Trading via `ssid_service` is implemented and functional (Demo + Real modes, SSID persistence).
- Profile system is fully implemented (CRUD, active profile, settings sync).
- Statement Analysis page is built and accessible via the `/statement-analysis` route.
- Strategy Lab panel is functional with CSV upload and chart integration.
- OTC assets now include Currencies, Cryptocurrencies, Commodities, Stocks, and Indices.
- Asset labels are normalized (e.g. `EURUSD_otc` → displayed as `EURUSDOTC`).
- Oscillator panes (RSI, MACD, Stochastic, CCI) are visualized below the main chart.
- Overlay indicators (SuperTrend, Bollinger Bands, EMA Cross-Over, Support/Resistance) are rendered on the main chart.
- Test files are organized into `tests/` (infra/integration) and `backend/tests/` (unit/backend).

## Success Metrics
- **Modularity**: Components (Collector, Strategy, Gateway, SSID Service) restart independently.
- **Latency**: End-to-end latency (Tick → Chart) under 100ms; AI responses fast enough for tactical decisions.
- **Data Integrity**: Zero missing ticks in the Redis Stream buffer.
- **Decision Support Quality**: AI explanations grounded in the same indicator/regime data the strategy engine uses.
- **Developer Experience**: Clear separation of concerns allowing parallel development.
