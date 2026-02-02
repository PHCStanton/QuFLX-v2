# AI Trading Integration Architecture Report – QuFLX v2 (2025-12-23)

## 1. Executive Summary

This report consolidates the current design for integrating technical indicators and xAI-powered assistants (text, vision, and voice) into QuFLX v2.

Key goals:
- Ensure the AI implementation aligns with the existing event-driven architecture and indicator pipeline.
- Define how the AI (Grok) interacts safely and effectively with live trading sessions via context injection and tools.
- Provide a clear, developer-friendly blueprint before any major code is written, in line with `CORE_PRINCIPLES.md`.

At this stage:
- Backend indicator infrastructure is in place and documented.
- Market regimes and indicator usage are described in `Indicators_vs_Market_Structures.md`.
- Research papers exist for Lightweight Charts indicators and AI (data + vision) integration.
- Voice agent patterns and xAI Voice Agent API usage are understood from reference examples.

The remaining work is primarily **implementation** of the AI Gateway, TradingContext builder, Ask-AI endpoints/UI, voice gateway, and indicator visualization on the Dashboard.

## 2. Current System State (Non-AI)

### 2.1 Core Services and Data Flow

QuFLX v2 is structured as an **Event-Driven Modular Monolith**:
- **Collector**
  - Intercepts PocketOption WebSocket traffic via Chrome DevTools.
  - Normalizes frames into `Tick` objects.
  - Publishes ticks into Redis Streams/Channels.
- **Strategy**
  - Subscribes to ticks from Redis.
  - Uses `TechnicalIndicatorsPipeline` (`backend/services/strategy/indicators.py`) to calculate a rich set of indicators.
  - Generates trading signals and may publish `IndicatorUpdate` / `Signal` events.
- **Gateway**
  - FastAPI-based HTTP and Socket.IO server.
  - Subscribes to Redis streams and channels.
  - Exposes:
    - REST endpoints (`/api/v1/history`, `/api/v1/bootstrap-history`, `/api/v1/refresh-assets`, etc.).
    - Socket.IO channels for `market_data:{asset}`, `backend_status`, etc.
- **Frontend (Dashboard)**
  - React + Vite + TypeScript.
  - Zustand store (`marketStore.js`) holds connection state, market data, and UI state.
  - Lightweight Charts renders intraday candles (UNIX timestamps) with tick aggregation per timeframe.
  - Asset panel supports OTC ticker and 92% payout asset flows.

### 2.2 Indicator and Market Regime Layer

The indicator engine is implemented in Python:
- File: `backend/services/strategy/indicators.py`.
- Indicators include (non-exhaustive):
  - Trend/overlays: `sma_20`, `ema_16`, `ema_165`, `wma_20`, `macd`, `macd_signal`, `macd_histogram`, `bb_upper`, `bb_middle`, `bb_lower`, `bb_width`, `bb_percent`, `supertrend`, `supertrend_direction`.
  - Oscillators: `rsi_14`, `rsi_21`, `stoch_k`, `stoch_d`, `williams_r`, `roc_10`, `schaff_tc`, `demarker`, `cci`.
  - Volatility: `true_range`, `atr_14`, `atr_21`.

Mapping of indicators to market regimes is defined in:
- `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md`.
- Regimes:
  1. Trending with Pullbacks.
  2. Strong Momentum Trending.
  3. Ranging / Sideways.
  4. Breakout Conditions.
  5. Trend Reversal.

This document specifies for each regime:
- Primary indicators (minimum set to detect and trade the regime).
- Secondary/confluence indicators.
- High-level strategy integration notes.

### 2.3 Frontend Indicator Visualization (Planned)

Details are captured in:
- `Research/research_lightweight-charts-indicators_2025-12-23.md`.

Core decisions:
- Overlays (MAs, Bollinger, Supertrend) will be drawn on the **main candlestick chart**.
- Oscillators (RSI, Stoch, MACD, Schaff, etc.) will be shown in **separate chart panes** below, implemented as additional Lightweight Charts instances stacked vertically.
- Oscillator panes will:
  - Share the same time scale as the main chart via `timeScale().setVisibleRange` synchronization.
  - Have resizable heights, controlled entirely by React layout (drag handle between panes).
- Indicator values will primarily come from the backend pipeline; overlay helpers from Lightweight Charts may be used for visual-only MAs.

At this point, visualization is designed but not implemented; the backend provides the necessary indicator data.

## 3. AI Integration Strategy (Text + Vision)

### 3.1 Context Injection Model

Given that the xAI models (Grok) run remotely and have no direct access to the QuFLX process or file system, we adopt a **Context Injection** model (as outlined in `Research/research_ai_integration_vision_files_2025-12-20.md`):

