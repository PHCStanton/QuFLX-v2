# Critical Architecture & Code Integrity Analysis – 2025-12-27

## 1. Scope & Method

- Reviewed core backend services:
  - Gateway API and Socket.IO bridge: `backend/services/gateway/main.py`
  - History pipelines and capabilities: `capabilities_v2/history_collector.py`
  - Strategy service and indicator pipeline: `backend/services/strategy/main.py`, `backend/services/strategy/indicators.py`
  - Collector and WebSocket interceptor: `backend/services/collector/*.py`
  - Redis infrastructure: `backend/infrastructure/redis_client.py`
- Reviewed core frontend Dashboard:
  - Workspace and charting: `gui/Dashboard/src/components/ChartWorkspace.jsx`, `ChartContainer.jsx`, `OscillatorChart.jsx`, `ChartHeader.jsx`
  - State stores: `gui/Dashboard/src/store/marketStore.js`, `settingsStore.js`
  - Layout and panels: `Dashboard.jsx`, `Sidebar.jsx`, `ContextPanelRouter.jsx`, `AssetPanel.jsx`
- Cross-checked against design docs:
  - `backend/services/strategy/strat_docs/Indicators_vs_Market_Structures.md`
  - `Research/indicator_parameters_2025-12-26.md`
  - `v2_Dev_Docs/V1_reference/UI/indicatorDefinitions.js`
  - `reports/report_indicators_v1.md`, `report_Oscillator_Indicator_OverlayOR_v1.md`, `review_indicators_implementation_25-12-26.md`
- Aligned findings with `/c:/QuFLX/v2/.agents/CORE_PRINCIPLES.md` (simplicity, separation of concerns, incremental testing, zero assumptions, fail-fast).


## 2. High-Level Architectural Assessment

### 2.1 Overall Structure

- **Backend**
  - Clear separation between:
    - **Collector** (Chrome + WebSocket → Redis `market_data`),
    - **Gateway** (FastAPI + Socket.IO + automation capabilities),
    - **Strategy Service** (consumes Redis, runs `TechnicalIndicatorsPipeline`, publishes signals),
    - **Capabilities Layer** (`capabilities_v2/*` for history collection and other automations).
  - `TechnicalIndicatorsPipeline` is used both by the strategy service and on-demand indicator calculations in the gateway. This keeps indicator logic centralized and consistent.
- **Frontend**
  - Dashboard shell (`Dashboard.jsx`) composes sidebar, top bar, and main workspace with clean flex layout.
  - `marketStore.js` acts as central state: asset/timeframe selection, history bootstrap, real-time candles, indicators, and indicator state.
  - Chart architecture is logically layered:
    - `ChartContainer`: owns main Lightweight Charts candlestick chart.
    - `ChartWorkspace`: orchestrates store, charts, indicator selection, screenshot, AI, and oscillator panes.
    - `OscillatorChart`: encapsulates each separate oscillator pane.

**Assessment:** The broad architecture is solid and aligned with the CORE_PRINCIPLES: clear layer boundaries, shared indicator pipeline, and a frontend that stays relatively thin and data-driven.


## 3. Critical Findings (Severity Overview)

- **CRITICAL**
  1. Gateway is accumulating responsibilities (settings, AI, automation, history, indicators, health checks) in a single large module (`gateway/main.py`, 1000+ lines). This is a structural smell that will become a bottleneck for maintainability and testing.
  2. The history/indicator data model depends on **CSV files as the contract** between history collection and indicator computation. This is fragile and tightly couples live functionality to filesystem state.

- **HIGH**
  3. Frontend `ChartWorkspace.jsx` is doing too much: layout, orchestration, indicator catalog, modal wiring, drag-resize logic, and indicator loading glue.
  4. Time-scale synchronization between main chart and oscillator panes is implemented ad hoc; it works but is not yet a first-class abstraction, which risks further drift.

