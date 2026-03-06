Support/Resistance Indicator — Optimization & Confluence Playbook
Based on your current S/R implementation in 
indicators.py
 (5-bar fractal pivots with confirmation lag) and its integration into 
regime_detector.py
 (reversal detection at S/R proximity).

Part 1 — Optimizing the Current Indicator
1. Level Strength Scoring (Touch Count)
Your current implementation outputs a single active support and resistance level (the most recent confirmed fractal, forward-filled). This means you lose historical context about how tested a level is.

Enhancement: Track how many times price has tested each level without breaking it. A level touched 3+ times is statistically stronger.

python
# Concept: Count touches within ATR band of each confirmed pivot
touch_band = df['atr_14'] * 0.5  # Half-ATR proximity
# For each confirmed resistance, count how many bars had High within touch_band
Impact on Regime Detector: The reversal detection in 
regime_detector.py
 currently only checks if price is within 0.1% of S/R (line 592/599). Adding a touch count would let you weight reversal signals higher when the level has been tested multiple times.

2. S/R Zones Instead of Single Lines
Real institutional supply/demand doesn't exist at a single price — it's a zone. Convert your single-price levels into zones defined by the candle bodies/wicks that formed the fractal.

python
# Instead of just df['high'] for resistance, capture the zone:
# resistance_zone_upper = fractal candle's high
# resistance_zone_lower = fractal candle's open (or close, whichever is lower)
Frontend rendering: In 
useOverlayIndicators
, render these as semi-transparent shaded rectangles instead of step-lines. Lightweight Charts supports this via AreaData or custom box rendering.

3. Multi-Timeframe S/R Confluence
Pull S/R levels from higher timeframes (15m, 1H) and overlay them on your 5-minute chart. When a 5m level aligns with a higher-TF level, it's a much stronger zone.

Implementation path: Your 
_calculate_support_resistance()
 already accepts a configurable support_resistance_period param (default 5). By running the pipeline on resampled data (15m, 1H OHLC), you get higher-TF levels. The Strategy Engine already has 
resample_to_grid()
 — extend this to produce multi-TF S/R.

4. Level Freshness / Age Classification
Color-code levels by freshness:

🟢 Fresh (untested, just formed) — highest probability of holding
🟡 Tested 1–2 times — still valid
🔴 Stale (tested 3+ times) — weakening, likely about to break
This directly feeds into the touch count from Enhancement #1. The frontend can adjust line opacity or color based on a level_age or touch_count field.

5. Breakout Detection & S/R Flip
Your 
regime_detector.py
 already has Breakout detection (line 548–586), but it doesn't know about S/R specifically — it only uses Bollinger Band width squeeze + ADX. By integrating S/R:

When price closes through a confirmed resistance → mark the level as broken
The broken resistance becomes new support (S/R flip)
This is a high-probability retest entry pattern
python
# In _calculate_support_resistance:
# Add: df['sr_flip'] column — True when resistance_level < close (level was broken)
# Shift the broken resistance_level → becomes the new support_level
6. Distance-to-Level Metrics
Add columns measuring the pip/point distance from current close to nearest S/R. This powers:

Quick risk/reward assessment before placing pending orders
Filtering out levels that are too far away to be actionable
The AI assistant can include this in its TradingContext
python
df['dist_to_resistance'] = (df['resistance_level'] - df['close']) / df['close'] * 100
df['dist_to_support'] = (df['close'] - df['support_level']) / df['close'] * 100
Part 2 — Best Confluence Indicators
These are ranked by how well they pair with your specific S/R + pending order strategy on OTC assets:

