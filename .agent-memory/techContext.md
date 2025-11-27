# Technical Context

## Technologies Used
- **Python 3.11+**: Backend services (Collector, Strategy, Gateway).
- **FastAPI**: API Gateway framework.
- **Redis**: Message broker and in-memory database.
- **React + Vite**: Frontend framework.
- **TypeScript**: Frontend language for type safety.
- **Zustand**: Frontend state management.
- **Lightweight Charts**: Financial charting library.
- **Pydantic**: Data validation and settings management.
- **Selenium**: Browser automation for data collection.

## Development Setup
1.  **Backend**:
    -   `python -m venv venv`
    -   `pip install -r requirements.txt`
    -   Run services via `python -m backend.services.[service].main`
2.  **Frontend**:
    -   `npm install`
    -   `npm run dev`
3.  **Infrastructure**:
    -   Redis running on default port 6379.

## Dependencies
- `fastapi`, `uvicorn`, `python-socketio`: Gateway.
- `redis`: Redis client.
- `selenium`: Chrome automation.
- `pandas`, `ta-lib` (optional): Indicator calculation.
- `lightweight-charts`: Frontend charting.

## Technical Constraints
- **Latency**: Must process ticks and update charts within 100ms.
- **Chrome Dependency**: The Collector requires a running Chrome instance with DevTools Protocol enabled.
- **Redis Availability**: The system cannot function without Redis.

## Coding Standards
- **Python**: PEP 8, Type Hints (mypy), Pydantic models for all data structures.
- **TypeScript**: Strict mode, functional components, hooks for logic.
- **Testing**: Pytest for backend, Vitest/Jest for frontend.

## Testing Requirements
- **Unit Tests**: For all core logic (parsers, indicators).
- **Integration Tests**: Verify Redis pub/sub flow.
- **End-to-End Tests**: Verify full pipeline from Chrome to Chart.
