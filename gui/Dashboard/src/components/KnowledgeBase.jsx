import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const KNOWLEDGE_BASE_CONTENT = `
# Knowledge Base: Pocket Option Indicators & Confluences

Here’s a clear, practical guide to the **main indicators** and their **optimal confluence setups** for different market conditions on Pocket Option (1-minute timeframe as default).  

Since Pocket Option **does not provide real volume data** through the WebSocket (only price/timestamp), we have to rely entirely on **price-derived proxies** for volume/momentum strength. The best proxies available are:

- **ATR** (true volatility as volume substitute)  
- **Bollinger Band Width** (expansion = increasing activity/volatility)  
- **MACD Histogram** (momentum acceleration)  
- **Candle body/wick size** relative to ATR (big bodies + small wicks = strong directional volume)

### Summary Table – Best Indicators & Confluences by Market Condition  
(1-minute timeframe – Pocket Option OTC/binary style)

| Market Condition              | Primary Goal               | Core Indicators & Settings                              | Strong Confluence Signals (must have ≥3 for A+ setup)                          | Proxy for "Volume"/Strength                  | Typical Win-Rate Edge (filtered) |
|-------------------------------|----------------------------|----------------------------------------------------------|--------------------------------------------------------------------------------|-----------------------------------------------|-----------------------------------|
| **Strong Momentum Trending**  | Continuation trades        | • EMA-16 (main trend filter)<br>• Supertrend (7,3)<br>• ADX 14 > 30–35 | • Price above EMA-16 + Supertrend green/up<br>• ADX rising + >35<br>• MACD hist expanding<br>• Big bullish/bearish candle bodies | ATR expansion + large candle bodies           | 62–71%                           |
| **Trending with Pullbacks**   | Pullback entries           | • EMA-16 / EMA-165 (trend filter)<br>• RSI 14<br>• Bollinger Bands (20,2) | • Price pulls back to/touches EMA-16<br>• RSI 40–55 (not oversold)<br>• BB squeeze then expansion<br>• Higher low in uptrend | ATR stable or rising + rejection wick size    | 58–68%                           |
| **Ranging / Sideways**        | Mean-reversion trades      | • Bollinger Bands (20,2)<br>• RSI 14<br>• Stochastic (14,3,3) | • Price at upper/lower BB<br>• RSI >70 / <30<br>• Stoch %K/%D crossover in extreme zone<br>• Small candle bodies | BB width contracting + small real bodies      | 55–65%                           |
| **Breakout Conditions**       | Early breakout / fakeout filter | • Bollinger Bands (20,2)<br>• ADX 14<br>• ATR 14       | • BB squeeze → sudden expansion<br>• Price closes outside BB<br>• ADX >25 and rising<br>• Large breakout candle + follow-through | ATR spike + large breakout candle             | 54–63% (fakeout filter critical) |
| **Trend Reversal**            | High-risk counter-trend    | • MACD (12,26,9)<br>• RSI 14 divergence<br>• Double top/bottom | • MACD histogram divergence<br>• RSI bearish/bullish divergence<br>• Price rejection at major level<br>• Large reversal candle | ATR expansion on reversal candle              | 48–58% (lowest probability – avoid unless strong confluence) |

### Quick Cheat-Sheet – When to Use Which Indicator (1m Timeframe)

- **Trend confirmation / continuation** → EMA-16 + Supertrend + ADX >30  
- **Pullback entry** → Price at EMA-16 + RSI 40–55 + BB touch/rejection  
- **Range trading** → BB upper/lower + RSI extreme + Stoch crossover  
- **Breakout** → BB squeeze → expansion + ADX rising + big candle  
- **Reversal (rare)** → MACD/RSI divergence + major level rejection

### Most Important Proxy Rules (No Volume Data)

Use these 3 price-based signals as your “volume confirmation”:

1. **Large candle body** relative to recent ATR → shows real participation  
2. **ATR expansion** on breakout or continuation candle → increasing volatility = increasing activity  
3. **Rejection wick size** on pullbacks → big wick + small body = strong rejection (hidden buying/selling pressure)

### Final A+ Setup Checklist (Use this every time before entry)

1. Is the market in my proven regime? (Trending/pullback or strong momentum preferred)  
2. Do I have ≥3 strong confluences? (EMA, RSI, BB, ADX, Supertrend, candle structure)  
3. Is “volume proxy” confirming? (ATR spike, large body, big rejection wick)  
4. Payout ≥92%?  
5. Within my high-activity session?  
6. Risk <3% of account (or whatever your Risk Manager allows)?  
7. No red flags from Ask AI quick scan?

Only enter when **all 7** are green.

### Main Indicators & Optimal Settings for 1-Minute Timeframe

| Indicator              | Type          | Default Parameters (1m)       | Purpose / When to Use                              | Strong Confluence Signals (A+ Setup)                                                                 | Strength/Volume Proxy (No Real Volume)               | Typical Regime Fit                  |
|-------------------------|---------------|-------------------------------|----------------------------------------------------|------------------------------------------------------------------------------------------------------|-------------------------------------------------------|-------------------------------------|
| **EMA-16**             | Trend Overlay | Period: 16                    | Primary trend filter, dynamic support/resistance  | Price above EMA-16 (uptrend), below (downtrend) + price pullback touches EMA                       | Large candle bodies closing near/above EMA           | All trending regimes                |
| **EMA-165**            | Long-term Trend | Period: 165                 | Major trend filter (higher timeframe bias)         | Price above EMA-165 = strong uptrend bias; pullbacks to EMA-165 often high-probability entries      | ATR expansion on touches                                 | Strong Momentum, Trending Pullback  |
| **Supertrend**         | Trend Overlay | Period: 7, Multiplier: 3      | Trailing stop + trend direction                    | Supertrend green + price above = strong uptrend; flip to red = potential reversal/exit             | Large candle closing beyond Supertrend line           | Strong Momentum Trending            |
| **ADX**                | Trend Strength | Period: 14                    | Measures trend strength (not direction)            | ADX > 30–35 and rising = strong trend; ADX > 40 = very strong (continuation likely)                | ADX rising + ATR expansion                            | Strong Momentum, Breakout           |
| **RSI**                | Oscillator    | Period: 14                    | Overbought/oversold + divergence                   | RSI 40–55 in uptrend pullback (buy zone); >70 = overbought (caution); <30 = oversold (caution)     | RSI divergence + large reversal candle body           | Pullbacks, Ranging, Reversal        |
| **Bollinger Bands**    | Volatility/Range | Period: 20, StdDev: 2       | Range identification + breakout/squeeze            | Squeeze → expansion + price close outside band = breakout; price at lower band in uptrend = pullback | BB width expansion + large directional candle         | Breakout, Ranging, Trending Pullback |
| **MACD**               | Momentum      | Fast: 12, Slow: 26, Signal: 9 | Momentum shifts + divergence                       | MACD line above signal + histogram expanding = bullish momentum; histogram divergence = reversal   | Expanding histogram + ATR spike                       | Momentum Trending, Reversal         |
| **CCI**                | Oscillator    | Period: 14                    | Overbought/oversold + momentum                     | CCI > +100 = overbought (sell in range); < –100 = oversold (buy in range); divergence = reversal   | CCI extreme + large wick rejection                    | Ranging, Reversal                   |
| **ATR**                | Volatility    | Period: 14                    | Volatility filter + stop distance                  | ATR rising = increasing activity/volatility (confirms momentum/breakout); ATR low = choppy         | ATR expansion on key candle                           | All (volume proxy #1)               |

### Quick Cheat-Sheet: Which Indicators to Prioritize by Regime (1m Timeframe)

| Regime                        | Core Indicators (Must Have)                          | Strong Confluence (A+ Requirements)                                   | Avoid / Caution                                      |
|-------------------------------|-------------------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------|
| **Strong Momentum Trending**  | EMA-16, Supertrend, ADX >35, MACD histogram          | Price above EMA-16 + Supertrend green + ADX rising + expanding MACD hist | RSI >75 (overbought risk)                           |
| **Trending with Pullbacks**   | EMA-16 / EMA-165, RSI 14, Bollinger Bands            | Pullback to EMA-16 + RSI 40–55 + BB touch/rejection + ATR stable/rising | Entering near BB extremes without pullback confirmation |
| **Ranging / Sideways**        | Bollinger Bands, RSI 14, CCI / Stochastic            | Price at BB upper/lower + RSI >70/<30 + CCI extreme + small bodies     | Trend indicators (ADX <20, avoid EMA crossovers)    |
| **Breakout Conditions**       | Bollinger Bands squeeze → expansion, ADX >25 rising, ATR spike | BB squeeze → big candle close outside band + ADX rising + ATR expansion | Fakeouts (no follow-through candle)                 |
| **Trend Reversal**            | MACD/RSI divergence, CCI extreme, large reversal candle | Divergence on MACD/RSI + rejection at major level + big reversal candle | Low-probability – require 4+ confluences             |

---

## Discord Alert System

QuFLX sends four distinct Discord signal types, each with a different embed color so you can instantly identify them at a glance.

### Signal Types & Embed Colors

| Signal Type | Color | Hex | Description |
|-------------|-------|-----|-------------|
| ✅ **CALL Signal** | 🟢 Green | \`0x22c55e\` | Confirmed bullish entry — all confluences met, AI approved |
| ✅ **PUT Signal** | 🔴 Red | \`0xef4444\` | Confirmed bearish entry — all confluences met, AI approved |
| ⏳ **Developing Setup** | 🔵 Blue | \`0x3B82F6\` | Confluences building but not yet fully confirmed — early heads-up |
| ⚠️ **Market Warning** | 🟡 Orange | \`0xffa500\` | Signal blocked — low volatility, dead market, or choppy conditions |

### CONFIRMED vs DEVELOPING

| Aspect | CONFIRMED | DEVELOPING |
|--------|-----------|------------|
| **Weighted score** | ≥ 70/100 | 50–69/100 |
| **ADX** | > 30, strong | > 30, **rising** |
| **AI verification** | ✅ Required | ❌ Skipped (saves quota) |
| **Cooldown** | Full (\`COOLDOWN_SECONDS\`) | Half cooldown |
| **Action** | Enter trade | Watch and prepare |

### When a Developing Setup Fires

**Strong Momentum (DEVELOPING):** ADX > 30, price above EMA-16 and Supertrend, weighted confluence score 50–69 with ADX still rising. The trend is forming but lacks the full body confirmation or oscillator alignment needed for a full signal.

**Breakout Squeeze (DEVELOPING):** Bollinger Band width < 0.04 (squeeze), ADX > 20 and rising, price within **0.2%** of the upper or lower band — before the actual candle break. This gives you setup time ahead of the confirmed breakout.

### How Confluence Scoring Works (Weighted Model)

| Signal Component | Weight |
|-----------------|--------|
| ADX strength | 25% |
| MACD histogram | 20% |
| Body/Volume proxy | 20% |
| Supertrend direction | 15% |
| Oscillator (+DI/-DI) | 10% |
| ATR expansion | 10% |

Score ≥ 70 = **CONFIRMED** | Score 50–69 + rising ADX = **DEVELOPING**

### Breakout Confirmatory Candle Logic

Breakout signals require **two consecutive scans** to fire as CONFIRMED:

1. **First scan** — Breakout condition detected → stored as "Pending", no alert sent yet
2. **Second scan** — If same direction + price followed through → **CONFIRMED** alert fires
3. If direction changed or price reversed → flagged as **Fakeout**, no alert

### Cooldown System

- Each asset has its own cooldown timer (\`COOLDOWN_SECONDS\`)
- DEVELOPING alerts use a **separate key** \`{asset}:developing\` (half cooldown) so they never block a subsequent CONFIRMED alert
- Correlation groups prevent simultaneous alerts on correlated assets (e.g., EURUSD + GBPUSD in the same group)

### Volatility Guard

Before any signal is dispatched, the **Volatility Guard** checks:

| Condition | ATR % (relative) | ADX | Outcome |
|-----------|------------------|-----|---------|
| Dead | < 0.02% | any | ⚠️ Market Warning |
| Low | 0.02–0.05% | < 20 | ⚠️ Market Warning |
| Normal | 0.05–0.20% | any | ✅ Proceed |
| High | 0.20–0.40% | any | ✅ Proceed |
| Extreme | > 0.40% | any | ✅ Proceed (caution) |

Choppy markets are also blocked if the average candle **body ratio < 0.4** over the last 10 candles.

---

## Regime Detection Details

All regimes are evaluated in priority order. Once a regime is matched, lower-priority checks are skipped.

### Priority Order

1. Strong Momentum (ADX > 30)
2. Trending Pullback (ADX > 20, not already matched)
3. Ranging / Sideways (ADX < 20, not already matched)
4. Breakout (BB squeeze, not already matched)
5. Trend Reversal (lowest priority, only when nothing else matched)

---

### 1. Trending Pullback — BUY / SELL

**When it fires:** ADX > 20 (trending but not strong), price within an ATR-normalized distance of EMA-16, and in the right macro bias.

#### Detection Conditions

| Check | Bullish Pullback (BUY) | Bearish Pullback (SELL) |
|-------|------------------------|-------------------------|
| **Macro trend** | close > EMA-89 | close < EMA-89 |
| **Proximity to EMA-16** | \`distance < ATR × 2.0 / price\` | same |
| **RSI range** | 40–55 (+1 point) | 45–60 (+1 point) |
| **BB level** | close ≤ BB_lower × 1.001 (+1 point) | close ≥ BB_upper × 0.999 (+1 point) |
| **ATR direction** | ATR ≥ prev ATR (+1 point) | same |
| **Minimum score** | ≥ 2 of the 3 above | same |

> **ATR-Normalized Threshold:** The proximity check uses a dynamic threshold — \`ATR × 2.0 / close\` — so it adjusts to each asset's natural volatility, not a fixed pip distance.

**Discord dispatch:** CONFIRMED only. 🟢 Green (CALL) or 🔴 Red (PUT). AI check required if enabled.  
**Suggested expiry:** 5 minutes  
**Confluence score:** 65 + (score × 5) → range 70–80

---

### 2. Ranging / Sideways — Overbought SELL / Oversold BUY

**When it fires:** ADX < 20 (market not trending), average candle body ratio ≥ 0.4 over last 10 candles (not choppy), and price at a BB extreme.

#### Detection Conditions

| Check | Overbought (SELL) | Oversold (BUY) |
|-------|-------------------|----------------|
| **Price level** | close ≥ BB_upper × 0.998 | close ≤ BB_lower × 1.005 |
| **RSI extreme** | RSI > 75 (+1 point) | RSI < 35 (+1 point) |
| **Stochastic** | Stoch K > 80 **and** K < D (crossing down) (+1) | Stoch K < 20 **and** K > D (crossing up) (+1) |
| **Candle size** | No large body (+1 — indecision candle) | No large body (+1) |
| **Minimum score** | ≥ 2 of the 3 above | same |

> **OTC-tuned thresholds:** RSI levels are 35/75 (not the standard 30/70) because OTC binary option markets tend to push further into extremes before reversing.

> **Chop guard** applied first: if avg body_ratio < 0.4 over last 10 candles → ⚠️ Market Warning sent instead, signal blocked.

**Discord dispatch:** CONFIRMED only. 🟢 Green (CALL) or 🔴 Red (PUT). AI raises confidence threshold to **85%** for these (vs. default) due to higher false-signal risk.  
**Suggested expiry:** 3 minutes  
**Confluence score:** 60 + (score × 5) → range 65–75

---

### 3. Breakout — Bullish / Bearish

**When it fires:** BB width < 0.04 (squeeze condition) and price breaks outside the band.

#### Detection Conditions

| Check | Bullish Breakout | Bearish Breakout |
|-------|-----------------|-----------------|
| **BB width** | < 0.04 (squeeze) | < 0.04 (squeeze) |
| **Price** | close > BB_upper | close < BB_lower |
| **ADX** | ADX > 25 | ADX > 25 |
| **ATR spike** | ATR > prev ATR × 1.2 (+1) | same |
| **Large candle** | body_ratio > 0.7 + ATR expansion (+1) | same |
| **ADX rising** | ADX > prev ADX (+1) | same |
| **Minimum score** | ≥ 2 of the 3 above | same |

> **Confirmatory candle rule:** Breakout signals are held for one scan cycle. Only on the **second consecutive scan** (with price follow-through) does the CONFIRMED alert fire. If direction flips or price reverses → Fakeout, no alert.

**Discord dispatch:** CONFIRMED only (after 2-scan confirmation). 🟢 Green (CALL) or 🔴 Red (PUT).  
**Suggested expiry:** 1 minute  
**Confluence score:** 65 + (score × 5) → range 70–80

---

### 4. Trend Reversal — Bullish / Bearish

**When it fires:** Only when no other regime matched. Requires RSI at extreme and MACD turning, **plus** price at a confirmed Support or Resistance level.

#### Detection Conditions

| Check | Bullish Reversal | Bearish Reversal |
|-------|-----------------|-----------------|
| **RSI** | RSI < 30 (extreme oversold) | RSI > 70 (extreme overbought) |
| **MACD histogram** | MACD_hist > prev MACD_hist (turning up) | MACD_hist < prev MACD_hist (turning down) |
| **S/R proximity** | Price within 0.1% of confirmed support level | Price within 0.1% of confirmed resistance level |

> **S/R detection:** Support/Resistance levels are calculated using fractal pivots (5-bar swing highs/lows), confirmed only after n+5 bars to prevent repainting. The most recent confirmed pivot is projected forward.

> Confluence score is fixed at **55** — intentionally lower than other regimes to reflect the inherent risk. Requires all 3 conditions to be met simultaneously.

**Discord dispatch:** CONFIRMED only. 🟢 Green (CALL) or 🔴 Red (PUT). AI check strongly recommended.  
**Suggested expiry:** 5 minutes  
**Confluence score:** 55 (fixed)

---

## Per-Asset ATR Calculation

The system never uses a global fixed ATR threshold. Every asset's volatility is assessed relative to **its own historical baseline**, making the signal system asset-agnostic.

### Step 1 — ATR-14 (True Range)

For each candle, ATR-14 is calculated:

\`\`\`
True Range = max(High - Low, |High - prev_Close|, |Low - prev_Close|)
ATR-14     = 14-period Exponential Moving Average of True Range
\`\`\`

### Step 2 — Relative ATR % (Cross-Asset Normalization)

To compare volatility across assets with different price scales (e.g., EURUSD at 1.08 vs. USDJPY at 150):

\`\`\`
Relative ATR % = (ATR-14 / current_Close) × 100
\`\`\`

This expresses volatility as a **percentage of price**, making it directly comparable across all assets.

### Step 3 — Rolling ATR Baseline (Asset-Specific History)

\`\`\`
ATR Baseline = 20-period rolling MEDIAN of ATR-14
\`\`\`

A **median** (not mean) is used to make the baseline resistant to spike distortion. The current ATR is then compared to this baseline:

\`\`\`
ATR Ratio = ATR-14 (current) / ATR Baseline
\`\`\`

### Step 4 — Volatility Zone Decision

| Relative ATR % | Zone | Tradeable |
|----------------|------|-----------|
| < 0.02% | Dead | ❌ Market Warning |
| 0.02–0.05% + ADX < 25 | Low | ❌ Market Warning |
| any + ATR Ratio < 0.5 + ADX < 25 | Compressed | ❌ Market Warning |
| any + BB Width Ratio < 0.5 + ADX < 25 | Tight Range | ❌ Market Warning |
| 0.05–0.20% | Normal | ✅ Trade |
| 0.20–0.40% | High | ✅ Trade |
| > 0.40% | Extreme | ✅ Trade (with caution) |

### BB Width Baseline (Parallel Check)

A second baseline is maintained for Bollinger Band width:

\`\`\`
BB Width Baseline = 20-period rolling MEDIAN of BB Width (bb_wband)
BB Width Ratio    = current BB Width / BB Width Baseline
\`\`\`

If BB Width Ratio < 0.5 **and** ADX < 25 → the market is in an unusually tight range → ⚠️ Market Warning sent.

### ATR-Normalized Pullback Threshold

For Pullback regimes, the proximity check to EMA-16 also uses ATR:

\`\`\`
Threshold = (ATR × 2.0) / close
\`\`\`

This means on a high-volatility asset, the pullback can be deeper (in absolute terms) before the regime fires, keeping the signal semantically consistent across assets.
`;

