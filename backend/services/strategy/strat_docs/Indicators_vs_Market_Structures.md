# Indicators vs Market Structures

## 1. Purpose and Scope

This document defines how QuFLX strategies should use technical indicators **in the context of specific market structures**, not in isolation.

Goals:
- Provide a shared vocabulary for market structure regimes.
- Map each regime to a **preferred indicator set** (core + optional confluence tools).
- Clarify which indicators we already compute in `backend/services/strategy/indicators.py` and which are candidates to add.
- Guide both backend signal logic and frontend visualization so they stay aligned.

The regimes covered:
1. Trending with Pullbacks
2. Strong Momentum Trending
3. Ranging / Sideways
4. Breakout Conditions
5. Trend Reversal

Throughout, indicator names match the fields and parameters used in the backend `TechnicalIndicatorsPipeline` wherever possible (e.g., `sma_20`, `rsi_14`, `macd_histogram`).

## 2. Market Structure Regimes

### 2.1 Trending with Pullbacks

Definition:
- Clear HH/HL structure (uptrend) or LH/LL (downtrend).
- Regular pullbacks that respect the dominant trend (no deep, violent reversals).
- Moderate momentum: candles are directional but not parabolic.

Primary use case:
- Bollinger-band and moving-average pullback entries **with the trend**.

### 2.2 Strong Momentum Trending

Definition:
- Price moves aggressively in one direction with **minimal pullbacks**.
- Candles often “walk” along a Bollinger Band.
- EMAs are cleanly stacked and steep.

Primary use case:
- Momentum continuation entries and late pullbacks with strict trend filters.

### 2.3 Ranging / Sideways

Definition:
- Price oscillates between well-defined support and resistance.
- No consistent HH/HL or LH/LL structure.
- Volatility typically contracts; ATR and Bollinger width are relatively low.

Primary use case:
- Mean reversion entries toward the range midpoint.

### 2.4 Breakout Conditions

Definition:
- Price breaks out of a range, consolidation, or key level (support/resistance, pivot, Donchian high/low).
- Volatility expands; candles close **beyond** previous boundaries.
- Follow-through is required to validate the break.

Primary use case:
- Breakout entries with volatility and momentum confirmation.

### 2.5 Trend Reversal

Definition:
- A prior uptrend transitions into a downtrend, or vice versa.
- Structural shift: HH/HL → LH/LL, or the reverse.
- Often coincides with breaks of key levels and shifts in oscillator and trend indicators.

Primary use case:
- Early entry into a new major swing, or confirmation that the old trend regime is no longer valid.

## 3. Indicator Inventory

This section lists indicators currently in our backend pipeline (v2) and recommended additions.

### 3.1 Existing Backend Indicators (v2 `TechnicalIndicatorsPipeline`)

**Trend / Overlay**
- `sma_20` – Simple Moving Average.
- `ema_16`, `ema_165` – Fast and slow EMAs.
- `wma_20` – Weighted Moving Average.
- `macd`, `macd_signal`, `macd_histogram` – MACD line, signal, histogram.
- `bb_upper`, `bb_middle`, `bb_lower`, `bb_width`, `bb_percent` – Bollinger Bands and derived stats.
- `supertrend`, `supertrend_direction` – Custom Supertrend implementation.

**Momentum / Oscillators**
- `rsi_14`, `rsi_21` – Relative Strength Index.
- `stoch_k`, `stoch_d` – Stochastic Oscillator.
- `williams_r` – Williams %R.
- `roc_10` – Rate of Change.
- `schaff_tc` – Schaff Trend Cycle.
- `demarker` – DeMarker indicator.
- `cci` – Commodity Channel Index.

**Volatility / Range**
- `true_range` – True Range per bar.
- `atr_14`, `atr_21` – Average True Range.

**Pattern / Levels (V1 reference)**
- `pivot_point`, `support_1`, `resistance_1` (V1 pipeline, not yet in v2 code).
- `doji`, `hammer`, `shooting_star`, `engulfing_bullish`, `engulfing_bearish` (V1 pattern flags).

### 3.2 Recommended Additions

These are not yet implemented in the v2 pipeline but are strong candidates for confluence and regime detection:

- `ADX / DMI` – Average Directional Index and directional movement.
  - Purpose: separate trending vs ranging regimes; confirm trend strength.
- `Keltner Channels`
  - Purpose: volatility-envelope based on ATR; used with Bollinger Bands to detect "squeezes".
- `Donchian Channels`
  - Purpose: breakout and range-boundary detection via N-period high/low.

These can be phased in as needed; the mappings below assume they eventually exist in the indicator set.

## 4. Regime → Indicator Mapping

This section defines, for each market structure, which indicators are **primary**, which are **secondary/confluence**, and how we intend to use them logically.

### 4.1 Trending with Pullbacks

