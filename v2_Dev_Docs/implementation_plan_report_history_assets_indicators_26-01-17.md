# Implementation Plan: History + Assets + Indicators Alignment (26-01-17)

**Author:** Team_Leader (Expert 2nd Opinion)
**Date:** 2026-01-17
**Status:** PROPOSED / READY FOR DELEGATION
**Reference Report:** `reports/report_2026-01/report_history_assets_indicators.md`

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
   - @Backend_Specialist: Update `bootstrap-history` route to raise `HTTPException` with appropriate status codes (400 for bad inputs, 504 for timeouts, 500 for runner failures) instead of returning a 200 JSON payload with `ok: false`.
   - *Success Criteria:* `curl` on failure returns non-200 status.

2. **[Frontend] Re-align Crosshair Strategy**
   - @Frontend_Specialist: Modify `useCrosshairSync.js` to remove the oscillator-to-main pathway. Ensure `mainChart.subscribeCrosshairMove` remains the single trigger for all panels.
   - *Success Criteria:* Hovering on oscillator does not move the main chart crosshair to Y=0.

### Phase 2: Architecture & Clean-up (Priority 1)
3. **[Frontend] Final ChartWorkspace Refactor**
   - @Code_Simplifier: Extract static `indicatorOptions` and chart configuration objects into a `config/chartConfig.js` module.
   - @Frontend_Specialist: Move remaining inline logic in `ChartWorkspace.jsx` into the existing hooks (`useOverlayIndicators`, etc.).
   - *Success Criteria:* `ChartWorkspace.jsx` is reduced to < 250 lines of orchestration-only code.

4. **[Backend/Frontend] API Shape Unification**
   - @Backend_Specialist: Update `GET /api/v1/history/{asset}` to return the same `{ candles: [...] }` key as the bootstrap endpoint.
   - @Frontend_Specialist: Update `marketStore.js` to expect `candles` consistently.
   - *Success Criteria:* One parser function handles both history sources.

### Phase 3: UX & Optimization (Priority 2)
5. **[Frontend] UI Messaging Standardization**
   - @Frontend_Specialist: Replace all remaining `window.alert()` calls in `useAIChat.js` and `useScreenshotCapture.js` with the application's Toast/Error Banner system.
   - *Success Criteria:* No native browser alerts appear during AI or screenshot workflows.

6. **[Optimizer] Bundle Optimization**
   - @Optimizer: Analyze `vite.config.js` and implement manual chunking for `settingsStore` and large indicator libraries to resolve the >500kB warning.

---

## 4. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Refactoring `ChartWorkspace` breaks chart init | High | Use @Reviewer for every PR; run Playwright smoke tests after every sub-component extraction. |
| Changing HTTP status codes breaks FE error parsing | Medium | Update `marketStore.js` error handling *before* deploying backend changes. |
| Bidirectional sync removal affects user workflow | Low | The report indicates this was a "side effect" rather than a requested feature; benefits of stability outweigh the feature loss. |

---

## 5. Success Criteria (Definition of Done)
- [ ] All failure paths in history bootstrap return 4xx/5xx status codes.
- [ ] `ChartWorkspace.jsx` is under 250 lines.
- [ ] No `window.alert` calls remain in the Dashboard source code.
- [ ] Vite build completes with zero chunk size warnings.
- [ ] Crosshair sync is unidirectional (Main -> Oscillator).
- [ ] All Playwright integration tests pass.

---
**Approval Signature:**  
👔 *Team_Leader*
