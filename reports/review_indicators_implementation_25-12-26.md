# Indicator Implementation Review – Oscillators & History Handling (2025-12-26)

## 1. Executive Summary

This review covers the current indicator implementation across backend and frontend, with a focus on oscillator panes, historical data handling, and user-facing behaviour when enabling indicators. It consolidates findings from the roles of @Investigator, @Debugger, @Optimizer, @Code_Simplifier, and @Reviewer, under the constraints of `.agents/CORE_PRINCIPLES.md`.

Key conclusions:
- The architectural direction (backend-owned indicator math, frontend as a thin visualization layer, separate oscillator panes) is sound and aligned with industry practice.
- The "no historical data" error you observed when indicators are enabled was caused by overly strict and slightly misaligned frontend gating.
- Timeframe locking is structurally correct (asset|timeframe keying, shared store state), but can be strengthened with clearer contracts and UX.
- The current implementation is minimal and maintainable, but there are opportunities to clarify responsibilities, reduce surprise errors, and prepare for advanced indicator features (strategy vs. visual-only, AI alignment).

## 2. Roles & Delegated Perspectives

- @Investigator – Forensic analysis of current indicator-related code and flows.
- @Debugger – Root cause analysis of the "no historical data" error and targeted fixes.
- @Optimizer – Performance, data access, and resource usage review.
- @Code_Simplifier – Complexity and maintainability review, with rewrite guidance where needed.
- @Reviewer – Readability, security, stability, and UX cohesion.

All recommendations respect and reference the CORE PRINCIPLES: functional simplicity, sequential logic, incremental testing, zero assumptions, code integrity, separation of concerns, and explicit error handling.

## 3. Current Implementation Overview

### 3.1 Backend – Indicator Calculation & History

- `backend/services/strategy/indicators.py`
  - Provides `TechnicalIndicatorsPipeline` and `IndicatorSet`, computing a comprehensive indicator suite (RSI, MACD family, CCI, DeMarker, Schaff, etc.).
  - Uses pandas and optional `pandas_ta` / TA-Lib; has clear parameters and a safe fallback path when TA libraries are unavailable.
  - Designed as the single source of truth for strategy indicators.

- `backend/services/gateway/main.py`
  - `/api/v1/indicators`:
    - Accepts `{ asset, timeframe, indicators }`.
    - Loads historical OHLC data from CSV at `data/data_output/history/{asset_clean}/{timeframe_min}.csv`.
    - Runs `TechnicalIndicatorsPipeline` and returns `{ series: { key: [{ time, value }] }, latest_timestamp }`.
    - Returns `404` with `"History not found for {asset} @ {timeframe_min}m"` when the CSV is missing.
  - `/api/v1/bootstrap-history`:
    - Triggers history collection via a subprocess runner.
    - Returns `{ candles }` for an asset/timeframe and is used by the Dashboard to seed the main chart.

### 3.2 Frontend – Store & Data Flow

- `gui/Dashboard/src/store/marketStore.js`
  - Historical data:
    - `historyCandles[asset]` and `historyStatus[asset]` track loaded candles and status (`loading`, `loaded`, `empty`, `not_found`, `error`).
    - `loadHistory(asset)` calls `/api/v1/bootstrap-history` first, then falls back to `/api/v1/history/{asset}`.
  - Indicators:
    - `indicatorSeries[asset|timeframe]` stores `{ key: [{ time, value }] }` per oscillator or indicator key.
    - `indicatorStatus[asset|timeframe]` tracks `loading`, `loaded`, `error`.
    - `loadIndicators({ asset, timeframe, indicators })` calls `/api/v1/indicators` and merges the result into `indicatorSeries`.
  - Recent change:
    - Added a check that uses both `historyStatus[asset]` and `historyCandles[asset]` to decide when indicator loading is allowed, and when to show a clear "no historical data" message.

### 3.3 Frontend – Chart & Indicator UI

