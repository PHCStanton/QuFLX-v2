# Research Paper – TradingView Lightweight Charts Indicators Integration – 2025-12-23

## 1. Executive Summary

This paper describes how to integrate technical indicators (moving averages, oscillators, etc.) into TradingView’s `lightweight-charts` with a focus on QuFLX v2’s live streaming Dashboard.
It covers the official indicator examples, real-time data handling, overlay vs oscillator layouts, pane sizing, and how to keep indicators locked to the visible chart timeframe.
The goal is to provide a practical, opinionated blueprint so future implementation can be simple, robust, and aesthetically consistent.

## 2. Core Concepts & Mental Model

### 2.1 Series, Data, and Indicators

- `lightweight-charts` is fundamentally a **time-series renderer**.
- A chart contains **one or more series** (candlestick, line, area, histogram, etc.).
- An **indicator** is conceptually just **derived data** plotted on its own series, computed from a source series (typically price candles).
- There is no special “indicator engine” in the library; indicators are implemented through:
  - **Helper primitives** that listen to data changes and manage a derived series, or
  - **Manual calculation functions** that take an array of data and return indicator points.

### 2.2 Two Official Indicator Approaches

From the official indicator tutorials and examples:
- **Helper function (recommended):**
  - Each example provides an `apply…Indicator` helper (e.g., `applyMovingAverageIndicator`).
  - You pass the **source series API object** (not raw data) and options.
  - The helper:
    - Creates the indicator series on the same chart.
    - Performs initial calculation from the series data.
    - Subscribes to data changes and updates the indicator automatically when the source series updates.
  - Internally this uses a `ISeriesPrimitive` attached to the source series.
- **Direct calculation function:**
  - Each example also provides `calculate…IndicatorValues` (e.g., `calculateMovingAverageIndicatorValues`).
  - Pure function: takes your series data and options → returns indicator data array.
  - You are responsible for when/how often to call it and how to update the indicator series.

For QuFLX v2, the **helper approach** matches our live streaming model best because it:
- Minimizes manual wiring to tick streams.
- Reduces risk of mismatched lengths between price and indicator data.
- Keeps indicator updates localized and predictable.

### 2.3 Overlay vs Oscillator Indicators

- **Overlay indicators** (e.g., Moving Average, VWAP):
  - Plotted on the **same price pane** as the candlestick series.
  - Use a **line or area series** with `overlay: true` and the same price scale as the main series.
  - Do not need a separate axis.
- **Oscillator indicators** (e.g., RSI, Stochastic, MACD-style histograms):
  - Conceptually live in a **separate pane** with their own vertical scale.
  - In full TradingView charts you get multiple panes; `lightweight-charts` itself exposes only a single main pane per chart.
  - To mimic trading-terminal style layouts you typically:
    - Create **multiple charts stacked vertically**, or
    - Create one chart but reserve vertical space for a “sub-pane” using `priceScale` margins (less flexible and not ideal for true oscillators).

For QuFLX v2, oscillators should be treated as **a second chart instance** below the main candlestick chart, sharing the same time scale semantics.

### 2.4 Timeframe vs Visible Range

- `lightweight-charts` distinguishes between:
  - **Logical timeframe** of your data (M1, M5, M15, etc.) – your data source responsibility.
  - **Visible time range** (what portion of the data is currently on screen).
- Indicators must be consistent on two axes:
  - **Data timeframe:** indicator inputs must match the candle timeframe (e.g., 14-period RSI on M1 data).
  - **Visible window:** indicator series should render exactly over the currently visible section of the time scale.
- The library exposes APIs to subscribe to **visible range changes** and time scale interactions, which we can use to keep oscillators and overlays in sync.

## 3. Official Recommendations & Best Practices

### 3.1 Using Helper Functions for Live Streaming

The official indicator tutorial strongly recommends using the **helper pattern**:
- Example for an EMA overlay indicator:
  - Create chart and candlestick series:
    - `const chart = createChart(container)`
    - `const mainSeries = chart.addSeries(CandlestickSeries)`
    - `mainSeries.setData(initialData)`
  - Apply indicator via helper:
    - `const emaSeries = applyMovingAverageIndicator(mainSeries, { length: 10, source: 'close', smoothingLine: 'EMA' })`
  - Customize the EMA series appearance:
    - `emaSeries.applyOptions({ color: 'orange', lineWidth: 2 })`
  - Update only the **source series** in real time:
    - `mainSeries.update(nextBar)`
    - The helper’s internal primitive automatically recalculates and updates `emaSeries`.

