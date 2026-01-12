# Indicators Knowledgebase – Frontend Chart & Indicator Implementation Plan

**Scope:** Frontend lightweight-charts integration for main price chart, oscillator panels, crosshair/time-scale synchronization, composite screenshot capture (with price scale), and drawing object cursor alignment in the QuFLX v2 Dashboard.

**References:**
- `reports/report_2026-01/report_indicators_knowledgebase_ready_26-01-10.md` (Sections 11 & 12)
- `Research/research_lightweight-charts-indicators_2025-12-23.md`
- `gui/Dashboard/src/components/ChartContainer.jsx`
- `gui/Dashboard/src/components/OscillatorChart.jsx`
- `gui/Dashboard/src/components/ChartWorkspace.jsx`
- `gui/Dashboard/src/components/ChartActions.jsx`
- `.agents/CORE_PRINCIPLES.md` & `.trae/rules/project_rules.md`

Status markers:
- **[x]** = Completed
- **[~]** = Partially implemented
- **[ ]** = Not started / pending

Status update 2026-01-10 (Tag 26-01-10):
- Phase 1 crosshair sync, Phase 2 composite screenshot, and initial Phase 3 drawing cursor alignment work are implemented in code and manually verified in the Dashboard.
- Drawing alignment work for this tag is scoped to the screenshot annotation modal (`ScreenshotModal`) and does not yet cover the full in-chart drawing pipeline.

---

## Phase 0 – Current State & Constraints (Assessment)

### 0.1 Architecture & Library Behavior

- [x] **P0.1 – Confirm lightweight-charts sync model and limitations**  
  - Independent chart instances; no built-in sync for time scale or crosshair.  
  - Sync must be implemented manually via `timeScale()` and `subscribeCrosshairMove()`.

- [x] **P0.2 – Lock in unidirectional sync strategy**  
  - Main price chart is the single source of truth for visible time range.  
  - Unidirectional pattern: **main chart → oscillator charts**, no feedback from oscillators to main chart.  
  - Bidirectional sync explicitly **de-scoped** (adds complexity and feedback-loop risk).