- `ChartWorkspace.jsx`
  - Handles:
    - Asset and timeframe selection.
    - Wiring candles and history into `useTickAggregation`.
    - Automatic indicator loading whenever `selectedAsset`, `selectedTimeframe`, or `oscillatorIndicators` change.
    - Rendering oscillator panes using `OscillatorChart` with a vertically resizable region.
  - Uses `activeIndicators` from the store and filters by `kind === 'oscillator'`.
  - Keys indicator series by `${selectedAsset}|${selectedTimeframe}`.

- `OscillatorChart.jsx`
  - Creates a dedicated `lightweight-charts` instance per oscillator.
  - Subscribes to the main chart time-scale visible range and mirrors it to the oscillator chart.
  - Renders either `LineSeries` or `HistogramSeries` depending on indicator type.

- `ChartHeader.jsx`
  - Renders the + Indicator combobox.
  - On selection, creates an `activeIndicators` entry with:
    - `id`, `name`, `value`, `key`, `kind`, `source`, `params`, `paramConfig`.
  - Displays indicator badges; clicking a badge opens the settings modal, clicking `X` removes the indicator.

- `IndicatorSettingsModal.jsx`
  - Uses `indicator.paramConfig` and `indicator.params` to render structured fields for each indicator parameter (e.g. RSI period, MACD fast/slow/signal).
  - Updates both `params` and badge label (`value`) when saved.

### 3.4 Documentation Baseline

- `Research/research_lightweight-charts-indicators_2025-12-23.md` – authoritative blueprint for indicator layout, timeframe locking, and performance.
- `reports/report_status_indicators_25-12-26.md` – status report summarising readiness for oscillator integration.
- `Research/indicator_parameters_2025-12-26.md` – phase-1 parameter definitions for RSI, MACD Histogram, CCI, and DeMarker.

## 4. Root Cause Analysis – "No Historical Data" Error

### 4.1 Symptom

- When enabling an indicator from the + Indicator combobox, the Dashboard sometimes displays an error stating that there is no historical data available, even though history has been loaded and candles are visible on the chart.

### 4.2 Previous Frontend Behaviour

- Older implementation allowed indicator requests regardless of `historyStatus`, relying on the backend 404 from `/api/v1/indicators` to signal missing CSV history.
- A recent change introduced a strict gate:
  - `loadIndicators` would only proceed if `historyStatus[asset] === 'loaded'`.
  - Any other state (including `loading` or undefined) triggered a user-facing error.

This led to false positives in scenarios where:
- History was in the process of loading and the user enabled an indicator early.
- `historyStatus` was briefly out of sync with `historyCandles` (candles present but status not yet updated).
- History had been successfully loaded for an asset, but the first indicator request fired before the `loaded` status became visible in the store.

### 4.3 Updated Behaviour (Fix Implemented)

- `loadIndicators` now uses a more nuanced check:

  - It inspects both `historyStatus[asset]` and `historyCandles[asset]`:
    - `historyState` = `historyStatus[asset]`.
    - `hasHistoryCandles` = `Array.isArray(historyCandles[asset]) && historyCandles[asset].length > 0`.

  - Error states:
    - If `historyState` is `not_found`, `error`, or `empty`, it sets a clear error and **does not** call the backend:
      - `"No historical data available for {asset} @ {timeframe}. Run history collection first."`

  - Loading/unknown states:
    - If `!hasHistoryCandles` and `historyState !== 'loaded'`, `loadIndicators` simply returns without setting an error, allowing history loading to complete silently.

  - Success states:
    - If candles exist or `historyState === 'loaded'`, indicators are requested from `/api/v1/indicators` as normal.

### 4.4 Effect on User Experience

- Reduces spurious "no historical data" errors when history is actually on the way or already present.
- Preserves a clear, explicit error for genuine no-history situations (e.g. CSV missing, collector not run, or empty history set).
- Keeps the backend as the ultimate arbiter of history availability while still providing a quick, user-friendly check in the UI.

## 5. Stability & Consistency Review (Per Role)

### 5.1 @Investigator – Forensic Findings

