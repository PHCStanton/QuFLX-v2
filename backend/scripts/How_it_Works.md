# OTC Alert Dispatcher: How It Works

This document explains the internal mechanisms of the `otc_alert_dispatch.py` script, detailing how market conditions are identified, scored, and verified.

## 1. Data Capture Architecture

The dispatcher supports two primary modes of operation for tracking market data:

*   **Standard Mode (Polling/History)**: Periodically fetches the latest candles from the QuFLX Internal API. This is the default mode for analysis.
*   **Redis Mode (Real-time)**: Subscribes to the `market_data` channel on Redis. This allows for tick-by-tick monitoring and raw data logging without poll latency.

---

## 2. Technical Analysis Engine (`MarketScanner`)

The core logic resides in the `MarketScanner` class. It uses a combination of indicators to determine market "interestingness."

### Key Indicators & Parameters
| Indicator | Parameter | Purpose |
| :--- | :--- | :--- |
| **EMA Cross** | 9-period & 21-period | Detects short-term trend reversals (Golden/Death Crosses). |
| **ADX** | 14-period | Measures trend strength. Signals are prioritized when ADX > 25. |
| **RSI** | 14-period | Confirms momentum. Bullish > 60, Bearish < 40. |
| **Bollinger Bands** | 20, 2-std dev | Measures volatility and potential breakout zones. |
| **ATR** | 14-period | Used to normalize volatility and filter out market noise. |
| **Fractal Pivots** | 5-window | Identifies dynamic Support and Resistance levels. |

---

## 3. Market Condition Determination

The scanner classifies the market into one of the following states:

### 🟢 Trending Up / 🔴 Trending Down
*   **Price Action**: Price closes outside the Bollinger Bands (High for Up, Low for Down).
*   **Trend Strength**: ADX must be greater than 25 to confirm a valid breakout.
*   **Momentum**: RSI must support the direction (e.g., > 60 for an uptrend).

### 🟠 Breakout Potential (Squeeze)
*   **Condition**: The Bollinger Band width becomes extremely narrow (< 4% of price).
*   **Logic**: High compression often precedes a volatile expansion. The script flags this as a "Squeeze" signal.

### 🔵 EMA Cross-Over
*   **Bullish**: 9 EMA crosses above the 21 EMA.
*   **Bearish**: 9 EMA crosses below the 21 EMA.
*   **Note**: If no other trend is established, the EMA Cross becomes the primary signal.

---

## 4. Confidence (Confluence) Scoring

Every alert is assigned a **Confidence Score** (0-100%). This represents how many technical signals are "agreeing."

*   **EMA Cross**: +20%
*   **BB Breakout**: +30%
*   **BB Squeeze**: +25%
*   **RSI Confirmation**: +15%
*   **S/R Proximity**: +10% (Price within 0.1% of support or resistance).

---

## 5. AI Confirmation Layer

Once a technical signal is detected, the script optionaly sends the data to the **QuFLX AI Orchestrator**:

1.  **Context Building**: The script packages the technical indicators (ADX, RSI, Price vs S/R) into a prompt.
2.  **LLM Reasoning**: The AI analyzes the confluence and provides a "Confirmed" or "Rejected" verdict.
3.  **Final Dispatch**: If AI Confirmation is enabled in Settings, alerts are only sent to Discord if the AI provides a confidence score higher than your set threshold (default 0.7).

---

## 6. Notification & Logging

*   **Discord Dispatcher**: Sends formatted rich embeds to your Discord channel via Webhook.
*   **Tick Logger**: Buffers raw tick data and flushes to CSV files once the chunk size (default 1000) is reached.
*   **Cooldowns**: To prevent spam, the script silences alerts for the same asset for a configurable period (default 5 minutes).
