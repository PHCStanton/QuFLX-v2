# OTC Sniper Integration Guide: SSID API Method
**Date:** February 25, 2025
**Version:** 1.0
**Status:** Production Ready

## 1. Executive Summary
This guide details the successful integration of the **SSID-based Pocket Option API** into the OTC Sniper Web Application. The integration replaces legacy global-state dependencies with a robust, **instance-based architecture** that supports:
- **Dual Account Isolation:** Simultaneous Demo and Real account connections without cross-contamination.
- **Seamless Switching:** Instant toggling between accounts with zero latency or re-login requirements.
- **Persistent Configuration:** Automatic saving of valid SSIDs to the local environment (`.env`).
- **Reliable Trade Execution:** Thread-safe synchronous wrappers for asynchronous WebSocket operations.

---

## 2. Architecture Overview

The system follows a **Layered Architecture** designed to bridge the synchronous world of standard Python applications with the asynchronous nature of WebSocket communications.

### Component Stack
1.  **Frontend (React)**: User Interface for switching accounts and executing trades.
    *   *Communication*: HTTP (REST) for commands, WebSocket for live data.
    *   *Port*: 8001 (Backend API).
2.  **Backend API (FastAPI)**: `web_app/backend/main.py`
    *   Acts as the entry point.
    *   Manages two distinct `OTCDataManager` instances (`demo` and `real`).
    *   Handles SSID persistence via `EnvManager`.
3.  **Data Orchestrator (`OTCDataManager`)**: `tui/otc_sniper/frontend/data_manager.py`
    *   Central source of truth.
    *   Manages `PocketOptionSession`, `PayoutManager`, and `TradeExecutor`.
4.  **Session Manager (`PocketOptionSession`)**: `tui/otc_sniper/backend/session.py`
    *   High-level abstraction for account operations.
    *   Provides properties like `.balance` which auto-fetch live data.
5.  **Async Bridge (`AsyncPocketOptionWrapper`)**: `tui/otc_sniper/backend/session.py`
    *   **CRITICAL COMPONENT**: Runs a dedicated `asyncio` event loop in a background thread.
    *   Uses `asyncio.run_coroutine_threadsafe` to execute async methods from synchronous code.
6.  **Core API (`PocketOptionInstance`)**: `web_app/backend/api_wrapper/pocket_option_instance.py`
    *   Low-level WebSocket client.
    *   **Completely State-Isolated**: No global variables. Each instance has its own headers, cookies, and connection state.

---

## 3. Key Features & Implementation Details

### 3.1 Dual SSID Isolation (The "User Not Authorized" Fix)
**Problem:** The legacy API relied on a global `ssid` variable. Switching accounts overwrote this variable, causing race conditions where the Real account would try to use the Demo SSID (or vice versa), resulting in "User not Authorized" errors.
**Solution:**
- We implemented `PocketOptionInstance` class.
- **Implementation:**
  ```python
  # OLD (Legacy)
  # import global_value
  # global_value.SSID = "..."

  # NEW (Instance-based)
  self.demo_session = PocketOptionInstance(demo_ssid, True)
  self.real_session = PocketOptionInstance(real_ssid, False)
  ```
- **Result:** You can now have both accounts connected simultaneously.

### 3.2 SSID Persistence (.env Integration)
**Feature:** When a user enters a valid SSID in the Web App, it is automatically saved to `tui/otc_sniper/.env`.
**Mechanism:**
1.  Frontend sends SSID to `/api/connect`.
2.  Backend verifies connection.
3.  If successful, `EnvManager.update_key()` is called.
4.  The `.env` file is updated without destroying comments or structure.
**Code Reference:** `web_app/backend/main.py` (lines 115-123).

### 3.3 Thread-Safe Trade Execution
**Challenge:** The backend runs synchronously (mostly), but the WebSocket API is asynchronous.
**Solution:** `AsyncPocketOptionWrapper` maintains a background thread with an event loop.
**Pattern:**
```python
def buy(self, ...):
    future = asyncio.run_coroutine_threadsafe(self.instance.buy(...), self.loop)
    return future.result(timeout=15)
```
This allows standard synchronous code to "await" async results safely.

