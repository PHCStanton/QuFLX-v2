# QuFLX v2 — Detailed AI Integration Architecture Report (2026-01-21)

**Scope:** Ask AI (Quick Modal + AI Insights Panel), screenshot-to-AI linkage, and platform-ready architecture foundations for Risk Manager + Calendar/Journal + Notifications integration.  
**Primary Code Areas:** Dashboard UI + Gateway AI route + AI provider wrapper.

---

## 1) Executive Summary

QuFLX v2 now has a production-shaped **Ask AI UX split**:

- **Ask AI Modal (Quick Assist):** fast, structured prompts with optional voice transcript, returns a quick response in-place.
- **AI Insights Panel (Deep Work):** persistent multi-turn thread with input box and message history.

Key upgrades implemented to reduce instability and future refactor risk:

- Removed `window.prompt` UX completely from the Dashboard codepath.
- Introduced a reusable **Ask AI request core** (prompt/image/context resolution) used by both the Modal and the Panel.
- Persisted **latest annotated screenshot** across refresh (localStorage) and exposed a clear **Image Source** label (Live / Annotated / None).
- Added keyboard shortcuts where they matter:
  - Screenshot editor: `Esc` close, `Ctrl+Z` undo, `Ctrl+S` save.
  - Ask AI modal: `Esc` close, `Ctrl+Enter` ask.

This creates a stable foundation for integrating the 3 separate projects (Risk Manager, Calendar/Journal, Notifications) into QuFLX without overloading AI Insights or creating tight coupling.

---

## 2) Non-Negotiable Architectural Principles (Aligned with CORE_PRINCIPLES)

1. **Functional Simplicity First:** No new frameworks; reuse existing React + Zustand + Tailwind patterns.
2. **Separation of Concerns:** UI prompt collection ≠ context building ≠ network transport ≠ provider invocation.
3. **Fail Fast / Loud / Predictable:** Validate prompt early; explicit error messages; no silent failures.
4. **Backward Compatibility:** Ask AI remains accessible from Chart actions; AI Insights remains a distinct tab.
5. **Incremental Testing:** Lint + QA tests executed after changes.

---

## 3) Current System Map (As-Is)

### 3.1 Frontend (Dashboard)

**Entry point:** AI button in Chart header actions.

- Chart actions: [ChartActions.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartActions.jsx)
- Chart workspace wiring: [ChartWorkspace.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartWorkspace.jsx)
- Quick modal: [AskAiModal.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AskAiModal.jsx)
- AI Insights tab/panel: [AiInsightsPanel.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AiInsightsPanel.jsx)

**Store:** Zustand UI slice in [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)

- `aiMessages[]` thread (user/assistant)
- `aiDraftPrompt` shared draft
- `lastAnnotatedScreenshotDataUrl` persisted to localStorage
- `captureChartImage` function reference injected by ChartWorkspace (so the panel can use live capture)

### 3.2 Screenshot Editor → AI Link

- Screenshot editing + save/crop: [ScreenshotModal.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ScreenshotModal.jsx)
- “Ask AI” button inside screenshot editor sends current canvas (respecting crop mode) directly into Ask AI modal.

### 3.3 API Transport