- Strengths:
  - Clear separation between backend calculation and frontend visualization.
  - Consistent use of `{ time, value }` series for indicators.
  - Timeframe state is owned by the store (`selectedTimeframe`), and both candles and indicators derive from it.
  - Oscillator panes are separate chart instances, reducing scaling issues.

- Risks and minor inconsistencies:
  - `historyStatus` is keyed only by `asset`, not by `asset|timeframe`, while indicator series are keyed by `asset|timeframe`.
    - This can hide subtle mismatches if multiple timeframes per asset are introduced.
  - Indicator parameter changes (via the modal) currently update the local store state but are not yet wired through to the backend indicator pipeline.
    - Visual parameters may drift from backend defaults unless the backend endpoint is extended to accept parameters.
  - `loadIndicators` is called automatically from a `useEffect` on oscillator indicators; rapid indicator add/remove or timeframe changes can trigger multiple requests in quick succession.

### 5.2 @Debugger – Potential Bug Vectors

- History/indicator mismatch:
  - Because indicator requests rely on CSV files (`/data/data_output/history/...`), but the main chart can display live tick-based candles via Socket.IO, there is a possible mismatch between what the user sees and what the indicator backend has available.
  - If a user switches assets or timeframes rapidly, the first indicator request may arrive before history collection completes or before CSV export is ready.

- Status UX:
  - A single `lastError` string at the store level is shared by many operations (timeframe selection, indicators, asset refreshing, history collection); this can cause later actions to override earlier context.
  - Users may see an old error that no longer reflects the current state.

### 5.3 @Optimizer – Performance Observations

- Indicator fetching:
  - `loadIndicators` fetches up to `limit` records (default 300, enforced server-side) and recomputes indicators for each request.
  - With multiple indicators per asset/timeframe, this is still bounded, but there is room for reuse:
    - Many indicator values are already computed and buffered in the strategy service.
    - A shared adapter that exposes the same indicator series used by the strategy could reduce duplicated calculation.

- Chart rendering:
  - Each oscillator uses its own chart instance; this is a deliberate design choice from the research paper and is appropriate for clarity.
  - A vertical resize handle allows the user to allocate more/less space to oscillators without impacting chart performance.

- Network usage:
  - Indicators are requested only for active oscillator indicators and only when the asset/timeframe/indicator set changes, which is efficient.
  - There is no unnecessary streaming of indicator ticks; data is fetched in windows.

### 5.4 @Code_Simplifier – Complexity & Maintainability

- Positive aspects:
  - Store functions are straightforward (`loadHistory`, `loadIndicators`, etc.).
  - Indicator option definitions (`indicatorOptions` in `ChartWorkspace`) provide a single place to define UI-facing indicator metadata.
  - Oscillator chart sync logic is clean and isolated in `OscillatorChart`.

- Opportunities:
  - `historyStatus` and `historyCandles` could be refactored into a single `history` map keyed by `asset|timeframe` with `{ status, candles }` objects for clearer semantics.
  - Indicator definitions for the Dashboard could be centralised by reusing or adapting `v2_Dev_Docs/V1_reference/UI/indicatorDefinitions.js` instead of duplicating parameter metadata.
  - The single `lastError` string might be split into context-specific error channels (e.g. `historyError`, `indicatorError`, `connectionError`) to improve diagnosability.

### 5.5 @Reviewer – Style, Security, and UX

- Style & readability:
  - Code is consistent with the rest of the Dashboard (React + Zustand + Tailwind).
  - Error handling in the store is explicit and user-facing (no swallowed errors), matching the CORE PRINCIPLES.

- Security:
  - Indicator endpoints accept only basic fields (`asset`, `timeframe`, `indicators`); no obvious injection vectors given current usage.
  - CSV loading is path-constrained and uses sanitized asset names; this is good.

- UX:
  - Indicator badges are clickable, with a clear distinction between opening settings and removing an indicator.
  - Modal shows concrete parameters instead of generic strings, which aligns with trader expectations.
  - Oscillator panes are vertically resizable, improving usability on smaller screens.
  - The main remaining UX gap is explicit feedback when history is still loading vs. when it is truly unavailable.

