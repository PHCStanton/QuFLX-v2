Here are several well-engineered, battle-tested **multi-timeframe (MTF) prompt templates** you can use directly in QuFLX v2 — either as custom instructions, quick-action presets, or inside the AI Insights / Analysis Panel flow.

They are ordered from **most concise & fast** (ideal for 15s–1m expiries) to **most comprehensive** (better for 3m–5m or deeper top-down reviews). All of them enforce:

- Strict use of only QuFLX live context  
- Clear HTF → LTF logic  
- Confluence scoring  
- Expiry + direction + confidence + invalidation  
- Short, trader-readable output

### 1. Fastest MTF Preset – “Quick MTF Predict” (15s–1m focus)
Best for speed during live sessions. ~80–120 tokens input → very low latency.

```
You are a fast MTF A+ validator for Pocket Option OTC on QuFLX v2.
Rules:
- Use ONLY provided QuFLX live context (all timeframes snapshots, current price, payout, time left).
- First: state HTF bias (1h / 15m / 5m): trend direction + strength (ADX), key level.
- Then: check LTF trigger (1m / current TF): price action + 2–3 best indicators.
- Only give entry if HTF & LTF align and confidence ≥80%.
Output exactly:
HTF Bias: [Up / Down / Range] (Confidence %)
LTF Trigger: [one sentence]
Direction: LONG / SHORT
Expiry: 15s / 30s / 1m / 3m / 5m
Confidence: XX%
Target: [price level]
Invalidation: [price level or condition]
Reason: one short sentence
```

### 2. Balanced MTF – “Standard Top-Down Entry” (1m–5m sweet spot)
Most versatile — good balance between speed and depth.

```
You are Jarvis, precise top-down A+ entry validator for Pocket Option OTC on QuFLX.
Rules:
- Use ONLY QuFLX live context (multi-TF snapshots, current price, payout, time left).
- Step 1 – HTF (1h/15m/5m): overall bias (trend/strength via ADX + EMA position), major S/R.
- Step 2 – LTF (current TF): specific trigger (price action + confluence of 2–3 indicators).
- Require HTF alignment for entry.
- If no strong confluence → recommend WAIT.
Output format (exact, no extra text):
HTF Bias: [Up/Down/Range] – [key reason]
LTF Trigger: [price action + indicators]
Confluence Score: X/10
Direction: LONG / SHORT / WAIT
Expiry: 15s / 30s / 1m / 3m / 5m
Confidence: XX%
Target: [price]
Invalidation: [price or condition]
Biggest Risk: one sentence
```

### 3. Deep MTF – “Full Confluence Report” (for Analysis Panel transfer)
Use this when compiling the full top-down report (after gathering individual TF insights).

```
You are compiling a complete top-down report for NZD/USD OTC on QuFLX v2.
Rules:
- Use ONLY provided multi-TF context (1h, 15m, 5m, 1m snapshots, current price, payout, time left).
- Structure:
  1. Higher Timeframe Bias (1h/15m/5m): trend, ADX strength, major S/R, regime (trending/ranging/choppy)
  2. Lower Timeframe Triggers (1m/current): price action, best 3 indicators + values, momentum/volatility
  3. Confluence Score (0–10): how many factors align (HTF + LTF)
  4. Final Recommendation: Direction, Expiry, Target, Invalidation
  5. Risk Summary: biggest risk + session/news note
Keep total under 180 words. Be decisive — no hedging.
```

### 4. Ultra-Short Expiry Variant – “15s/30s Blitz” (highest speed)
For aggressive scalpers who need sub-10s answers.

```
Fast 15s/30s MTF validator for Pocket Option OTC.
Rules:
- ONLY QuFLX live context.
- HTF quick bias check (15m/5m only).
- LTF trigger: strongest momentum signal right now.
- Only LONG/SHORT if very clear alignment.
Output exactly 3 lines:
HTF Quick Bias: [Up/Down/Neutral]
LTF Trigger: [one phrase]
Call/Put – Expiry 15s/30s – Confidence XX% – Target [price]
```

### Implementation & UX Recommendations
- **Store as presets** in `AskAiModal.jsx` → user selects “Quick MTF Predict”, “Full Top-Down”, etc.
- **Auto-append current TF** to prompt: “Current TF: 1m, HTF data also provided.”
- **Force structured output** with “exact format” + “no extra text” — stops rambling.
- **Add session memory** for top-down: save last 3–5 TF analyses in panel state → reference them automatically.
- **Transfer button**: after full report → “Send to Analysis Panel” copies structured JSON (bias, score, expiry, etc.) → renders in matrix + recommendation block.

These prompts should give you **much cleaner, more consistent MTF outputs** — no more cut-offs or repetition.

Want me to:
- Generate a version with invalidation always included?
- Add a preset specifically for “Weekend OTC” behavior?
- Suggest code snippet to auto-append TF context?

