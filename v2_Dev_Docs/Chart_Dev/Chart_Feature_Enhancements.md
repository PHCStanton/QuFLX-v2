# Chart_Feature_Enhancements.md
**QuFLX v2 – Lightweight Charts Priority Upgrades**  
**Last Updated:** January 27, 2026  
**Objective:** Elevate chart readability, decision support, and visual journaling without adding complexity or clutter.

## Status Legend
- [x] Done  
- [~] In Progress  
- [ ] Not Started

## Priority 1 – Highest Daily UX Impact (Implement First)

1. **Legend + Crosshair Tooltip (Price + All Indicators)**  
   - **Description:** Hover cursor shows exact OHLC + every indicator value at that point (RSI, ADX, EMA, BB upper/lower, etc.) in a floating tooltip.  
   - **Why:** Eliminates mental estimation; instant read for screenshots/AI/journaling.  
   - **Where:** `ChartContainer.jsx` – subscribe to `subscribeCrosshairMove` → position HTML tooltip  
   - **Effort:** 1–2 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/how_to/tooltips

2. **Series Markers for Signals, Entries & Events**  
   - **Description:** Place visual markers on chart for AI alerts, user entries, expiry times, “wait” zones, indicator crosses.  
   - **Why:** Built-in visual trade journal; review “why we entered here” at a glance.  
   - **Where:** `marketStore.js` + `useOverlayIndicators.js` → emit markers to chart series  
   - **Effort:** 1–2 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/how_to/series-markers

3. **Price Lines for Key Levels (S/R, OB/OS, Entry/Expiry)**  
   - **Description:** Horizontal lines on main chart for support/resistance, overbought/oversold bands, planned entry/expiry levels.  
   - **Why:** Consistent visualization across panes; explicit decision support.  
   - **Where:** `ChartContainer.jsx` – mirror pattern from `OscillatorChart.jsx` using `createPriceLine`  
   - **Effort:** 1 hour  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/how_to/price-lines

4. **Tick Volume / Activity Histogram Overlay**  
   - **Description:** Histogram showing tick count per candle (OTC volume proxy) – color green/red by candle direction.  
   - **Why:** Spots high-activity zones (your goal); better A+ filtering (avoid low-conviction moves).  
   - **Where:** `useTickAggregation.js` → count ticks per candle → add histogram series to chart  
   - **Effort:** 2–3 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/how_to/price-and-volume

5. **Range Switcher (30m / 2h / Session / Fit Content)**  
   - **Description:** Header buttons to jump between time ranges or fit all visible data.  
   - **Why:** Faster navigation between micro & context views; less zoom/scroll friction.  
   - **Where:** `ChartHeader.jsx` → buttons call `timeScale().setVisibleRange()` or `fitContent()`  
   - **Effort:** 1–2 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/demos/range-switcher

## Priority 2 – Medium Impact (Next Sprint)

6. **Infinite History Loading (Scroll Back → Load More)**  
   - **Description:** Auto-load older candles when scrolling left past loaded history.  
   - **Why:** No hard edges; seamless context when reviewing past setups.  
   - **Where:** `useTickAggregation.js` + `subscribeVisibleLogicalRangeChange` → load more on left threshold  
   - **Effort:** 2–4 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/demos/infinite-history

7. **Compare Mode / Correlation (Overlay Secondary Pair)**  
   - **Description:** Overlay a second symbol (e.g. compare EURUSD OTC vs GBPUSD OTC) on same chart.  
   - **Why:** Spot correlation or divergence; improves context on related pairs.  
   - **Where:** `useOverlayIndicators.js` → add secondary line series  
   - **Effort:** 3–5 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/demos/compare-multiple-series

## Priority 3 – Accessibility & Polish (Low Effort, High Value)

8. **Keyboard Navigation + ARIA Labels**  
   - **Description:** Arrow keys pan/zoom, tabIndex on chart container, ARIA roles/descriptions.  
   - **Why:** Faster power-user navigation; accessibility compliance.  
   - **Where:** `ChartContainer.jsx` → add key handlers + ARIA  
   - **Effort:** 1–2 hours  
   - **Status:** [ ] Not Started  
   - **Reference:** https://tradingview.github.io/lightweight-charts/tutorials/a11y/keyboard

## Recommended Next Steps (Execution Order)

1. **Start with #1 – Legend + Crosshair Tooltip**  
   → Highest daily UX win; makes chart instantly more readable  
   → Deliver first patch: tooltip component + integration in ChartContainer

2. **Follow with #2 – Series Markers**  
   → Instant visual journaling; pairs perfectly with Ask AI screenshots

3. **Then #3 – Price Lines & #4 – Tick Volume Histogram**  
   → Explicit levels + real activity proxy → core decision support

4. **Finish Priority 1 with #5 – Range Switcher**  
   → Navigation speed boost

5. **Later (after core 5)**: Infinite history, compare mode, keyboard/A11y

**Total estimated effort for Top 5:** ~6–10 hours (spread over 1–2 weeks)  
**Risk:** Very low — all additive, no breaking changes

Say **“Approve Top 5 Chart Enhancements – Start with Tooltip”** — I’ll deliver the first patch (tooltip + crosshair) ready to apply.

Or tell me your preferred starting point (e.g. markers first, volume histogram first).

Let’s make the chart a trader’s best friend — clear, fast, insightful. Ready when you are. 🚀