**Objective:** Join the existing trend on controlled pullbacks, not chase extremes.

**Primary indicators**
- `sma_20`, `ema_16`, `ema_165`, `wma_20` (overlay)
  - Trend direction: MA stack and slope (uptrend vs downtrend).
  - Pullback zone: price retracing toward `sma_20` / fast EMA without breaking structure.
- `bb_upper`, `bb_middle`, `bb_lower` (overlay)
  - Pullback trigger: in an uptrend, price touching or briefly piercing the **lower band**; in downtrend, the upper band.

**Secondary / confluence indicators**
- `rsi_14`, `rsi_21` (oscillator)
  - Pullback quality: in a healthy uptrend, pullbacks often take RSI down to ~40–50 but not deep oversold.
  - Filter: reject setups when RSI collapses below typical pullback zones (likely regime change).
- `stoch_k`, `stoch_d`
  - Timing: pullback entries when Stoch leaves overbought/oversold **back into** trend direction.
- `cci`
  - Mean reversion within trend: CCI dipping below 0 or −100 then reclaiming positive territory in an uptrend.
- `supertrend`, `supertrend_direction`
  - Structural filter: only take pullbacks when Supertrend direction aligns with the trade direction and has **not flipped**.

**Implementation notes**
- Regime classification:
  - Trend structure + MA stack + positive ADX (once added) define the regime.
- Entry logic (conceptual):
  - Trend up, Supertrend up, ADX above threshold.
  - Price pulls back toward lower band / MA cluster.
  - RSI/Stoch indicate pullback, not deep reversal.

### 4.2 Strong Momentum Trending

**Objective:** Capture continuation in very strong trends where pullbacks are shallow or absent.

**Primary indicators**
- `ema_16`, `ema_165` + potential extra EMAs via frontend helper (overlay)
  - Strong trend: fast EMAs sharply angled, clean separation from slow EMAs.
- `bb_upper`, `bb_lower`, `bb_width` (overlay)
  - "Band walk": price hugging upper band in uptrend or lower band in downtrend.
  - Expanding `bb_width` indicates volatility expansion.
- `macd`, `macd_signal`, `macd_histogram` (oscillator)
  - Momentum: histogram strongly positive/negative and persistent.

**Secondary / confluence indicators**
- `roc_10`
  - Confirms rate-of-change remains elevated; avoid entries when ROC collapses.
- `schaff_tc`
  - Trend persistence: staying near higher/lower extremes.
- `atr_14`, `atr_21`
  - Volatility confirmation: ATR rising relative to recent history.
- `supertrend`
  - Direction filter: price stays on one side; flips signal potential end of momentum regime.
- `ADX` (when implemented)
  - High and rising ADX is a canonical signature for strong trends.

**Implementation notes**
- Regime classification:
  - Combine MA slope, MACD histogram, ATR, `bb_width`, and ADX.
- Entry logic (conceptual):
  - Avoid mean-reversion assumptions; expect shallow pullbacks only.
  - Favor break-pullback or simple continuation entries with small invalidation.

### 4.3 Ranging / Sideways

**Objective:** Trade mean reversion between range boundaries; avoid trend-following logic.

**Primary indicators**
- `bb_upper`, `bb_lower`, `bb_middle`, `bb_width`
  - Range detection: narrow `bb_width` + repeated reversions from upper/lower band toward middle.
  - Entry zones: upper band for short bias, lower band for long bias.
- `atr_14`, `atr_21`
  - Low and stable ATR supports range classification.

**Secondary / confluence indicators**
- `rsi_14`, `rsi_21`
  - Range extremes: oscillation between ~30 and ~70 around a central mean.
- `stoch_k`, `stoch_d`
  - Sensitive mean-reversion oscillator for tighter ranges.
- `williams_r`
  - Quick overbought/oversold reads in sideways markets.
- `cci`
  - Oscillation around zero, with ±100 as range extremes.
- `Keltner Channels` (when implemented)
  - Volatility envelope used with Bollinger for "squeeze" and range confirmation.
- `Donchian Channels` (when implemented)
  - Clear N-bar high/low acting as range boundaries.

**Implementation notes**
- Regime classification:
  - Low ATR, narrow `bb_width`, ADX below threshold, lack of HH/HL or LH/LL structure.
- Entry logic (conceptual):
  - Buy near lower range boundary when oscillators evolve from oversold back toward neutral.
  - Sell near upper range boundary with the reverse conditions.

### 4.4 Breakout Conditions

**Objective:** Enter when price escapes a range or significant level with real volatility and follow-through.

**Primary indicators**
- `bb_upper`, `bb_lower`, `bb_width`
  - Pre-break: narrow `bb_width` and squeezing bands.
  - Break: strong close outside a band plus expanding width.
