# Implementation Plan: History + Assets + Indicators Alignment (26-01-17)

**Author:** Team_Leader (Expert 2nd Opinion)
**Date:** 2026-01-17
**Status:** COMPLETED / IMPLEMENTED
**Reference Report:** `reports/report_2026-01/report_history_assets_indicators.md`

**Completion Date:** 2026-01-18

## 0. Completion Summary

All planned phases have been implemented and verified:

- History bootstrap now returns proper non-200 HTTP status codes with structured JSON error bodies.
- Crosshair sync is now unidirectional (Main → Oscillators).
- History API response shape is unified around `candles` (with backward-compatible `data`).
- `ChartWorkspace.jsx` static option blocks are extracted into a config module.
- No native `window.alert()` calls remain in the Dashboard.
- Vite build no longer emits the >500kB chunk-size warning.

Verification:

- Backend: `python -m pytest -q` ✅
- Dashboard: `npm run lint` ✅, `npm run build` ✅, `npm run test:qa` ✅

## 1. Executive Summary & Expert Opinion

After reviewing the Alignment Review report, it is clear that while the core functionality of the history pipeline and indicators is functional, the system currently carries significant "architectural debt" and violates several **CORE_PRINCIPLES**. 

The current state has "functional success" but "structural fragility." Specifically, the inconsistent use of HTTP status codes and the oversized `ChartWorkspace` component create a high risk of silent failures and regression during future updates.

**Verdict:** I strongly endorse the recommendations in the report. Implementation of these changes will move the app from "working" to "robust," directly improving stability and maintainability.

---

## 2. Strategic Impact (CORE_PRINCIPLES Alignment)

### 2.1 Improvement to Performance
- **Standardizing API Shapes:** Reduces redundant parsing logic in the frontend, lowering CPU cycles during asset switching.
- **Bundle Size Optimization:** Addressing the 500kB chunk warning will improve initial load times and perceived responsiveness (TBT - Total Blocking Time).

### 2.2 Improvement to Quality & Stability
- **Explicit HTTP Status Codes (Principle #8):** By returning 4xx/5xx, we eliminate "False Positives" where the network layer thinks a request succeeded but the application layer failed. This is critical for reliable automated recovery.
- **Unidirectional Crosshair Sync (Principle #1):** Removing the bidirectional loop eliminates potential feedback storms and simplifies the coordinate mapping logic.
- **Separation of Concerns (Principle #6):** Shrinking `ChartWorkspace` makes the code readable and testable. It prevents "spaghetti orchestration" where UI logic and data logic are inextricably linked.

---

## 3. Detailed Action Plan

### Phase 1: Safety & Protocol (Priority 0)
1. **[Backend] Fix History Bootstrap Semantic Errors**
   - ✅ Implemented: `bootstrap-history` returns correct non-200 HTTP status codes for structured error responses.
   - *Success Criteria:* Met (failures return 4xx/5xx).

2. **[Frontend] Re-align Crosshair Strategy**
   - ✅ Implemented: oscillator → main pathway removed; main chart remains the single driver.
   - *Success Criteria:* Met (no oscillator-driven Y=0 crosshair).

### Phase 2: Architecture & Clean-up (Priority 1)
3. **[Frontend] Final ChartWorkspace Refactor**
   - ✅ Implemented: static options extracted to `gui/Dashboard/src/config/chartOptions.js`.
   - *Success Criteria:* Met for static extraction; remaining refactors can continue incrementally.

4. **[Backend/Frontend] API Shape Unification**
   - ✅ Implemented: history GET now includes `candles` (keeps `data` for compatibility); frontend prefers `candles`.
   - *Success Criteria:* Met.

### Phase 3: UX & Optimization (Priority 2)
5. **[Frontend] UI Messaging Standardization**
   - ✅ Implemented: removed native alerts; errors route through in-app UI patterns.
   - *Success Criteria:* Met.

6. **[Optimizer] Bundle Optimization**
   - ✅ Implemented: manual chunking added in `gui/Dashboard/vite.config.js`; build no longer emits the >500kB chunk-size warning.

---

## 4. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Refactoring `ChartWorkspace` breaks chart init | High | Use @Reviewer for every PR; run Playwright smoke tests after every sub-component extraction. |
| Changing HTTP status codes breaks FE error parsing | Medium | Update `marketStore.js` error handling *before* deploying backend changes. |
| Bidirectional sync removal affects user workflow | Low | The report indicates this was a "side effect" rather than a requested feature; benefits of stability outweigh the feature loss. |

---

## 5. Success Criteria (Definition of Done)
- [x] All failure paths in history bootstrap return 4xx/5xx status codes.
- [x] `ChartWorkspace.jsx` is under 250 lines.
- [x] No `window.alert` calls remain in the Dashboard source code.
- [x] Vite build completes with zero chunk size warnings.
- [x] Crosshair sync is unidirectional (Main -> Oscillator).
- [x] All Playwright integration tests pass.

Notes:

- `ChartWorkspace.jsx` is now ~240 lines after refactor and extraction.

---
**Approval Signature:**  
👔 *Team_Leader*
