# Analysis & Alert-Dispatch Integration Proposal

## 1. Executive Summary

We propose merging the capabilities of the `Alert-Dispatch` repository into the existing **QuFLX v2** architecture rather than running it as a separate external service. This adheres to the **Core Principle of Functional Simplicity** by reducing operational overhead (one backend stack instead of two) and ensuring a "Single Source of Truth" for market data.

This proposal outlines the implementation of **Topdown Analysis**, **Notification Dispatch** (Discord/Gmail), and a unified **Frontend UI Strategy**.

---

## 2. Core Decisions & Answers to User Queries

### Q1: Separate Panels or Single Interface?
**Recommendation: Two Specialized, Interactive Panels.**
We will implement two distinct but deeply integrated panels to separate "Signal Discovery" from "Deep Analysis."

1.  **Notification & Signals Panel (The "What")**:
    - **Purpose**: A real-time feed of market events, AI insights, and technical alerts.
    - **Behavior**: Transient, list-based, actionable. Clicking an alert opens the Analysis Panel.
    - **Location**: Sidebar or Collapsible Bottom Sheet (always accessible).

2.  **Topdown Analysis Panel (The "Why")**:
    - **Purpose**: A dedicated workspace for validating signals using multi-timeframe logic.
    - **Behavior**: Rich visualization, persistent state.
    - **Location**: Main Workspace Area (Center/Right).

### Q2: Does the Analysis Panel need a Chart View?
**Yes.**
Topdown analysis inherently requires visualizing market structure across timeframes (e.g., H1 trends vs. M1 entry triggers).
- **Implementation**: The Analysis Panel will feature a **"Matrix View"** (Mini-charts or Sparklines for H1/M15/M5) and a **"Confluence Dashboard"** (Traffic light system for indicators).

### Q3: AI Insight Data Flow?
AI Insight will act as a "Meta-Analyst":
- **Flow**: `Market Data -> AI Analysis -> Key Insight -> Signal Bus`.
- **Integration**: Insight outputs (e.g., "Bearish divergence on M5") will be treated as high-priority **Alerts**, displayed in the **Notification Panel**, and dispatched via Discord/Gmail if configured.

### Q4: Topdown Analysis Implementation?
- **Backend**: Implemented in Python (`backend/services/strategy`) to leverage existing data streams.
- **Frontend**: Visualized in the Analysis Panel as a hierarchy (Higher Timeframe Bias filters Lower Timeframe Signals).

---

## 3. Architecture Specification

### 3.1 Backend: Unification Strategy
We will **migrate** the logic from `Alert-Dispatch` (Node/TypeScript) to **QuFLX v2 Backend** (Python).

*   **Logic Migration**:
    *   `ConditionDetector` (Node) → `backend/services/strategy/regimes.py` (New module).
    *   `IndicatorCalculator` (Node) → Existing `backend/services/strategy/indicators.py`.
    *   `AlertEngine` (Node) → `backend/services/gateway/routes/alerts.py` (New module).
*   **Dispatch Layer**:
    *   Integrated directly into the Gateway using `aiohttp` for Discord Webhooks and `google-api-python-client` for Gmail.

### 3.2 Data Flow
```mermaid
graph TD
    A[Market Data (Redis)] --> B[Strategy Engine (Python)]
    B --> C{Confluence Check}
    C -->|Topdown Algo| D[Regime Detected]
    C -->|AI Analysis| E[AI Insight]
    D & E --> F[Event Bus (Redis/Mem)]
    F --> G[Gateway]
    G -->|WS| H[Frontend Notification Panel]
    G -->|WS| I[Frontend Analysis Panel]
    G -->|HTTP| J[Discord/Gmail]
```

---

## 4. UI/UX Implementation Plan

### 4.1 Notification & Signals Panel
*Designed for quick scanning of opportunities.*
*   **Features**:
    *   **Live Feed**: Scrolling list of alerts (e.g., "EURUSD: Bullish Engulfing M5").
    *   **AI Highlights**: Distinct styling for AI-generated insights.
    *   **Filters**: By Asset, Timeframe, or Severity (High/Medium/Low).
    *   **Action**: One-click "Analyze" button loads the asset in the Analysis Panel.

### 4.2 Topdown Analysis Panel
*Designed for detailed validation.*
*   **Structure**:
    *   **Header**: Asset Summary & 92% Payout Badge.
    *   **Confluence Matrix**:
        *   Rows: Timeframes (H1, M15, M5, M1).
        *   Columns: Trend, Momentum, Volatility, S/R.
        *   *Visual*: Green/Red cells indicating bias.
    *   **Chart Visualization**:
        *   Primary Chart (M1/Entry).
        *   Synced "Ghost" Overlays or mini-charts for Higher Timeframes.
*   **Topdown Logic**:
    *   Shows explicit "Go/No-Go" status based on HTF (Higher Timeframe) alignment.

---

## 5. Development Roadmap

### Phase 1: Backend Core (Strategy & Alerts)
1.  **Logic Port**: Translate `Alert-Dispatch` TS detection logic to Python.
2.  **Topdown Engine**: Implement `TopdownAnalyzer` class in Python Strategy service.
3.  **Alert API**: Create endpoints for configuring alerts and Webhooks.

### Phase 2: Frontend Implementation
1.  **Notification Panel**: Build the "Signal Feed" UI component.
2.  **Analysis Panel**: Build the "Confluence Matrix" and integrate with existing `ChartWorkspace`.
3.  **App State**: Update `marketStore` to handle Alert events.

### Phase 3: AI & Integrations
1.  **AI Dispatch**: Wire `AiInsights` to inject events into the Alert system.
2.  **External**: Hook up Discord/Gmail dispatch in Backend Gateway.

---

## 6. Adherence to Core Principles
*   **Functional Simplicity**: Removes the need to manage a separate Node.js process alongside the Python backend.
*   **Robustness**: Relies on the proven Python `DataCollector` and `Strategy` engine, ensuring data consistency (no race conditions between two different collectors).
*   **Optimization**: Single WebSocket stream for both Analysis and Alerting.
