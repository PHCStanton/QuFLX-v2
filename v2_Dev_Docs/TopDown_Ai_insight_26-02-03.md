# TopDown Analysis & AI Insight Integration Plan
**Date:** 2026-02-03
**Status:** Proposal / Design Phase

This document outlines the implementation strategy for integrating TopDown Analysis into the AI Insights panel, improving screenshot workflows, and managing the Alert Dispatcher system.

---

## 1. Universal Image Upload & Analysis
**Requirement:** 
- specific upload capability in "AI Insights" modal.
- Support for analyzing external platform charts (e.g., Pocket Option) uploaded by the user.

**Recommendation:**
- **Unified Attachment System**: Enhance the AI Chat input area to accept generic file uploads (images), not just internal screenshots.
- **Vision Model Prompting**: When an external image is uploaded, prepend a system instruction: *"Analyze this chart image for market structure, trends, and patterns. Note that this may be an external platform chart."*
- **Why**: Keeps the UI consistent. Usage of a capable Vision model (like Gemini 1.5 Pro/Flash or GPT-4o) allows generic analysis of *any* chart image without custom parsing logic for every external platform.

---

## 2. Seamless Internal Screenshot Sharing
**Requirement:** 
- "Ask AI" button on screenshots -> "AI Insights".
- Screenshots context should attach *automatically* to the Insights panel.
- Eliminate "Share -> Wait -> Share -> Wait" friction.
- AI should fetch corresponding historical data files from `@data\data_output\history` based on the screenshot filename/metadata.

**Recommendation:**
- **Smart Metadata Context**: When a screenshot is captured in QuFLX, it is already saved with metadata (Asset, Timeframe, Timestamp). Instead of just sending the pixel data to the AI:
    1.  Frontend sends the **Reference ID** (Filename) to the AI.
    2.  Backend Middleware intercepts this, looks up the corresponding JSON data in `data_output/history`, and injects the *raw OHLC data* directly into the AI's context window alongside the image.
- **"Attach & Continue" Workflow**: The "Capture" action should have a "Add to Insight" toggle. When checked, it silently uploads the context to the active AI session *background* without triggering a response generation immediately. The user can stack multiple timeframes (1H, 15m, 1m) and then send *one* prompt: "Analyze these views."
- **Why**: Reduces API latency and token wastage. Giving the AI the raw numbers (from the file) + the visual (screenshot) is far more accurate than vision alone.

---

## 3. Backend Integration of S&R Indicator
**Requirement:** 
- Frontend Custom S&R Indicator exists but AI doesn't "see" it backend-side.

**Recommendation:**
- **Logic Porting**: The logic currently calculating Support/Resistance in the Frontend (JavaScript) must be ported/duplicated to Python in `backend.services.analytics.technical_analysis`.
- **Pre-calculation**: When the AI request is made, the backend should run this Python function on the data buffer and inject the resulting levels textually into the system prompt (e.g., *"Current Technical Context: Support at 1.0500, Resistance at 1.0600"*).
- **Why**: AI LLMs are bad at calculating precise geometric levels from tokenized numbers. Explicitly telling them the levels ensures the AI and User see the same reality.

---

## 4. TopDown Assistant "Wizard" Mode
**Requirement:** 
- "TopDown" button should initiate a structured, step-by-step guidance workflow.
- Concise summary/reporting.

**Recommendation:**
- **Interactive State Machine**: When "TopDown" is clicked, switch the AI System Prompt to a "Moderator Mode".
    - *AI:* "Starting TopDown Analysis. Step 1: Upload the 4H Chart or describe the higher timeframe trend."
    - *User:* (Uploads image)
    - *AI:* "Received. Trend is Bullish. Step 2: Switch to 15m for structure..."
- **Final Report Generation**: At the end of the flow, the AI generates a structured Artifact (Markdown) summarizing the view (e.g., "bias: LONG, key_levels: [x, y], status: WAIT_FOR_PULLBACK").
- **Why**: Prevents the user from getting lost and ensures all necessary datapoints are collected before a decision is made.

---

## 5. Alert Script Management & Tick Logging
**Requirement:** 
- Mechanism to Enable/Disable the Alert Script.
- Save ticks in batches of 1000 to avoid memory issues/data loss.
- Reference: `@compile_ticks_csv.py` from v1.

**Recommendation:**
- **Process Management**: Run the Alert Dispatcher as a managed background task (Service).
    - **Toggle**: Use a Redis key `system:alerts:enabled`. The script checks this key at the start of every loop. If `False`, it sleeps.
    - **UI Control**: Simple Toggle Switch in the "Automation" or "Settings" panel.
- **Buffered File Logging**:
    - Implement a `TickLogger` class.
    - **Logic**: Memory Buffer -> (Limit 1000) -> Flush to CSV -> Clear Buffer.
    - **Naming**: `data/ticks/{asset}/{timestamp_start}_{timestamp_end}.csv`
- **Why**: File I/O is slow. Writing every tick crashes systems. Writing every 1000 ticks is efficient and safe. Segregating by functionality (Toggle vs Logic) keeps the system responsive.

---

## Summary of Next Steps for Phase 3
1.  **Frontend**: Update AI Insights UI for file uploads and "Stacking" contexts.
2.  **Backend**: Port S&R logic to Python.
3.  **System**: Implement Redis-backed Toggle for Alert Dispatcher.