- Frontend AI client: [aiClient.js](file:///c:/QuFLX/v2/gui/Dashboard/src/api/aiClient.js)
- Frontend screenshot client: [screenshotClient.js](file:///c:/QuFLX/v2/gui/Dashboard/src/api/screenshotClient.js)
- Frontend settings client: [settingsClient.js](file:///c:/QuFLX/v2/gui/Dashboard/src/api/settingsClient.js)
- Shared API base resolver: [apiBase.js](file:///c:/QuFLX/v2/gui/Dashboard/src/api/apiBase.js)

**Dev base URL control:** `VITE_API_BASE_URL` (fallback `http://localhost:8000`).

### 3.4 Backend

- Gateway endpoint: [ai.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py)
- Provider wrapper: [service.py](file:///c:/QuFLX/v2/backend/services/ai/service.py)

**Flow:** UI → `POST /api/v1/ai/ask` → AIService → xAI chat completions.

---

## 4) Implemented UX Model (To-Be)

### 4.1 Ask AI Modal = Quick Assist

Use cases (fast, chart-focused):

- Market overview (trend + volatility + regime)
- Chart overview (what stands out, key levels)
- Alert review (rate 1–10, biggest risk, wait vs enter)
- Risk check (conservative plan + invalidation)

**Escalation:** one click → “Continue in AI Insights” with the same thread + draft carried forward.

### 4.2 AI Insights Tab = Deep Work

Use cases (multi-step, persistent):

- Top-down analysis (multi-timeframe alignment + regime)
- Strategy refinement and playbooks
- Post-session debrief / learning loop
- Cross-feature synthesis (alerts + journal + risk plan)

### 4.3 IMPORTANT: Tabs Separation (Confirmed)

- **Risk Manager tab stays its own tab** (not merged into AI Insights).
- **Strategy Lab tab stays its own tab**.
- **AI Insights tab is not a dumping ground**—it’s the place for long conversations, while other tabs should own their domain UI and optionally call AI with domain context.

The intended design is: each domain tab can have a lightweight “Ask AI” entry that passes *domain context* to the same AI request core, while the AI Insights tab remains the long-form workspace.

---

## 5) Core Architecture Recommendation (Foundation for Scalability)

### 5.1 Two-Layer AI Design

**Layer A — AI Request Core (shared):**

- Input: `prompt`, `imageSource`, `captureImage`, `lastAnnotatedImage`, market/indicator context.
- Output: `{ answer, meta, usedImageSource, asset, timeframe }`.

Implementation:

- Shared functions: [aiContext.js](file:///c:/QuFLX/v2/gui/Dashboard/src/utils/aiContext.js)
- Hook wrapper: [useAskAi.js](file:///c:/QuFLX/v2/gui/Dashboard/src/hooks/useAskAi.js)

**Layer B — UX Surfaces (multiple):**

- Ask AI Modal
- AI Insights Panel
- (future) Risk Manager “Ask AI Sizing” helper
- (future) Notifications “Ask AI Validate Alert” helper
- (future) Calendar/Journal “Ask AI Debrief” helper

This keeps new features additive without refactoring AI plumbing repeatedly.

### 5.2 Trading Context Contract (Next Step)

Define a single JSON contract that can be constructed from multiple tabs:

```json
{
  "asset": "AUDNZDOTC",
  "timeframe": "1m",
  "market": { "recentTicks": [], "currentPrice": 0 },
  "indicators": { "active": [], "snapshots": {} },
  "alerts": { "latest": null },
  "risk": { "dailyMaxTrades": 10, "maxDrawdownPercent": 5 },
  "journal": { "selectedDate": "YYYY-MM-DD", "entrySummary": null }
}
```

Rule: each tab owns its slice; AI core merges slices safely.

---

## 6) Infrastructure Assessment (Dev-Safe, Implementation-Ready)

### 6.1 Strengths

- Frontend sends **structured context** (ticks + indicator tails) rather than raw, unbounded data.
- Screenshot workflow produces a single consistent **data URL** image suitable for multimodal models.
- Settings already expose an **Ask AI Image** selector (None / Live / Annotated).

### 6.2 Current Risks / Improvements

1. **Gateway AI service instantiation**
   - `AIService()` is instantiated directly in the route module.
   - Recommendation: move to FastAPI dependency injection or a startup singleton to avoid multiple instances and to simplify configuration and testing.

2. **Logging sensitivity**
   - Provider wrapper logs prompts (info level). Prompts can contain user notes.
   - Recommendation: redact or downgrade prompt logging; log only request IDs and flags (image present, asset/timeframe) in production.

3. **Image size / token pressure**
   - Data URLs can be large. This increases latency/cost and may cause provider-side issues.
   - Recommendation: add an optional image downscale/compression step (frontend-offscreen canvas) behind a setting.

4. **API base URL hardcoding**
   - Addressed: frontend now uses `VITE_API_BASE_URL` with a safe fallback.

5. **Voice support portability**
   - Implemented via Web Speech API (browser support dependent).
   - Recommendation: treat as best-effort; add a “not supported” UI state.

---

## 7) Integration Blueprint: Notifications + Risk Manager + Calendar/Journal

### 7.1 Goal

Enable “Synergy Flywheel” behavior (from [Notifications_Ai_Risk_Synergy.md](file:///c:/QuFLX/v2/docs/Notifications_Ai_Risk_Synergy.md)):

1) Notification fires (A+ filter) → 2) Ask AI validates & coaches timing → 3) Risk Manager sizes & caps drawdown → 4) Journal captures outcome → 5) AI debrief improves the rules.

### 7.2 How It Fits in the UI

- **Notifications tab/panel (future):** shows alert payload; button “Ask AI: Validate Alert” opens Ask AI modal prefilled.
- **Risk Manager tab:** owns risk configuration UI + scenario simulation; optional “Ask AI: Next trade sizing” helper.
- **Calendar/Journal tab:** owns trade logging; optional “Ask AI: Debrief today” helper.

AI Insights remains the place for extended chat and multi-step planning.

---

## 8) Status of Next Recommendations (From Screenshot_modifications_Plan.md)

Implemented in Dashboard code:

- Replace `window.prompt` UX with dedicated Ask AI modal/panel: ✅
- Persist last annotated screenshot across refresh: ✅
- Keyboard shortcuts (Esc/Ctrl+Z/Ctrl+S) in screenshot editor: ✅
- Image source label in AI Insights: ✅

Not implemented yet (intentionally deferred):

- Redo support for markup editor
- Full Ask AI “pin to chart” / overlays
- Notifications system UI integration points
- Risk Manager + Calendar/Journal UI integration in Dashboard panels

---

## 9) Verification Performed

Dashboard checks executed:

- `npm run lint` ✅
- `npm run test:qa` ✅
- `npm run build` ✅

---

## 10) Recommended Roadmap (Next)

### Phase A — Stabilize AI Context Contract

- Introduce a typed/validated “TradingContext” builder on the backend (pydantic model) and enforce size limits.
- Add request IDs and structured error responses (no silent failures).

### Phase B — Integrate Notifications

- Add UI surfaces to display alerts + “Ask AI validate” with alert payload included.

### Phase C — Integrate Risk Manager + Calendar/Journal

- Surface each module inside its own Dashboard tab panel.
- Add optional AI assist buttons that feed domain context into the shared AI core.

---

## 11) File/Module Index (Most Relevant)

- Ask AI modal: [AskAiModal.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AskAiModal.jsx)
- AI insights chat thread: [AiInsightsPanel.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AiInsightsPanel.jsx)
- Shared request core hook: [useAskAi.js](file:///c:/QuFLX/v2/gui/Dashboard/src/hooks/useAskAi.js)
- Shared context helpers: [aiContext.js](file:///c:/QuFLX/v2/gui/Dashboard/src/utils/aiContext.js)
- Screenshot editor + send-to-AI: [ScreenshotModal.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ScreenshotModal.jsx)
- Store integration: [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)
- Gateway endpoint: [ai.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py)
- Provider wrapper: [service.py](file:///c:/QuFLX/v2/backend/services/ai/service.py)

