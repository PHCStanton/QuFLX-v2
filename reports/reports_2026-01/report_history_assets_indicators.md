# Report: History + Assets + Indicators Alignment Review
**Date:** 2026-01-17  
**Reviewer Mode:** Team_Leader (multi-layer contract + CORE_PRINCIPLES compliance)

## Scope
This review validates that the implementations described in the following Dev Docs are present in the codebase, behave consistently across layers (frontend ↔ gateway ↔ capabilities), and align with CORE_PRINCIPLES:

- `v2_Dev_Docs/History_data_Payload_Aggregation.md`
- `v2_Dev_Docs/History_Indicator_Stability_Plan.md`
- `v2_Dev_Docs/indicators_knowledgebase_implementation_plan.md`
- `v2_Dev_Docs/Implementation_Assessment_Plan_26-01-15.md`

## Executive Summary
Overall, the key history pipeline stability fixes are implemented and correctly wired end-to-end:

- `CapResult` now supports `error_code` and the runner serializes it.
- Gateway history bootstrap uses a Windows-safe subprocess strategy and uses the corrected runner path.
- Frontend defaults support a 15s manual workflow and the collector respects a shorter minimum wait (3s).

Indicators and chart stability features are largely implemented (crosshair/time scale sync, composite screenshots, AI context enrichment), and automated test coverage is present and passing.

The main remaining gaps are CORE_PRINCIPLES compliance items and a couple of behavioral/architecture mismatches:

- History bootstrap returns structured error payloads but does not consistently use non-200 HTTP status codes.
- ChartWorkspace separation-of-concerns refactor is partially done (hooks exist), but the component remains very large.
- Crosshair sync includes a bidirectional pathway (oscillator → main) that is outside the documented strategy and can create feedback-loop risk.

## Automated Verification Results
### Backend (Python)
- `python -m pytest -q` → PASS (9 tests)

### Dashboard (Vite/React)
- `npm run lint` → PASS
- `npm run build` → PASS
- `npm run test:qa` (Playwright) → PASS (6 tests)

Build notes:
- Vite reports a dynamic-import/static-import warning around `settingsStore.js` chunking.
- Bundle size warning: one JS chunk > 500kB after minification.

## Dev Doc → Code Alignment Matrix

### A) History_data_Payload_Aggregation.md
| Doc Claim | Code Location | Status | Notes |
|---|---|---:|---|
| Fix runner path from shallow to project root | `backend/services/gateway/routes/history.py` | ✅ | Uses `../../../../capabilities_v2/runner.py` |
| Fix PYTHONPATH injection to project root | `backend/services/gateway/routes/history.py` | ✅ | Sets `PYTHONPATH` to root + `root/v2` |
| Bootstrap awaits subprocess and returns candles in-memory | `backend/services/gateway/routes/history.py` | ✅ | `bootstrap-history` returns `candles` directly |

### B) History_Indicator_Stability_Plan.md
| Doc Step | Code Location | Status | Notes |
|---|---|---:|---|
| Add `error_code` to `CapResult` | `capabilities_v2/base.py` | ✅ | `CapResult.error_code: Optional[str]` |
| Update `CapResult.fail()` to include `error_code` | `capabilities_v2/base.py` | ✅ | Accepts `error_code` and stores it |
| Runner JSON includes `error_code` | `capabilities_v2/runner.py` | ✅ | Output dict includes `error_code` |
| Frontend `historyWaitTime` default 15 seconds | `gui/Dashboard/src/store/settingsStore.js` | ✅ | `automation.historyWaitTime: 15` |
| Gateway timeout buffer +15 seconds | `backend/services/gateway/routes/history.py` | ✅ | `timeout=duration_s + 15` |
| Collector hardcoded minimum reduced from 8s to 3s | `capabilities_v2/history_collector.py` | ✅ | `wait_time = max(3, duration_s)` |

### C) indicators_knowledgebase_implementation_plan.md
| Feature | Code Location | Status | Notes |
|---|---|---:|---|
| Main → oscillator time-scale sync | `gui/Dashboard/src/components/OscillatorChart.jsx` | ✅ | Subscribes to `subscribeVisibleTimeRangeChange` |
| Main → oscillator crosshair sync | `gui/Dashboard/src/components/OscillatorChart.jsx` | ✅ | Subscribes to `mainChart.subscribeCrosshairMove` |
| Composite screenshot capture incl. oscillators | `gui/Dashboard/src/hooks/useScreenshotCapture.js` | ✅ | Uses `html2canvas` on `#quflx-chart-screenshot-root` |
| Screenshot annotation cursor alignment | `gui/Dashboard/src/components/ScreenshotModal.jsx` | ✅ | Uses `getBoundingClientRect` scaling for coordinates |
| Ask AI enriched context with indicator series tail | `gui/Dashboard/src/hooks/useAIChat.js` | ✅ | `indicatorSnapshots` includes last ~50 points |