---

## 4. Technical Specifications

### API Endpoints
*   **Base URL**: `http://localhost:8001` (Changed from 8000 to avoid conflicts)
*   **POST /api/connect**:
    *   Body: `{"ssid": "...", "demo": true/false}`
    *   Returns: `{"success": true, "balance": 123.45, ...}`
*   **POST /api/trade**:
    *   Body: `{"asset_id": "...", "direction": "call", "amount": 1.0, "demo": true}`

### WebSocket Configuration
*   **Regions**: Automatically cycles through:
    *   `api-eu.po.market`
    *   `api-fi.po.market`
    *   `api-en.po.market`
*   **Headers**: Requires strict `User-Agent` and `Origin` to mimic a browser.

### SSID Format
The SSID must be a raw JSON string extracted from the `42["auth", ...]` WebSocket frame.
*   **Prefix**: `42["auth",`
*   **Contains**: `session_id`, `uid`, `isDemo`.

---

## 5. Pitfalls & Safeguards

### 5.1 Common Pitfalls
1.  **Global State Pollution**:
    *   *Issue*: Importing modules that set global variables (like the old `PocketOptionAPI-v2`).
    *   *Safeguard*: Use `PocketOptionInstance`. Never import the legacy `main.py` or `global_value.py`.
2.  **WebSocket 451 (Unavailable for Legal Reasons)**:
    *   *Issue*: Connecting to a region blocked in the user's country.
    *   *Safeguard*: The wrapper implements a **Region Rotation** mechanism, trying multiple URLs until one connects.
3.  **Port Conflicts (WinError 10048)**:
    *   *Issue*: `python.exe` processes lingering and holding port 8000.
    *   *Safeguard*: Moved to **Port 8001**. Added logic to kill zombie processes during development.

### 5.2 Development Safeguards
*   **Validation**: `OTCDataManager` validates SSID structure before attempting connection.
*   **Timeout Handling**: All synchronous wrappers have `timeout` parameters (default 15s) to prevent infinite hanging if the WebSocket drops.
*   **Keep-Alive**: A background task sends periodic heartbeats to prevent the server from closing the connection.

---

## 6. Integration Checklist (For Future Developers)

When integrating this module into a new Bot or App:

1.  [ ] **Copy the Wrapper**: Ensure `pocket_option_instance.py` and `session.py` are present.
2.  [ ] **Install Dependencies**: `websockets`, `asyncio`, `python-dotenv`.
3.  [ ] **Initialize Manager**:
    ```python
    from otc_sniper.frontend.data_manager import OTCDataManager
    dm = OTCDataManager(ssid="...", demo=True)
    ```
4.  [ ] **Access Balance**: `current_balance = dm.session.balance` (Auto-fetches).
5.  [ ] **Execute Trade**: `dm.executor.execute_trade(...)`.
6.  [ ] **Handle Persistence**: Use `EnvManager.update_key()` for saving user credentials.

## 7. File Reference

| File | Purpose |
| :--- | :--- |
| [main.py](file:///c:/QuFLX/v2/ssid/web_app/backend/main.py) | **Entry Point**: FastAPI backend & SSID persistence logic. |
| [pocket_option_instance.py](file:///c:/QuFLX/v2/ssid/web_app/backend/api_wrapper/pocket_option_instance.py) | **Core Logic**: Async WebSocket client (No global state). |
| [session.py](file:///c:/QuFLX/v2/ssid/tui/otc_sniper/backend/session.py) | **Bridge**: `AsyncPocketOptionWrapper` & `PocketOptionSession`. |
| [data_manager.py](file:///c:/QuFLX/v2/ssid/tui/otc_sniper/frontend/data_manager.py) | **Orchestrator**: High-level application state management. |
| [env_manager.py](file:///c:/QuFLX/v2/ssid/tui/otc_sniper/utils/env_manager.py) | **Utility**: Safe `.env` file updating. |

---
**Prepared by:** @Team-Leader & @Backend-Specialist
