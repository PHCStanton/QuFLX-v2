# Support & Resistance Indicator — Optimization Plan

> **Legend:** `[x]` Done · `[~]` In Progress · `[ ]` Pending
> **Codebase targets:** `backend/services/strategy/indicators.py`, `regime_detector.py`, `useOverlayIndicators.js`, `ChartWorkspace.jsx`
> **Last updated:** 2026-03-05

---

## Phase 1 — Distance-to-Level Metrics *(Low Effort / Immediate Impact)*

**Goal:** Surface how far price is from the nearest S/R level so the AI context, regime detector, and frontend can make better filtering decisions.

- [x] **1.1** Add `dist_to_resistance` column to `_calculate_support_resistance()` in `indicators.py`
- [x] **1.2** Add `dist_to_support` column
- [x] **1.3** Add `dist_to_resistance` and `dist_to_support` to `IndicatorSet` dataclass
- [x] **1.4** Include distance values in `TradingContext` injected to xAI requests
- [x] **1.5** Update `regime_detector.py` — tighten or widen S/R proximity band dynamically (was hardcoded `0.001`, now uses `dist_to_*` with `0.15%` threshold)
- [x] **1.6** Expose `dist_to_resistance` and `dist_to_support` in the `technicals` dict
- [x] **1.7** Display distance values in the `RegimePanel` UI (▲ Res / ▼ Sup distance with colour-coded highlight when near)

✅ **Phase 1 — COMPLETE**

---

## Phase 2 — Touch Count / Level Strength Scoring *(Medium Effort / High Impact)*

**Goal:** Track how many times price has tested each S/R level without breaking it. More touches = stronger level.

- [x] **2.1** Define a `touch_band` as a fraction of `atr_14` (0.5 × ATR)
- [x] **2.2** Add `resistance_touch_count` column
- [x] **2.3** Add `support_touch_count` column
- [x] **2.4** Add touch count fields to `IndicatorSet`
- [x] **2.5** Feed touch count into `regime_detector.py` — weight reversal signals higher when `touch_count >= 3`
- [x] **2.6** Expose `touch_count` in the `technicals` dict
- [x] **2.7** Display level strength in `RegimePanel` (touch count + freshness badge)

✅ **Phase 2 — COMPLETE**

---

## Phase 3 — S/R Flip Detection *(Medium Effort / High Impact)*

**Goal:** Detect when a confirmed S/R level is broken and automatically promote the broken resistance to new support (or vice versa), enabling high-probability retest entries.

- [x] **3.1** Detect `resistance_broken` when `close > resistance_level` on a confirmed close
- [x] **3.2** Add `sr_flip` boolean column + `sr_flip_price`
- [x] **3.3** Add `sr_flip` fields to `IndicatorSet`
- [x] **3.4** `sr_flip` context exposed in `technicals` dict and `RegimePanel` (orange alert badge)
- [ ] **3.5** Update `otc_alert_dispatch.py` to include `sr_flip` in MarketScanner signal set
- [ ] **3.6** Frontend: Visually distinguish a flipped level (dashed vs solid line, different label)

⚠️ **Phase 3 — PARTIALLY COMPLETE** (backend done; items 3.5 & 3.6 still pending)

---

## Phase 4 — S/R Zones (Frontend Rendering) *(Medium Effort / Visual Clarity)*

**Goal:** Replace single step-lines with semi-transparent shaded zones that show the true width of each S/R area.

- [x] **4.1** `resistance_zone_upper/lower`, `support_zone_upper/lower` — captured from fractal candle bounds
- [x] **4.2** Forward-fill zone bounds alongside level prices
- [x] **4.3** Zone bound fields added to `IndicatorSet`
- [x] **4.4** Zone bound columns passed to frontend via existing `indicatorSeries` series key (no API change needed)
- [x] **4.5** `useOverlayIndicators.js` updated — 4 extra dotted `LineSeries` render the zone band edges (red for resistance zone, green for support zone)

✅ **Phase 4 — COMPLETE**

---

## Phase 5 — Level Freshness / Age Classification *(Low Effort / Builds on Phase 2)*

**Goal:** Color-code S/R levels by how "fresh" they are, adjusting visual weight and signal priority accordingly.

