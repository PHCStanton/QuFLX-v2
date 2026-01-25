# QuFLX v2 — AI Integration Dev Plan

**Date:** 2026-01-21  
**Owner:** Team Leader (delegates per `.agents/CORE_PRINCIPLES.md`)  
**Scope:** Ask AI (Quick Modal + AI Insights Panel), screenshot-to-AI linkage, backend hardening, and domain-tab AI entrypoints without UI reshuffles.

This plan is written to be executed incrementally, with explicit validation at each phase.

## 0 Snapshot (Current State)

### Implemented (confirmed)

- [x] Ask AI Modal (Quick Assist) + AI Insights Panel separation
- [x] Shared Ask AI request core (context + image resolution)
- [x] Persist latest annotated screenshot across refresh (localStorage)
- [x] Image source label (Live / Annotated / None)
- [x] Keyboard shortcuts: Screenshot editor (Esc/Ctrl+Z/Ctrl+S), Ask AI modal (Esc/Ctrl+Enter)
- [x] Global resizable right-side tab panel (all tabs)

Primary references:

- [Detailed_report_Ai_integration_architechture_26-01-21.md](file:///c:/QuFLX/v2/reports/report_2026-01/Detailed_report_Ai_integration_architechture_26-01-21.md)
- [ai.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py)
- [service.py](file:///c:/QuFLX/v2/backend/services/ai/service.py)
- [aiClient.js](file:///c:/QuFLX/v2/gui/Dashboard/src/api/aiClient.js)
- [useAskAi.js](file:///c:/QuFLX/v2/gui/Dashboard/src/hooks/useAskAi.js)
- [aiContext.js](file:///c:/QuFLX/v2/gui/Dashboard/src/utils/aiContext.js)
- [AskAiModal.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AskAiModal.jsx)
- [AiInsightsPanel.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AiInsightsPanel.jsx)

### Active Issue (must fix first)

- [x] Ask AI failures no longer render as “answers”
  - Fixed: backend now returns non-200 with structured JSON errors (`code`, `detail`, `request_id`, `retryable`).
  - Remaining: dev logs UI visibility at `http://localhost:5173/dev-logs`.

## Principles & Non-Negotiables

- No new frameworks.
- Validate inputs at the boundary (backend) and fail predictably.
- Structured errors (status code + JSON body), no silent failures.
- Keep domain tabs owning UI; AI Insights is for long-form conversation, not a dumping ground.

## Phase 1 — Restore Observability + Fix “Internal Error” Surface (fast stabilization)

**Goal:** make failures diagnosable, and ensure AI failures show as errors (not “answers”).

### 1.1 Gateway request IDs and AI call correlation

- [x] Ensure every `/api/v1/ai/ask` response includes `request_id` (and an `error_id` when failing)
- [x] Log `request_id`, `asset`, `timeframe`, `image_present`, and model (never raw prompt)

### 1.2 Dev logs reliability

- [ ] Verify gateway logs are being written to the configured log directory
- [ ] Validate `/api/v1/dev-logs/state` returns correct base dir and log level
- [ ] Validate `/api/v1/dev-logs/tail?service=gateway&file=<active-log>&lines=200` works

### 1.3 Fix the error contract so UI can distinguish failure

- [x] On provider/network failure: return non-200 with structured error JSON (no “answer” string)
- [x] On client input error: return 400 with a structured validation error
- [x] Update frontend `askAI`/`useAskAi` to display structured errors via the existing error surface

Acceptance criteria:

- Asking AI with an invalid payload returns 400 with JSON `{ detail, request_id, code }`.
- Provider failure returns 502/504 with JSON `{ detail, request_id, code, retryable }`.
- UI shows a user-facing error state (toast/inline) and does not append an “assistant” message for failures.

## Phase 2 — Harden AI Backend Boundary (must-do)

**Goal:** strict schema for `/api/v1/ai/ask`, size limits, safe logging, and explicit error mapping.

### 2.1 Strict request schema (Pydantic)

- [x] Replace `payload: Dict[str, Any]` with a Pydantic model (single source of truth)
- [x] Explicitly model supported fields: `prompt`, `context`, `asset`, `timeframe`, `image_base64`
- [x] Enforce size limits:
  - [x] `prompt` max length (e.g., 4–8k chars)
  - [x] `context` max serialized bytes (e.g., 50–150 KB)
  - [x] `image_base64` max bytes after decoding (e.g., 1–2 MB) and/or max data-url length
- [x] Validate image format:
  - [x] Allow `data:image/png;base64,...` and raw base64 only
  - [x] Reject non-base64 and “data:” without comma payload

### 2.2 Structured response schema

- [~] Define a success response model `{ answer, meta, request_id }`
- [~] Define an error response model `{ detail, code, request_id, retryable, debug? }`

### 2.3 Safe logging (no raw prompts)

- [x] Remove info-level prompt logging in [service.py](file:///c:/QuFLX/v2/backend/services/ai/service.py)
- [ ] Log only:
  - [ ] `request_id`
  - [ ] provider status code (when present)
  - [ ] whether image was included
  - [ ] selected model

### 2.4 Map provider failures to gateway HTTP codes

- [x] Timeout → 504 (retryable)
- [x] Connection/provider down → 502 (retryable)
- [x] Provider returns 4xx (bad request, auth) → 502 or 500 with non-retryable code
- [x] Invalid image payload → 400

Implementation touchpoints:

- [ai.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py)
- [service.py](file:///c:/QuFLX/v2/backend/services/ai/service.py)
- [main.py](file:///c:/QuFLX/v2/backend/services/gateway/main.py) (request_id + exception handlers)

Acceptance criteria:

- Invalid prompt/image/context fails fast at the gateway boundary with clear messages.
- No raw prompts appear in production logs.
- Gateway returns structured JSON errors; frontend renders them reliably.

## Phase 3 — TradingContext Contract (scalability anchor)

**Goal:** one stable contract constructed across tabs (market/indicators/alerts/risk/journal) with safe merging.

### 3.1 Define TradingContext (backend-first)

- [ ] Add Pydantic `TradingContext` model and nested models with defaults
- [ ] Enforce per-slice size limits (market window, indicator tails, etc.)
- [ ] Add a safe “merge” rule: missing slices are allowed; unknown keys rejected

Target contract:

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

### 3.2 Frontend context ownership by tab

- [ ] Dashboard builds: `market + indicators` (existing)
- [ ] Notifications builds: `alerts` (future)
- [ ] Risk Manager builds: `risk`
- [ ] Calendar/Journal builds: `journal`

### 3.3 Dev-only context preview

- [ ] Add a dev-only UI that shows the exact JSON being sent (size + redactions)
- [ ] Add a “copy context” button for debugging

Acceptance criteria:

- Every Ask AI request contains a TradingContext object (even if partially filled).
- Context preview makes field-level issues obvious without digging in network logs.

## Phase 4 — AI Insights Panel UX Upgrade (discuss-first, then implement)

**Goal:** turn AI Insights into a real workspace panel with better visibility and controls.

### UX recommendations (preferred direction)

- Resizable left-side panel (width drag handle), with collapse/expand.
- Message “cards” render metadata: asset, timeframe, image source, timestamp, provider/model.
- Optional screenshot strip (thumbnails) inside the panel:
  - latest annotated screenshot
  - latest live capture
  - click thumbnail to open larger preview
- Actions per message: Copy, Continue from last answer.
- Thread actions: Clear (exists), Export (later), Pin important messages (later).

### Implementation steps

- [ ] Add message timestamp and imageSource into stored message meta
- [ ] Render metadata line + tool buttons on each message
- [x] Implement resizable panel layout (no extra libs)
- [ ] Add screenshot thumbnail preview and a simple viewer modal

References:

- [AiInsightsPanel.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/AiInsightsPanel.jsx)
- [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)

Acceptance criteria:

- Panel can expand for “deep work” without covering the chart entirely.
- Screenshot context can be inspected without leaving the panel.
- Actions are keyboard-friendly and do not introduce UI clutter.

## Phase 5 — Domain Tab AI Entrypoints (no UI migration into AI Insights)

**Goal:** each domain tab calls the shared AI request core with its own context slice.

### 5.1 Risk Manager: “Ask AI: sizing recommendation”

- [ ] Add a lightweight entrypoint that passes current risk settings + streak/DD state
- [ ] Use the shared Ask AI core (same API + context contract)

Risk Manager reference components:

- [RiskCalculator.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/RiskCalculator.tsx)
- [LimitReachedModal.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/LimitReachedModal.tsx)
- [RiskComparison.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/RiskComparison.tsx)
- [SessionTable.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/SessionTable.tsx)
- [RiskVisualizationPrototype.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/RiskVisualizationPrototype.tsx)

### 5.2 Calendar/Journal: “Ask AI: debrief this day”

- [ ] Prefill prompt with selected date and journal content summary
- [ ] Pass `journal` slice: selected date, entry content, emotion tags, lessons

Calendar/Journal references:

- [CalendarView.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/CalendarView.tsx)
- [JournalEntryForm.tsx](file:///c:/QuFLX/v2/gui/RiskManager/src/components/JournalEntryForm.tsx)

Acceptance criteria:

- Domain tab UI stays in its tab.
- Ask AI calls include domain slice + shared market slice when available.

## Phase 6 — Screenshot → AI Workflow Improvements

**Goal:** reduce latency/cost and improve usability of “Send to AI”.

- [ ] Optional downscale/compress before sending images (settings-gated)
- [ ] Add preset prompt when sending from screenshot editor (e.g., “Analyze what I marked and give a plan”)

Reference:

- [Screenshot_modifications_Plan.md](file:///c:/QuFLX/v2/ai_dev_docs/Screenshot_modifications_Plan.md)

Acceptance criteria:

- Image payload stays under the configured size limit.
- Screenshot send-to-AI yields reliable responses and consistent image source behavior.

## Phase 7 — Notifications + Analysis Tab (define UX contract first)

**Goal:** integrate “Ask AI: validate alert” into an Analysis tab without prematurely committing infrastructure.

- [ ] Define what “Analysis” owns vs “Strategy Lab” (tools vs playbooks)
- [ ] Define alert payload contract and UI layout
- [ ] Only after UX contract: add store + endpoints placeholders
- [ ] Add “Ask AI: validate alert” (alert payload + optional screenshot)

Relevant docs:

- `gui/Alert-Dispatch/dev_docs_notify` (notification system notes)

### Phase 5: Voice Agent Integration (Priority: LOW) ⏱️ Est. 1 week+

**Goal:** Add voice-based AI interaction.

**Tasks:**
- [x] Implement backend voice gateway (Route added)
- [x] Add WebSocket endpoint for audio streaming (Verified connection)
- [x] Create frontend voice UI (mic button, transcript display)
- [x] Wire voice to same TradingContext as text (Frontend ready)
- [ ] Add voice-specific guardrails
- [ ] Connect to real xAI API (currently Mock Relay)

**Trading Benefit:** Hands-free trading assistance; faster interaction during active trading.

---

## 11. API Contract Reference

### `POST /api/v1/ai/ask`

**Request:**
```json
{
  "prompt": "What is the current trend?",
  "context": {
    "asset": "AUDNZDOTC",
    "timeframe": "1m",
    "price": 0.98765,
    "indicators": {
      "rsi_14": 45,
      "sma_20": 0.98750,
      "atr_14": 0.00045
    },
    "recent_candles": [/* last 50 candles */]
  },
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Response:**
```json
{
  "answer": "Based on the chart and RSI of 45, the trend appears neutral with a slight bullish bias...",
  "meta": {
    "ok": true,
    "model": "grok-4-latest",
    "usage": {
      "prompt_tokens": 1200,
      "completion_tokens": 150,
      "total_tokens": 1350
    },
    "used_context_keys": ["asset", "timeframe", "indicators", "recent_candles"]
  }
}
```

---

## 12. Files Involved in Implementation

| File | Purpose | Status |
|------|---------|--------|
| `backend/services/ai/service.py` | xAI API wrapper | ✅ Complete |
| `backend/services/gateway/main.py` | `/api/v1/ai/ask` endpoint | ✅ Complete |
| `gui/Dashboard/src/components/ChartActions.jsx` | Ask AI button | ✅ Complete |
| `gui/Dashboard/src/components/ScreenshotModal.jsx` | Screenshot + annotations | ✅ Complete |
| `gui/Dashboard/src/components/AiInsightsPanel.jsx` | Chat interface | ✅ Complete |
| `gui/Dashboard/src/components/AskAiModal.jsx` | Quick Q&A modal | ✅ Complete |
| `gui/Dashboard/src/hooks/useChartCapture.js` | Screenshot capture | ✅ Complete |
| `gui/Dashboard/src/stores/aiStore.js` | Conversation state | ✅ Complete (Merged into marketStore) |

---

## 13. Summary

The Ask AI feature transforms QuFLX v2 into an intelligent trading assistant by combining:

1. **Quick Modal** for fast situational awareness
2. **Screenshot Analysis** for visual pattern recognition
3. **Extended Chat** for deep analysis and coaching
4. **Context Injection** for data-aware responses

All implementations follow CORE_PRINCIPLES to ensure a solid, robust, functional, optimized, simplified, and bug-free codebase.

---

*Compiled by: Team Leader Agent*  
*Date: 2026-01-25*  
*References: CORE_PRINCIPLES.md, DATA_CONTRACTS.md, ai_trading_integration_architecture_report_25-12-23.md*