- The application pushes all relevant information into the xAI request:
  - **Data Context**: Compact JSON representation of the current trading session:
    - Asset, timeframe, current price.
    - Recent candles and indicator snapshot.
    - Inferred market regime (per `Indicators_vs_Market_Structures.md`).
    - Open positions / risk parameters where applicable.
  - **Visual Context**: Base64 chart screenshot captured on the frontend.
  - **File/History Context** (optional): Selected historical data segments or logs, when the user asks for back-references.

xAI never introspects QuFLX directly; it only sees the structured context we explicitly send.

### 3.2 AI Gateway Module (Backend)

To maintain strict separation of concerns and satisfy `CORE_PRINCIPLES`:
- All xAI interactions are funneled through a dedicated **AI Gateway** module, planned under `backend/services/ai_gateway/`.
- Responsibilities:
  - Manage API keys and endpoints (e.g., `https://api.x.ai/v1/chat/completions`).
  - Provide functions:
    - `ask_text(TradingContext, prompt)` – text-only or data-rich queries.
    - `ask_vision(TradingContext, prompt, image_base64)` – multimodal queries with charts.
  - Choose appropriate models:
    - e.g., `grok-4-fast` for lightweight text.
    - `grok-4-vision` for image-based analysis.
  - Convert internal structures into xAI message format, including structured outputs when needed.
  - Log usage and handle errors (timeouts, rate limits) without affecting the core trading loop.

The AI Gateway becomes the single integration point that other backend services call; no service outside this module should talk to xAI directly.

### 3.3 Trading Context Builder

A `TradingContext` object provides a stable contract between the Strategy layer and the AI Gateway.

- Implemented in a `context_builder` module under `backend/services/strategy/`.
- The builder will:
  - Read from the `TechnicalIndicatorsPipeline` outputs and, later, a regime detection helper that applies the rules in `Indicators_vs_Market_Structures.md`.
  - Assemble a compact structure, for example:

```jsonc
{
  "asset": "AUDNZD_OTC",
  "timeframe": "M1",
  "regime": "TRENDING_PULLBACK",
  "price": 1.2345,
  "indicators": {
    "sma_20": 1.2337,
    "ema_16": 1.2341,
    "rsi_14": 63.2,
    "macd_histogram": 0.0012,
    "atr_14": 0.0008,
    "bb_percent": 0.72
  },
  "open_positions": [],
  "recent_candles": [/* compact OHLC data, limited window */]
}
```

- This structure is then passed to AI Gateway functions along with the user’s prompt and optional screenshot.

### 3.4 Ask-AI API Contract

The Gateway service will expose a dedicated endpoint for the text+vision assistant:

- `POST /api/v1/ai/ask`
  - Request body (conceptual):

```jsonc
{
  "prompt": "What is the current regime and what are the key risks?",
  "asset": "AUDNZD_OTC",
  "timeframe": "M1",
  "image_base64": "data:image/png;base64,..." // optional
}
```

  - Backend steps:
    1. Validate input (asset, timeframe, prompt length).
    2. Build `TradingContext` via `context_builder`.
    3. Decide whether to call `ask_text` or `ask_vision` based on presence of `image_base64`.
    4. Return normalized response:

```jsonc
{
  "text": "The market is in a trending-with-pullbacks regime...",
  "summary": {
    "regime": "TRENDING_PULLBACK",
    "trend_direction": "up",
    "key_indicators": ["rsi_14", "bb_percent", "supertrend"],
    "risk_notes": ["Volatility rising", "Close to upper band"]
  }
}
```

The `summary` field can be produced via xAI structured outputs to keep the UI simpler and more robust.

### 3.5 Frontend: Ask-AI Panel and Chart Capture

On the Dashboard:
- Implement a reusable `useChartCapture()` hook that:
  - Locates the main chart canvas.
  - Uses `canvas.toDataURL('image/png')` to capture the current view.
  - Returns a base64 string ready for the `image_base64` field.

- Add an Ask-AI panel (e.g., in `TopBar` or a side drawer) with:
  - Prompt input.
  - Toggles: “Include chart screenshot”, “Include market context”.
  - A scrollable conversation view showing:
    - Raw text from `text`.
    - Optional structured `summary` rendered as badges / bullet points.

This panel will post to `/api/v1/ai/ask`, and the backend will ensure that every AI answer is grounded in the latest trading context.

## 4. Voice Agent Integration

### 4.1 High-Level Architecture

We follow the architecture recommended by the xAI voice examples:

- **Browser (Dashboard)**
  - React client that captures microphone audio via Web Audio API.
  - Connects to our backend via WebSocket for bidirectional audio streaming.
- **Backend Voice Gateway**
  - FastAPI or lightweight ASGI app that exposes:
    - WebSocket: `/voice/ws/:session_id` for audio streaming.
    - REST: `/voice/sessions` for session lifecycle.
  - Forwards audio events to xAI Voice Agent API (`wss://api.x.ai/v1/realtime`).
  - Receives audio + transcript + tool-calls from xAI and forwards to the browser.
- **xAI Voice Agent API**
  - Real-time low-latency voice assistant endpoint.

