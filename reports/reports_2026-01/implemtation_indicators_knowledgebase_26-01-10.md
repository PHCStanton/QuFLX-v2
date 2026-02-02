# Indicators Knowledgebase – Frontend Implementation Report

**Date:** 2026-01-10  
**Tag:** 26-01-10  
**Branch:** `features/indicators_knowledebase`  
**Scope:** Frontend lightweight-charts work for indicators knowledgebase readiness

---

## 1. Summary

This report documents the frontend implementation work performed to align the QuFLX v2 Dashboard with the indicators knowledgebase requirements, specifically around chart/indicator visualization and AI screenshot capture.

The work follows the previously approved plan, with one extension:
- Main-chart-driven synchronization model, where the main price chart remains the hub for time and crosshair state.
- Crosshair sync from the main chart into all oscillator charts.
- Bidirectional crosshair interaction: moving the cursor inside an oscillator can also move the main chart crosshair to the same time.
- Composite screenshot capture that includes the main chart, all active oscillators, and the price scale.
- Minimal impact on existing architecture and clear separation of concerns.

Backend indicator fixes (ADX, CCI, etc.) are tracked separately in earlier reports and are not repeated here.

---

## 2. Crosshair Synchronization (Main ↔ Oscillators)

**Files:**
- `gui/Dashboard/src/components/OscillatorChart.jsx`
- `gui/Dashboard/src/components/ChartWorkspace.jsx`

### 2.1 Behavior

When the user moves the mouse over the main candlestick chart, each oscillator panel displays a crosshair aligned to the same time index. The main chart remains the hub for the visible time range and the canonical crosshair time.

When the user moves the mouse inside any oscillator panel, that oscillator reports the hovered time back to the main chart. The main chart crosshair then moves to that time and propagates the update back out to all oscillators, so both candle and indicator panes stay in sync regardless of where the interaction starts.

### 2.2 Key Implementation Points

- Each oscillator chart keeps its own chart and series instances created via `createChart`.
- Time scale sync (already present) is preserved: `mainChart.timeScale().subscribeVisibleTimeRangeChange` drives the oscillator `timeScale().setVisibleRange`.
- Main → Oscillators crosshair path:
  - `mainChart.subscribeCrosshairMove` is wired to each oscillator instance.
  - A dedicated ref (`dataRef`) mirrors the oscillator data array so the handler can look up an appropriate Y-value for a given time.
  - The handler exits early if references are missing, clears crosshairs when the main chart leaves the chart area, and falls back to the last known oscillator value when there is no direct time match.
  - It calls `chartRef.current.setCrosshairPosition(value, param.time, seriesRef.current)` to position the crosshair in the oscillator.
- Oscillators → Main crosshair path:
  - Each oscillator subscribes to its own `chart.subscribeCrosshairMove` and forwards the hovered `time` to `ChartWorkspace` via a callback.
  - `ChartWorkspace` compares the incoming time with the last applied main chart time to avoid redundant updates.
  - When the time changes, it calls `mainChart.setCrosshairPosition(defaultPrice, time, candleSeries)` so the main chart and all oscillators converge on the same crosshair time.
- Cleanup ensures both `unsubscribeVisibleTimeRangeChange` and `unsubscribeCrosshairMove` are called appropriately and that subscription refs are nulled when components unmount or when `mainChart` changes.

### 2.3 Side Effects and Constraints

- The main chart remains the only chart that directly controls the global time range; oscillators cannot change the visible range, only request a crosshair time.
- No changes were made to the main chart API surface or the global store; all sync logic remains encapsulated within `OscillatorChart`, `ChartWorkspace`, and the existing `mainChart` and callback props.
- The implementation assumes oscillator input data uses the same time domain as the main chart data (as per the indicators pipeline contract). If that ever changes, only the lookup logic needs to be adjusted.

---

## 3. Composite Screenshot Capture (Chart + Oscillators + Price Scale)

**Files:**
- `gui/Dashboard/package.json`
- `gui/Dashboard/src/components/ChartWorkspace.jsx`

### 3.1 Library and Layout Changes

- Added `html2canvas` as a dependency in the Dashboard package to support DOM-based screenshot capture.
- Restructured the layout so a single DOM root wraps both the main chart and oscillator panels:
  - The wrapper `div` with `id="quflx-chart-screenshot-root"` now encloses:
    - The main chart container.
    - The oscillator resize handle.
    - All oscillator chart panels.
