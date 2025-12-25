# Technical Context

## Technologies Used
- **Python 3.11+**: Backend services (Collector, Strategy, Gateway, future AI Gateway).
- **FastAPI**: API Gateway framework.
- **Redis**: Message broker and in-memory database.
- **React + Vite**: Frontend framework.
- **TypeScript**: Frontend language for type safety.
- **Zustand**: Frontend state management.
- **Lightweight Charts**: Financial charting library (price chart + planned oscillator panes).
- **Pydantic**: Data validation and settings management.
- **Selenium**: Browser automation for data collection.
- **xAI API (Grok)**: External AI service for text, vision, and voice assistants.

## Development Setup
1. **Backend**:
   - `python -m venv venv`
   - `pip install -r requirements.txt`
   - Run services via `python -m backend.services.[service].main`
   - Configure xAI via environment variables (e.g. `XAI_API_KEY`) and never hardcode secrets.
2. **Frontend**:
   - `npm install`
   - `npm run dev`
3. **Infrastructure**:
   - Redis running on default port 6379.
   - Chrome with DevTools Protocol enabled for the Collector.

## Dependencies
- `fastapi`, `uvicorn`, `python-socketio`: Gateway.
- `redis`: Redis client.
- `selenium`: Chrome automation.
- `pandas`, `pandas-ta` (optional), `talib` (optional): Indicator calculation.
- `lightweight-charts`: Frontend charting.
- `xai-sdk` or HTTP client: Integration with xAI chat/vision/voice APIs.

## Technical Constraints
- **Latency**: Must process ticks and update charts within ~100ms for a responsive UI.
- **Chrome Dependency**: The Collector requires a running Chrome instance with DevTools Protocol enabled.
- **Redis Availability**: The system cannot function without Redis.
- **External AI Calls**: xAI requests are network-bound and must not block the core trading loop. AI integration should be best-effort and tolerant of latency/failures.

## Chart & Indicator Conventions
- **Intraday Candles**: Use UNIX timestamps in seconds for `time` values when rendering intraday series.
- **Time Axis**: Enable intraday display using `timeScale.timeVisible` (and keep `secondsVisible` disabled for `1m`).
- **Indicators**:
  - Backend is the canonical source for indicator values and market regimes (via `TechnicalIndicatorsPipeline` and strategy docs).
  - Frontend uses Lightweight Charts to visualize:
    - Overlay indicators (e.g. MAs, Bollinger, Supertrend) on the main pane.
    - Oscillators (e.g. RSI, Stoch, MACD) in separate, time-synchronized panes.

## Coding Standards
- **Python**: PEP 8, Type Hints (mypy), Pydantic models for all data structures and xAI request/response schemas.
- **TypeScript**: Strict mode, functional components, hooks for logic, clear separation between store and view.
- **AI Integration**: All xAI calls go through a dedicated AI Gateway module; no direct HTTP calls to xAI from scattered modules.

## Testing Requirements
- **Unit Tests**: For core logic (parsers, indicators, regime detection, AI Gateway request shaping).
- **Integration Tests**: Verify Redis pub/sub flow and Gateway endpoints (including `/api/v1/ai/ask` once implemented).
- **End-to-End Tests**: Verify full pipeline from Chrome to Chart; later, add flows that include Ask-AI interactions to ensure context injection wiring is correct.