Implications for QuFLX v2:
- We should wrap our existing **main price series** with one or more indicator helpers.
- Real-time updates stay focused on pushing new ticks/candles into the price series.
- Indicator helpers listen to data changes and remain fully synchronized without extra wiring.

### 3.2 Direct Calculation Pattern

- The official moving average example exposes `calculateMovingAverageIndicatorValues` to compute SMA/EMA values from a given dataset.
- Typical usage:
  - Get your full data array: `const candles = getCandles()`.
  - Call calculation function: `const smaData = calculateMovingAverageIndicatorValues(candles, options)`.
  - Feed result into a line series: `smaSeries.setData(smaData)`.
- In a streaming context, you would need to:
  - Re-run the calculation manually when new data arrives.
  - Or incrementally update the last value if the function supports it.

Implications:
- This approach is more suitable for **static or batch** datasets.
- For QuFLX’s continuous tick/candle feed, relying exclusively on direct calculation would add unnecessary complexity and duplication.

### 3.3 Price Scale & Visual Overlays

- Overlay indicators should:
  - Use the **same price scale** as the main candlestick series where possible.
  - Respect the chart’s autoscale behavior, avoiding manual min/max hacks.
- The library offers options such as:
  - `series.applyOptions({ priceScaleId: 'right', overlay: true })` for overlay series.
  - `chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })` to avoid crowding.

Best practice:
- Keep most overlay indicators on the **main right-side price scale**.
- Use color, line style, and width to differentiate indicators rather than separate scales.

### 3.4 Multi-Chart Layout for Oscillators

Because `lightweight-charts` does not natively support true multi-pane charts in a single instance:
- The common pattern for oscillators is to create **multiple chart instances** stacked vertically in the UI.
- You then:
  - Share the same **time scale range** conceptually by aligning their widths and subscribing to visible range changes.
  - Optionally synchronize crosshair moves between charts for better UX.

Best practice for QuFLX v2:
- Treat **main price chart** and **oscillator chart(s)** as **separate charts** that:
  - Share the same data timeframe and updates.
  - Keep their visible ranges in sync via `timeScale()` callbacks.
- This keeps rendering simple and prevents indicator logic from interfering with candlestick rendering.

### 3.5 Maintaining Rendering Performance

- Indicators should be **cheap to update**:
  - Avoid full recomputation on every tick when not needed.
  - Prefer incremental updates where the helper supports it.
- Limit the number of simultaneously visible indicators, especially with high-frequency data.
- Consider **debouncing** updates if QuFLX ever pushes extremely high-frequency ticks (e.g., microsecond-level streaming), although standard Pocket Option tick rates should be fine.

## 4. Gotchas / Common Pitfalls

### 4.1 Indicator vs Price Data Length Mismatch

Common issue:
- Price data and indicator data arrays end up with different lengths or misaligned timestamps.
- This leads to visual shifts, gaps, or indicators “starting” at unexpected points.

Avoidance strategies:
- Always base indicator calculations on the **same candle structure** as the main series.
- Use the official calculation helpers for moving averages and similar indicators.
- Let helper primitives handle alignment whenever possible – they compute the indicator from the series’ internal data array.

### 4.2 Rendering Interference with Candlesticks

Potential problems:
- Overly thick or opaque indicator lines can visually obscure candles.
- Incorrect z-order assumptions – but in `lightweight-charts`, all series are rendered according to internal rules; heavy use of overlapping series can reduce legibility.

Best practices:
- Use **subtle but visible** colors for overlays (e.g., semi-bright lines, not full-opaque blocks).
- Keep line widths moderate (typically 1–2px).
- Limit the number of overlay indicators to avoid clutter.

### 4.3 Oscillators in the Main Price Pane

While you can draw oscillator-style data in the main pane (e.g., histogram series with small `scaleMargins`), pitfalls include:
- Mixed scaling: price and oscillator values are not comparable, making autoscale behavior unintuitive.
- Visual confusion: users expect oscillators in distinct sub-panels.