const KnowledgeBase = () => {
  return (
    <div className="min-h-screen bg-dashboard-bg text-text-primary p-8 overflow-auto">
      <div className="max-w-5xl mx-auto bg-card-bg border border-border-primary rounded-lg p-8 shadow-xl">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => <h1 className="text-3xl font-bold text-accent-blue mb-6 border-b border-border-primary pb-2" {...props} />,
              h2: (props) => <h2 className="text-2xl font-semibold text-accent-blue mt-8 mb-4" {...props} />,
              h3: (props) => <h3 className="text-xl font-medium text-text-primary mt-6 mb-3" {...props} />,
              p: (props) => <p className="text-text-secondary mb-4 leading-relaxed" {...props} />,
              ul: (props) => <ul className="list-disc list-inside mb-4 space-y-2 text-text-secondary" {...props} />,
              li: (props) => <li className="ml-4" {...props} />,
              table: (props) => (
                <div className="overflow-x-auto my-8">
                  <table className="w-full border-collapse border border-border-primary text-sm" {...props} />
                </div>
              ),
              thead: (props) => <thead className="bg-section-bg" {...props} />,
              th: (props) => <th className="border border-border-primary p-3 text-left font-semibold text-accent-blue" {...props} />,
              td: (props) => <td className="border border-border-primary p-3 text-text-secondary" {...props} />,
              strong: (props) => <strong className="text-accent-orange font-semibold" {...props} />,
              blockquote: (props) => <blockquote className="border-l-4 border-accent-blue pl-4 italic my-4 text-text-secondary" {...props} />,
              code: (props) => <code className="bg-section-bg px-1 rounded text-accent-green" {...props} />,
            }}
          >
            {KNOWLEDGE_BASE_CONTENT}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;