- [x] **P0.3 – Confirm minimal enhancement option (Option A)**  
  - User agreed to Option A:  
    - Add crosshair sync main → oscillators.  
    - Implement composite screenshot (main chart + oscillators + price scale).  
    - Investigate drawing object cursor alignment.  
  - No structural rewrite of charts required (Phase 0 confirms CORE_PRINCIPLES #7 does not trigger).

### 0.2 Existing Implementation Snapshot

- [x] **P0.4 – Main chart container present**  
  - `ChartContainer.jsx` creates a candlestick chart via `createChart()` and exposes `{ chart, series }` through `onChartReady`.

- [x] **P0.5 – Oscillator charts created as separate chart instances**  
  - `OscillatorChart.jsx` creates a dedicated `createChart()` instance per oscillator (RSI, CCI, MACD histogram, DeMarker).

- [x] **P0.6 – Time scale sync already implemented**  
  - `OscillatorChart.jsx` subscribes to `mainChart.timeScale().subscribeVisibleTimeRangeChange(sync)` and applies the range to `chartRef.current.timeScale()`.

- [~] **P0.7 – Screenshot capture partially implemented**  
  - `ChartWorkspace.jsx::captureChart()` uses `canvas.toDataURL()` on the first canvas under `#quflx-chart-screenshot-root`.  
  - Captures only the **main chart canvas**, not oscillators, and does **not** guarantee inclusion of the price scale.

- [ ] **P0.8 – Drawing object rendering pipeline documented**  
  - Drawing tools (horizontal line, zone, label) exist in the UI options.  
  - Exact implementation and coordinate mapping between cursor, chart, and objects still require investigation.

### 0.3 Test Baseline

- [x] **P0.9 – Verify current basic chart behavior**  
  - Main chart renders and resizes correctly.  
  - Oscillator charts render with data when indicators are active.

- [~] **P0.10 – Qualitative UX check**  
  - Time scale feels visually aligned between chart and oscillators.  
  - Crosshair, screenshot behavior, and drawing tools show gaps identified in the report.

---

## Phase 1 – Crosshair Synchronization (Main → Oscillator)

**Goal:** When hovering on the main price chart, all oscillator charts display a synchronized crosshair locked to the same time, without altering the existing unidirectional time scale sync.

### 1.1 Design & API Contract

- [x] **P1.1 – Confirm mainChart is available in OscillatorChart props**  
  - `ChartWorkspace.jsx` passes `mainChart` into each `OscillatorChart` instance once `handleChartReady` sets it.

- [x] **P1.2 – Define crosshair event data contract**  
  - Determine which fields from `param` will be used:  
    - `param.time` – canonical time coordinate.  
    - `param.seriesData` – map for main series values (optional helper for aligning Y).  
  - Decide on a resilient strategy for oscillator Y-value lookup:  
    - Prefer mapping from **oscillator data array** (`data`) keyed by `time`.  
    - Fallback behavior for missing data at a given time (e.g., use last known value or default to 0).

- [x] **P1.3 – Guardrails & CORE_PRINCIPLES alignment**  
  - Avoid cross-chart side effects other than visual crosshair positioning.  
  - Ensure crosshair sync is **read-only** from the oscillator perspective.  
  - Implement robust null checks and early returns to comply with “Fail Fast, Fail Loud”.

### 1.2 Implementation Steps (OscillatorChart.jsx)

- [x] **P1.4 – Add crosshair subscription effect**  
  - Extend the existing `useEffect` that depends on `mainChart` or add a dedicated effect.  
  - Implement a `handleCrosshairMove(param)` function that:  
    - Returns early if `!chartRef.current` or `!seriesRef.current`.  
    - If `param.time` exists:  
      - Locate the oscillator point for that time in `data`.  
      - Compute `value` (e.g., `point.value` or safe fallback).  
      - Call `chartRef.current.setCrosshairPosition(value, param.time, seriesRef.current)`.  
    - If `param.time` is null:  
      - Call `chartRef.current.clearCrosshairPosition()`.

- [x] **P1.5 – Wire crosshair subscription to mainChart**  
  - Subscribe via `mainChart.subscribeCrosshairMove(handleCrosshairMove)`.  
  - Store references for cleanup alongside existing `syncSubscriptionRef` or in a separate ref.

- [x] **P1.6 – Implement cleanup to avoid memory leaks**  
  - On effect cleanup, call `mainChart.unsubscribeCrosshairMove(handleCrosshairMove)`.  
  - Ensure cleanup runs whenever `mainChart` changes or component unmounts.

### 1.3 Test Points – Crosshair Sync

- [x] **T1.1 – Basic hover sync**  
  - Hover over several candles in the main chart.  
  - Verify that each oscillator shows a crosshair at the same time index.

- [x] **T1.2 – Edge times and gaps**  
  - Hover near the start and end of data, including regions where oscillators might have fewer points (e.g., early bars before indicator warm-up).  
  - Confirm crosshair does not jump erratically or cause errors.

- [x] **T1.3 – Rapid movement and performance**  
  - Move the mouse quickly across the main chart.  
  - Confirm crosshair keeps up visually without noticeable lag or console spam.

- [x] **T1.4 – Toggle indicators on/off**  
  - Enable and disable oscillators while hover is active.  
  - Confirm crosshair subscription does not leak (no warnings or exceptions after repeated toggling).

---

## Phase 2 – Composite Screenshot (Main Chart + Oscillators + Price Scale)

**Goal:** Replace the single-canvas screenshot with a composite capture that includes the main chart, all visible oscillator panels, and the price scale (Y-axis values), suitable for AI image analysis.

### 2.1 Design & Tooling Decision

- [x] **P2.1 – Confirm current screenshot limitations**  
  - `captureChart()` currently selects the first `canvas` under `#quflx-chart-screenshot-root` and calls `toDataURL`.  
  - Oscillators are rendered outside this container, and price scale visibility is not guaranteed.

- [x] **P2.2 – Decide capture approach (html2canvas vs takeScreenshot)**  
  - Option A: Use a DOM-based capture library like `html2canvas` to render the composed chart region (main + oscillators + price scale) into a single canvas.  
  - Option B: Use `lightweight-charts` `takeScreenshot()` API per chart and manually stitch images together in an offscreen canvas.  
  - Decision criteria:  
    - Reliability of price scale inclusion.  
    - Visual fidelity across browsers.  
    - Runtime performance and implementation complexity.

- [x] **P2.3 – Define screenshot region**  
  - Identify a single container that wraps:  
    - Main chart (including price scale).  
    - Oscillator panels.  
  - If necessary, adjust layout so one wrapper element can be captured to include all relevant content.

### 2.2 Implementation Steps (ChartWorkspace.jsx)

- [x] **P2.4 – Introduce composite capture function**  
  - Replace `captureChart()` with an async `captureCompositeChart()` that:  
    - Resolves the correct DOM root for the entire chart stack.  
    - Uses the chosen approach (html2canvas or stitched `takeScreenshot()` outputs).  
    - Returns a single `dataUrl` representing the composite image.

- [x] **P2.5 – Update screenshot consumers**  
  - Modify `handleOpenScreenshot` to call `captureCompositeChart()`.  
  - Ensure `handleAskAi` uses the same composite capture so AI sees all panels and price values.

- [x] **P2.6 – Error handling & user messaging**  
  - Replace generic alerts where appropriate with UX-consistent notifications if available.  
  - Provide clear messages when capture fails (e.g., “Chart region not available for screenshot”).

### 2.3 Test Points – Composite Screenshot

- [x] **T2.1 – Visual coverage**  
  - Capture a screenshot with 2–3 oscillators enabled.  
  - Confirm the resulting image contains:  
    - Full main candlestick pane.  
    - Visible right-side price scale values.  
    - All oscillator panels.

- [x] **T2.2 – AI flow compatibility**  
  - Trigger `Ask AI` and verify the image passed to the backend matches the composite capture.  
  - Confirm the backend receives and stores a single coherent image.

- [x] **T2.3 – Layout variability**  
  - Test with zero oscillators (main chart only).  
  - Test with multiple oscillators and different heights (using the resize handle).  
  - Ensure capture always includes the full visible chart area.

- [x] **T2.4 – Performance & reliability**  
  - Capture multiple screenshots sequentially.  
  - Ensure no memory leaks, hanging promises, or degraded UI responsiveness.

---

## Phase 3 – Drawing Object Cursor Alignment (Investigation & Fix)

**Goal:** Ensure drawing objects (horizontal lines, zones, labels, etc.) align precisely with the cursor and chart coordinates across main and oscillator panes.

**2026-01-10 implementation note:** For this tag, the implemented scope focuses on the screenshot annotation modal used by the indicators workflows. Cursor-to-canvas mapping and text sizing have been corrected there so annotation objects track the cursor accurately in saved screenshots.

### 3.1 Investigation

- [ ] **P3.1 – Map drawing tool implementation**  
  - Locate where drawing objects are created, stored, and rendered (canvas overlay vs separate DOM layer).  
  - Identify how cursor positions are converted into chart coordinates (time/price).

- [ ] **P3.2 – Analyze coordinate transforms**  
  - Document the full pipeline from mouse event:  
    - Browser event (`clientX`, `clientY`) → chart-relative coordinates.  
    - Chart-relative → time/price via `timeScale().coordinateToTime` and `priceScale().coordinateToPrice`.  
  - Compare this with how drawing object anchors are calculated and stored.

- [ ] **P3.3 – Identify misalignment patterns**  
  - Reproduce misalignment cases reported by the user (e.g., offset in X or Y directions, shifts at different zoom levels).  
  - Determine whether the problem is constant offset, scale mismatch, or inconsistent transforms between panes.

### 3.2 Fix Design & Implementation

- [ ] **P3.4 – Normalize coordinate handling**  
  - Centralize cursor-to-chart coordinate calculations in a single utility or hook.  
  - Ensure both drawing creation and rendering use the same mapping logic.

- [ ] **P3.5 – Pane- and scale-aware drawing placement**  
  - For main chart drawings, always use the main chart’s price/time scales.  
  - For oscillator drawings (if supported), bind to the correct oscillator chart instance and its scale.

- [ ] **P3.6 – Regression-safe implementation**  
  - Avoid changing existing public contracts or store structures without explicit approval.  
  - Prefer additive changes or internal refactors that keep behavior backwards-compatible.

### 3.3 Test Points – Drawing Alignment

- [ ] **T3.1 – Single-pane drawing accuracy**  
  - Place horizontal lines at visually obvious price levels (e.g., round numbers).  
  - Confirm the line remains aligned regardless of zoom and scroll changes.

- [ ] **T3.2 – Multi-pane behavior (if applicable)**  
  - If drawing tools are available on oscillators, verify alignment in those panes too.  
  - Confirm no cross-contamination between main and oscillator coordinates.

- [ ] **T3.3 – Cursor-follow interactions**  
  - During drawing creation (click-and-drag), ensure the preview object follows the cursor exactly.  
  - Test at varying window sizes and DPI/zoom settings.

- [ ] **T3.4 – Persisted object consistency**  
  - Save and reload a chart with multiple drawings.  
  - Confirm objects reappear at the correct visual positions.

---

## Phase 4 – QA, Regression, and Knowledgebase Alignment

**Goal:** Validate that the implemented changes are stable, aligned with CORE_PRINCIPLES, and fully integrated into the indicators knowledgebase context.

### 4.1 Manual & Automated QA

- [ ] **P4.1 – Add lightweight unit/integration tests where feasible**  
  - For sync logic, extract pure helper functions (e.g., time → value lookup for oscillators) and add tests.  
  - For screenshot logic, consider snapshot tests or visual regression hooks if the infrastructure exists.

- [ ] **P4.2 – Run existing frontend test suite**  
  - Execute the project’s standard lint, typecheck, and test commands.  
  - Confirm no regressions are introduced.

- [ ] **P4.3 – Browser and viewport sanity checks**  
  - Verify behavior in supported browsers (Chrome-based baseline).  
  - Check at multiple viewport sizes relevant to QuFLX usage.

### 4.2 Knowledgebase & Documentation Hooks

- [x] **P4.4 – Update assessment report with findings and recommendations**  
  - Section 11 and 12 of `report_indicators_knowledgebase_ready_26-01-10.md` already capture the gap analysis and recommended frontend plan.

- [ ] **P4.5 – Link implementation back to indicators knowledgebase**  
  - Ensure the indicators knowledgebase references this implementation plan for frontend chart/indicator behavior.  
  - Highlight how crosshair sync and composite screenshot support AI-driven analysis workflows.

### 4.3 Sign-off

- [ ] **P4.6 – CORE_PRINCIPLES compliance review**  
  - Validate that new code respects:  
    - Functional Simplicity (no unnecessary complexity).  
    - Sequential Logic (clear effect chains and cleanup).  
    - Incremental Testing (tests after each change).  
    - Zero Assumptions and Fail Fast (defensive checks, explicit error handling).  
  - Record any deviations and required follow-up actions.

- [ ] **P4.7 – Final indicators knowledgebase readiness check**  
  - Confirm that, together with backend indicator fixes, the frontend now supports:  
    - Accurate visual alignment between price and oscillators.  
    - High-fidelity chart imagery for AI analysis, including price scales.  
    - Usable, predictable drawing tools for annotation and scenario capture.

---

## Phase 5 – Streaming Indicators & AI Alignment

**Goal:** Align indicator behavior, UI exposure, and AI context with the knowledgebase so that live trading views and AI assistance see the same, strategy-ready signal set.

### 5.1 Streaming Indicator Behavior (Frontend & Store)

- [ ] **P5.1 – Document current historical-only indicator behavior**  
  - Capture that `loadIndicators()` in `marketStore.js` depends on `historyCandles` and does not yet refresh on streaming ticks.  
  - Reference the assessment in `report_indicators_knowledgebase_ready_26-01-10.md`.

- [ ] **P5.2 – Design incremental streaming refresh model**  
  - Decide whether indicators should be recomputed on every tick, on a cadence, or on candle-close boundaries.  
  - Ensure the design respects CORE_PRINCIPLES (simplicity, fail-fast, no feedback-loop hazards).

- [ ] **P5.3 – Implement and wire indicator refresh triggers**  
  - Extend the Dashboard store/hooks so oscillator series can update in response to streaming data without blocking the UI.  
  - Keep the API contract with `/api/v1/indicators` explicit and backwards-compatible.

### 5.2 Backend Indicator Fixes (ADX & CCI Dependencies)

- [ ] **P5.4 – Track backend ADX implementation and CCI fix**  
  - Ensure `backend/services/strategy/indicators.py` implements ADX with KB parameters and applies the vectorized CCI fix from `v2_Dev_Docs/FIX_CCI_TASK.txt`.  
  - Update this plan once backend work is complete so frontend assumptions stay accurate.

### 5.3 Dashboard Indicator Exposure (UI)

- [ ] **P5.5 – Expose additional knowledgebase indicators in Dashboard**  
  - Extend `ChartWorkspace.jsx` / related components so the indicator selector can enable KB-critical indicators (e.g., ADX, ATR, Stochastic, Supertrend overlays) alongside existing oscillators.  
  - Keep the options in sync with the backend indicator set and knowledgebase tables.

### 5.4 AI Context Extension

- [x] **P5.6 – Enrich Ask AI context with structured indicator data**  
  - Extend `handleAskAi` so the `context` payload includes recent indicator snapshots (e.g., last N RSI, MACD histogram, CCI values) in addition to the composite screenshot.  
  - Ensure payload shape is documented and consistent with backend AI expectations.


## Phase Overview – High-Level Checklist

- [x] **Phase 0 – Assessment & Constraints**  
  - Current state, limitations, and decision log captured.

- [x] **Phase 1 – Crosshair Sync (Main → Oscillators)**  
  - Implement and test `subscribeCrosshairMove`-based sync.

- [x] **Phase 2 – Composite Screenshot with Price Scale**  
  - Replace single-canvas capture with composite chart + oscillators image.

- [x] **Phase 3 – Drawing Object Cursor Alignment**  
  - Investigate and fix coordinate mapping issues (for this tag, focused on screenshot annotation tools).

- [ ] **Phase 4 – QA, Regression, Knowledgebase Alignment**  
  - Tests, compliance review, and final sign-off.

