# History Data Payload Aggregation & Fix Report
**Date:** 2026-01-06 (Updated: 2026-01-06 20:45 UTC)  
**Status:** CRITICAL – Root Cause Identified, Rewrite Recommended  
**Context:** Fix for "History Data Not Loading" (500 Internal Server Error / 404 Not Found)

## ⚠️ LATEST FINDINGS (2026-01-06 20:45 UTC)

**History implementation has been refined for Manual Mode stability.**

### 1. Manual Mode Workflow
- **Frontend Timeout:** 15 seconds (configurable in settings).
- **Backend Wait:** Respects the `duration` parameter from the frontend.
- **User Action:** Requires manual click in Pocket Option within the 15s window.

### 2. Key Logic Updates
- **Path Fix:** `runner.py` is now correctly located via `../../../../capabilities_v2/runner.py`.
- **Capability Wait:** `history_collector.py` uses `max(8, duration_s)` for interception.
- **Error Handling:** Structured error responses from backend are surfaced as user-friendly toasts.

---

## Original Report (Path Fix Applied 2026-01-06)

## 1. Issue Summary
Users reported that historical data was not loading in the Dashboard.
- **Symptoms:**
  - `GET /api/v1/history/{asset}` returned **404 Not Found** (Expected for new assets).
  - `POST /api/v1/history/bootstrap-history` returned **500 Internal Server Error**.
  - Frontend displayed: *"Error: Manual click not detected or bootstrap failed"*.
- **Impact:** No historical candles were displayed on the chart; only live ticks were visible (if streaming worked).

## 2. Root Cause Analysis
The 500 error was caused by a **Path Calculation Bug** in `backend/services/gateway/routes/history.py`.

The code attempted to locate the `runner.py` script using a relative path that was **one level too shallow**:
- **Incorrect Path:** `../../../capabilities_v2/runner.py`
  - Resolved to: `backend/capabilities_v2/runner.py` (Non-existent)
- **Correct Path:** `../../../../capabilities_v2/runner.py`
  - Resolves to: `capabilities_v2/runner.py` (Project Root)

This caused the `subprocess` call to fail immediately because it could not find the python script to execute.

## 3. Fixes Applied
The following changes were made to `backend/services/gateway/routes/history.py`:

### A. Fixed `bootstrap_history` Path
Updated the relative path calculation to go up **4 levels** instead of 3.
```python
# BEFORE
runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))

# AFTER
runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
```

### B. Fixed `PYTHONPATH` Injection
Updated the `project_root` calculation to ensure imports work correctly within the subprocess.
```python
# BEFORE
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))

# AFTER
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
```

### C. Fixed `collect_history` Path
Applied the same fix to the background collection endpoint.
```python
# BEFORE
runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))

# AFTER
runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
```

### D. Extended History Collection Timeout
Updated `capabilities_v2/history_collector.py` to respect the `duration` parameter for the history wait loop, preventing premature timeouts during manual selection.
```python
# BEFORE
history_deadline = time.time() + 8  # Hardcoded 8s

# AFTER
history_deadline = time.time() + max(8, duration_s)  # Use duration (default 15s)
```

## 4. Current System State & Workflow

### "Manual Mode" Explained
The system currently operates in **Manual Mode** for history collection because the "Auto Select" feature (where the bot clicks for you) is deprecated.

**The Workflow:**
1. **User Selects Asset** in Dashboard (e.g., clicks "AUD/USD OTC").
2. **Dashboard** checks for existing CSV history (returns 404 if none).
3. **Dashboard** calls `bootstrap-history` endpoint.
4. **Backend** spawns `history_collector` process via `runner.py`.
5. **Frontend** displays: *"Manual Mode: Waiting for user to click..."*
6. **USER ACTION REQUIRED:** The user **MUST click the asset** in the Pocket Option browser window.
7. **Collector** intercepts the network response from Pocket Option containing history.
8. **Backend** saves data to CSV and returns candles to Frontend.
9. **Frontend** renders the chart.

**If the user does not click:**
- The collector waits 15 seconds.
- It times out.
- Frontend shows: *"Error: Manual click not detected"*.

## 5. Terminology Clarification

- **Collection:** The process of intercepting raw data (ticks/candles) from the source (Pocket Option).
- **Aggregation:** The process of grouping raw ticks into candles (e.g., 60 ticks -> 1 minute candle).
  - *Note:* The `HistoryCollector` performs both collection (intercepting the payload) and aggregation (merging history with live ticks).
- **Bootstrap:** The specific act of fetching *initial* history for an asset that has no local data yet.

## 6. Verification Steps
To confirm the fix:
1. **Restart Gateway:** The code changes require a restart of the backend process.
2. **Select Asset:** Click a new asset in the Dashboard.
3. **Observe Log:** Ensure no 500 error appears in the Gateway terminal.
4. **Perform Click:** Click the same asset in the Pocket Option window when prompted.
5. **Verify Chart:** Candles should appear.
