# Research Paper – AI Integration: Real-time Data, Files & Vision – 2025-12-20

## 1. Executive Summary
This paper outlines the strategy for empowering the QuFLX "Ask AI" feature with real-time market awareness and visual capabilities using the xAI API (Grok). By leveraging Grok's multimodal (Vision) capabilities and a "Context Injection" architecture, we can enable the AI to "see" the user's charts and analyze real-time market data without requiring direct access to the user's machine. The proposed solution integrates the existing screenshot functionality ("red button") directly into the AI query pipeline.

## 2. Core Concepts & Mental Model

### 2.1. The "Blind" AI Problem
As noted by the AI's previous response, the model running on xAI's servers is "stateless" and "blind" to the user's local session. It has no persistent connection to the dashboard's DOM or the local file system.

### 2.2. Solution: Context Injection
To solve this, we must invert the relationship: instead of the AI "reaching out" to see the data, the application **pushes** the data to the AI with every request.
*   **Data Context**: JSON representation of current price, indicators, and recent candles.
*   **Visual Context**: Base64-encoded screenshots of the chart.
*   **File Context**: Text content of relevant logs or historical data files read by the backend.

### 2.3. Multimodal Architecture (Grok Vision)
The xAI API (specifically Grok-1.5V and Grok-4 series) supports **multimodal inputs**. This means a single API message can contain both:
1.  **Text**: The user's prompt (e.g., "What pattern is forming?")
2.  **Image**: The chart screenshot.

## 3. Official Recommendations & Best Practices

### 3.1. xAI API Usage
*   **Model Selection**: Use `grok-4-vision` (or equivalent latest vision-capable model) for requests involving images. Use `grok-4-fast` for pure text/data queries to save latency/cost.
*   **Payload Structure**:
    ```json
    {
      "model": "grok-4-vision-latest",
      "messages": [
        {
          "role": "user",
          "content": [
            { "type": "text", "text": "Analyze this chart pattern." },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
          ]
        }
      ]
    }
    ```
*   **Privacy**: Ensure users are aware that screenshots are sent to xAI for analysis.

### 3.2. File System Access Strategy
*   **Screenshots**: The system already saves screenshots to `c:/QuFLX/v2/data/screenshots/`.
*   **Retrieval**: The `AIService` should act as the "File System Agent".
    *   *Option A (Implicit)*: Frontend sends the image directly (faster, no disk read needed).
    *   *Option B (Reference)*: Frontend sends "Analyze latest screenshot", Backend reads the most recent file in `data/screenshots/`.
    *   **Recommendation**: **Option A** for the "Ask AI" button (saves a round-trip to disk). **Option B** for "Batch Analysis" background tasks.

## 4. Proposed Implementation Steps (Actionable)

### Phase 1: Data Context (The "Brain")
**Goal**: Give AI the numbers.
1.  **Frontend (`TopBar.jsx`)**:
    *   Gather state from `useMarketStore`: `selectedAsset`, `currentPrice`, `lastCandle`, `indicators`.
    *   Pass this object to `askAI({ prompt, context: marketData })`.
2.  **Backend (`AIService`)**:
    *   Format this JSON context into a System Prompt: *"Current Market Context: Asset: EURUSD, Price: 1.05..."*

### Phase 2: Vision Context (The "Eyes")
**Goal**: Give AI the chart view.
1.  **Frontend (`TopBar.jsx`)**:
    *   Reuse `handleOpenScreenshot` logic *without* opening the modal.
    *   Capture canvas `toDataURL('image/png')`.
    *   Send as `image` field in `askAI` payload.
2.  **Backend (`AIService`)**:
    *   Detect if `image` is present.
    *   Construct the multimodal message for xAI.

### Phase 3: Historical/File Access (The "Memory")
**Goal**: Allow AI to reference saved data.
1.  **Backend Tooling**:
    *   Implement a helper `get_recent_screenshots(limit=5)` in `AIService`.
    *   Implement `read_history_file(asset)` to load CSV data.
2.  **Integration**:
    *   When the user asks "Compare with yesterday's data", the service loads the relevant CSV segment and injects it into the prompt context.

## 5. Security & Safety
*   **Read-Only**: The AI should generally only *read* these files. Write access (other than saving its own logs) should be restricted.
*   **Path Traversal**: Ensure file access is strictly limited to `c:/QuFLX/v2/data/` to prevent reading system files.

## 6. Next Steps
1.  **Approve Phase 1 & 2**: Immediate implementation of Data + Vision injection.
2.  **Update Contracts**: Modify `POST /api/v1/ai/ask` to accept `image_base64`.
3.  **Refactor Frontend**: Extract screenshot logic from `TopBar` into a reusable hook `useChartCapture`.

---
*Prepared by: Researcher Agent*
*Date: 2025-12-20*