## 6. Recommendations – Path Forward

### 6.1 Solidify History and Timeframe Semantics

1. Key history by `asset|timeframe` instead of just `asset`:
   - Structure:
     - `history[asset|timeframe] = { status, candles }`.
   - Benefits:
     - Avoids ambiguity when switching timeframes.
     - Keeps history and indicators fully aligned on the same compound key used by `indicatorSeries`.

2. Make loading states explicit in the UI:
   - Show a small inline message or indicator in the indicator area when history is still loading (e.g. "Preparing history for AUDNZD @ 1m...").
   - Only show the "No historical data available" message when the system has confirmed a negative state (`not_found`, `empty`, `error`).

### 6.2 Wire Indicator Parameters End-to-End

1. Extend `/api/v1/indicators` to accept indicator parameter overrides:
   - Request payload could include an optional `indicatorParams` map:
     - `{ indicatorParams: { rsi_14: { period: 14 }, macd_histogram: { fast: 12, slow: 26, signal: 9 } } }`.
   - These would be passed into `TechnicalIndicatorsPipeline(config={ 'indicator_params': ... })` so the backend and frontend share the same parameter set.

2. On the frontend:
   - Extend `loadIndicators` to derive `indicatorParams` from `activeIndicators` and send them with the request.
   - Keep `IndicatorSettingsModal` as the single source of truth for editing parameters per indicator instance.

This ensures that changing settings in the modal truly changes the indicator series plotted, not just the badge label.

### 6.3 Clarify Indicator Modes (Strategy vs Visual-Only)

1. Surfacing strategy-linked indicators:
   - Use the backend pipeline and adapter for indicators that must match the strategy exactly (e.g. `rsi_14`, `macd_histogram`, `cci`, `demarker`).

2. Adding visual-only helpers later:
   - For overlays like EMA bands, consider using `lightweight-charts` helper primitives fed directly from the main candlestick series.
   - Clearly label these in the UI (e.g. "Custom EMA" vs "Strategy RSI") so users understand which indicators affect AI/strategy decisions.

### 6.4 Improve Error Channel Clarity

1. Split `lastError` into scoped error fields:
   - Example:
     - `historyError`, `indicatorError`, `connectionError`, `backendError`.
   - Render them in context-specific locations (e.g. near the indicator badges for indicator errors).

2. Provide actionable messages:
   - For history errors: suggest running collection or checking asset/timeframe combinations that have data.
   - For indicator errors: show whether the problem is missing CSV, backend failure, or parameter misconfiguration.

### 6.5 Guard Against Future Instabilities

1. Add focused tests:
   - Store-level unit tests for `loadHistory` and `loadIndicators`:
     - Ensure that various `historyStatus` states lead to the correct behaviour (proceed/skip/error).
   - Component tests for `IndicatorSettingsModal` and `ChartWorkspace` to verify:
     - Correct parameters are shown for each indicator.
     - Badge labels reflect parameter changes.

2. Monitor performance:
   - Add lightweight logging or metrics around indicator requests:
     - Count of indicator calls per timeframe.
     - Average response size.
   - Use this information to tune `limit` and decide if caching is beneficial.

## 7. Summary

- The indicator implementation is directionally correct and already adheres to key industry standards:
  - Backend-owned indicator computation.
  - Frontend as a thin, interactive visualization layer.
  - Separate oscillator panes with synchronized time scales.
- The primary instability you encountered (spurious "no historical data" errors) has been addressed by aligning indicator loading with actual history availability without over-eager error messages.
- The main next steps are architectural refinements rather than structural rewrites:
  - Key history by `asset|timeframe`.
  - Wire indicator parameters into the backend.
  - Clarify indicator modes and error channels.

Following these recommendations will make indicator behaviour more predictable, reduce user confusion, and keep the implementation ready for deeper AI and strategy integrations while staying faithful to the CORE PRINCIPLES.

