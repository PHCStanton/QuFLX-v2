# AI Indicator & Regime Awareness — QuFLX v2

**Date:** February 12, 2026  
**Scope:** Definitive reference for all technical indicators, their parameters, regime-specific usage, confluence rules, and AI prompt integration for OTC binary options on 1-minute timeframes (Pocket Option).

> **No real volume data** is available from Pocket Option WebSocket. All "volume" or strength confirmation relies on price-derived proxies: ATR expansion, candle body/wick size relative to ATR, Bollinger Band width, and MACD histogram momentum.

---

## 1. Indicator Parameters (1-Minute Timeframe)

| Indicator | Type | Parameters | Min Candles Required |
|-----------|------|-----------|---------------------|
| **EMA-16** | Trend Overlay | Period: 16 | ~50 |
| **EMA-165** | Long-term Trend | Period: 165 | **200+** (critical) |
| **Supertrend** | Trend Overlay | Period: 7, Multiplier: 3 | ~15 |
| **ADX** | Trend Strength | Period: 14 | ~30 |
| **+DI / -DI** | Directional Movement | Period: 14 (same as ADX) | ~30 |
| **RSI** | Oscillator | Period: 14 | ~20 |
| **Bollinger Bands** | Volatility/Range | Period: 20, StdDev: 2 | ~25 |
| **BB %B** | Band Position | Derived from BB (0.0–1.0) | ~25 |
| **MACD** | Momentum | Fast: 12, Slow: 26, Signal: 9 | ~35 |
| **Stochastic** | Oscillator | %K: 14, %D smooth: 3 | ~20 |
| **CCI** | Oscillator | Period: 14 | ~20 |
| **ATR** | Volatility | Period: 14 | ~20 |
| **Schaff TC** | Momentum Cycle | Fast: 10, Slow: 20, D: 3 | ~30 |
| **Williams %R** | Oscillator | Period: 14 | ~20 |
| **ROC** | Momentum Velocity | Period: 10 | ~15 |
| **DeMarker** | Oscillator | Period: 10 | ~15 |
| **Body Ratio** | Volume Proxy | Body / Total Range | 1 |
| **Large Body** | Volume Proxy | Body > ATR(14) × 0.8 | ~20 |
| **S/R Fractals** | Levels | Window: 5 (non-repainting, shifted) | ~15 |

> **EMA-165 Warning:** Requires 200+ candles for stable values. If fewer available, results are unreliable — regime detection should fall back or skip pullback direction filtering.

---

## 2. OTC-Tuned RSI Thresholds

Standard Forex RSI uses 30/70. **OTC binary options tend to push further during momentum runs**, making standard thresholds too reactive.

| Zone | OTC Threshold | Standard Forex | Rationale |
|------|:------------:|:--------------:|-----------|
| **Oversold** | **35** | 30 | OTC momentum pushes deeper — 30 triggers too often during valid continuation |
| **Overbought** | **75** | 70 | Matching symmetry — momentum regularly pushes past 70 in strong OTC trends |
| **Pullback Buy Zone** | 40–55 | 40–50 | Healthy uptrend pullback territory |
| **Pullback Sell Zone** | 45–60 | 50–60 | Healthy downtrend pullback territory |

---

## 3. Market Regime Definitions

### 3.1 Strong Momentum Trending
- Price moves aggressively with minimal pullbacks
- Candles "walk" along a Bollinger Band
- EMAs cleanly stacked and steep
- **Goal:** Continuation trades

### 3.2 Trending with Pullbacks
- Clear HH/HL (uptrend) or LH/LL (downtrend)
- Regular pullbacks that respect the dominant trend
- Moderate momentum — directional but not parabolic
- **Goal:** Join the trend on controlled pullbacks

### 3.3 Ranging / Sideways
- Price oscillates between support and resistance
- No consistent swing structure
- Volatility contracted (low ATR, narrow BB)
- **Goal:** Mean-reversion trades toward range midpoint

### 3.4 Breakout Conditions
- Price escapes a range or key level
- Volatility expands — candles close beyond previous boundaries
- Follow-through required to validate
- **Goal:** Early breakout entry with momentum confirmation

### 3.5 Trend Reversal
- Prior trend transitions to opposite direction
- Structural shift plus oscillator divergence
- **Highest risk** — use sparingly
- **Goal:** Early entry into new swing

---

## 4. Regime → Indicator Mapping

### Strong Momentum Trending

| Role | Indicator | Trigger |
|------|-----------|---------|
| **Gate** | ADX | > 30 (strong: > 35) |
| **Direction** | +DI / -DI | +DI > -DI = bullish, vice versa |
| **Trend** | Close vs EMA-16 | Close above = bullish, below = bearish |
| **Trend** | Supertrend | Close must be on aligned side |
| **Momentum** | MACD Histogram | Must be expanding (rising for bull, falling for bear) |
| **Volume Proxy** | Body Ratio + ATR | Large body candle + ATR rising |
| **Caution** | RSI | > 75 = overbought risk |
| **Supplemental** | Schaff TC | Near extremes confirms persistence |
| **Supplemental** | ROC-10 | Elevated confirms velocity |
| **Expiry** | — | **3m** |

