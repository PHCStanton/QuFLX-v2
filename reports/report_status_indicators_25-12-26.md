# Indicator Implementation Status – Oscillators & AI Alignment (2025-12-26)

## 1. Scope of This Status Report
- Confirm current understanding of indicator integration for QuFLX v2 Dashboard.
- Focus specifically on **oscillator-style indicators** rendered in separate panes (RSI, MACD, CCI, DeMarker, etc.).
- Ensure the planned implementation remains structurally aligned with the **AI Trading Integration Architecture**.

## 2. Documents Reviewed
- [research_lightweight-charts-indicators_2025-12-23.md](file:///c:/QuFLX/v2/Research/research_lightweight-charts-indicators_2025-12-23.md)
- [ai_trading_integration_architecture_report_25-12-23.md](file:///c:/QuFLX/v2/reports/ai_trading_integration_architecture_report_25-12-23.md)
- [.agents/CORE_PRINCIPLES.md](file:///c:/QuFLX/v2/.agents/CORE_PRINCIPLES.md)

## 3. Backend Indicator State (Reference Only)
- Backend already provides a **mature TechnicalIndicatorsPipeline** in `backend/services/strategy/indicators.py`.
- Available indicators include all required oscillators for the first phase:
  - `rsi_14`, `rsi_21`, `stoch_k`, `stoch_d`, `williams_r`, `roc_10`, `schaff_tc`, `demarker`, `cci`, plus MACD family (`macd`, `macd_signal`, `macd_histogram`).
- V1 reference + research confirm we can expose `{ time, value }` series per indicator via an adapter pattern, without re‑implementing indicator math on the frontend.
- **Conclusion:** Backend is **ready** to supply chart-friendly oscillator series when we define the exact API contract.

## 4. Frontend Oscillator Layout – Confirmed Approach
Based on the research paper:
- Oscillators will **not** be drawn inside the main price pane.
- Instead, they will live in **separate Lightweight Charts instances**, stacked vertically below the main candlestick chart.
- Key properties of the planned layout:
  - Each oscillator (RSI, MACD, CCI, DeMarker, etc.) uses its own chart container and y-axis.
  - All charts share the **same logical timeframe** (M1/M5/etc.), controlled centrally by the store.
  - The **visible time range** of oscillator charts is synchronized with the main chart using `timeScale().setVisibleRange` callbacks.
  - Pane height is controlled purely by **React layout** (e.g., a draggable separator), keeping indicator logic independent from sizing concerns.
- **User experience goals:**
  - Clear separation between price action and oscillator bands.
  - Readable oscillator scales (no mixed price/oscillator autoscale issues).
  - Smooth scrolling/zooming where all panes move together.

## 5. Data Flow & Contracts – Indicators vs AI
To maintain structural integrity with upcoming AI integration:
- **Single source of truth:**
  - Backend indicator outputs (via `TechnicalIndicatorsPipeline` + adapter) are the **canonical values** used both for strategy and for AI context (`TradingContext`).
- **Frontend role:**
  - Visualize backend-provided series for strategy-linked oscillators (e.g., strategy RSI, MACD histogram) in dedicated panes.
  - Optionally add visual-only helpers later (e.g., custom user EMA overlays) with explicit separation from strategy indicators.
- **AI context alignment:**
  - The same indicator values and regimes used in the Dashboard will feed into `TradingContext.indicators` and regime detection described in the AI architecture report.
  - This prevents drift between what the trader sees and what the AI analyses.

## 6. Phase Focus – Oscillator Indicators First
For the initial implementation phase on the Dashboard:
- Prioritize **oscillator indicators** that live in bottom panes:
  - RSI (e.g., `rsi_14`), MACD (line + histogram), CCI, DeMarker, and potentially Schaff Trend Cycle and Stochastic.
- Treat each oscillator pane as:
  - A dedicated chart wired to the same timeframe and tick source as the main chart.
  - Backed by a `{ time, value }` series that can be provided by the backend once the adapter/endpoint is defined.
- Layout and UX considerations (from research) will be treated as first-class requirements:
  - Avoid visual clutter; default to a small, focused set of oscillators enabled.
  - Ensure pane resizing is smooth and does not break chart synchronization.

## 7. Alignment with CORE_PRINCIPLES
- **Functional Simplicity:**
  - We reuse backend indicator math and keep the frontend as a thin visualization layer.
  - Oscillators are isolated in their own panes, avoiding complex mixed scaling logic.
- **Sequential Logic:**
  - Data flow remains strictly: candles → backend indicators → adapter → Dashboard charts → AI context.
- **Incremental Testing:**
  - Indicator visualization can be added chart-by-chart (e.g., RSI pane first), with focused tests per pane.
- **Strict Separation of Concerns:**
  - Strategy, AI Gateway, and UI keep clear boundaries as described in the AI architecture report.

## 8. Current Status & Readiness Assessment
- Research and architectural alignment are **complete for oscillator integration**:
  - Layout model (multi-chart stack, shared time scale) is clearly defined.
  - Backend indicator availability and adapter pattern are validated.
  - AI integration requirements (TradingContext and Ask-AI) are understood and compatible with this design.
- **No frontend indicator code has been implemented yet**; this report confirms the blueprint and priorities so implementation can proceed without structural rework.

**Status:** READY TO IMPLEMENT – Oscillator panes (RSI, MACD, CCI, DeMarker, etc.) can now be implemented on the Dashboard following the confirmed layout and data contracts, with full compatibility for future AI analysis.