Recommendation for QuFLX v2:
- Avoid cramming oscillators into the primary price pane.
- Use a dedicated chart instance below the main chart with its own y-axis.

### 4.4 Timeframe / Visible Range Desynchronization

Potential issues:
- Main chart and oscillator chart drift out of sync when users scroll or zoom.
- Indicators appear to “lag” because their visible window does not match the candles.

Mitigations:
- Subscribe to visible range changes on the **primary chart time scale** and apply corresponding actions to the oscillator charts.
- Enforce a single source of truth for timeframe selection (e.g., M1/M5 toggle in store) that updates all charts.

### 4.5 Resource Leaks from Indicator Primitives

- Each helper-based indicator attaches primitives and listeners to the source series.
- If you frequently create/destroy indicators without proper cleanup, you can accumulate listeners.

Mitigations:
- When removing an indicator, dispose of the series and associated primitive.
- Treat indicator lifecycles like component lifecycles in React: create in `useEffect` and clean up in the return function.

## 5. Performance & Security Considerations

### 5.1 Performance

- **Number of series:**
  - Each additional series (indicator) adds rendering work; keep the default view limited (e.g., 1–3 indicators max).
- **Update strategy:**
  - Use helper primitives that update only changed points when possible.
  - Avoid reconstructing whole data arrays per tick.
- **History length:**
  - Very long histories (tens of thousands of candles) plus multiple indicators can impact initial render time.
  - Consider limiting history window based on the operating timeframe (e.g., last N bars) for live views.
- **Animation & transitions:**
  - `lightweight-charts` focuses on static, high-performance rendering; avoid custom DOM overlays that animate on every tick over the chart region.

### 5.2 Security

- Indicator integration is mostly client-side visualization; primary concerns are:
  - Ensuring no user-provided formulas are executed as code.
  - Avoiding unbounded memory growth from uncleaned listeners or stored data.
- For QuFLX v2:
  - Indicators will be pre-defined (MA, maybe RSI, etc.), not user-supplied scripts.
  - No additional security surface is introduced beyond existing chart data streaming.

## 6. Version-Specific Notes

- The official indicator examples are tied to the current `lightweight-charts` major version of the TradingView repo.
- Key compatibility principles:
  - Rely on public APIs (`createChart`, `addSeries`, `ISeriesApi`, `ISeriesPrimitive`, `timeScale`) rather than internal types.
  - Copy indicator example files directly into the project rather than referencing the GitHub repo at runtime.
  - If upgrading `lightweight-charts`, re-run a quick check on the indicator example repo to confirm APIs used by helpers are unchanged.

Practical recommendation:
- **Lock `lightweight-charts` version** in `package.json` while implementing indicators.
- Once stable, upgrades should be deliberate and tested with the indicator suite.

## 7. Code Patterns & Examples

> NOTE: These patterns are conceptual and should be adapted to QuFLX’s existing React + Zustand + streaming architecture. They are intentionally implementation-agnostic but grounded in the official examples.

### 7.1 Basic Moving Average Overlay with Helper

- **Goal:** Add an EMA overlay that updates automatically with the candlestick series.
- **Pattern:**

```ts
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { applyMovingAverageIndicator } from './indicators/moving-average/moving-average';

const chart = createChart(containerElement);
const mainSeries = chart.addSeries(CandlestickSeries);

// Initial data
mainSeries.setData(initialCandles);

// Attach indicator helper
const emaSeries = applyMovingAverageIndicator(mainSeries, {
  length: 10,
  source: 'close',
  smoothingLine: 'EMA',
});

// Style the EMA line
emaSeries.applyOptions({
  color: 'orange',
  lineWidth: 2,
  lineStyle: LineStyle.Dotted,
});

// Live updates – only touch mainSeries
function onNewCandle(bar) {
  mainSeries.update(bar);
}
```

Key point: only `mainSeries` receives updates; the EMA series is owned by the helper.

### 7.2 Multiple Overlays Without Interference

- **Goal:** Add multiple moving averages without cluttering candles.
- **Pattern:**

```ts
const fastEma = applyMovingAverageIndicator(mainSeries, {
  length: 9,
  source: 'close',
  smoothingLine: 'EMA',
});

fastEma.applyOptions({ color: '#4ade80', lineWidth: 1 });

const slowEma = applyMovingAverageIndicator(mainSeries, {
  length: 21,
  source: 'close',
  smoothingLine: 'EMA',
});

slowEma.applyOptions({ color: '#f97316', lineWidth: 1 });
```