Indicator	Already in QuFLX?	Confluence Role	How to Use
RSI (14)	✅ rsi_14	Momentum at level	RSI < 35 at support = strong buy; RSI > 75 at resistance = strong sell
Stochastic	✅ stoch_k/d	Reversal timing	%K/%D crossover at S/R level = precise entry timing
Bollinger Bands	✅ bb_upper/lower	Volatility envelope	Price at support + touching lower BB = double confluence
EMA 21/50	✅ ema_21/50	Dynamic S/R	Static S/R aligning with a key EMA = extra confluence layer
ADX	✅ 
adx
Trend strength filter	ADX < 20 = ranging → S/R bounces more reliable; ADX > 30 = breakout risk
SuperTrend	✅ supertrend	Trend direction	Only trade S/R bounces in SuperTrend direction
MACD Histogram	✅ macd_histogram	Momentum confirmation	MACD hist turning positive at support = momentum shifting to buyers
DeMarker	✅ 
demarker
Exhaustion detection	DeMarker > 0.7 at resistance = selling exhaustion building
ATR	✅ atr_14	Volatility filter	ATR below baseline = ranges hold better; ATR spike = breakout risk
Volume (body_ratio)	✅ body_ratio	Participation proxy	Small bodies at S/R = rejection; large bodies through = breakout
Recommended Confluence Stack for OTC Pending Orders
S/R + RSI(14) + Stochastic + ADX + body_ratio

This gives you: Level → Momentum → Timing → Regime Filter → Participation Confirmation — all already computed by your pipeline.

Part 3 — Market Conditions for S/R Effectiveness
✅ Best Conditions (Trade These)
Condition	Why S/R Works Better	How to Detect in QuFLX
Ranging / Sideways	Price bounces predictably between levels	adx < 20 + regime = RANGING_*
Low-to-Normal Volatility	Levels hold more reliably, less slippage	volatility_zone = "low" or "normal"
Post-News Consolidation	New S/R levels form quickly and hold well	After a breakout move settles → new range forms
OTC Quiet Hours	Less manipulation, more technical	Lower atr_ratio periods
Round Number Alignment	Psychological levels + your S/R = extra strength	When resistance_level or support_level ends in 000 or 500
⚠️ Avoid These Conditions
Condition	Why S/R Fails	Detection
Strong Trending	Levels break in succession	adx > 30 + regime = STRONG_MOMENTUM_*
High Volatility Spikes	Wide candles blow through levels	volatility_zone = "high" or "extreme"
Breakout Momentum	Level tested 4+ times = about to break	High touch count + expanding ATR
Dead / No Volume	No follow-through even at good levels	volatility_zone = "dead"
Choppy Indecision	No clear levels form at all	body_ratio < 0.4 (already blocked by regime detector)
💡 Pro Tips for Your Pending Order Strategy
Use ADX as a master filter: Only place pending orders at S/R when adx < 25. Above 25, levels are more likely to break.

Wait for rejection candles: Instead of blind pending orders, wait for a rejection wick (pin bar) at the level. Your body_ratio metric already captures this — small body_ratio (< 0.3) with a long wick = rejection.

Stagger entries: Place 2–3 pending orders at slightly different prices within the S/R zone to improve fill quality and average entry.

Use the RegimePanel: Your 
RegimePanel
 already shows the current market condition. Only trade S/R bounces when the regime is Ranging – Oversold/Overbought or Neutral.

SuperTrend as direction bias: In the screenshot, your SuperTrend (red line) was bearish. In that context, resistance levels are stronger (price more likely to reject downward from resistance). Use SuperTrend direction to prioritize which S/R level to trade.

Track win rates by level type: Log whether "fresh" levels vs "retested" levels perform better in your statement analysis. Your 
StatementAnalysisPage
 could be extended to correlate trade outcomes with the S/R metrics at entry time.

Time-of-day filter: OTC assets often have different behavior at different hours. Track which hours your S/R entries work best and configure your Alert Dispatcher's whitelist accordingly.

Part 4 — Priority Implementation Roadmap
If you want to implement these enhancements, here's a suggested phased priority:

Phase	Enhancement	Effort	Impact
1	Distance-to-level metrics	Low	Immediate — powers better entry decisions
2	Touch count / level strength	Medium	High — strongest single improvement for filtering levels
3	S/R Flip detection (broken level → new level)	Medium	High — catches retest entries, which are your highest-probability setups
4	Zone rendering (frontend)	Medium	Visual clarity — see exact supply/demand zones
5	Multi-TF confluence	High	Very high — institutional-grade S/R alignment
6	Level freshness classification	Low	Nice-to-have — builds on touch count
TIP

Phases 1–3 are backend-only changes to 
_calculate_support_resistance()
 and 
regime_detector.py
. They immediately improve signal quality across the Alert Dispatcher and regime detection without any frontend work.