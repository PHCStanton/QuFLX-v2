# CHROME + STREAM Start/Pause Controls — Implementation Plan

**Goal**

Enable the Dashboard TopBar badges to act as safe, predictable controls:

- **CHROME** badge: click to launch a local Chrome instance with remote debugging on **9222**.
- **STREAM** badge: click to **Start** the Collector (streaming) and to **Pause** it (recommended: Pause = Stop Collector process).
- **WS** badge: remains informational only (started manually in terminal).

This plan is structured to maintain CORE_PRINCIPLES:

- Functional simplicity first
- Sequential logic
- Defensive + explicit error handling
- Fail fast / loud / predictably (all failure paths return 4xx/5xx)
- Strict separation of concerns (UI → Gateway API → Process Manager)

---

## Scope

### In Scope

- Add **local-only/dev-gated** Gateway endpoints to start/stop processes.
- Add minimal process-state tracking (PID + running/exited).
- Make **TopBar CHROME + STREAM** badges clickable with clear loading/disabled/error UX.

### Out of Scope (for this iteration)

- “Soft pause” that keeps Selenium attached but stops publishing ticks.
- Remote orchestration (starting desktop Chrome from a non-local Gateway host).
- WS badge control.

---

## Baseline (Current State)

- TopBar badges render in `gui/Dashboard/src/components/TopBar.jsx` as non-clickable UI blocks.
- Collector runs at `backend/services/collector/main.py` and attaches to Chrome remote debugging `127.0.0.1:9222`.
- Gateway status check exists via Socket.IO (`check_status`) which probes port `9222`.
- Stream health in UI is tick-driven (via `lastTickTimestamp` + `useStreamHealth`).

---

## Key Design Constraints

1. **Browser security model**: React in the browser cannot launch OS processes directly.
2. **Must be local**: The process-launching endpoint must run on the same machine that can start Chrome and Python.
3. **Idempotency**: Avoid multiple collectors/chromes from repeated clicks.
4. **Explicit errors**: Every failure returns structured 4xx/5xx with a user-friendly message.
5. **Security**: Endpoints must be **dev-gated** and **whitelist-only** to avoid RCE risk.

---

## Recommended Approach

### Pause Semantics (Recommended)

**STREAM Pause = Stop Collector process (PID)**

- Pause is a real stop, not a UI-only pause.
- Resume is a restart.
- Stream badge naturally transitions to `slow/stale/idle` based on tick recency.

---

## Phase 0 — Preconditions & Acceptance Criteria

- [ ] Confirm Gateway runs locally where Chrome can be launched.
- [ ] Confirm the TopBar to modify is `gui/Dashboard` (not `gui/Alert-Dispatch`).
- [ ] Confirm desired Chrome target URL (default currently: PocketOption demo URL).
- [ ] Confirm desired behavior if Chrome already running on 9222:
  - Option A: treat as success and do not spawn
  - Option B: spawn a new session anyway (not recommended)
- [ ] Confirm desired behavior if Collector already running:
  - Option A: treat as success and do not spawn
  - Option B: return an error (not recommended)

**Decision**

- [ ] Option A selected — if 9222 is already open, return 200 `already_running` (do not spawn duplicate).
- [ ] Option A selected — if Collector already running, return 200 `already_running` (do not spawn duplicate).

**API Response Shape (Standard)**

- All Ops endpoints return either:
  - Success: `{ ok: true, status: "...", ... }`
  - Error: `{ ok: false, error_code: "...", error_message: "...", user_message: "...", details?: {...} }`
- Error shape should match the existing structured error pattern used by History (see `backend/models/errors.py`).

**Dev Gate (Required)**

- Ops endpoints must be disabled by default.
- Require BOTH:
  - `QFLX_ENABLE_OPS=1` (environment flag)
  - `request.client.host` is `127.0.0.1` or `::1`
- Return **403** with a structured error payload if either check fails.
- Do not rely on `Host` header checks for security.

**CSRF / Drive-by Protection (Strongly Recommended)**

