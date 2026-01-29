# AI Preset Prompts Documentation

This document compiles the specific prompts and instructions the AI receives, including their preset definitions, dynamic template logic, and source code locations.

## 1. Quick Action Presets (Modal)

Defined in **`gui/Dashboard/src/components/AskAiModal.jsx`** (Lines 12-49).

| Preset ID | Title | Description | Prompt Template |
| :--- | :--- | :--- | :--- |
| `market_overview` | **Market Overview** | Quick regime + volatility snapshot | `Give a concise market overview for ${asset} on ${timeframe}. Trend, volatility, and any red flags.` |
| `chart_overview` | **Chart Overview** | What stands out on the chart right now | `Summarize what stands out on the ${asset} ${timeframe} chart right now. Key levels, momentum, and likely scenarios.` |
| `alert_review` | **Alert Review** | Sanity-check a notification/trigger | `Review this setup on ${asset} ${timeframe}. Rate it 1-10, biggest risk, and whether to wait or enter.` |
| `risk_check` | **Risk Check** | Sizing and risk guardrails | `Given the current context on ${asset} ${timeframe}, propose a conservative risk plan and invalidation.` |
| `top_down` | **Top-Down Analysis** | Continue in Insights Panel for depth | `Start a top-down analysis for ${asset}. Use HTF bias, key levels, and an entry plan for ${timeframe}.` |
| `quick_predict` | **Quick Predict** | Rapid bias, confidence, and primary trigger | `FAST PREDICT for ${asset} ${timeframe}.\nBias: [Call/Put/Neutral] (Confidence %)\nPrimary Trigger: [Logic]\nExpiry: [Target]\nLimit response to 3 precise lines.` |
| `custom` | **Custom** | Ask anything | *(Empty String - User Input)* |

## 2. Dynamic Context & System Instructions

The AI receives a constructed "System" or "Context" string alongside your prompt. This injects the market data and defines the AI's persona.

### Context Builder Logic
**Location:** `gui/Dashboard/src/utils/aiContext.js`

The function `buildAiContext` aggregates:
- `asset` & `timeframe`
- `currentPrice`
- `activeIndicators` (list of names)
- `recentTicks` (last 20 price updates)
- `indicatorSnapshots` (last 50 values for active indicators)
- `recentCandles` (last 100 historical candles, if available)

### System Prompt Construction (Modal)
**Location:** `gui/Dashboard/src/components/AskAiModal.jsx` (Lines ~216-222)

```javascript
let base = `You are analyzing ${asset || 'the market'} on ${timeframe || 'the chart'}.\n\n`;
base += `Current Market Data Context:\n${JSON.stringify(dataCtx, null, 2)}\n\n`;
base += `Respond concisely relative to the user's trading context. If the user asks for current price or indicators, refer to the data provided above. NEVER say you are using simulation data.`;

if (customInstructions) {
  base = `${customInstructions}\n\n${base}`;
}
```

### System Prompt Construction (Insights Panel)
**Location:** `gui/Dashboard/src/components/AiInsightsPanel.jsx` (Lines ~149-156)

```javascript
let base = `You are the QuFLX AI Insights Assistant. Analyzing ${selectedAsset || 'the asset'} on ${selectedTimeframe || 'the chart'}.\n\n`;
base += `Current Market Data Context:\n${JSON.stringify(dataCtx, null, 2)}\n\n`;
base += `Respond concisely. If the user asks for current price or indicators, refer to the data provided above. NEVER say you are using simulation data.`;

if (customInstructions) {
  base = `${customInstructions}\n\n${base}`;
}
```

## 3. Image Injection

**Location:** `gui/Dashboard/src/hooks/useAskAi.js`

If `imageSource` is set to "Live Snapshot" or "Annotated", a base64 screenshot is attached to the request under the `image` parameter. The prompt itself is NOT modified to mention the image; the AI model (Grok) automatically detects the image attachment.