- **MEDIUM**
  5. The difference between “live/streaming” history (from Redis) and “persisted history” (CSV) is not expressed explicitly in types or store shape; it is implicit, which makes it easy to introduce subtle misalignments.
  6. Indicator parameter wiring is correct but still tightly coupled to hard-coded indicator definitions inside `ChartWorkspace`; there is no shared catalog for the Dashboard in v2.

- **LOW**
  7. Some duplication of layout/resize patterns (e.g. `AssetPanel` and oscillator block) could be unified for consistency and less cognitive load.


## 4. Detailed Findings

### 4.1 Gateway Monolith (CRITICAL)

**Evidence**

- Single file [`backend/services/gateway/main.py`](file:///c:/QuFLX/v2/backend/services/gateway/main.py) handles:
  - FastAPI app setup and lifespan management (Redis bootstrap, background Redis listener).
  - Socket.IO server, event handlers, and system status broadcasting.
  - AI integration (`/api/v1/ai/ask`).
  - History endpoints: `/api/v1/bootstrap-history`, `/api/v1/history/{asset}`.
  - Indicator endpoint: `/api/v1/indicators` with DataFrame creation and pipeline invocation.
  - Asset automation (`/api/v1/select-asset`, `refresh-assets` capability runner).
  - Settings persistence and versioning.

**Why it matters**

- Violates **Strict Separation of Concerns**:
  - One module is responsible for HTTP API, WebSocket API, settings storage, AI proxying, historical data management, indicator calculation, and Selenium automation.
- Increases risk for:
  - Cross-cutting bugs (a change in one area affects others unintentionally).
  - Hard-to-test endpoints (need complex environment setup to exercise small pieces).
  - Slower iteration and harder reasoning as complexity grows (e.g., adding more analysis tools or live trading endpoints).

**Recommendation**

- Introduce clear submodules and routers:
  - `gateway/http/indicators.py` – only `/api/v1/indicators` & history/DF preparation.
  - `gateway/http/history.py` – `/api/v1/bootstrap-history`, `/api/v1/history/{asset}`.
  - `gateway/http/automation.py` – `refresh-assets`, `select-asset`.
  - `gateway/http/ai.py` – `ai/ask`.
  - `gateway/socket/events.py` – Socket.IO events and Redis listener bridging.
- Keep `main.py` as thin composition glue that wires subrouters and event handlers together.
- This refactor is fully backward-compatible at the API level (no external contract changes), so it respects **Code Integrity & Backward Compatibility**.


### 4.2 CSV-Centric Indicator History Contract (CRITICAL)

**Evidence**

- Indicators endpoint in [`gateway/main.py`](file:///c:/QuFLX/v2/backend/services/gateway/main.py#L502-L611):

  ```python
  csv_path = root / "data" / "data_output" / "history" / asset_clean / f"{int(timeframe_min)}.csv"
  if not csv_path.exists():
      raise HTTPException(status_code=404, detail=f"History not found for {asset} @ {timeframe_min}m")
  ```

- History is collected via `HistoryCollector` capability ([`capabilities_v2/history_collector.py`](file:///c:/QuFLX/v2/capabilities_v2/history_collector.py#L44-L82)) and persisted as CSV.
- Frontend initially loaded history via `/api/v1/bootstrap-history`, consuming JSON candles, but did not persist them to CSV until we added `_persist_history_csv`. That previously caused the “History not found” error even when charts displayed candles.

**Why it matters**

- Creates a **hidden dependency**: indicator availability depends not only on live/bootstrapped history but also on correct filesystem state.
- Harder failure modes:
  - Inconsistent state if CSV writing fails but API still returns candles.
  - Environment-specific issues (permissions, different working directories, deployment environments).
- Violates **Zero Assumptions** and partially **Fail Fast**: indicators endpoint assumes CSV is the canonical source instead of validating the true upstream data flow.

**Recommendation**

- Move toward a **data-layer abstraction** for history:
  - Introduce a `HistoryRepository` interface with two implementations:
    - `FileHistoryRepository` (current CSV-based implementation).
    - `RedisHistoryRepository` or `InMemoryHistoryRepository` (for recent collected/bootstrapped candles).
  - Make `/api/v1/indicators` depend on the repository rather than hard-coded CSV paths.
  - Default implementation can still be CSV for now, but the abstraction allows:
    - Easier transition to Redis or DB-backed history later.
    - Clearer error messages and behavior when history is missing.
- Short-term hardening without full refactor:
  - Return a structured error payload when history is missing that can be surfaced in the UI (“Indicators require historical data. Run history collection.”) instead of generic 404/500.


### 4.3 Large `ChartWorkspace` Component (HIGH)

**Evidence**

- [`ChartWorkspace.jsx`](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartWorkspace.jsx) (400+ lines) currently handles:
  - Main chart and oscillator orchestration (`ChartContainer`, `OscillatorChart`).
  - Indicator options catalog (RSI, MACD, CCI, DeMarker) and their parameter metadata.
  - Indicator settings modal wiring and indicator updates.
  - Data flow into `useTickAggregation` hook and loading overlays.
  - Screenshot capture, AI ask UI, and health status badge.
  - Oscillator pane sizing (drag handle logic) and layout.

**Why it matters**

- Violates **Strict Separation of Concerns** at the frontend component level:
  - One component mixes layout, domain configuration (indicator definitions), and cross-cutting UX behavior.
- Makes future tasks harder:
  - Adding new oscillators or overlays requires touching this large file.
  - Testing isolated behaviors (e.g. AI ask vs oscillator behavior) is difficult.

**Recommendation**

- Extract clearly-scoped subcomponents and configuration:
  - `indicatorOptions` → move to a dedicated `indicatorCatalog.ts/js` (Dashboard-specific) that mirrors the v1 reference catalog and `Research/indicator_parameters_2025-12-26.md`.
  - Oscillator layout and drag logic → move to `OscillatorPaneGroup` component that receives `oscillatorIndicators`, `indicatorSeries`, and `indicatorStatus` as props.
  - Keep `ChartWorkspace` focused on:
    - Wiring store → chart container.
    - High-level composition (header, workspace, oscillator group, modals).


### 4.4 Time-Scale Synchronization Model (HIGH)

**Evidence**

- Main chart time scale is created in [`ChartContainer.jsx`](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartContainer.jsx#L27-L43).
- [`OscillatorChart.jsx`](file:///c:/QuFLX/v2/gui/Dashboard/src/components/OscillatorChart.jsx) sets up its own chart and series, then:
  - Subscribes to main chart `timeScale` visible range changes.
  - Applies `setVisibleRange(range)` on osc time scale.
- We recently added guards to avoid crashes when `data` is empty and a best-effort alignment when data is present.

**Why it matters**

- While the approach works, it is currently an **implicit contract** encoded in two components:
  - `ChartContainer` must expose a valid chart with timeScale.
  - `OscillatorChart` must know how to subscribe/align.
- Edge cases (leading/trailing whitespace, extremely zoomed views, partial data sets) may still produce visible misalignment, as you observed.

**Recommendation**

- Formalize a **Viewport Sync Service** or hook:
  - Example: `useSynchronizedTimeScales(mainChart, oscCharts[])` that:
    - Maintains a single source of truth for the current time range.
    - Handles initial sync when data appears.
    - Optionally listens to wheel/pan events explicitly.
  - `OscillatorChart` would then become a pure rendering unit that receives the desired visible range as a prop, instead of directly subscribing to the main chart.


### 4.5 Live vs Historical Data Separation (MEDIUM)

**Evidence**

- Streaming tick/candle data flows through Redis and is aggregated in `useTickAggregation`.
- Historical bootstrap comes from `/api/v1/bootstrap-history` and is stored in `historyCandles` and `historyStatus` in `marketStore`.
- Indicators currently compute only from **historical** data (CSV). Real-time indicator updates based on streaming candles are not yet integrated.

**Why it matters**

- Design intent (from docs such as `Indicators_vs_Market_Structures.md`) is to have a unified understanding of market state that uses both history and recent streaming candles.
- Without a clear abstraction, there’s a risk of **drift** between:
  - What the strategy sees (buffered candles + pipeline), and
  - What the Dashboard indicators show (CSV + pipeline).

**Recommendation**

- Introduce a unified **CandleSeries model** in the backend that:
  - Combines last N candles from history + live buffer.
  - Exposes a single API for indicator calculation (for both strategy and dashboard).
- On the frontend, adjust `marketStore` to:
  - Track a single `combinedCandles` series per asset/timeframe rather than separate conceptual streams.


### 4.6 Indicator Parameter Catalog Cohesion (MEDIUM)

**Evidence**

- Indicator definitions for RSI, MACD histogram, CCI, and DeMarker exist in multiple places:
  - V1 reference: `v2_Dev_Docs/V1_reference/UI/indicatorDefinitions.js`.
  - Research doc: `Research/indicator_parameters_2025-12-26.md`.
  - Dashboard: `ChartWorkspace.jsx` hard-codes `indicatorOptions` with params and ranges.
  - Backend pipeline: `TechnicalIndicatorsPipeline.params` in `indicators.py`.

**Why it matters**

- Multiple sources of truth increase the risk of misalignment (defaults, ranges, or parameter names diverging).
- Violates **Zero Assumptions** and adds maintenance overhead.

**Recommendation**

- Adopt a single **indicator parameter schema** shared between backend and frontend:
  - Define a JSON/YAML/TS schema (e.g., `config/indicator_catalog.json`) listing each indicator’s:
    - Key, description, default params, ranges, render type, and backend pipeline mapping keys.
  - Generate or derive frontend `indicatorOptions` and backend `TechnicalIndicatorsPipeline` defaults from this schema.


### 4.7 Layout & Resizing Patterns (LOW)

**Evidence**

- Both `AssetPanel.jsx` and the oscillator section in `ChartWorkspace.jsx` implement handcrafted drag-resize logic.
- Patterns are similar but not shared.

**Why it matters**

- Not a functional bug, but a **consistency issue**: slightly different min/max heights and behaviors increase cognitive load.

**Recommendation**

- Introduce a small `VerticalResizableSection` component or hook that:
  - Encapsulates drag handling, min/max bounds, and cleanup.
  - Is reused across AssetPanel and oscillator block, improving consistency.


## 5. Alignment with CORE_PRINCIPLES

- **Functional Simplicity First**
  - The high-level architecture honors simplicity, but the gateway monolith and CSV-based contracts are pressure points where future complexity will accumulate.
- **Sequential Logic**
  - Data flow (Collector → Redis → Gateway → Socket.IO → Dashboard) is coherent and sequential.
- **Incremental Testing**
  - Presence of `backend/tests/test_validation.py` and use of `pytest` is positive. However, gateway and indicator endpoints lack dedicated tests; they rely on manual testing and dashboard behavior.
- **Zero Assumptions / Fail Fast**
  - Recent fixes (explicit history status in `marketStore`, error messages for missing history) move in the right direction, but filesystem assumptions for indicators remain a gap.
- **Separation of Concerns**
  - Good at macro-level (services vs capabilities), weaker at micro-level (gateway/main.py and ChartWorkspace).


## 6. Next Actionable Steps (Prioritized)

### 6.1 Backend – Gateway & History/Indicator Layer

1. **Extract Gateway Submodules (High Priority)**
   - Create dedicated modules for:
     - `indicators_http.py` – `/api/v1/indicators`, DataFrame creation, pipeline invocation.
     - `history_http.py` – `/api/v1/bootstrap-history`, `/api/v1/history/{asset}`.
     - `automation_http.py` – `refresh-assets`, `select-asset` endpoints.
     - `ai_http.py` – `/api/v1/ai/ask`.
   - Keep `main.py` as a thin assembly layer wiring FastAPI routers and Socket.IO.
   - Add tests that directly hit these routers using `TestClient`.

2. **Introduce History Repository Abstraction**
   - Define an interface `HistoryRepository` with operations:
     - `get_candles(asset: str, timeframe: int, limit: int) -> List[OHLC]`.
     - `save_candles(asset: str, timeframe: int, candles: List[OHLC])`.
   - Implement `CSVHistoryRepository` using existing CSV format.
   - Refactor `/api/v1/indicators` and `/api/v1/history/{asset}` to use the repository instead of manual `csv.reader`.

3. **Align Strategy and Dashboard Indicator Inputs**
   - Ensure that both `StrategyService` (buffer + pipeline) and `/api/v1/indicators` consume candles via the same repository or adapter layer, so behavior is consistent.


### 6.2 Frontend – Dashboard & Indicators

4. **Extract Indicator Catalog for Dashboard**
   - Move `indicatorOptions` from `ChartWorkspace.jsx` into a shared `indicatorCatalog.js/ts` in `gui/Dashboard/src/config/`.
   - Back this catalog with the same parameter definitions used in `Research/indicator_parameters_2025-12-26.md`.
   - Ensure each catalog entry includes:
     - Backend key, default params, param ranges, display name, render type (line/histogram).

5. **Refactor ChartWorkspace into Smaller Units**
   - Create an `OscillatorPaneGroup` component that:
     - Receives `mainChart`, `oscillatorIndicators`, `indicatorSeries`, `indicatorStatus`.
     - Owns the vertical drag handle and layout of `OscillatorChart` instances.
   - Keep cross-cutting features (screenshot, AI ask, status display) in a smaller, more focused `ChartWorkspace`.

6. **Formalize Time-Scale Sync**
   - Introduce a `useChartViewportSync(mainChart)` hook that provides:
     - `visibleRange` and an API to subscribe child charts.
   - Update `OscillatorChart` to receive `visibleRange` as a prop, and apply it internally, instead of subscribing directly to the main chart.


### 6.3 Testing & Observability

7. **Add API-Level Tests for Indicators and History**
   - Use FastAPI `TestClient` to test:
     - Successful indicator computation when CSV/history exists.
     - Well-defined error responses when history is missing.
     - Parameter overrides (RSI period, MACD fast/slow/signal, CCI and DeMarker periods).

8. **Add Frontend Integration Checks**
   - At minimum, add a small Cypress/Playwright or React Testing Library flow to validate:
     - Adding an oscillator after history load does not crash.
     - Adjusting indicator parameters results in a changed series (e.g. different RSI values) without runtime errors.


### 6.4 Documentation & Design Alignment

9. **Unify Indicator Documentation**
   - Consolidate the indicator design into:
     - One canonical document (likely extending `Indicators_vs_Market_Structures.md`) that maps:
       - Indicator keys → backend pipeline params → frontend catalog entries → oscillator/overlay usage.
   - Make the Dashboard indicator catalog explicitly reference this document to keep v2 aligned with strategy design.


## 7. Conclusion

- The system’s **macro-architecture is strong** and in line with your strategic direction: backend-driven indicators, a structured strategy pipeline, and a Dashboard focused on visualizing regimes and key oscillators.
- The main risks are **localized**:
  - Gateway monolith,
  - CSV-centric indicator history contract,
  - Large multi-responsibility React components.
- Addressing these via the recommended refactors will:
  - Improve maintainability and testing.
  - Reduce the chance of subtle desyncs between what the backend “thinks” and what the Dashboard shows.
  - Keep the project tightly aligned with `/c:/QuFLX/v2/.agents/CORE_PRINCIPLES.md`, especially functional simplicity, separation of concerns, and fail-fast behavior.