- Risk: If the Gateway has `QFLX_ENABLE_OPS=1` and permissive CORS, a malicious website opened in the same browser could attempt to hit `http://127.0.0.1:<gateway>/api/v1/ops/...`.
- Mitigation options (pick one, simplest first):
  - Require `QFLX_OPS_TOKEN` and an `X-QFLX-OPS-TOKEN` header for every ops request.
  - Enforce an `Origin` allowlist (Dashboard dev server origin only) and reject all others.

**Idempotency (Required)**

- Start endpoints are idempotent:
  - If already running, return **200** with `status: "already_running"`.
- Stop endpoints are idempotent:
  - If already stopped, return **200** with `status: "already_stopped"`.

**Acceptance Criteria**

- [ ] Clicking **CHROME** starts Chrome with 9222 or reports “already running”.
- [ ] Clicking **STREAM** toggles Start/Pause safely (no duplicates).
- [ ] All failures return 4xx/5xx with structured error payload.
- [ ] UI shows “Starting…” / “Pausing…” and surfaces errors via existing error banner.

---

## Phase 1 — Backend: Add Local Ops Endpoints

### 1.1 Create a dedicated router

- [ ] Add `backend/services/gateway/routes/ops.py` (new router).
- [ ] Register router in `backend/services/gateway/main.py`.
- [ ] Ensure router is tagged (e.g., `tags=["Ops"]`).

### 1.2 Dev-gate + local-only policy

- [ ] Add explicit guard in every ops endpoint:
  - Require env flag `QFLX_ENABLE_OPS=1`.
  - Require `request.client.host` is `127.0.0.1` or `::1`.
- [ ] Return **403** with structured error payload if guard fails.
- [ ] Ensure ops endpoints never accept arbitrary commands/paths from request bodies (whitelist-only to avoid RCE).

### 1.3 Error contract (Ops)

- [ ] Ops endpoints must not rely on the global exception handler for response shape.
- [ ] Any unexpected exception inside ops should return a structured **500** error payload (no raw stack traces to client).

### 1.4 Process Manager (in Gateway)

- [ ] Implement minimal in-memory process registry:
  - `chrome: { pid, started_at, last_error }`
  - `collector: { pid, started_at, last_error, log_path }`
- [ ] Store the actual process handles needed to stop processes (not just PID).
- [ ] Ensure we can detect “running” vs “exited” (poll the process handle).
- [ ] Guard registry mutations with an `asyncio.Lock` to future-proof concurrency.
- [ ] Define Pydantic request/response models for all ops endpoints.
- [ ] All endpoints validate input with these models (fail fast with 422 on invalid input).
- [ ] Registry must survive endpoint exceptions without corrupting state (fail predictable).

---

## Phase 2 — Backend: CHROME Start Endpoint

### 2.1 Endpoint: `POST /api/v1/ops/chrome/start`

- [ ] Validate dev gate.
- [ ] Check if port **9222** already open:
  - If open → return **200** `{ status: "already_running" }`.
- [ ] If not open:
  - Spawn chrome non-blocking using `subprocess.Popen`.
  - Use known chrome executable resolution logic (paths + fallback).
  - Use a workspace `data/runtime/chrome_profile/` user-data-dir.
  - Include required flags: `--remote-debugging-port=9222`, `--user-data-dir=...`, `--no-first-run`.
- [ ] Store PID in registry.

### 2.2 Errors & status codes

- [ ] Chrome executable not found → **424** (failed dependency).
- [ ] Spawn failed → **500**.
- [ ] Return JSON body:
  - `ok: false`
  - `error_code`
  - `error_message`
  - `user_message`
  - `details` (debug-friendly, but no secrets)
- [ ] Example `user_message` when Chrome not found:
  - "Chrome executable not found. Please ensure Chrome is installed and accessible in your PATH or standard install locations."

---

## Phase 3 — Backend: STREAM Start/Pause/Status

### 3.1 Endpoint: `POST /api/v1/ops/stream/start`