**A+ Requirements:** ≥ 3 of: ADX > 35, MACD expanding, large directional body, ATR rising, Supertrend aligned

---

### Trending with Pullbacks

| Role | Indicator | Trigger |
|------|-----------|---------|
| **Gate** | ADX | > 20 |
| **Macro Trend** | Close vs EMA-165 | Above = look for buys, below = look for sells |
| **Pullback Zone** | Close proximity to EMA-16 | Within ATR-normalized distance |
| **Quality** | RSI | 40–55 (buy pullback), 45–60 (sell pullback) |
| **Confirmation** | BB touch | Close near lower BB (buy) or upper BB (sell) |
| **Volume Proxy** | ATR | Stable or rising on pullback touch |
| **Structural** | Supertrend | Must still align with trade direction |
| **Supplemental** | BB %B | Near 0.0 (buy) or 1.0 (sell) |
| **Expiry** | — | **5m** |

**A+ Requirements:** ≥ 3 of: RSI in pullback zone, BB touch, ATR stable/rising, higher low (buy) or lower high (sell)

---

### Ranging / Sideways

| Role | Indicator | Trigger |
|------|-----------|---------|
| **Gate** | ADX | **< 20** (no trend) |
| **Zones** | BB upper/lower | Close near band edge |
| **Overbought** | RSI | > 75 (OTC tuned) |
| **Oversold** | RSI | < 35 (OTC tuned) |
| **Timing** | Stochastic | K > 80 + K < D (sell), K < 20 + K > D (buy) |
| **Confirmation** | CCI | > +100 (sell in range), < -100 (buy in range) |
| **Body Filter** | Large Body | Should be **false** (small bodies = choppy range) |
| **Supplemental** | Williams %R | Quick overbought/oversold reads |
| **Supplemental** | BB %B | > 0.95 (sell zone), < 0.05 (buy zone) |
| **Expiry** | — | **3m** |

**A+ Requirements:** ≥ 3 of: RSI extreme, Stoch crossover in zone, CCI extreme, BB edge touch, small bodies

> **Avoid** trend indicators (EMA crossovers, ADX) — they are misleading in ranges.

---

### Breakout Conditions

| Role | Indicator | Trigger |
|------|-----------|---------|
| **Pre-condition** | BB Width | < 0.04 (squeeze / compression) |
| **Break** | Close vs BB | Close outside band |
| **Strength** | ADX | > 25 and rising |
| **Velocity** | ATR | Spike > 1.2× previous bar |
| **Candle** | Large Body | Must be true |
| **Confirmation** | ADX trend | ADX > previous bar's ADX |
| **Supplemental** | ROC-10 | Rate-of-change spike confirms breakout velocity |
| **Supplemental** | Schaff TC | Movement from mid-range to extreme |
| **Expiry** | — | **1m** |

**A+ Requirements:** ≥ 3 of: ATR spike, large body, ADX rising. **Plus:** confirmatory candle (second scan must agree on direction with follow-through price)

> **Fakeout Filter:** Breakouts require two consecutive scans confirming direction before alerting. If price reverses after initial break, it's invalidated.

---

### Trend Reversal (High Risk)

| Role | Indicator | Trigger |
|------|-----------|---------|
| **Divergence** | RSI | < 35 + MACD histogram starting to turn (bullish), > 75 + MACD turning (bearish) |
| **Momentum Shift** | MACD Histogram | Crossing from negative to positive or vice versa |
| **Level** | S/R Proximity | Close within 0.1% of fractal support (buy) or resistance (sell) |
| **Confirmation** | Supertrend | Flip from one side to other confirms structural change |
| **Supplemental** | CCI | Leaving ±100 extremes with zero cross |
| **Supplemental** | DeMarker | Moving from > 0.7 or < 0.3 back toward 0.5 |
| **Expiry** | — | **5m** |

**A+ Requirements:** Require **4+** confluences (higher bar due to inherently lower probability)

> **⚠ Lowest probability regime (48–58%).** Only trade with strong multi-signal confluence.

---

## 5. Volume/Strength Proxies (No Real Volume)

Since Pocket Option provides no real volume data, strength is confirmed via:

| Proxy | What It Measures | How to Use |
|-------|-----------------|------------|
| **ATR Expansion** | Increasing volatility/activity | ATR > previous bar confirms momentum or breakout |
| **ATR Spike** | Sudden volatility burst | ATR > 1.2× previous bar = breakout confirmation |
| **Large Candle Body** | Directional conviction | Body > ATR(14) × 0.8 = "large" |
| **Body Ratio** | Proportion of move that is directional | Body / (High - Low) > 0.7 = strong directional move |
| **Rejection Wick** | Hidden buying/selling pressure | Big wick + small body on pullback = strong rejection |
| **BB Width Expansion** | Volatility regime shift | Expanding width confirms breakout or momentum increase |
| **MACD Histogram** | Momentum acceleration | Expanding histogram = increasing momentum |