Best practices embedded here:
- Thin lines, distinct colors.
- No separate price scales; both share the main chart price scale.

### 7.3 Oscillator in Separate Chart with Shared Time Scale

- **Goal:** Show an oscillator (e.g., custom RSI) below the main chart, syncing visible range.
- **Pattern:**

```ts
import { createChart, LineSeries } from 'lightweight-charts';

const mainChart = createChart(mainContainer, { height: 300 });
const oscChart = createChart(oscContainer, { height: 120 });

const candleSeries = mainChart.addCandlestickSeries();
const oscSeries = oscChart.addSeries(LineSeries);

candleSeries.setData(candles);
oscSeries.setData(rsiData);

// Sync visible time range from mainChart to oscChart
mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
  if (!range) return;
  oscChart.timeScale().setVisibleRange(range);
});

// Optionally, sync crosshair moves as well (for better UX)
mainChart.subscribeCrosshairMove((param) => {
  oscChart.setCrosshairPosition(param.time, null, oscSeries);
});
```

Key point: oscillators live in a **separate chart instance**, but visible range is kept in lockstep.

### 7.4 Locking Indicators to Chart Timeframe

- **Goal:** Ensure indicators always reflect the active timeframe (M1/M5/etc.) and visible range.
- **Pattern:**

```ts
// Pseudocode – integrate with existing store
const timeframe = getActiveTimeframe(); // e.g., 'M1', 'M5'
const candles = await fetchCandles(symbol, timeframe);

candleSeries.setData(candles);
emaHelper.recalculate({ length: 10, source: 'close' });

// When timeframe changes:
function onTimeframeChange(nextTimeframe) {
  const nextCandles = fetchCandles(symbol, nextTimeframe);
  candleSeries.setData(nextCandles);
  // Indicator helper recomputes from new series data automatically
}
```

Core rules:
- The **store** owns timeframe state; charts and indicators react to it.
- Indicators never mix data from different timeframes on the same chart instance.

### 7.5 Adjustable Oscillator Pane Height

- **Goal:** Allow users to resize the oscillator area vertically without affecting indicator logic.
- **Pattern (UI-level):**

```tsx
// High-level React pattern (conceptual)
const [oscHeight, setOscHeight] = useState(120);

return (
  <div className="flex flex-col h-full">
    <div className="flex-1 min-h-[200px]" ref={mainChartRef} />
    <div
      className="h-2 cursor-row-resize bg-gray-800"
      onMouseDown={startDrag}
    />
    <div style={{ height: oscHeight }} ref={oscChartRef} />
  </div>
);
```

Key idea: **layout & resizing live entirely in React CSS/layout**, while `lightweight-charts` simply renders into the provided containers.

## 8. Further Reading

- Official Lightweight Charts site:
  - https://www.tradingview.com/lightweight-charts/
- Official indicator tutorials and examples:
  - https://tradingview.github.io/lightweight-charts/tutorials/analysis-indicators
- Moving Average indicator example source:
  - https://github.com/tradingview/lightweight-charts/tree/master/indicator-examples/src/indicators/moving-average
- General discussion and recipes (GitHub issues and examples directory):
  - https://github.com/tradingview/lightweight-charts/issues
  - https://github.com/tradingview/lightweight-charts/tree/master/indicator-examples

## 9. Glossary

- **Overlay indicator:** Indicator drawn on the same pane and price scale as the main price series (e.g., MA, VWAP).
- **Oscillator:** Indicator whose values oscillate within a bounded or semi-bounded range and are usually displayed in their own pane (e.g., RSI, MACD, Stochastic).
- **Helper function:** Convenience function (e.g., `applyMovingAverageIndicator`) that attaches a primitive to a source series to manage indicator calculations and updates automatically.
- **ISeriesPrimitive:** Lightweight Charts primitive that can subscribe to series updates, recalculate, and update derived series.
- **Timeframe:** Logical aggregation period of candles (M1, M5, etc.), controlled by data source.
- **Visible time range:** Portion of the full data currently visible on the chart, controlled by zoom/scroll.
- **Pane:** Visual region of a chart; in `lightweight-charts` you typically simulate multiple panes with multiple chart instances.