- [ ] Validate dev gate.
- [ ] If collector already running → **200** `{ status: "already_running" }`.
- [ ] Ensure prerequisites:
  - Redis reachable (optional but recommended)
  - Chrome 9222 reachable (recommended)
- [ ] Spawn collector non-blocking:
  - command: `sys.executable backend/services/collector/main.py` (absolute path recommended)
  - redirect stdout/stderr to a timestamped log file in `data/data_output/logs/`
- [ ] Store PID + log_path.

### 3.2 Endpoint: `POST /api/v1/ops/stream/pause`

- [ ] Validate dev gate.
- [ ] If collector not running → **200** `{ status: "already_stopped" }`.
- [ ] Attempt graceful stop:
  - First: `proc.terminate()`
  - Wait 3 seconds
  - If still alive after 3 seconds: `proc.kill()`
- [ ] Return **200** on success.

### 3.3 Endpoint: `GET /api/v1/ops/stream/status`

- [ ] Return:
  - `running: boolean`
  - `pid: number | null`
  - `log_path: string | null`
  - `last_error: string | null`
  - `observed_at: timestamp`

---

## Phase 4 — Frontend: Make TopBar Badges Clickable

### 4.1 UI/UX behavior

- [ ] Only **CHROME** and **STREAM** become `<button>`.
- [ ] Maintain existing badge styling, add:
  - hover cursor + focus ring
  - disabled state
  - “Starting…” / “Pausing…” label shift (or a small spinner)
- [ ] On any failure, badge returns to clickable state (retry without refresh).
- [ ] WS remains informational.

### 4.2 Store/API wiring

- [ ] Add functions in `marketStore.js` (or a small `api/opsClient.js`):
  - `startChrome()`
  - `startStream()`
  - `pauseStream()`
- [ ] On error, call existing `setError()` (top-of-chart red banner).

### 4.3 STREAM toggle logic

- [ ] Use a simple UI toggle based on last known `streamProcessRunning`:
  - If running → click pauses
  - If not running → click starts
- [ ] Refresh state after each action by calling backend `status` (or rely on returned response).

---

## Phase 5 — Observability & Feedback

- [ ] Expose `log_path` returned by start endpoints.
- [ ] Optional: add “Open logs” link in UI error area (non-blocking).
- [ ] Optional: add a `system_status` emit when ops actions start/stop (so UI updates immediately).

---

## Phase 6 — Testing & Verification

### 6.1 Backend tests (minimum)

- [ ] Start stream when already running returns **200** `already_running`.
- [ ] Pause stream when not running returns **200** `already_stopped`.
- [ ] Chrome start returns **200** when port 9222 already open.
- [ ] Dev-gate blocked returns **403** with structured error.
- [ ] Chrome not found returns **424** with structured error.
- [ ] Unexpected spawn failure returns **500** with structured error.
- [ ] All failure paths return **4xx/5xx** with `{ ok: false, error_code, error_message, user_message }`.

### 6.2 Manual smoke run (Windows)

- [ ] Start Gateway.
- [ ] Start Dashboard.
- [ ] Click CHROME → verify remote debugging port 9222 is open.
- [ ] Click STREAM Start → collector PID returned; ticks arrive; Stream badge turns green.
- [ ] Click STREAM Pause → collector stops; Stream badge transitions to slow/stale.

### 6.3 Quality gates

- [ ] Run backend lint/tests (project-standard).
- [ ] Run frontend lint/typecheck/tests (project-standard).

---

## Phase 7 — Hardening (Optional)

- [ ] Add rate limiting to ops endpoints (simple in-memory cooldown).
- [ ] Add “single instance” enforcement for Chrome (port-open check remains primary).
- [ ] Add a clean shutdown hook to stop child processes when Gateway exits (opt-in).

---

## Status Legend

- `[x]` Completed
- `[~]` In progress
- `[ ]` Not started

---

## Current Status (this plan)

- [x] Plan drafted and aligned with failure-path 4xx/5xx requirement.
- [ ] Backend ops router implemented.
- [ ] Process start/stop endpoints implemented.
- [ ] TopBar clickable controls implemented.
- [ ] Tests + verification complete.
