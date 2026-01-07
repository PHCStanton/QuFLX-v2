# History Rewrite Implementation Report (2026-01-06)

## Overview
This report documents the implementation details of the history data collection and bootstrap process in QuFLX v2, specifically focusing on the "Manual Mode" and the 15-second timeout logic introduced to resolve historical data loading issues.

## Technical Details

### 1. Frontend Integration (`marketStore.js`)
- **Manual Mode Trigger:** When an asset is selected and no local CSV is found, the system triggers a bootstrap process.
- **Timeout Configuration:** A dynamic wait time is retrieved from `settingsStore.automation.historyWaitTime` (default: 8s).
- **Manual Prompt:** A console log (and UI indicator) informs the user to click the asset in Pocket Option within the specified duration (e.g., 15 seconds).
- **Bootstrap Call:** `POST /api/v1/history/bootstrap-history` is called with the following payload:
  ```json
  {
    "asset": "AUDNZDOTC",
    "timeframe": "1",
    "duration": 15
  }
  ```

### 2. Backend Gateway (`history.py`)
- **Endpoint:** `/api/v1/history/bootstrap-history`
- **Default Duration:** Defaults to 15 seconds if not provided by the frontend.
- **Subprocess Execution:** Spawns `capabilities_v2/runner.py` to execute the `history_collector` capability.
- **Environment:** Injects `PYTHONPATH` to ensure the project root and `v2` directories are available for imports.
- **Logging:** Logs the start of the collection and the wait duration for manual click detection.

### 3. Capability Layer (`history_collector.py`)
- **Wait Time Logic:** `wait_time = max(8, duration_s)`. This ensures a minimum of 8 seconds and respects the frontend's requested duration (typically 15s).
- **Interception:** Uses `WebSocketInterceptor` to listen for history payloads from the Pocket Option web socket.
- **Resilient Matching:** Implements fuzzy asset matching to handle variations in symbol names between the UI and the data feed.
- **Early Exit:** Once historical candles are captured, it briefly collects real-time ticks (2s) to bridge the gap before returning the merged data.

## Critical Improvements & Lessons Learned
1. **Race Condition Prevention:** The frontend now awaits the bootstrap response before attempting to sync subscriptions or load indicators, ensuring data integrity.
2. **User Feedback:** Clearer logging and error messages in the "Manual Mode" flow reduce user confusion during the click-to-capture process.
3. **Path Resolution:** Relative path calculation for the subprocess runner was fixed to go up 4 levels to correctly reach the project root.

## Future Development Guidelines
- Always verify that `runner.py` is accessible from the gateway service.
- Maintain the 15-second window as a default for manual interactions.
- Ensure `lastError` is cleared in the store when starting a new asset selection to prevent stale error banners.
