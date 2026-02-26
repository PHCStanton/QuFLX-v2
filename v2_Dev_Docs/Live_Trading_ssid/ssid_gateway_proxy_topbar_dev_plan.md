# SSID Gateway Proxy + TopBar Integration — Full Development Plan
**Date:** February 25, 2026
**Version:** 2.0
**Status:** Active — Supersedes `Live_Trading_ssid_Implementation_Plan.md`
**Author:** @Team-Leader + @Backend-Specialist + @Frontend-Specialist

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Deprecation Manifest](#2-complete-deprecation-manifest) ← CRITICAL
3. [New File Structure](#3-new-file-structure)
4. [Implementation Phases](#4-implementation-phases)
5. [API Contract](#5-api-contract)
6. [SSID Security](#6-ssid-security)
7. [Verification Checklist](#7-verification-checklist)

---

## 1. Executive Summary

### What This Plan Replaces

This document supersedes `Live_Trading_ssid_Implementation_Plan.md` (the original plan) and the partially-implemented `trading_service.py` singleton approach. The previous implementation had **6 confirmed bugs** and relied on a global-state PocketOption API library (`global_value.py`) embedded inside `ssid_integration/`. That approach is **fully deprecated** — no patches, no incremental fixes.

> Per Core Principle #7 (Stop Patching, Start Rewriting): The previous `trading_service.py` accumulated 6 bugs across threading, response shapes, and mode-switching. A clean rewrite as an independent service is the correct path.

### Chosen Architecture: Gateway Proxy (Option A)

```
Dashboard (React :5173)
    │
    │  HTTP /api/v1/trading/*
    ▼
Gateway (FastAPI :8000)
    │  trading_proxy.py  ← thin HTTP proxy, no business logic
    │
    │  HTTP /api/*
    ▼
ssid_service (FastAPI :8001)   ← NEW independent microservice
    │
    │  WebSocket (async, instance-based, no global state)
    ▼
Pocket Option API (wss://api-eu.po.market / api-fi / api-en)
```

**Why Gateway Proxy (not direct from Dashboard)?**
- Single origin for the frontend — no CORS issues
- `tradingStore.js` URL base stays `http://localhost:8000` — zero frontend URL changes
- Gateway can add auth, rate-limiting, and logging in one place
- ssid_service can be restarted independently without touching the Gateway

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Gateway Proxy | Single origin, no CORS, tradingStore unchanged |
| SSID storage | `.env` only | Never in JSON config files — security requirement |
| API library | Instance-based `PocketOptionInstance` | No `global_value.py`, dual-account safe |
| Service port | 8001 | Matches Integration Guide, avoids Gateway conflict |
| Ops pattern | Follows existing `ops.py` pattern | Chrome/Stream precedent already proven |
| Old code | Full deletion | Zero residue — user explicit requirement |

---

## 2. Complete Deprecation Manifest

>  **CRITICAL  USER REQUIREMENT: "There must be no residue in the codebase."**
> Every file listed below MUST be deleted or moved BEFORE any new code is written.
> This is Phase 0 and it is non-negotiable.

---

### 2.1 Files to DELETE Permanently

These files are dead code after this implementation. Delete them with no backup in the working tree.

#### `ssid_integration/`  ENTIRE DIRECTORY

| File | Reason for Deletion |
|---|---|
| `ssid_integration/__init__.py` | Exposes `SSIDConnector`, `OTCExecutor`  replaced by ssid_service |
| `ssid_integration/connector.py` | Uses `global_value.py`  replaced by `PocketOptionInstance` |
| `ssid_integration/executor.py` | Hardcoded assets, global state  replaced by ssid_service executor |
| `ssid_integration/README.md` | Documents deleted code |
| `ssid_integration/ssid_integration_task.md` | Task doc for deleted implementation |
| `ssid_integration/pocketoptionapi/__init__.py` | Global-state API package root |
| `ssid_integration/pocketoptionapi/_.py` | Unknown/temp file |
| `ssid_integration/pocketoptionapi/api.py` | Global-state API |
| `ssid_integration/pocketoptionapi/candles.json` | Stale data artifact |
| `ssid_integration/pocketoptionapi/constants.py` | Part of global-state package |
| `ssid_integration/pocketoptionapi/expiration.py` | Part of global-state package |
| `ssid_integration/pocketoptionapi/global_value.py` | **ROOT CAUSE of all bugs**  global mutable state |
| `ssid_integration/pocketoptionapi/pocket.py` | Global-state API |
| `ssid_integration/pocketoptionapi/prueba_temp.py` | Temp/test file |
| `ssid_integration/pocketoptionapi/stable_api.py` | Global-state API wrapper |
| `ssid_integration/pocketoptionapi/backend/` | Entire subdirectory |
| `ssid_integration/pocketoptionapi/test/` | Entire subdirectory |
| `ssid_integration/pocketoptionapi/ws/` | Entire subdirectory |

**Delete command:**
```powershell
Remove-Item -Recurse -Force "c:\QuFLX\v2\ssid_integration"
```

#### `backend/services/gateway/trading_service.py`  DELETE

| File | Reason for Deletion |
|---|---|
| `backend/services/gateway/trading_service.py` | Singleton with 6 bugs. Replaced by `trading_proxy.py` + ssid_service. Even the "fixed" version is wrong architecture  business logic does not belong in the Gateway. |

**Delete command:**
```powershell
Remove-Item -Force "c:\QuFLX\v2\backend\services\gateway\trading_service.py"
```

#### `data/settings/trading_config.json`  DELETE IF EXISTS

| File | Reason for Deletion |
|---|---|
| `data/settings/trading_config.json` | SSIDs must never be stored in JSON files. Move to `.env` only. |

**Delete command:**
```powershell
if (Test-Path "c:\QuFLX\v2\data\settings\trading_config.json") { Remove-Item -Force "c:\QuFLX\v2\data\settings\trading_config.json" }
```

---

### 2.2 Files to MOVE (Reference Only  Archive)

These files contain valuable reference documentation and must be preserved, but moved out of active code paths.

| Source | Destination | Action |
|---|---|---|
| `ssid_integration/INTEGRATIONS_GUIDE_26-02-25.md` | `v2_Dev_Docs/Live_Trading_ssid/INTEGRATIONS_GUIDE_26-02-25.md` | Already present  confirm and delete source |

**Note:** `ssid_integration/INTEGRATIONS_GUIDE_26-02-25.md` does not appear in the directory listing  it was already moved to `v2_Dev_Docs/Live_Trading_ssid/`. Confirm with:
```powershell
Test-Path "c:\QuFLX\v2\ssid_integration\INTEGRATIONS_GUIDE_26-02-25.md"
# Should return False  if True, move it then delete
```

---

### 2.3 Files to MODIFY (Surgical Changes Only)

These files stay but require targeted edits to remove all references to deleted code.

#### `backend/services/gateway/main.py`

**Remove:**
```python
# Line to remove:
from backend.services.gateway.routes import ... trading
# And:
app.include_router(trading.router, prefix="/api/v1/trading", tags=["Live Trading"])
```

**Add (replace with proxy router):**
```python
from backend.services.gateway.routes import trading_proxy
app.include_router(trading_proxy.router, prefix="/api/v1/trading", tags=["Live Trading"])
```

#### `backend/services/gateway/routes/trading.py`

**Current state:** Full business logic calling `trading_service.py`
**New state:** Thin proxy  all endpoint URLs preserved, bodies forwarded to ssid_service :8001
**Action:** Full rewrite of file content (not deletion  URL structure must be preserved for `tradingStore.js`)

#### `backend/services/gateway/routes/ops.py`

**Add:** SSID service start/stop/status entries following the existing `chrome`/`collector` pattern:
- `_registry["ssid_service"]` entry
- `_spawn_ssid_service()` function
- `POST /ssid/start` endpoint
- `POST /ssid/stop` endpoint
- `GET /ssid/status` endpoint

#### `gui/Dashboard/src/components/TopBar.jsx`

**Add:** SSID `StatusBadge` following the exact same pattern as Chrome and Stream badges.

#### `gui/Dashboard/src/store/marketStore.js`

**Add to `createConnectionSlice`:**
- `ssidStatus: 'disconnected'`
- `opsSsidBusy: false`
- `startSsidService()` action
- `stopSsidService()` action

#### `.env` (project root)

**Add:**
```env
QFLX_SSID_DEMO=
QFLX_SSID_REAL=
QFLX_SSID_SERVICE_PORT=8001
```

#### `.env.example`

**Add same placeholders** (with empty values  never real SSIDs).

#### `.gitignore`

**Verify/Add:**
```gitignore
# SSID credentials  NEVER commit
.env
*.env
```
`.env` is already in `.gitignore`  confirm it covers the project root `.env`.

---

### 2.4 Imports to Remove

Search and remove all references to the deleted modules:

```powershell
# Find all remaining references to ssid_integration or trading_service
Select-String -Path "c:\QuFLX\v2\backend\*" -Pattern "ssid_integration|trading_service" -Recurse
Select-String -Path "c:\QuFLX\v2\gui\*" -Pattern "ssid_integration|trading_service" -Recurse
```

**Expected references to clean:**
- `backend/services/gateway/main.py`  `from backend.services.gateway.routes import ... trading`
- `backend/services/gateway/routes/trading.py`  `from backend.services.gateway.trading_service import get_trading_service`
- Any test files referencing `trading_service` or `SSIDConnector` from `ssid_integration`

---

### 2.5 Git Verification Commands

Run after completing Phase 0 to confirm zero residue:

```powershell
# Confirm ssid_integration is gone
Test-Path "c:\QuFLX\v2\ssid_integration"
# Expected: False

# Confirm trading_service.py is gone
Test-Path "c:\QuFLX\v2\backend\services\gateway\trading_service.py"
# Expected: False

# Confirm no imports of deleted modules remain
Select-String -Path "c:\QuFLX\v2\backend" -Pattern "from ssid_integration|import ssid_integration|trading_service" -Recurse
# Expected: No output

# Confirm no trading_config.json with SSIDs
Test-Path "c:\QuFLX\v2\data\settings\trading_config.json"
# Expected: False

# Git status  should show only deletions and new files
git -C "c:\QuFLX\v2" status
```

---

### 2.6 Deprecation Checklist

- [ ] `ssid_integration/` directory deleted entirely
- [ ] `backend/services/gateway/trading_service.py` deleted
- [ ] `data/settings/trading_config.json` deleted (if exists)
- [ ] `main.py` import of old `trading` router removed
- [ ] `routes/trading.py` rewritten as proxy (old business logic gone)
- [ ] No `from ssid_integration` imports anywhere in `backend/`
- [ ] No `from ssid_integration` imports anywhere in `gui/`
- [ ] No `global_value` references anywhere in `backend/`
- [ ] `.env` has SSID placeholders (empty values)
- [ ] `.gitignore` confirmed to exclude `.env`
- [ ] `git status` shows clean state with only intended changes

---

## 3. New File Structure

### 3.1 New Service: `backend/services/ssid_service/`

```
backend/services/ssid_service/
 __init__.py                  # Empty package marker
 main.py                      # FastAPI app, port 8001, lifespan startup/shutdown
 connector.py                 # Instance-based SSID connector (no global_value)
 executor.py                  # OTC trade executor (uses connector instance)
 routes.py                    # All /api/* endpoints
 pocketoptionapi/             # Instance-based API (from Integration Guide)
     __init__.py
     pocket_option_instance.py  # PocketOptionInstance class  NO global_value.py
```

**Key design rules for this service:**
- Zero global state  every connection is a `PocketOptionInstance` object
- Dual-account support: `demo_instance` and `real_instance` can coexist
- SSIDs loaded from environment variables at startup only
- All blocking WebSocket calls run in `asyncio.run_in_executor()`
- Region rotation built-in: `api-eu.po.market`  `api-fi.po.market`  `api-en.po.market`

### 3.2 New Gateway File: `backend/services/gateway/routes/trading_proxy.py`

```
backend/services/gateway/routes/trading_proxy.py
```

This is a **thin HTTP proxy only**  no business logic, no state, no imports from ssid_service.

```python
# trading_proxy.py  what it does:
# 1. Receives request at /api/v1/trading/*
# 2. Forwards to http://localhost:8001/api/* (ssid_service)
# 3. Returns response as-is
# 4. On connection error  returns 503 with user-friendly message
```

### 3.3 Modified Files Summary

```
backend/services/gateway/
 main.py                      # MODIFIED: swap trading  trading_proxy router
 routes/
    trading.py               # REWRITTEN: thin proxy (replaces business logic)
    trading_proxy.py         # NEW: httpx-based proxy to ssid_service :8001
    ops.py                   # MODIFIED: add ssid_service start/stop/status

gui/Dashboard/src/
 components/
    TopBar.jsx               # MODIFIED: add SSID StatusBadge
 store/
     marketStore.js           # MODIFIED: add ssidStatus + startSsidService/stopSsidService

.env                             # MODIFIED: add QFLX_SSID_DEMO, QFLX_SSID_REAL, QFLX_SSID_SERVICE_PORT
.env.example                     # MODIFIED: add SSID placeholders
```

### 3.4 Files NOT Changed

```
gui/Dashboard/src/store/tradingStore.js    # NO CHANGES  still hits localhost:8000
gui/Dashboard/src/components/LiveTradingPanel.jsx  # NO CHANGES  UI unchanged
```

---

## 4. Implementation Phases

> Execute phases in strict order. Do not start Phase N+1 until Phase N passes its verification step.

---

### Phase 0: Deprecation (DELETE FIRST  No Exceptions)

**Owner:** @Backend-Specialist
**Verification:** All git verification commands in Section 2.5 return clean results.

```powershell
# Step 1: Delete ssid_integration entirely
Remove-Item -Recurse -Force "c:\QuFLX\v2\ssid_integration"

# Step 2: Delete trading_service.py
Remove-Item -Force "c:\QuFLX\v2\backend\services\gateway\trading_service.py"

# Step 3: Delete trading_config.json if it exists
if (Test-Path "c:\QuFLX\v2\data\settings\trading_config.json") {
    Remove-Item -Force "c:\QuFLX\v2\data\settings\trading_config.json"
}

# Step 4: Verify no residue
Select-String -Path "c:\QuFLX\v2\backend" -Pattern "ssid_integration|trading_service" -Recurse
# Expected: zero results
```

**Phase 0 Gate:** `python -m pytest -q` must still pass (trading routes will 500 temporarily  that is acceptable during Phase 0).

---

### Phase 1: ssid_service Standalone FastAPI (Port 8001)

**Owner:** @Backend-Specialist
**Files Created:**
- `backend/services/ssid_service/__init__.py`
- `backend/services/ssid_service/main.py`
- `backend/services/ssid_service/connector.py`
- `backend/services/ssid_service/executor.py`
- `backend/services/ssid_service/routes.py`
- `backend/services/ssid_service/pocketoptionapi/__init__.py`
- `backend/services/ssid_service/pocketoptionapi/pocket_option_instance.py`

#### `pocket_option_instance.py`  Core Design

Based on the Integration Guide architecture. Key contract:

```python
class PocketOptionInstance:
    """Instance-based WebSocket client. Zero global state."""

    REGIONS = [
        "wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket",
        "wss://api-fi.po.market/socket.io/?EIO=4&transport=websocket",
        "wss://api-en.po.market/socket.io/?EIO=4&transport=websocket",
    ]

    def __init__(self, ssid: str, is_demo: bool):
        self.ssid = ssid
        self.is_demo = is_demo
        # Instance-owned state  no globals
        self._ws = None
        self._connected = False
        self._balance = None
        self._loop = None
        self._thread = None

    async def connect(self) -> tuple[bool, str]: ...
    async def disconnect(self) -> None: ...
    async def get_balance(self) -> float | None: ...
    async def buy(self, amount, asset, direction, expiration) -> tuple[bool, str]: ...
    async def check_win(self, order_id: str) -> tuple[float, str]: ...
```

#### `connector.py`  Session Manager

```python
class AsyncPocketOptionWrapper:
    """Runs a dedicated asyncio event loop in a background thread.
    Allows synchronous callers to await async WebSocket operations safely."""

    def __init__(self, ssid: str, is_demo: bool):
        self.instance = PocketOptionInstance(ssid, is_demo)
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self._thread.start()

    def connect(self, timeout=20) -> tuple[bool, str]:
        future = asyncio.run_coroutine_threadsafe(self.instance.connect(), self.loop)
        return future.result(timeout=timeout)

    def buy(self, amount, asset, direction, expiration, timeout=15):
        future = asyncio.run_coroutine_threadsafe(
            self.instance.buy(amount, asset, direction, expiration), self.loop
        )
        return future.result(timeout=timeout)

    def stop(self):
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=5)
```

#### `main.py`  Service Entry Point

```python
# backend/services/ssid_service/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load SSIDs from environment at startup
    app.state.ssid_demo = os.getenv("QFLX_SSID_DEMO", "").strip()
    app.state.ssid_real = os.getenv("QFLX_SSID_REAL", "").strip()
    app.state.demo_session = None   # AsyncPocketOptionWrapper | None
    app.state.real_session = None   # AsyncPocketOptionWrapper | None
    yield
    # Cleanup on shutdown
    for session in [app.state.demo_session, app.state.real_session]:
        if session:
            try: session.stop()
            except Exception: pass

app = FastAPI(title="QuFLX SSID Service", lifespan=lifespan)
```

#### `routes.py`  Endpoints

```
POST   /api/connect          Connect with SSID + demo flag
POST   /api/disconnect       Disconnect session
GET    /api/status           Connection status + balance
POST   /api/trade            Execute a trade
GET    /api/result/{id}      Check trade WIN/LOSS
GET    /api/assets           List verified OTC assets
POST   /api/switch-mode      Switch Demo <-> Real
```

**Phase 1 Verification:**
```powershell
# Start ssid_service directly
python -m backend.services.ssid_service.main

# In another terminal, test health
curl http://localhost:8001/health
# Expected: {"status": "ok"}

curl http://localhost:8001/api/status
# Expected: {"success": true, "connected": false, "demo": true, "balance": null}
```

---

### Phase 2: ops.py  SSID Service Start/Stop

**Owner:** @Backend-Specialist
**File Modified:** `backend/services/gateway/routes/ops.py`

Add to `_registry`:
```python
_registry["ssid_service"] = {
    "proc": None,
    "pid": None,
    "started_at": None,
    "last_error": None,
    "log_path": None,
    "log_file": None,
}
```

Add `_spawn_ssid_service()`:
```python
def _spawn_ssid_service(*, log_path: Path) -> subprocess.Popen:
    entrypoint = project_root / "backend" / "services" / "ssid_service" / "main.py"
    if not entrypoint.exists():
        raise FileNotFoundError(str(entrypoint))

    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_f = open(log_path, "w", encoding="utf-8")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["PYTHONPATH"] = str(project_root)

    proc = subprocess.Popen(
        [sys.executable, str(entrypoint)],
        cwd=str(project_root),
        stdout=log_f,
        stderr=subprocess.STDOUT,
        env=env,
    )
    _registry["ssid_service"]["log_file"] = log_f
    return proc
```

Add three new endpoints:
```
POST /api/v1/ops/ssid/start     starts ssid_service subprocess
POST /api/v1/ops/ssid/stop      terminates ssid_service subprocess
GET  /api/v1/ops/ssid/status    returns running/pid/log_path
```

All three follow the exact same pattern as `/stream/start`, `/stream/pause`, `/stream/status`.

**Phase 2 Verification:**
```powershell
# With QFLX_ENABLE_OPS=1 set:
curl -X POST http://localhost:8000/api/v1/ops/ssid/start
# Expected: {"ok": true, "status": "started", "pid": <N>}

curl http://localhost:8000/api/v1/ops/ssid/status
# Expected: {"ok": true, "running": true, "pid": <N>}
```

---

### Phase 3: TopBar SSID Badge

**Owner:** @Frontend-Specialist
**File Modified:** `gui/Dashboard/src/components/TopBar.jsx`

Add SSID badge following the exact existing `StatusBadge` pattern:

```jsx
// In TopBar component, destructure from useMarketStore:
const {
  wsStatus,
  chromeStatus,
  opsChromeBusy,
  opsStreamBusy,
  startChrome,
  startStream,
  pauseStream,
  ssidStatus,          // NEW
  opsSsidBusy,         // NEW
  startSsidService,    // NEW
  stopSsidService,     // NEW
} = useMarketStore();

// Add badge in the status bar (after Stream badge):
<StatusBadge
  label="SSID"
  status={ssidStatus}
  onClick={ssidStatus === 'connected' ? stopSsidService : startSsidService}
  disabled={opsSsidBusy}
  busyLabel={ssidStatus === 'connected' ? 'Stopping...' : 'Starting...'}
/>
```

**Status color mapping** (uses existing `getStatusColor` in `StatusBadge`):
- `'connected'`  green (solid)
- `'connecting'`  yellow (pulse)
- `'disconnected'`  yellow (default)
- `'error'`  red

**Phase 3 Verification:**
```powershell
cd gui\Dashboard
npm run lint
# Expected: zero new errors
npm run build
# Expected: zero errors
```

---

### Phase 4: marketStore.js  SSID Ops State

**Owner:** @Frontend-Specialist
**File Modified:** `gui/Dashboard/src/store/marketStore.js`

Add to `createConnectionSlice`:

```javascript
// State
ssidStatus: 'disconnected',   // 'disconnected' | 'connecting' | 'connected' | 'error'
opsSsidBusy: false,

// Actions
startSsidService: async () => {
  if (get().opsSsidBusy) return;
  set({ opsSsidBusy: true, ssidStatus: 'connecting' });
  try {
    const res = await fetch('http://localhost:8000/api/v1/ops/ssid/start', {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.user_message || data.detail || `Failed to start SSID service (HTTP ${res.status})`;
      set({ lastError: msg, ssidStatus: 'error' });
      return;
    }
    // Poll status after start
    await new Promise(r => setTimeout(r, 1500));
    get().checkSsidStatus();
  } catch (err) {
    set({ lastError: `Network error starting SSID service: ${err.message}`, ssidStatus: 'error' });
  } finally {
    set({ opsSsidBusy: false });
  }
},

stopSsidService: async () => {
  if (get().opsSsidBusy) return;
  set({ opsSsidBusy: true });
  try {
    const res = await fetch('http://localhost:8000/api/v1/ops/ssid/stop', {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.user_message || data.detail || `Failed to stop SSID service (HTTP ${res.status})`;
      set({ lastError: msg });
      return;
    }
    set({ ssidStatus: 'disconnected' });
  } catch (err) {
    set({ lastError: `Network error stopping SSID service: ${err.message}` });
  } finally {
    set({ opsSsidBusy: false });
  }
},

checkSsidStatus: async () => {
  try {
    const res = await fetch('http://localhost:8000/api/v1/ops/ssid/status');
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      set({ ssidStatus: data.running ? 'connected' : 'disconnected' });
    }
  } catch {
    // Non-fatal  status check failure does not set error
  }
},
```

**Phase 4 Verification:**
```powershell
npm run lint
npm run build
# Both must pass with zero errors
```

---

### Phase 5: Gateway trading_proxy.py

**Owner:** @Backend-Specialist
**Files:**
- `backend/services/gateway/routes/trading_proxy.py`  NEW (thin proxy)
- `backend/services/gateway/routes/trading.py`  REWRITTEN (becomes proxy adapter)
- `backend/services/gateway/main.py`  MODIFIED (swap router import)

#### `trading_proxy.py`  Thin HTTP Proxy

```python
"""
trading_proxy.py  Thin HTTP proxy from Gateway to ssid_service.

No business logic. No state. No imports from ssid_service.
Forwards /api/v1/trading/*  http://localhost:{port}/api/*
Returns 503 if ssid_service is unreachable.
"""
from __future__ import annotations
import os
import logging
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger("gateway.trading_proxy")

def _ssid_service_url() -> str:
    port = os.getenv("QFLX_SSID_SERVICE_PORT", "8001")
    return f"http://127.0.0.1:{port}"

async def _proxy(request: Request, path: str) -> JSONResponse:
    base = _ssid_service_url()
    url = f"{base}/api/{path}"
    try:
        body = await request.body()
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers={"Content-Type": request.headers.get("Content-Type", "application/json")},
            )
        return JSONResponse(status_code=resp.status_code, content=resp.json())
    except httpx.ConnectError:
        logger.warning("ssid_service unreachable at %s", base)
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": "SSID service is not running. Start it from the TopBar SSID button."}
        )
    except Exception as exc:
        logger.error("Proxy error: %s", exc)
        return JSONResponse(
            status_code=502,
            content={"success": False, "error": f"Proxy error: {exc}"}
        )

# Route all /api/v1/trading/* paths through the proxy
@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_all(request: Request, path: str):
    return await _proxy(request, path)
```

#### `main.py` Change

```python
# REMOVE:
from backend.services.gateway.routes import ... trading
app.include_router(trading.router, prefix="/api/v1/trading", tags=["Live Trading"])

# ADD:
from backend.services.gateway.routes import trading_proxy
app.include_router(trading_proxy.router, prefix="/api/v1/trading", tags=["Live Trading"])
```

**Phase 5 Verification:**
```powershell
# Start Gateway
python -m backend.services.gateway.main

# Test proxy (ssid_service NOT running  should get 503, not 500)
curl http://localhost:8000/api/v1/trading/status
# Expected: {"success": false, "error": "SSID service is not running..."}

# Start ssid_service, then test again
python -m backend.services.ssid_service.main
curl http://localhost:8000/api/v1/trading/status
# Expected: {"success": true, "connected": false, ...}
```

---

### Phase 6: .env + .gitignore

**Owner:** @Backend-Specialist

Add to `.env` (project root):
```env
# SSID Trading Service
QFLX_SSID_DEMO=
QFLX_SSID_REAL=
QFLX_SSID_SERVICE_PORT=8001
```

Add to `.env.example`:
```env
# SSID Trading Service  fill in from PocketOption browser DevTools
# Format: 42["auth",{"session":"...","isDemo":1,"uid":...}]
QFLX_SSID_DEMO=
QFLX_SSID_REAL=
QFLX_SSID_SERVICE_PORT=8001
```

Verify `.gitignore` already excludes `.env`:
```powershell
Select-String -Path "c:\QuFLX\v2\.gitignore" -Pattern "^\.env$"
# Expected: match found
```

---

### Phase 7: Tests + Final Verification

**Owner:** @Tester

Create `backend/tests/test_trading_proxy.py`:

```python
"""Tests for trading proxy  mocks ssid_service responses."""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

def test_proxy_returns_503_when_ssid_service_down():
    """When ssid_service is unreachable, proxy returns 503 with user message."""
    # Import app after Phase 5 changes
    from backend.services.gateway.main import app
    client = TestClient(app)
    with patch("httpx.AsyncClient.request", side_effect=Exception("connect error")):
        resp = client.get("/api/v1/trading/status")
    assert resp.status_code in (503, 502)
    assert "success" in resp.json()
    assert resp.json()["success"] is False

def test_proxy_forwards_status_when_ssid_service_up():
    """When ssid_service responds, proxy forwards the response."""
    from backend.services.gateway.main import app
    client = TestClient(app)
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"success": True, "connected": False}
    with patch("httpx.AsyncClient.request", return_value=mock_response):
        resp = client.get("/api/v1/trading/status")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
```

**Final test run:**
```powershell
python -m pytest -q
# Expected: all tests pass
```

---

## 5. API Contract

### 5.1 ssid_service Endpoints (Port 8001)

These are the internal endpoints. The Gateway proxies to these  the Dashboard never calls them directly.

| Method | Path | Description | Request Body | Response |
|---|---|---|---|---|
| GET | `/health` | Health check |  | `{"status": "ok"}` |
| POST | `/api/connect` | Connect SSID | `{"ssid": "...", "demo": true}` | `{"success": true, "balance": 1234.56, "demo": true, "message": "..."}` |
| POST | `/api/disconnect` | Disconnect |  | `{"success": true, "message": "Disconnected"}` |
| GET | `/api/status` | Connection status |  | `{"success": true, "connected": bool, "demo": bool, "balance": float\|null}` |
| POST | `/api/trade` | Execute trade | `{"asset": "EURUSD_otc", "direction": "call", "amount": 10.0, "expiration": 60}` | `{"success": true, "order_id": "...", "asset": "...", "direction": "...", "amount": 10.0}` |
| GET | `/api/result/{order_id}` | Check WIN/LOSS |  | `{"success": true, "win": bool, "profit": float, "message": "..."}` |
| GET | `/api/assets` | List OTC assets |  | `{"success": true, "assets": [{"id": "EURUSD_otc", "payout": null}], "count": 31}` |
| POST | `/api/switch-mode` | Switch Demo/Real | `{"demo": bool}` | `{"success": true, "demo": bool, "balance": float\|null}` |

### 5.2 Gateway Proxy Endpoints (Port 8000)

These are the public endpoints the Dashboard calls. URLs are **identical** to the old `trading_service.py` routes  `tradingStore.js` requires zero changes.

| Method | Gateway Path | Proxied To |
|---|---|---|
| POST | `/api/v1/trading/connect` | `POST /api/connect` |
| POST | `/api/v1/trading/disconnect` | `POST /api/disconnect` |
| GET | `/api/v1/trading/status` | `GET /api/status` |
| POST | `/api/v1/trading/execute` | `POST /api/trade` |
| GET | `/api/v1/trading/result/{id}` | `GET /api/result/{id}` |
| GET | `/api/v1/trading/assets` | `GET /api/assets` |
| POST | `/api/v1/trading/switch-mode` | `POST /api/switch-mode` |

### 5.3 Ops Endpoints (Port 8000)

New endpoints added to `ops.py` for SSID service lifecycle management:

| Method | Path | Description | Response |
|---|---|---|---|
| POST | `/api/v1/ops/ssid/start` | Start ssid_service subprocess | `{"ok": true, "status": "started", "pid": N}` |
| POST | `/api/v1/ops/ssid/stop` | Stop ssid_service subprocess | `{"ok": true, "status": "stopped"}` |
| GET | `/api/v1/ops/ssid/status` | Check if ssid_service is running | `{"ok": true, "running": bool, "pid": N\|null}` |

### 5.4 Error Response Shape

All endpoints return structured errors  never raw exceptions:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

HTTP status codes:
- `400`  Bad request (invalid SSID format, invalid trade params)
- `409`  Conflict (already connected, trade cooldown active)
- `503`  ssid_service unreachable (proxy cannot connect to :8001)
- `502`  Proxy error (unexpected upstream failure)
- `500`  Internal server error (should never happen in normal operation)

### 5.5 SSID Format Validation

The SSID must match this pattern before any connection attempt:

```python
import re
SSID_PATTERN = re.compile(r'^42\["auth",\{.*"session".*"isDemo".*\}\]$')

def validate_ssid(ssid: str) -> tuple[bool, str]:
    if not ssid or not isinstance(ssid, str):
        return False, "SSID must be a non-empty string"
    if len(ssid) < 50:
        return False, "SSID too short  copy the full 42[\"auth\",...] string"
    if not ssid.startswith('42["auth"'):
        return False, 'SSID must start with 42["auth"'
    return True, "ok"
```

---

## 6. SSID Security

### 6.1 Storage Rules

| Location | Allowed | Notes |
|---|---|---|
| `.env` (project root) |  YES | Only valid storage location |
| `.env.example` |  YES | Empty values only  never real SSIDs |
| `data/settings/trading_config.json` |  NO | Delete this file  SSIDs must not be in JSON |
| Any Python source file |  NO | Never hardcode SSIDs |
| Any JavaScript source file |  NO | Never hardcode SSIDs |
| Git history |  NO | `.gitignore` must exclude `.env` |
| Log files |  NO | Never log SSID values |
| API responses |  NO | Never return SSID in any response body |

### 6.2 .gitignore Verification

The project `.gitignore` already contains `.env`. Verify:

```powershell
Select-String -Path "c:\QuFLX\v2\.gitignore" -Pattern "^\.env$"
```

If not found, add explicitly:
```gitignore
# SSID credentials and environment secrets
.env
.env.local
.env.*.local
```

### 6.3 Logging Rules

In `ssid_service/`, never log SSID values:

```python
# WRONG  logs the SSID
logger.info("Connecting with SSID: %s", ssid)

# CORRECT  log only metadata
logger.info("Connecting | demo=%s ssid_len=%d", is_demo, len(ssid))
```

In `trading_proxy.py`, never log request bodies that may contain SSIDs:

```python
# WRONG
logger.debug("Forwarding request body: %s", body)

# CORRECT
logger.debug("Forwarding %s %s", method, path)
```

### 6.4 SSID Rotation

SSIDs expire when the PocketOption session expires (typically hours to days). When a connection fails with an auth error:

1. ssid_service returns `{"success": false, "error": "Authentication failed  SSID may have expired"}`
2. User must extract a fresh SSID from browser DevTools
3. User updates `.env` with new SSID value
4. Restart ssid_service via TopBar SSID button (Stop  Start)

**How to extract SSID from browser:**
1. Open PocketOption in Chrome
2. Open DevTools  Network  WS tab
3. Find the WebSocket connection to `api-eu.po.market`
4. Look for a frame starting with `42["auth",`
5. Copy the entire frame content
6. Paste into `.env` as `QFLX_SSID_DEMO=` or `QFLX_SSID_REAL=`

---

## 7. Verification Checklist

### 7.1 Phase-by-Phase Gates

| Phase | Gate Command | Expected Result |
|---|---|---|
| Phase 0 | `Test-Path "c:\QuFLX\v2\ssid_integration"` | `False` |
| Phase 0 | `Test-Path "c:\QuFLX\v2\backend\services\gateway\trading_service.py"` | `False` |
| Phase 0 | `Select-String -Path "c:\QuFLX\v2\backend" -Pattern "ssid_integration" -Recurse` | No output |
| Phase 1 | `curl http://localhost:8001/health` | `{"status": "ok"}` |
| Phase 1 | `curl http://localhost:8001/api/status` | `{"success": true, "connected": false}` |
| Phase 2 | `curl -X POST http://localhost:8000/api/v1/ops/ssid/start` | `{"ok": true, "status": "started"}` |
| Phase 3 | `npm run lint` (in gui/Dashboard) | Zero new errors |
| Phase 4 | `npm run build` (in gui/Dashboard) | Zero errors |
| Phase 5 | `curl http://localhost:8000/api/v1/trading/status` (ssid_service down) | HTTP 503 |
| Phase 5 | `curl http://localhost:8000/api/v1/trading/status` (ssid_service up) | HTTP 200 |
| Phase 7 | `python -m pytest -q` | All tests pass |

### 7.2 Manual End-to-End Flow

After all phases complete:

1. **Start Gateway:** `python -m backend.services.gateway.main`
2. **Start Dashboard:** `cd gui\Dashboard && npm run dev`
3. **Verify TopBar:** SSID badge appears next to Stream badge, shows yellow (disconnected)
4. **Click SSID badge:** Badge shows "Starting..."  ssid_service starts  badge turns green
5. **Navigate to Live Trading tab:** Panel renders normally
6. **Enter Demo SSID:** Connect  balance appears
7. **Execute $1 demo trade:** Trade appears in results table
8. **Wait for expiry:** WIN/LOSS result shows
9. **Click SSID badge again:** Badge shows "Stopping..."  ssid_service stops  badge turns yellow

### 7.3 Final Verification Checklist

**Backend:**
- [ ] `ssid_integration/` directory does not exist
- [ ] `backend/services/gateway/trading_service.py` does not exist
- [ ] `backend/services/ssid_service/` directory exists with all 7 files
- [ ] `backend/services/gateway/routes/trading_proxy.py` exists
- [ ] `backend/services/gateway/routes/ops.py` has ssid_service entries
- [ ] `backend/services/gateway/main.py` imports `trading_proxy` not `trading`
- [ ] `python -m pytest -q` passes

**Frontend:**
- [ ] `TopBar.jsx` has SSID `StatusBadge`
- [ ] `marketStore.js` has `ssidStatus`, `opsSsidBusy`, `startSsidService`, `stopSsidService`
- [ ] `tradingStore.js` unchanged
- [ ] `LiveTradingPanel.jsx` unchanged
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

**Security:**
- [ ] `.env` has `QFLX_SSID_DEMO=`, `QFLX_SSID_REAL=`, `QFLX_SSID_SERVICE_PORT=8001`
- [ ] `.env.example` has same keys with empty values
- [ ] `.gitignore` excludes `.env`
- [ ] No SSID values in any source file
- [ ] No SSID values in any log output
- [ ] `data/settings/trading_config.json` does not exist

**Integration:**
- [ ] TopBar SSID badge starts/stops ssid_service correctly
- [ ] Gateway proxy returns 503 when ssid_service is down (not 500)
- [ ] Gateway proxy forwards correctly when ssid_service is up
- [ ] `tradingStore.js` connects/disconnects without URL changes
- [ ] Demo trade executes end-to-end

---

## Appendix: Dependencies

### New Python Dependencies

Add to `requirements.txt`:
```
httpx>=0.27.0    # For trading_proxy.py async HTTP client
```

Verify `httpx` is not already present:
```powershell
Select-String -Path "c:\QuFLX\v2\requirements.txt" -Pattern "httpx"
```

### Existing Dependencies Used

- `fastapi`  ssid_service FastAPI app
- `uvicorn`  ssid_service ASGI server
- `websockets`  PocketOption WebSocket client
- `python-dotenv`  `.env` loading in ssid_service
- `pydantic`  Request/response validation

---

*Document prepared by @Team-Leader | @Backend-Specialist | @Frontend-Specialist*
*Supersedes: `Live_Trading_ssid_Implementation_Plan.md`*
*Reference: `INTEGRATIONS_GUIDE_26-02-25.md`*