The frontend remains backend-agnostic with respect to xAI; it only knows about the local `/voice` WebSocket.

### 4.2 Session and Trading Context

Each voice session should be associated with a trading session:
- `session_id` identifies a user’s current voice conversation.
- On each speaking turn, the backend:
  - Builds or refreshes a `TradingContext` using the same builder as the text assistant.
  - Injects that context into the voice system instructions (e.g., current asset, timeframe, regime, key indicators).

This ensures the voice agent is always aware of the current trading situation without querying the frontend for truth.

### 4.3 Tools and Actions

The voice assistant should use the **same tool layer** as the text assistant:
- Tools like `get_market_snapshot`, `simulate_entry`, and `explain_indicator_state` are exposed to xAI as JSON-typed functions.
- The backend voice gateway:
  - Detects tool-call requests from xAI.
  - Invokes the corresponding Python functions (which call into Strategy and Gateway as needed).
  - Returns results back to xAI within the same WebSocket session.

Voice and text experiences share the same safety and validation logic.

### 4.4 Frontend Voice UX

On the Dashboard:
- A dedicated "Voice Trading Assistant" module provides:
  - Start/Stop microphone button with clear state.
  - Live transcript view synchronized with audio.
  - Visual indicators of connection status and speaking/thinking states.

Key UX rules:
- Keep responses concise; prefer short turns for voice.
- Require explicit confirmation for any action with trading impact (place orders, change risk settings), even in test mode.

### 4.5 Failure Modes and Safety

- If xAI or network fails:
  - Voice gateway must gracefully notify the client and stop audio streaming.
  - Core trading pipeline must remain unaffected.
- Logs:
  - Log transcripts and tool calls (with user consent) for debugging and audit.

This design keeps the voice agent optional and non-critical, while still tightly integrated with trading context.

## 5. Alignment with CORE_PRINCIPLES

### 5.1 Functional Simplicity

- AI functionality is centralized in an **AI Gateway** module instead of being scattered.
- Indicators are computed in one place (Strategy/Indicator pipeline) and reused by both strategies and AI.
- Voice integration uses a thin WebSocket bridge, without embedding xAI logic into the Dashboard directly.

### 5.2 Sequential Logic

- The overall flow is strictly stepwise:
  1. Ticks → Redis → Strategy → Indicators/Regimes.
  2. Strategy state → TradingContext builder.
  3. TradingContext (+ optional screenshot) → AI Gateway.
  4. AI Gateway → xAI → advisory response.
  5. Response → Gateway → Frontend UI (text/voice).

Each layer has a clearly defined input and output; no shortcuts.

### 5.3 Incremental Testing

- Before integrating AI:
  - Indicator pipeline is already validated and documented.
- For AI Gateway implementation:
  - Unit tests for context building and xAI request shaping.
  - Integration tests for `/api/v1/ai/ask` using mocked xAI responses.
  - Non-blocking behavior: AI failures must not affect the trading loop.
- For indicators visualization:
  - Test rendering with static data first.
  - Then test live streaming with controlled tick feeds.

### 5.4 Zero Assumptions

- AI never assumes access to hidden state; all context is explicitly injected.
- The backend does not trust the frontend for ground truth; it rebuilds TradingContext from its own data stores.
- Tools and actions are explicitly declared and validated; no “magic” behavior.

### 5.5 Code Integrity & Backward Compatibility

- AI Gateway and Ask-AI endpoints are additive; they do not modify existing trading logic.
- Indicator visualization uses existing indicator values; backend strategy behavior is unchanged.
- Voice agent is optional; the system must function without it.

### 5.6 Strict Separation of Concerns

- Strategy vs AI vs UI are distinct layers:
  - Strategy: indicators, regimes, signals.
  - AI Gateway: external reasoning engine that reads but does not mutate state directly.
  - UI: visualization and interaction.

This separation reduces coupling and simplifies debugging and evolution.

## 6. Recommended Implementation Phases

1. **Phase A – Indicator Visualization**
   - Implement overlay indicators and oscillator panes in the Dashboard using Lightweight Charts.
   - Ensure everything is driven from backend indicator data.

2. **Phase B – AI Gateway + TradingContext**
   - Implement AI Gateway module and context builder.
   - Add `/api/v1/ai/ask` and basic Ask-AI panel with text-only queries.

3. **Phase C – Vision Integration**
   - Implement `useChartCapture` and wire image_base64 to the AI Gateway.
   - Validate chart+data analyses against real sessions.

4. **Phase D – Voice Agent**
   - Implement backend voice gateway and frontend voice UI.
   - Reuse TradingContext and tools from the text assistant.

5. **Phase E – Hardening & Documentation**
   - Add tests, rate limiting, and observability for AI components.
   - Document AI capabilities, limitations, and safety guidelines for users.

This phased approach ensures that each layer is structurally sound and tested before the next is added.
