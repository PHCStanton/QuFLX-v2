# Product Context

## Project Purpose
QuFLX v2 is a sophisticated automated trading and decision-support platform for PocketOption that leverages WebSocket data streaming, Selenium automation, AI-driven trading strategies, and an xAI-powered assistant (text, vision, and voice). It is a complete rebuild of v1, designed to be modular, event-driven, and scalable.

## Problem Statement
- **Monolithic Complexity**: The previous v1 architecture was tightly coupled, making it hard to maintain and scale.
- **Frontend Performance**: The React frontend struggled with heavy data processing and complex chart state.
- **Race Conditions**: Direct coupling between data collection and analysis led to race conditions and missing data.
- **Resilience**: A failure in one component (e.g., Chrome connection) could crash the entire system.
- **Limited Guidance**: v1 offered little in the way of structured, AI-assisted decision support, especially around interpreting indicators and regimes in real time.

## Intended Users
- **Algorithmic Traders**: Developers and traders who want to automate their PocketOption trading strategies.
- **Discretionary Traders**: Users who trade manually but want real-time indicator visualization and AI guidance.
- **Data Analysts**: Users who need real-time market data collection and analysis.
- **Trading System Developers**: Engineers building automated trading systems or hybrid human+AI workflows.

## Core Functionality
- **Data Collection ("The Miner")**: Robust, isolated service to intercept WebSocket data from Chrome.
- **Strategy Engine ("The Brain")**: Independent service to calculate indicators and generate signals.
- **API Gateway ("The Face")**: Centralized entry point for the Frontend, managing REST and Socket.IO connections.
- **Real-time Visualization**: High-performance React frontend using Lightweight Charts and Zustand state management.
- **Event-Driven Architecture**: Redis Pub/Sub and Streams as the central nervous system.
- **Indicator & Regime Intelligence**: A documented mapping from indicators → market structures, used by strategies and the UI to interpret current conditions.
- **AI Trading Assistant (xAI / Grok)**:
  - Text + Vision assistant that can explain current charts, indicators, and regimes using context injection (JSON + screenshots).
  - Voice agent that allows hands-free interaction with the trading session using the xAI Voice Agent API.

## Current Delivery Status (High-Level)
- The Gateway and Dashboard now enforce explicit error semantics for history collection (no semantic 200 failures).
- History API shapes are converging on `candles` as the canonical list key.
- Dashboard Ask-AI is minimally usable (prompt + in-app answer modal), pending a dedicated AI Gateway + TradingContext builder.

## Success Metrics
- **Modularity**: Components (Collector, Strategy, Gateway, AI Gateway) can be restarted independently without system failure.
- **Latency**: End-to-end latency (Tick -> Chart) under 100ms for visual updates; AI responses fast enough for tactical decision support.
- **Data Integrity**: Zero missing ticks in the Redis Stream buffer.
- **Decision Support Quality**: AI explanations and suggestions are grounded in the same indicator/regime data the strategy engine uses.
- **Developer Experience**: Clear separation of concerns (strategy vs AI vs UI) allowing parallel development and safe evolution of each layer.
