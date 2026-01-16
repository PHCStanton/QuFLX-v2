# Implementation Assessment Plan (Actionable)
**Date:** 2026-01-15  
**Source:** `reports/report_2026-01/report_assessment_26-01-15.md`

## Goal
Resolve the assessment’s CORE_PRINCIPLES violations (primarily #8, #6, #9) without breaking existing behavior (#5).

## Scope
- Frontend: error handling/user feedback in chart UI + Zustand stores; input validation around time ranges/timestamps; ChartWorkspace separation of concerns refactor.
- Backend: remove production debug prints; replace with structured logging.

## Non-Negotiable Quality Gates (CORE_PRINCIPLES)
- **#8 Defensive & Explicit Error Handling:** No log-only catch blocks. Every error must be handled (user-friendly message + safe state) or propagated upward.
- **#9 Fail Fast, Fail Loud:** Validate inputs at boundaries; do not rely on optional chaining defaults to hide invalid state.
- **#6 Separation of Concerns:** One module/component = one responsibility; extract cross-cutting behaviors from ChartWorkspace.
- **#3 Incremental Testing:** Test after each change-set; do not stack unverified edits.

## Phases & Status
- [x] Phase 0 — Planning
  - [x] Compile assessment plan into this Dev Doc
- [x] Phase 1 — P0: Stop silent failures in marketStore
  - [x] Replace log-only catch blocks with user-visible error state
  - [x] Ensure socket `connect_error` sets status + user explanation
- [x] Phase 2 — P1: Chart UI stabilization + validation
  - [x] Add boundary validation (time range, timestamps, chart readiness)
  - [x] Ensure failures surface user-friendly messages (no silent console-only)
  - [x] Fix lightweight-charts disposal race during ResizeObserver resize
  - [x] Fix oscillator sync errors when visible range is null/invalid
- [x] Phase 3 — P1: ChartWorkspace separation of concerns
  - [x] Extract overlay indicators logic
  - [x] Extract oscillator panel component
  - [x] Extract screenshot capture logic
  - [x] Extract AI interaction logic
  - [x] Extract crosshair synchronization logic
- [x] Phase 4 — P2: Backend logging cleanup
  - [x] Replace `print()` debug statements with `logger.debug()`
- [~] Phase 5 — Verification
  - [x] Run Dashboard lint
  - [x] Run Dashboard build
  - [x] Run frontend QA smoke tests (Playwright)
  - [x] Run backend syntax check (py_compile)
  - [x] Run backend tests (pytest)
  - [~] Pass manual QA scenarios (automated smoke complete)

### Manual QA Checklist
- [x] Backend down → shows connection failed guidance
- [~] Empty/bad market data → empty validated, bad payload pending
- [x] Oscillator sync edge cases → no crashes, message visible
- [x] Add/remove indicators → no regressions
- [x] Screenshot capture → works
- [ ] Asset switching → works
- [x] Timeframe switching → works

## Priority Workstreams

### P0 — Stop Silent Failures in `marketStore.js`
- Replace “catch → console.error only” patterns with a consistent, user-visible error mechanism (e.g., store `lastError` updates).
- Ensure socket `connect_error` sets both `wsStatus` and a user-facing explanation.

**Acceptance Criteria**
- Any network/socket failure results in a stable UI state and a readable message.
- No catch blocks remain that only log without state/UI impact.

### P1 — Fix Chart UI Error Handling Hotspots
Target files:
- `ChartContainer.jsx`
- `ChartWorkspace.jsx`
- `OscillatorChart.jsx`
- `useTickAggregation.js`

Actions:
- Validate inputs before risky operations (time range integrity, timestamp finiteness, chart instance readiness).
- On failure, surface a user-friendly error (UI message/store/ErrorBoundary pathway) instead of silent console-only behavior.

**Acceptance Criteria**
- Invalid time ranges/timestamps do not crash charts and do not fail silently.
- User sees a clear non-technical message when chart sync/update fails.

### P1 — Restore Separation of Concerns in `ChartWorkspace.jsx`
Extract responsibilities (as recommended in the assessment):
- Overlay indicators → `useOverlayIndicators.js` hook
- Oscillator panel → `OscillatorPanel.jsx` component
- Screenshot logic → `useScreenshotCapture.js` hook
- AI interaction → `useAIChat.js` hook
- Crosshair synchronization → `useCrosshairSync.js` hook

Keep `ChartWorkspace.jsx` as orchestration only (target ~200 lines).

**Acceptance Criteria**
- Each extracted unit has one responsibility and a clean boundary.
- No regressions in chart initialization, overlays, oscillators, timeframe sync, resizing, asset selection, screenshot, crosshair sync.

### P2 — Remove Backend Debug Prints
Target file:
- `backend/services/gateway/main.py`

Actions:
- Replace `print()` debug statements with proper `logger.debug()` usage.

**Acceptance Criteria**
- No stdout debug noise in production paths.
- Logs remain structured and filterable.

### P2 — Reduce Optional-Chaining Band-Aids via Early Validation
Actions:
- Identify initialization/boundary points (store initialization, action entry points) and validate required settings/state once.
- Prefer explicit, predictable failure paths (dev) or controlled user messaging (prod UI) over silent fallback.

**Acceptance Criteria**
- Missing required settings does not silently degrade behavior.
- Failures are explicit, consistent, and observable.

## Verification Plan

### Automated
- Run frontend lint + typecheck using existing project scripts.
- Run frontend unit/integration tests if present.
- Run backend tests/linting if present.

### Manual QA (Must-Pass)
- Backend down: UI shows “connection failed” guidance (not just a status flag).
- Bad/empty market data payload: charts remain stable and display an actionable message.
- Oscillator timeframe sync edge cases: no crashes; message visible when sync fails.
- Core flows remain intact: add/remove indicators, oscillator resize, screenshot, timeframe/asset switching, crosshair sync.

## Risks & Mitigations
- **ChartWorkspace refactor regression risk:** extract one concern at a time with immediate verification (#3) and keep public interfaces stable (#5).
- **Hotspot churn risk:** if a file requires repeated incremental fixes, trigger the rewrite rule (#7) rather than stacking patches.

## Next Review
- Recommended next review: after implementing **P0** fixes.
