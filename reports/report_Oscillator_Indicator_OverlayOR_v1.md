# Oscillator Indicators – Overlays vs Separate Panes (v1 Context & v2 Direction)

**Date:** 2025-12-26  
**Prepared by:** Team (with @Investigator, @Debugger, @Optimizer, @Code_Simplifier, @Reviewer)  
**Scope:** Evaluate using custom oscillator overlays on the main price chart versus separate oscillator panes, in light of:
- `reports/report_indicators_v1.md` (v1 analysis)
- `v2_Dev_Docs/Oscillator_Indicators_Overlay.md` (overlay research notes)
- v2 Dashboard implementation (`gui/Dashboard`)
- CORE_PRINCIPLES and project_rules

The goal is to recommend the best direction forward for QuFLX v2’s oscillator indicators, balancing visual appeal, screen space, technical correctness, and implementation complexity.

---

## 1. Background & Context (v1 vs v2)

### 1.1 v1 Implementation Snapshot

From `report_indicators_v1.md`:

- v1 frontend (legacy): `gui/Data-Visualizer-React/…`.
- Characteristics:
  - Heavy use of custom hooks for indicators and data streams.
  - Indicators strongly coupled to Socket.IO lifecycle.
  - Multi-pane chart logic became complex (synchronizing panes, data modes, and indicators).
  - No robust adjustable pane height; UX and maintainability suffered.

The report concludes that v1 accumulated complexity and fragility, which triggered Rule #7 (“Stop Patching, Start Rewriting”) and motivated v2.

### 1.2 v2 Implementation Snapshot

From `report_indicators_v1.md` and recent code:

- v2 frontend: `v2/gui/Dashboard`.
- Key decisions:
  - Use Zustand store (`marketStore.js`) as a single source of truth for:
    - `activeIndicators`, `indicatorSeries`, `indicatorStatus`.
    - `historyCandles`, `historyStatus`.
    - WebSocket connection status.
  - Indicators are loaded via REST (`/api/v1/indicators`), decoupled from live tick streaming.
  - Historical candles + live ticks are unified in `useTickAggregation`.
  - Oscillators (RSI, MACD histogram, CCI, DeMarker) render in separate panes via `OscillatorChart` components.
  - Vertical resizing of oscillator region is implemented with a simple drag handle and bounded height.

v2 is already a clean rewrite that significantly improves structure, readability, and robustness compared to v1.

---

## 2. Two Approaches for Oscillators

This section defines the two alternatives for oscillator indicators in v2.

### 2.1 Approach A – Separate Oscillator Panes (Current v2)

**Concept:**

- Each oscillator (RSI, MACD histogram, CCI, DeMarker) is rendered in its own chart instance stacked below the main price chart.
- The oscillator chart’s time scale is synchronized with the main chart.
- Each pane has its own Y-axis and scaling appropriate to oscillator values.

**Implementation snapshot:**

- `ChartWorkspace.jsx`:
  - Filters `activeIndicators` by `kind === 'oscillator'`.
  - For each oscillator, selects data from `indicatorSeries[asset|timeframe][indicatorKey]`.
  - Renders a list of `OscillatorChart` components inside a vertically resizable region.

- `OscillatorChart.jsx`:
  - Creates a dedicated `lightweight-charts` instance.
  - Adds either `LineSeries` or `HistogramSeries` for the indicator.
  - Subscribes to main chart `timeScale().subscribeVisibleTimeRangeChange` to mirror the visible range.
  - Cleans up subscriptions and chart instance on unmount.

**Pros (Approach A):**

- Clear separation of scales:
  - Oscillators typically move in fixed or semi-fixed ranges (e.g. 0–100 for RSI, -100 to +100 for CCI, etc.).
  - Price exists in a completely different magnitude.
  - Separate panes avoid the “mixed scale” problem and preserve intuitive oscillator reading (overbought/oversold bands, midline, etc.).

- UX clarity for traders:
  - This is the layout most traders expect from professional platforms (TradingView, MT4/5, etc.) when looking at oscillators.
  - Overbought/oversold regions are easy to see without being compressed by price.

- Implementation matches existing research:
  - `Research/research_lightweight-charts-indicators_2025-12-23.md` explicitly recommends separate panes for oscillators to avoid autoscale and readability issues.
  - Timeframe and visible-range sync is well-defined and already implemented.

- Good separation of concerns:
  - Main price chart remains focused on price and overlays (MA, Bollinger, Supertrend, etc.).
  - Oscillator components stay small, self-contained, and reusable.

- Easy to extend:
  - Adding new oscillators is as simple as adding an indicator option and a corresponding series in the indicator response; no complex price-scale juggling is required.

**Cons (Approach A):**

- Screen space:
  - Oscillator panes consume vertical space, reducing the height of the main candle chart.
  - On small screens or with many oscillators enabled, this can feel crowded.

