# QuFLX v2 — Logging (Developer Guide)

This folder contains **developer-facing logs** for QuFLX v2 services.

## Goals
- Make debugging fast (filter by service, request, timeframe/asset).
- Avoid giant unstructured logs.
- Keep logs safe (no secrets, no sensitive prompt payloads in production).

---

## Folder Structure

Logs are organized **by service**, then **rotated daily**.

Recommended structure:

```
system_LOGS/
  gateway/
    gateway.log
    gateway.error.log
    gateway.access.log
  collector/
  strategy/
  ai/
  selenium/
```

### What each file is
- `gateway.log`: Application + runtime logs (info/debug/warn/error depending on level)
- `gateway.error.log`: Error-only stream (stack traces, crashes, failures)
- `gateway.access.log`: One-line request summaries (method/path/status/duration)

Files rotate daily and keep a rolling history.

---

## Gateway Logging (Implemented)

Gateway logging is configured in:
- `backend/services/gateway/main.py`

### Log fields
Each log line includes correlation keys:
- `run=` a unique ID per gateway process start
- `req=` request ID (per HTTP request)

Example format:

```
2026-01-21T12:34:56Z | INFO | gateway.history | run=abc123 req=9f8e7d | message...
```

---

## How to Run the Gateway with File Logs

### Option A — Run via `python main.py` (supports flags)

From project root:

```powershell
cd c:\QuFLX\v2
python .\backend\services\gateway\main.py --log-level DEBUG --debug-errors
```

Useful flags:
- `--log-level DEBUG|INFO|WARNING|ERROR`
- `--log-dir c:\QuFLX\v2\system_LOGS`
- `--log-to-file` (enabled by default)
- `--debug-errors` (dev-only, returns extra error details in JSON)
- `--reload` (enabled by default unless overridden)

### Option B — Run via uvicorn CLI (recommended for dev)

```powershell
cd c:\QuFLX\v2\backend\services\gateway
$env:QFLX_LOG_DIR = "c:\QuFLX\v2\system_LOGS"
$env:QFLX_LOG_LEVEL = "DEBUG"
$env:QFLX_LOG_TO_FILE = "1"
$env:QFLX_DEBUG_ERRORS = "1"
uvicorn main:socket_app --reload --loop asyncio --log-level debug --access-log
```

---

## Environment Variables

These environment variables control gateway logging:

- `QFLX_LOG_DIR`
  - Default: `c:\QuFLX\v2\system_LOGS`
  - Logs are written into `QFLX_LOG_DIR\gateway\...`

- `QFLX_LOG_LEVEL`
  - Default: `INFO`
  - `DEBUG` is recommended when diagnosing

- `QFLX_LOG_TO_FILE`
  - Default: `1`
  - Set to `0` to disable file logs (console only)

- `QFLX_DEBUG_ERRORS`
  - Default: `0`
  - Set to `1` to include extra debug info in API error responses (dev-only)

---

## Troubleshooting & Usage

### Find the latest gateway errors

```powershell
Get-Content c:\QuFLX\v2\system_LOGS\gateway\gateway.error.log -Tail 200
```

### Find requests for a specific Request ID

```powershell
Select-String -Path c:\QuFLX\v2\system_LOGS\gateway\gateway*.log -Pattern "req=YOUR_REQUEST_ID"
```

### Filter AI failures quickly

```powershell
Select-String -Path c:\QuFLX\v2\system_LOGS\gateway\gateway.error.log -Pattern "gateway.ai|AIService"
```

---

## Safety Rules

- Never log secrets (API keys, tokens).
- Avoid logging full user prompts in production.
- Prefer logging:
  - request IDs
  - whether an image was present
  - asset/timeframe
  - high-level error codes

