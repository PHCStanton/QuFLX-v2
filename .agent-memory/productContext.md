# Product Context

## Project Purpose
QuFLX v2 is a sophisticated automated trading platform for PocketOption that leverages WebSocket data streaming, Selenium automation, and AI-driven trading strategies. It is a complete rebuild of v1, designed to be modular, event-driven, and scalable.

## Problem Statement
- **Monolithic Complexity**: The previous v1 architecture was tightly coupled, making it hard to maintain and scale.
- **Frontend Performance**: The React frontend struggled with heavy data processing and complex chart state.
- **Race Conditions**: Direct coupling between data collection and analysis led to race conditions and missing data.
- **Resilience**: A failure in one component (e.g., Chrome connection) could crash the entire system.

## Intended Users
- **Algorithmic Traders**: Developers and traders who want to automate their PocketOption trading strategies.
- **Data Analysts**: Users who need real-time market data collection and analysis.
- **Trading System Developers**: Engineers building automated trading systems.

## Core Functionality
- **Data Collection ("The Miner")**: Robust, isolated service to intercept WebSocket data from Chrome.
- **Strategy Engine ("The Brain")**: Independent service to calculate indicators and generate signals.
- **API Gateway ("The Face")**: Centralized entry point for the Frontend, managing Socket.IO connections.
- **Real-time Visualization**: High-performance React frontend using Lightweight Charts and Zustand state management.
- **Event-Driven Architecture**: Redis Pub/Sub and Streams as the central nervous system.

## Success Metrics
- **Modularity**: Components can be restarted independently without system failure.
- **Latency**: End-to-end latency (Tick -> Chart) under 100ms.
- **Data Integrity**: Zero missing ticks in the Redis Stream buffer.
- **Developer Experience**: Clear separation of concerns allowing parallel development.