- The inner chart container (`ChartContainer`) remains responsible only for initializing and sizing the main lightweight-charts instance; it no longer carries the screenshot root ID.

### 3.2 Capture Logic

- Replaced the previous one-canvas `captureChart()` function with an async `captureCompositeChart()` function that:
  - Locates `#quflx-chart-screenshot-root` in the DOM.
  - Uses `html2canvas(container, { backgroundColor: '#020617', useCORS: true, logging: false, scale: window.devicePixelRatio || 1 })` to render the visible UI region into an offscreen canvas.
  - Returns a PNG data URL via `canvas.toDataURL('image/png')`.
- Error handling:
  - On failure, logs an error to the console with `console.error('Composite chart capture failed:', err)`.
  - Returns `null` so callers can show a user-friendly message.

### 3.3 Integration Points

- **Screenshot Modal Trigger** (`handleOpenScreenshot`):
  - Now awaits `captureCompositeChart()` instead of reading a single `<canvas>` element.
  - If no data URL is returned, displays a simple alert indicating the chart is not available for screenshot.
  - On success, passes the composite image to `ScreenshotModal` as before.

- **Ask AI Flow** (`handleAskAi`):
  - Requests the same composite chart image via `captureCompositeChart()`.
  - Builds the context object as before from the store and recent ticks.
  - Sends `{ prompt, context, image }` to the `askAI` API, so AI now receives a full visual of the trading context (main chart, price scale, and oscillators).

### 3.4 Resulting Behavior

- The screenshot button and Ask AI feature both operate on a single, consistent composite image:
  - Main candlestick chart.
  - Y-axis price scale values.
  - All visible oscillator panels stacked below the main chart.
- The user experience remains the same (same buttons, same modal), but the underlying image is more complete and aligned with knowledgebase and AI requirements.

---

## 4. Testing & Verification

### 4.1 Manual Checks

- **Crosshair Sync:**
  - Verified that moving the mouse over the main chart shows synchronized crosshairs in all active oscillators.
  - Confirmed crosshair disappears in oscillators when the main chart crosshair leaves the chart.
  - Confirmed no console errors during rapid mouse movement or when toggling oscillators on and off.

- **Composite Screenshot:**
  - Enabled multiple oscillators and captured a screenshot via the UI.
  - Confirmed that the resulting image contains the main candlestick pane, price scale values, and all oscillator panels.
  - Verified Ask AI sends the composite image instead of a partial main-chart-only view.

### 4.2 Linting

- Ran `npm run lint` in `gui/Dashboard`.
- Current status:
  - The new changes in `OscillatorChart.jsx` and `ChartWorkspace.jsx` do not introduce additional lint errors.
  - The lint command still fails due to pre-existing issues in other components (e.g., unused React imports, unused variables, unescaped quotes in `AnimatedLogo.jsx`, `AssetPanel.jsx`, `KnowledgeBase.jsx`, `NeomorphicSwitch.jsx`, `SettingsPanel.jsx`).
- These lint issues are unrelated to the indicators work and can be addressed in a focused cleanup pass.

---

## 5. Outstanding Items

The following tasks remain open relative to the full indicators knowledgebase plan:

- **Drawing Object Cursor Alignment (Main Chart Tooling):**
  - Full investigation and fixes for in-chart drawing tools (horizontal lines, zones, labels) alignment against the cursor are still pending.
  - This work will primarily affect coordinate mapping between browser events and chart/indicator coordinate space.

- **Drawing Object Cursor Alignment (Screenshot Annotation Modal):**
  - For this tag (26-01-10), the screenshot annotation modal has been updated so drawn objects align with the cursor and annotation text is more readable.
  - The fix relies on proper canvas coordinate scaling in `ScreenshotModal` and an increased text size for annotations.

- **Lint Cleanup:**
  - Existing lint errors in unrelated UI components should be resolved to restore a fully green `npm run lint` baseline on `features/indicators_knowledebase`.

These will be documented in follow-up implementation notes once the remaining chart drawing alignment work and lint cleanup are completed.

---

## 6. High-Level Outcome

- The chart and indicator synchronization behavior now matches the minimal enhancement option agreed in the indicators knowledgebase plan.
- AI and screenshot workflows operate on a more complete, visually aligned representation of the trading context.
- Changes are localized to chart-related components and do not alter the broader application structure or backend contracts.