- Visual density:
  - Traders who like everything “in one pane” may perceive it as less visually compact compared to overlays.

### 2.2 Approach B – Oscillator Overlays on Main Price Chart

**Concept:**

- Plot oscillator values directly on the main price chart as overlay line/histogram series.
- Potentially use either:
  - A shared price scale (mapping oscillator values to the same scale as price), or
  - A separate overlay price scale (e.g. left/right) but still in the same visual pane.

**Reference:** `v2_Dev_Docs/Oscillator_Indicators_Overlay.md`

- Confirms it is possible in `lightweight-charts` to overlay custom oscillator-type indicators as line series on the main chart.
- Notes key considerations:
  - Must align timestamps with main series.
  - Need to manage price scales carefully (overlays may need their own scale or a shared overlay scale).

**External references (TradingView ecosystem):**

- Custom overlays like “MACD & RSI Overlay” in TradingView show both oscillators on the main chart for a compact view (e.g. [Zeiierman’s MACD & RSI Overlay (Expo), TradingView Script, 2024][1]).
- Blogs and docs note that overlays can keep charts cleaner, but oscillators are traditionally used in separate panels; overlays are often a specialized UX choice rather than the default.

**Pros (Approach B):**

- Space efficiency:
  - All information (price + oscillators) is in one pane, leaving more vertical space for price bars.
  - Especially attractive on smaller monitors or laptops.

- Visual integration:
  - Some traders like seeing oscillator transitions right on top of price, which can make certain patterns more obvious.

- Potentially fewer panes to manage:
  - Only one `lightweight-charts` instance; multiple series on that chart.
  - Slightly simpler DOM layout (one container for everything).

**Cons (Approach B):**

- Scale conflicts:
  - Price might be in the range of 1.0000–2.0000 or 100–200, while RSI/CCI sits between 0–100.
  - Putting them on the same scale can distort oscillators (they appear as flat lines) or distort price scale.
  - Using separate overlay scales (left/right) partially solves this but adds complexity.

- Implementation complexity in `lightweight-charts`:
  - Requires more careful configuration of `priceScaleId` and options for each series to ensure overlay alignment.
  - With multiple overlays and main price candles, autoscale behaviour becomes less predictable.

- Reduced clarity for classic oscillator signals:
  - Overbought/oversold zones, midlines, and oscillator regimes become visually blended with price, which can reduce readability compared to separate panes.

- Divergence from the v2 research blueprint:
  - The research paper and status reports consistently recommend separate oscillator panes as the primary pattern for QuFLX.
  - Using overlays would mean intentionally diverging from that design and requires careful justification.

---

## 3. Sync & Timeframe Considerations

Your question raised a critical point:

> “The indicators might sync better to the timeframe of the candles when having it directly as an overlay of the main chart. Or it would be easier to sync with less integration headaches.”

### 3.1 Current v2 Sync Model (Separate Panes)

- Timeframe:
  - `selectedTimeframe` in the store is the single source of truth.
  - Both `useTickAggregation` (candles) and `loadIndicators` use `selectedTimeframe`.
  - Backend indicator endpoint `/api/v1/indicators` derives a `timeframe_min` from the string and loads matching CSV data.

- Visible range:
  - Main chart uses `lightweight-charts` time scale.
  - `OscillatorChart` subscribes to `mainChart.timeScale().subscribeVisibleTimeRangeChange` and applies the same range to the oscillator chart.

In other words, sync is already logically correct: the same timeframe drives both candles and indicators, and the same visible time range is applied to all charts.

### 3.2 Would Overlays Sync “Better”?

- With overlays, visible-range sync becomes implicit:
  - All series (price + oscillator) are on the same chart and time scale → they always share the same visible range.
- However, this is only part of the story:
  - The more important sync dimension is **data timeframe** and **timestamp alignment**, which is already solved in v2’s separate-pane design.
  - Overlays don’t fundamentally improve timeframe or timestamp alignment; they mainly reduce the need for a second chart instance.

Conclusion: overlays are not inherently more correct in terms of timeframe sync. They change *how* sync is achieved (implicit vs explicit) but do not eliminate integration logic; they introduce scale management complexity instead.

---

## 4. Impact on Current Code Structure

### 4.1 How Overlays Would Fit into v2

To implement oscillator overlays on the main chart in v2, we would need to:

1. Extend `ChartContainer` (main price chart) to support additional overlay series for indicators.
2. Change `ChartWorkspace` so that, instead of rendering `OscillatorChart` components, it:
   - Registers oscillator indicators with `ChartContainer` as overlays.
   - Maps indicator keys to overlay series on the main chart.
3. Rework UI affordances:
   - The vertical resize handle for oscillators becomes irrelevant or would need to control something different.
   - Overbought/oversold levels (e.g. 30/70 for RSI) would need to be drawn as horizontal lines on the overlay scale.