## 10. Backend ↔ Frontend Indicator Integration Plan

### 10.1 Existing Backend Indicator Infrastructure

The project already has a mature indicator stack on the backend:

- Legacy V1 reference (archived docs):
  - `v2_Dev_Docs/V1_reference/strategies/technical_indicators.py` – a comprehensive `TechnicalIndicatorsPipeline` that computes ~20+ indicators (trend, momentum, volatility, bands, patterns) for 1-minute OTC pairs using pandas, `pandas_ta`, and TA-Lib.
  - `v2_Dev_Docs/V1_reference/strategies/indicator_adapter.py` – an `IndicatorAdapter` that:
    - Accepts raw candles in `[timestamp, open, close, high, low]` format.
    - Converts them to a DataFrame.
    - Configures a fresh `TechnicalIndicatorsPipeline` per indicator instance.
    - Returns a structured result `{ asset, timeframe_minutes, indicators, series, signals, timestamp }` where:
      - `indicators[instance]` contains the latest indicator value + params.
      - `series[instance]` is `{ time, value }` suitable for chart plotting.
      - `signals[instance]` exposes BUY/SELL/NEUTRAL decisions for some indicators.
- Current v2 backend (live code):
  - `backend/services/strategy/indicators.py` – a streamlined `TechnicalIndicatorsPipeline` + `IndicatorSet` for production strategy use.
    - Exposes the same family of indicators (SMA/EMA/WMA, RSI, Stochastic, Williams %R, ROC, MACD, Bollinger, ATR, Supertrend, Schaff Trend Cycle, DeMarker, CCI).
    - Designed to run on streaming candle data on the server side.
    - Provides a clean `IndicatorSet` dataclass per candle for decision-making.

Conclusion: **Backend already knows how to compute indicators and how to adapt them into `{time, value}` series that are chart-friendly.** We do not need to reinvent indicator calculations on the frontend.

### 10.2 Division of Responsibilities

To keep the system simple, robust, and efficient:

- **Backend responsibilities:**
  - Own the **canonical indicator calculations** used for trading logic and signals.
  - Maintain one or more `TechnicalIndicatorsPipeline` instances inside the strategy service as it already does (`backend/services/strategy/indicators.py`).
  - Optionally expose:
    - Per-candle `IndicatorSet` snapshots for diagnostics/logging.
    - Aggregated `{ time, value }` series for selected indicators via an adapter similar to `IndicatorAdapter` when we want to mirror strategy indicators on the chart.
  - Decide which indicators are “strategy-critical” vs “visual-only”.

- **Frontend responsibilities:**
  - Focus on **visualization and interactivity**:
    - Render overlay indicators (MAs, etc.) using `lightweight-charts` helpers for smooth UX and low latency.
    - Render oscillator panes (RSI, Stoch, etc.) using separate chart instances locked to the main time scale.
  - Stay thin in terms of math:
    - Prefer consuming indicator time series from the backend **when we need to display exactly what the strategy uses** (to avoid duplicated formulas and subtle drift).
    - Use helper-based indicators only for generic visual aids that don’t need perfect parity with backend strategy calculations.

This split means: **backend is the source of truth for strategy signals**, while the frontend may have a small subset of indicators computed locally for UX, as long as we are explicit about which is which.

### 10.3 Data Contract Between Backend and Frontend

When we want to show backend indicators on the chart (for example, “show me the same RSI the strategy sees”):

- Use a JSON structure modeled on the V1 `IndicatorAdapter` output:

```jsonc
{
  "asset": "AUDNZD_OTC",
  "timeframe_minutes": 1,
  "data_points": 300,
  "latest_timestamp": 1734900000,
  "latest_price": 1.2345,
  "indicators": {
    "RSI-14": { "value": 63.2, "type": "rsi", "period": 14 }
  },
  "series": {
    "RSI-14": [
      { "time": 1734898500, "value": 45.0 },
      { "time": 1734898560, "value": 47.2 },
      // ...
      { "time": 1734900000, "value": 63.2 }
    ]
  },
  "signals": {
    "RSI-14": "NEUTRAL"
  },
  "timestamp": "2025-12-23T12:34:56.000000"
}
```