- `atr_14`, `atr_21`
  - Volatility expansion confirming the break is meaningful.
- `macd_histogram`
  - Momentum shift from flat/near-zero to strong one-sided values.
- `roc_10`
  - Rate-of-change spike at or just after breakout.

**Secondary / confluence indicators**
- `supertrend`
  - Confirmation when Supertrend flips and price holds on new side.
- `schaff_tc`
  - Movement from mid-range to extremes after the break.
- `Donchian Channels` (when implemented)
  - Breakouts defined as closes above N-period high / below N-period low.
- `Keltner Channels` (when implemented)
  - BB/Keltner "squeeze" as pre-break filter.

**Implementation notes**
- Regime classification:
  - Transition from range regime (narrow bands, low ATR) → breakout regime (expanding ATR, BB, Donchian break).
- Entry logic (conceptual):
  - Require close beyond range boundary + indicator confirmation, avoid first spike if indicators show no expansion.

### 4.5 Trend Reversal

**Objective:** Detect when the dominant trend has likely ended and a new one is forming.

**Primary indicators**
- `supertrend`, `supertrend_direction`
  - First flip after an extended trend is a strong candidate reversal signal.
- `macd`, `macd_signal`, `macd_histogram`
  - Crosses of MACD and signal lines; histogram crossing zero after extended one-sided regime.
- `rsi_14`, `rsi_21`
  - Failure swings: e.g., price makes higher high but RSI makes lower high (divergence), followed by break of prior swing.
- `schaff_tc`
  - Cross of midline (around 50) after long stays in extremes.

**Secondary / confluence indicators**
- `cci`
  - Leaving extreme zones (+100/−100) and crossing zero with structure break.
- `demarker`
  - Moving from >0.7 or <0.3 extremes back toward 0.5 with price structure break.
- `pivot_point`, `support_1`, `resistance_1` (from V1 pipeline)
  - Reversal often occurs around major pivots; useful for level-based confirmation.
- Pattern flags (`hammer`, `shooting_star`, `engulfing_*`, `doji`)
  - Candlestick reversal patterns at critical levels plus indicator confirmation.

**Implementation notes**
- Regime classification:
  - Structural: HH/HL → LH/LL (or the reverse) plus one or more trend indicator flips.
  - Indicator: MACD, Supertrend, oscillators all transitioning away from prior trend regime.

## 5. Backend Strategy Integration Guidelines

### 5.1 Regime Detection Layer

- Implement a dedicated "regime detection" layer that:
  - Consumes the same DataFrame used by `TechnicalIndicatorsPipeline`.
  - Classifies each bar (or window) into one of the five regimes using:
    - Structural info (swing highs/lows, pivots).
    - Volatility measures (`atr_*`, `bb_width`).
    - Trend-strength measures (later `adx`/`dmi`).
    - Trend orientation (MA stack, Supertrend direction).
- Output can be a simple enum-like field, e.g. `market_regime` in a strategy context object.

### 5.2 Indicator Usage by Strategy

- Strategies should **not** use all indicators at once.
- For each regime, define a minimal set of required indicators and optional ones for extra confirmation.
- Keep strategy code declarative, for example:
  - `if regime == TREND_PULLBACK: use {MA, BB, RSI, Supertrend}`
  - `if regime == RANGE: use {BB, ATR, RSI, Stoch, CCI}`
- This keeps logic aligned with this document and prevents indicator bloat.

### 5.3 Backend ↔ Frontend Consistency

- When exposing indicators to the Dashboard:
  - Use the same fields (`sma_20`, `rsi_14`, `macd_histogram`, etc.) that the strategy uses.
  - Prefer a structured adapter output (`{ asset, timeframe, indicators, series, signals }`) similar to `indicator_adapter.py`.
- The frontend can then:
  - Plot overlay indicators on the main chart.
  - Plot oscillators in a separate pane synced to the main time scale.
  - Optionally display `market_regime` as a compact badge or panel.

### 5.4 Phasing in New Indicators

- For additions like `ADX`, `Keltner`, `Donchian`:
  - Start by computing and logging them, without integrating into decision logic.
  - Validate behavior across sample sessions.
  - Then introduce them as **filters**, not primary triggers:
    - Example: only allow trend strategies when `adx > threshold`.
- This staged approach preserves backward compatibility and follows incremental testing principles.

## 6. Summary

- Market structure comes first; indicators are tools to **quantify and confirm** that structure.
- Each regime has a well-defined, small set of primary indicators and a limited set of confluence tools.
- The existing backend pipeline already covers most of what we need; a few carefully chosen additions (ADX, Keltner, Donchian) can significantly improve regime detection and confluence without overcomplicating the system.
- Strategy code should treat this document as the canonical mapping between **regime ↔ indicator set**, ensuring consistent behavior across backend logic and frontend visualization.