4. Carefully manage price scales:
   - Decide whether overlays share the main price scale or use a dedicated overlay scale (e.g. left or right).
   - Ensure autoscale behaviour remains usable and doesn’t compress price or oscillator data.

This would be a non-trivial refactor with several moving parts in the charting components.

### 4.2 How Separate Panes Align With v2

- The current separate-pane implementation integrates cleanly with:
  - `indicatorSeries` keyed by `${asset}|${timeframe}`.
  - `OscillatorChart` components that are independent of the main chart’s series definitions.
  - The research recommendations for multi-pane layouts.

- Changes needed to further improve separate panes are incremental and low-risk:
  - Wire indicator parameters to the backend.
  - Key history by `asset|timeframe` for even stronger alignment.
  - Improve error messaging and UX around history/indicator loading.

From a code-integrity perspective, separate panes are the path of least resistance that still offers professional UX.

---

## 5. CORE_PRINCIPLES Alignment

Evaluating both approaches against `.agents/CORE_PRINCIPLES.md`:

### 5.1 Functional Simplicity

- Separate panes (A):
  - Simple mental model: one chart for price, one chart per oscillator with its own scale.
  - Implementation is modular and already written.

- Overlays (B):
  - Require additional cross-cutting configuration (scale IDs, overlay scales, series options) on the main chart.
  - Risk of complex autoscaling behaviour.

Result: Approach A (separate panes) is simpler to reason about and implement in the existing v2 structure.

### 5.2 Sequential Logic & Stop Patching, Start Rewriting

- v2 is already the “rewrite” that replaced v1’s complex multi-pane implementation.
- Switching to overlays now would be another structural shift, not an incremental improvement:
  - It would introduce a second, competing layout model.
  - It risks re-introducing complexity in `ChartContainer` and related components.

Result: For oscillators, continuing to refine the separate-pane model honours the rewrite that v2 already represents.

### 5.3 Separation of Concerns

- Separate panes:
  - Price visualization and oscillator visualization are clearly separated.
  - Backend indicator math stays independent of chart layout.

- Overlays:
  - Push oscillator concerns into the main chart component, increasing its responsibilities (price + overlays + potentially overlay scales + horizontal levels).

Result: separate panes maintain stricter separation of concerns.

### 5.4 Defensive & Explicit Error Handling

- Separate panes make it easier to:
  - Show indicator-specific loading states.
  - Display per-indicator errors (e.g. overlay text in each pane) without cluttering the main chart.

With overlays, errors related to oscillator series might be less obvious to place and could clutter the main price area.

---

## 6. Recommendation

After considering v1 context, v2’s current design, external overlay references, and CORE_PRINCIPLES, the recommended direction is:

> **Keep oscillator indicators in separate panes (Approach A) for v2, and do not switch them to overlays on the main chart.**

Rationale:

1. **Simplicity & Maintainability**
   - Separate panes are already implemented in a clean, modular way and align with the research paper.
   - They minimize scale conflicts and keep responsibilities clear between components.

2. **UX Consistency with Professional Tools**
   - Most professional platforms present oscillators in dedicated panes.
   - Traders are used to seeing RSI/CCI/DeMarker below price, with clear overbought/oversold zones.

3. **Reduced Risk**
   - Overlay implementation would require non-trivial changes to chart configuration, scaling, and UX.
   - It could reintroduce complexity v2 was designed to remove.

4. **Future Flexibility**
   - Separate panes can still co-exist with optional overlay-style views later (for specific custom indicators) if needed.
   - We can add a *special* overlay-mode indicator for advanced users without changing the default architecture.

### 6.1 Practical Next Steps (If You Agree)

1. Continue refining the separate-pane implementation:
   - Key history by `asset|timeframe`.
   - Wire indicator parameters from the modal to backend indicator calculations.
   - Improve indicator error messaging and scoped error handling.

2. Treat overlays as an optional advanced feature:
   - Implement one example overlay indicator (e.g. “MACD+RSI Overlay”) as a **separate indicator type** later.
   - Keep it behind a clear label (e.g. “Overlay experimental”) and do not replace default oscillator panes.

This strikes a balance between your idea of more visually compact overlays and the project’s need for simplicity, reliability, and clean integration with existing v2 architecture.

---

## 7. Files Referenced

- [report_indicators_v1.md](file:///c:/QuFLX/v2/reports/report_indicators_v1.md)
- [Oscillator_Indicators_Overlay.md](file:///c:/QuFLX/v2/v2_Dev_Docs/Oscillator_Indicators_Overlay.md)
- [research_lightweight-charts-indicators_2025-12-23.md](file:///c:/QuFLX/v2/Research/research_lightweight-charts-indicators_2025-12-23.md)
- [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)
- [ChartWorkspace.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartWorkspace.jsx)
- [OscillatorChart.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/OscillatorChart.jsx)

[1]: https://www.tradingview.com/script/iOi1pXOX-MACD-RSI-Overlay-Expo/