- Frontend mapping:
  - The Dashboard receives this payload over REST or Socket.IO.
  - For each `series[instanceName]` array, we can map directly to a `LineSeries` on either the overlay chart or an oscillator chart.
  - For overlay indicators, the time series plugs directly into a `lightweight-charts` series: `series.setData(payload.series['SMA-20'])` with `{ time, value }` pairs.
  - For oscillators, we set data on the secondary chart instance, keeping visible range in sync with the main chart as described earlier.

Key benefit: **we reuse the backend’s proven pandas-based indicator math while still leveraging lightweight-charts’ rendering helpers and layout capabilities.**

### 10.4 Strategy vs Visual-Only Indicator Modes

There are two complementary modes for indicators on the chart:

1. **Strategy-linked indicators (backend-driven):**
   - Data source: backend `TechnicalIndicatorsPipeline` + adapter.
   - Use when the user wants to see exactly what the strategy uses to make decisions.
   - Display both:
     - The line(s) (RSI, MACD, etc.), and
     - Any signals (BUY/SELL/NEUTRAL) surfaced by `_generate_signal` / `_generate_stochastic_signal` in `indicator_adapter.py`.
   - Locked to the strategy’s timeframe and candle set.

2. **Visual-only helpers (frontend-driven):**
   - Data source: main candlestick series + `apply…Indicator` helper from `lightweight-charts` examples.
   - Use for user-driven overlays that don’t have to match backend exactly (e.g., user adds a 9/21 EMA band just for visual context).
   - Still locked to the current chart timeframe, but **not** guaranteed to match backend rounding, data window, or exact formula.

We can expose this distinction explicitly in the UI (e.g., “Strategy Indicators” vs “Custom Overlays”).

### 10.5 Efficiency Considerations

- Backend computation:
  - Indicators are already being computed for strategy purposes in `backend/services/strategy/indicators.py`; exposing them to the frontend is mostly about **formatting & transport**, not extra heavy computation.
  - For additional indicator series not used by the strategy, we can selectively enable them to avoid waste.

- Frontend computation:
  - For visual-only helpers, the math is light (simple moving averages, basic transforms) and done on a small, visible window.
  - Using helper primitives avoids manual recomputation and minimizes CPU usage in the browser.

- Network:
  - We should avoid streaming every indicator tick for every possible indicator.
  - Instead, send only:
    - The subset the user has enabled.
    - Either incremental updates (last point) or small rolling windows, depending on our existing Socket.IO/event design.

### 10.6 Locking Backend and Frontend to the Same Timeframe

To avoid subtle discrepancies:

- The store should treat **timeframe** as a shared piece of state across:
  - Candle subscription.
  - Strategy pipelines.
  - Indicator adapters.
  - Frontend charts (main + oscillator).

- When timeframe changes (e.g., M1 → M5):
  - Backend:
    - Strategy pipelines switch to M5 candle streams.
    - Indicator adapters output M5-based indicators.
  - Frontend:
    - Main chart reloads M5 candles.
    - Indicator helper or backend-provided series use the same M5 timestamps.
    - Oscillator chart is resynced via `timeScale().setVisibleRange`.

Net result: **what you see on the chart is always computed from the same candle aggregation the strategy uses.**

### 10.7 Assessment of V1 Indicator Provisions

- The code in `v2_Dev_Docs/V1_reference/strategies/` is:
  - Architecturally sound as a reference.
  - Already aligned with QuFLX’s current backend implementation; much of it has effectively been ported into `backend/services/strategy/indicators.py`.
  - Particularly valuable for the **adapter pattern** that turns DataFrame columns into `{ time, value }` series and adds semantic signals.

- No structural changes are needed for the research perspective; instead, we:
  - Treat V1 as a **design reference** that validates our backend indicator approach.
  - Plan to mirror the successful parts (especially the adapter’s output format) when wiring backend indicators into the Dashboard charts.

In summary, the best, most efficient linkage is:
- **Backend:** canonical indicator calculations + optional adapter that exposes `{ time, value }` series and signals.
- **Frontend:** thin visualization layer that:
  - Renders backend indicator series for strategy-linked views.
  - Uses `lightweight-charts` helpers for extra visual-only overlays.
  - Keeps all charts and indicators locked to the active timeframe and visible range.