---

## 6. Confluence Scoring Model

### Weighted Scoring (Proposed — replaces flat binary count)

| Signal | Weight | Description |
|--------|:-----:|-------------|
| ADX alignment (direction + strength) | 25% | ADX threshold met + +DI/-DI confirms direction |
| MACD direction | 20% | Histogram expanding in trade direction |
| Body/Volume proxy | 20% | Large body and/or ATR spike on signal candle |
| Supertrend alignment | 15% | Close on correct side of Supertrend |
| Oscillator confirmation (RSI/Stoch/CCI) | 10% | Regime-appropriate oscillator signal |
| ATR expansion | 10% | ATR rising vs previous bar |

**Minimum threshold:** Weighted score ≥ **70** for alert dispatch  
**A+ threshold:** Weighted score ≥ **80**

### Score Ranges by Regime

| Regime | Base Score | Score Range | Minimum for Alert |
|--------|:---------:|:----------:|:-----------------:|
| Strong Momentum | 65 | 65–85 | 75 |
| Trending Pullback | 65 | 65–80 | 75 |
| Ranging | 60 | 60–75 | 70 |
| Breakout | 65 | 65–80 | 75 |
| Reversal | 55 | 55–75 | 70 (+ 4 confluences) |

---

## 7. Regime Detection Priority (Waterfall)

The system evaluates regimes in this order — first match wins:

```
1. Strong Momentum    (ADX > 30)           → CALL/PUT, 3m expiry
2. Trending Pullback  (ADX > 20)           → CALL/PUT, 5m expiry
3. Ranging/Sideways   (ADX < 20)           → CALL/PUT, 3m expiry
4. Breakout           (BB squeeze + ADX>25) → CALL/PUT, 1m expiry
5. Trend Reversal     (lowest priority)     → CALL/PUT, 5m expiry
```

If no regime meets its minimum confluence threshold → **NEUTRAL** (no alert).

---

## 8. AI Prompt Regime Awareness

The AI must receive **regime-specific** confluence criteria — not a generic checklist. The prompt should dynamically include only the relevant indicators and thresholds for the detected regime.

### Template Structure

```
Regime: {detected_regime}
Direction: {CALL/PUT}
Confluence Score: {score}

Required confirmations for this regime:
{regime-specific list from Section 4}

Current Values:
{technicals dict — only regime-relevant indicators}

Task: Is this an A+ setup? Evaluate using ONLY the regime-specific criteria above.
```

### What NOT to Do
- ❌ Ask the AI to check momentum confluences on a ranging setup
- ❌ Send every indicator regardless of regime
- ❌ Hardcode a single "required confluences" list for all regimes

---

## 9. Post-Detection Filters

| Filter | Logic | Default |
|--------|-------|---------|
| Individual asset cooldown | Skip if same asset alerted recently | 300s (5 min) |
| Correlation guard | Skip if same currency group alerted recently | 120s (2 min) |
| Breakout confirmation | Require 2 consecutive scans with direction + follow-through | 2 scans |
| AI confidence gate | Skip if AI confidence below threshold | 0.7 (70%) |
| Ticker whitelist | Only process assets selected in frontend | Dynamic (Redis) |

### Correlation Groups
- **AUD:** AUDCAD, AUDCHF, AUDJPY, AUDNZD, AUDUSD
- **EUR:** EURUSD, EURJPY, EURGBP, EURAUD, EURCAD, EURCHF
- **GBP:** GBPUSD, GBPJPY, GBPAUD, GBPCAD, GBPCHF
- **USD:** EURUSD, GBPUSD, AUDUSD, USDJPY, USDCAD, USDCHF

---

## 10. A+ Trade Checklist

Every alert dispatch and AI recommendation should validate:

1. ✅ Regime identified? (Prefer Trending/Pullback > Momentum > others)
2. ✅ Weighted confluence score ≥ 70? (≥ 80 for A+)
3. ✅ Volume proxy confirming? (ATR spike, large body, or big wick)
4. ✅ Payout ≥ 92%?
5. ✅ Not in cooldown? (asset + correlation group)
6. ✅ AI confidence ≥ 0.7?
7. ✅ Risk within limits?

**Only dispatch when all checks pass.**

---

## 11. Known Limitations & Notes

- **EMA-165** needs 200+ candles — validate data depth before using for pullback direction
- **S/R Fractals** must use non-repainting (shifted) implementation to avoid misleading proximity signals
- **Supertrend** computation should be vectorized for performance at scale
- **CCI** is valuable for ranging and reversal regimes — must actually be used in confluence scoring (not just calculated)
- **OTC pricing** can differ from live markets — indicators should account for potential spread/deviation
- Target: **4–6 A+ setups per session** with a realistic **60–68%** filtered win rate for strong compounding with 92% payout