- [x] **5.1** `fresh` (0–1 touches) / `tested` (2–3) / `stale` (4+) classification columns added
- [x] **5.2** Computed vectorized per-level-group touch count, then mapped to tier
- [x] **5.3** `regime_detector.py` applies -10 pt penalty to confluence_score for `stale` levels
- [x] **5.4** Frontend line style: solid/2px for fresh, LargeDashed/2px for tested, Dashed/1px for stale
- [x] **5.5** `RegimePanel` displays freshness badges (green=fresh, yellow=tested, red=stale) next to touch count

✅ **Phase 5 — COMPLETE**

---

## Phase 6 — Multi-Timeframe S/R Confluence *(High Effort / Institutional-Grade)*

**Goal:** Overlay S/R levels from higher timeframes (15m, 1H) on the 5m chart. When a 5m level aligns with a higher-TF level, the zone has much greater institutional validity.

> ⏸️ **DEFERRED** — Requires multi-TF OHLC data (15m, 1H) to be available in Redis. Architecture dependency must be resolved before implementation begins.

- [ ] **6.1** Create a `calculate_mtf_sr(df_5m, df_15m, df_1h)` function in `indicators.py`
  - Restores `resample_to_grid()` approach to produce higher-TF DataFrames
  - Runs `_calculate_support_resistance()` on each TF independently
- [ ] **6.2** Define an MTF "confluence" condition: when `resistance_level_15m` is within `0.1%` of `resistance_level_5m`, flag as `mtf_confluence = True`
- [ ] **6.3** Add new columns: `resistance_15m`, `support_15m`, `resistance_1h`, `support_1h`, and `mtf_confluence`
- [ ] **6.4** Backend: Ensure Gateway's `/api/v1/indicators` endpoint supports fetching multi-TF data (may require 15m and 1H OHLC to be available in Redis or cached)
- [ ] **6.5** In `regime_detector.py` — boost `confluence_score` significantly (+15 pts) when `mtf_confluence = True`
- [ ] **6.6** Frontend: Render MTF levels with a distinct visual style:
  - Heavier line weight for 15m levels
  - Dotted line for 1H levels
  - Label with timeframe badge (e.g., `Res 15m`, `Res 1H`)
- [ ] **6.7** Alert Dispatcher: Add `mtf_confluence` as a weighted signal in `MarketScanner`'s confidence scoring

---

## Current Status Summary

| Phase | Title | Status |
|---|---|---|
| 1 | Distance-to-Level Metrics | ✅ Complete |
| 2 | Touch Count / Level Strength | ✅ Complete |
| 3 | S/R Flip Detection | ⚠️ Partial (3.5 & 3.6 pending) |
| 4 | S/R Zones (Frontend) | ✅ Complete |
| 5 | Level Freshness Classification | ✅ Complete |
| 6 | Multi-Timeframe Confluence | ⏸️ Deferred |

---

## Remaining Work (Next Session Priority)

### 🔴 High Priority
- **3.5** — `otc_alert_dispatch.py`: Add `sr_flip` as a weighted signal in `MarketScanner`'s signal set. When `sr_flip = True`, boost alert confidence score and include flip price in the Discord alert message.
- **3.6** — `useOverlayIndicators.js` / charting layer: Visually distinguish flipped levels — use a dashed line style with a different color (e.g., orange) and a `"Flipped"` label to differentiate from fresh S/R lines.

### 🟡 Deferred (Architecture Pre-requisite)
- **Phase 6** — Requires confirming 15m and 1H OHLC data is available from Redis before any implementation begins. Consider adding a `resample_to_grid()` caching layer in the Strategy Engine to prepare multi-TF data on ingestion.

---

## Notes

- All backend changes (`indicators.py`, `regime_detector.py`) can be implemented and tested independently of frontend changes.
- The Alert Dispatcher (`otc_alert_dispatch.py`) benefits automatically from any backend S/R improvements without code changes, as it already uses the unified `TechnicalIndicatorsPipeline`.
- Run `python -m pytest -q` after each backend phase to verify no regressions.
- After Phase 1–3 backend changes: restart the Strategy service and Gateway to pick up new indicator columns.