### D) Implementation_Assessment_Plan_26-01-15.md
| Claim | Code Location | Status | Notes |
|---|---|---:|---|
| Extract concerns from ChartWorkspace into hooks/components | `gui/Dashboard/src/components/ChartWorkspace.jsx` + `gui/Dashboard/src/hooks/*` | ✅ (partial) | Hooks exist and are used; ChartWorkspace remains large |
| Chart stability validations & error surfacing | `gui/Dashboard/src/components/OscillatorChart.jsx`, `gui/Dashboard/src/store/marketStore.js` | ✅ | Defensive checks exist; user-visible error banner exists |
| Backend debug prints replaced with logger | Not re-validated in this review | ⚠️ | Requires targeted scan of gateway/collector mains |

## Key Findings (By Layer)

### 1) Capabilities Layer (capabilities_v2)
**What aligns well**
- `CapResult` contract now supports `error_code` and runner output includes it.
- `HistoryCollector._collect_and_save()` sets explicit `error_code` for common failure modes (e.g., `chrome_not_connected`, `manual_click_timeout`).

**Gaps / risks**
- Some failure paths return `CapResult(ok=False, error=...)` without `error_code` (e.g., missing `asset`, `ctx.driver required` in `_collect_only`). This is not a breaking issue because the gateway validates inputs before calling the capability, but it reduces observability and consistent error mapping.

### 2) Gateway Layer (backend/services/gateway)
**What aligns well**
- History bootstrap uses a threadpool + `subprocess.run(...)` approach and includes timeout buffer, consistent with the stability plan.
- Correct runner path and PYTHONPATH injection are present.
- Gateway maps runner/capability errors into structured `HistoryErrorResponse` with `error_code` mapping.

**Gaps / risks (CORE_PRINCIPLES #8/#9)**
- `POST /api/v1/history/bootstrap-history` returns a JSON error model but not a non-200 HTTP status code for most failure cases (it returns `error_response.dict()` directly). The response shape is good, but HTTP semantics are inconsistent with the stated principle: “always return proper HTTP status codes + structured JSON error responses”.
- `GET /api/v1/history/{asset}` returns a legacy shape (`{ asset, timeframe, data: [...] }`) while `POST /bootstrap-history` returns `{ candles: [...] }`. This is currently handled in the frontend, but the API contract is split.

### 3) Dashboard Frontend (gui/Dashboard)
**What aligns well**
- Manual mode workflow: frontend uses `settings.automation.historyWaitTime` (default 15) and sends `duration` to bootstrap.
- Bootstrap response handling correctly supports structured error responses (`error_code`, `user_message`).
- Crosshair sync and time-scale sync are implemented and guarded against null/invalid ranges.
- Composite screenshot capture exists and is used for both the screenshot modal and Ask AI.

**Gaps / risks (CORE_PRINCIPLES #6/#7/#8/#9)**
- `ChartWorkspace.jsx` imports extracted hooks, but remains very large and still includes large inline option structures. This keeps orchestration + configuration + UI logic mixed, which weakens separation of concerns.
- Crosshair strategy mismatch: the documented plan prefers main → oscillators unidirectional behavior. The implementation includes oscillator → main crosshair forwarding (`useCrosshairSync`), which can create feedback-loop risk and currently sets main crosshair with a hardcoded Y value (`0`).
- Some UI/network error handlers still rely on `console.error(...)` and/or `window.alert(...)`. User-visible messaging exists (error banner), but the error handling is not consistently centralized.

## Recommendations

### Priority 0 (Safety / Correctness)
1) **Make history bootstrap use correct HTTP statuses**
   - Keep the structured body, but return 4xx/5xx status codes consistently.
   - This reduces frontend ambiguity and aligns with CORE_PRINCIPLES #8.

2) **Remove or redesign oscillator → main crosshair sync**
   - If bidirectional crosshair is desired, compute a correct Y value for the main series (or clear crosshair) to avoid placing crosshair at y=0.
   - If not desired, remove the oscillator → main pathway and keep main → oscillator only to match the plan.

### Priority 1 (Architecture / Maintainability)
3) **Finish ChartWorkspace separation-of-concerns**
   - Keep ChartWorkspace as orchestration only.
   - Move static `indicatorOptions`/configs into a dedicated module (or store) so the component shrinks and the boundaries are enforceable.
   - This reduces regression risk and aligns with CORE_PRINCIPLES #6.

4) **Standardize history API response shape**
   - Consider a single shared schema for history payloads (`candles` vs `data`) to avoid duplicative parsing logic.

### Priority 2 (Performance / UX)
5) **Address bundle size warnings**
   - Split large chunks via route-level code splitting or extract large constant configs into separate modules.
   - This reduces load time and keeps the Dashboard responsive.

6) **Replace `window.alert/prompt` with the app’s UI messaging pattern**
   - The project already has an error banner mechanism; consider using a unified toast/message system for AI and screenshot flows.

## Suggested Follow-Up Checks
- Scan gateway/collector mains for any remaining `print()` statements in production paths and replace with structured logging.
- Add a small contract test asserting that history bootstrap errors include both `error_code` and a non-200 status.
- Add a crosshair-loop regression test (hover main → osc → main) to ensure no feedback storms.

