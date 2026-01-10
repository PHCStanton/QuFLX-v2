import React from 'react';
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
`;

const KnowledgeBase = () => {
  return (
    <div className="min-h-screen bg-dashboard-bg text-text-primary p-8 overflow-auto">
      <div className="max-w-5xl mx-auto bg-card-bg border border-border-primary rounded-lg p-8 shadow-xl">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <h1 className="text-3xl font-bold text-accent-blue mb-6 border-b border-border-primary pb-2" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl font-semibold text-accent-blue mt-8 mb-4" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xl font-medium text-text-primary mt-6 mb-3" {...props} />,
              p: ({node, ...props}) => <p className="text-text-secondary mb-4 leading-relaxed" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-4 space-y-2 text-text-secondary" {...props} />,
              li: ({node, ...props}) => <li className="ml-4" {...props} />,
              table: ({node, ...props}) => (
                <div className="overflow-x-auto my-8">
                  <table className="w-full border-collapse border border-border-primary text-sm" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="bg-section-bg" {...props} />,
              th: ({node, ...props}) => <th className="border border-border-primary p-3 text-left font-semibold text-accent-blue" {...props} />,
              td: ({node, ...props}) => <td className="border border-border-primary p-3 text-text-secondary" {...props} />,
              strong: ({node, ...props}) => <strong className="text-accent-orange font-semibold" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-accent-blue pl-4 italic my-4 text-text-secondary" {...props} />,
              code: ({node, ...props}) => <code className="bg-section-bg px-1 rounded text-accent-green" {...props} />,
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
