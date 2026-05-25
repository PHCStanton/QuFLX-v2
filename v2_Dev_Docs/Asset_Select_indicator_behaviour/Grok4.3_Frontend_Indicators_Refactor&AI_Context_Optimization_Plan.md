**QuFLX-v2: Frontend Indicators Refactor & AI Context Optimization Plan**  
**Compiled from Chat Discussion — 17–19 May 2026**  
**Version:** 1.0 (Post-AI Performance Optimization + Multi-Model Routing)  
**Author:** Grok (xAI) — Binary Options Trading Platform with AI Integration  
**Repositories referenced:** `PHCStanton/QuFLX-v2.git` (authoritative state via `.agent-memory/`) and `PHCStanton/OTC_SNIPER_v3.git` (shared pipeline patterns)

---

### Executive Summary

This document consolidates **all modifications, assessments, and recommendations** discussed in our chat regarding the frontend GUI indicators implementation, AI context injection logic, and indicator caching strategies.

**Core Verdict from Reviews**:
- Backend indicator pipeline (`TechnicalIndicatorsPipeline`) and caching layers are **optimal** and production-ready.
- Frontend GUI indicators are functional (7.5/10) but suffer from **visual/performance bloat**: no oscillator visibility persistence, excessive separate panes, and non-essential indicators (CCI + Stochastic) cluttering binary-options charts.
- AI context injection (`buildAiContext` → `_inject_backend_indicators`) is clean, defensive, and fully leverages caching — **zero negative impact** from proposed UI changes.
- **Proposed changes** are frontend-only, low-risk, and deliver immediate UX wins for binary-options traders while preserving (or slightly improving) AI intelligence.

**Key Changes Proposed** (detailed below):
1. Oscillator visibility persistence in settings.
2. Shared oscillator container refactor (address OPT-3).
3. Deprecate CCI & Stochastic **in UI only**.
4. Optional AI context trim (visible indicators only).
5. Minor hardening & telemetry.

These changes align with the project’s modular monolith architecture, “smart store, dumb components” pattern, and binary-options focus (fast 1-min/5-min decisions).

---

### Current State Assessment (as of 19-04-2026 memory system)

**Backend (Strong)**
- `backend/services/strategy/indicators.py` → `TechnicalIndicatorsPipeline` runs **in-process** via `asyncio.to_thread()` (`routes/indicators.py`).
- Multi-layer caching:
  - Per-asset DataFrame cache (`_df_cache` keyed by `csv_path`).
  - 5-second mtime-aware TTL cache (`backend/utils/indicator_utils.py` keyed by `(asset, timeframe, pipeline params)`).
  - Live-candle bypass for accuracy.
- AI injection path (`routes/ai.py: _inject_backend_indicators`) re-uses exact same cache → no redundant computation.

**Frontend (Functional but Sub-Optimal)**
- Overlays (main chart): SuperTrend, Bollinger Bands, EMA Cross-Over (21/50/100), Support/Resistance.
- Oscillators (separate panes): RSI, MACD, Stochastic, CCI (`OscillatorChart.jsx` + `OscillatorPanel.jsx`).
- `ChartWorkspace.jsx` + `marketStore` + Lightweight Charts synchronization.
- AI path: `buildAiContext` (in `utils/aiContext.js`) → `useAskAi.js` → shared `aiProvidersStore` → `/api/v1/ai/ask` (or `/ask/stream`).
- Gaps (from `progress.md`, `activeContext.md`, March 2026 plan):
  - Oscillator visibility toggle persistence **pending**.
  - Multi-oscillator shared-chart refactor (OPT-3) **deferred**.
  - No frontend series filtering for AI payloads.

**AI Context & Caching Health**
- Logic is cache-friendly (3-message prompt layout post-Phase B).
- Provider-aware size limits fire **after** injection.
- Benchmark harness (`perf_ask_ai_bench.py`) already in place.

---

### Proposed Modifications & Changes (Technical Details)

#### 1. Oscillator Visibility Persistence (Priority 1 — Highest Impact)
**Files to modify:**
- `gui/Dashboard/src/store/settingsStore.js` — add `visibleOscillators: string[]` (default `['rsi', 'macd']`) with `persistMiddleware`.
- `gui/Dashboard/src/components/OscillatorPanel.jsx` — read/write setting; conditional render.
- `gui/Dashboard/src/components/IndicatorSettingsModal.jsx` — add toggle switches for each oscillator.
- `gui/Dashboard/src/components/ChartWorkspace.jsx` — respect `settings.visibleOscillators` when mounting panes.

**Technical spec:**
```ts
// settingsStore.js (example)
visibleOscillators: ['rsi', 'macd'], // persisted via persistMiddleware
setVisibleOscillators: (oscillators: string[]) => set({ visibleOscillators: oscillators }),
```

#### 2. Shared Oscillator Container Refactor (Priority 2 — OPT-3)
**Files:**
- Deprecate separate `OscillatorChart.jsx` instances.
- New: `gui/Dashboard/src/components/OscillatorContainer.jsx` (single Lightweight Chart instance).
- Support stacked or tabbed layout based on `visibleOscillators`.
- Use `useMemo` + `useCallback` for series filtering in `ChartWorkspace.jsx`.

**Benefit:** Reduces from 5 chart instances → 1 main + 1 shared oscillator pane.

#### 3. Deprecate CCI & Stochastic in UI Only (Priority 3)
**Files:**
- `gui/Dashboard/src/config/chartOptions.js` — remove from default config.
- `IndicatorSettingsModal.jsx` — hide from UI toggles (keep backend computation).
- `buildAiContext` / `marketStore` — exclude from visual series (but keep in full backend injection fallback).
- Update `activeIndicators` filtering.

**Backend unchanged** — CCI/Stochastic remain in `TechnicalIndicatorsPipeline`, alerts, strategy, and full AI context.

#### 4. Optional AI Context Trim (Priority — Easy Win)
**File:** `gui/Dashboard/src/utils/aiContext.js` (`buildAiContext`)
```js
// New logic (after visibility persistence)
const visibleSeries = Object.fromEntries(
  Object.entries(indicatorSeries).filter(([key]) => 
    overlays.includes(key) || visibleOscillators.includes(key)
  )
);
```

**Impact:** Smaller JSON payload → lower token count → faster TTFT on Grok-4 / grok-4-fast.

#### 5. Frontend Hardening & Telemetry (Priority 4)
- Add `React.memo` + selective Zustand selectors in `ChartWorkspace.jsx`.
- Expose cache metrics in `_inject_backend_indicators` (log to `/dev-logs`).
- Loading skeleton for oscillators.

---

### Impact Analysis

**On Backend Indicators & Caching**:
- **Zero changes** to `TechnicalIndicatorsPipeline`, DataFrame cache, TTL cache, or `_inject_backend_indicators`.
- AI still receives **full indicator set** (CCI/Stochastic included) via injection fallback.
- Caching layers remain shared across chart, strategy, alerts, and AI.

**On Ask AI Modal + AI Insights Panel**:
- No regression in AI intelligence.
- Potential **performance gain** via context trim.
- Streaming (SSE) and multi-model routing (grok-4 / grok-4-fast / gemma-local) unaffected.

**On Live Trading & Binary Options Operations**:
- Cleaner, faster-loading charts → better real-time decision speed on 1-min/5-min OTC.
- Reduced React re-renders and memory footprint.

---

### Improvements & Why They Are Valuable

| Change | Improvement | Value for System | Value for Users (Binary Options Traders) |
|--------|-------------|------------------|-----------------------------------------|
| Oscillator visibility persistence | Remember on/off choices across sessions | Reduces unnecessary chart instances & re-renders | Cleaner dashboard, faster load times, personalized UX |
| Shared oscillator container | Single pane instead of 4 separate charts | Lower CPU/memory, better Lightweight Charts performance | Snappier UI, less visual noise on high-tick charts |
| Deprecate CCI/Stochastic (UI only) | Remove redundant overlays | Smaller payloads, simpler code maintenance | Focused high-signal indicators (RSI+MACD + overlays) = faster decisions |
| AI context trim | Send only visible indicators | Lower token usage, faster TTFT | Quicker Ask AI responses without losing depth (fallback ensures full data) |
| Hardening & telemetry | Memoization + cache visibility | More robust, debuggable AI path | Confidence in “AI used cached data” during live trading |

**Overall System Benefits**:
- Aligns with “smart store, dumb components” and modular architecture.
- Completes OPT-3 from March 2026 plan.
- Improves benchmark metrics (TTFT, payload size, cache-hit ratio).
- Prepares dashboard for Risk Manager / Calendar panels without bloat.

**User Benefits**:
- Faster, cleaner interface tailored for high-frequency binary options.
- AI remains maximally intelligent while feeling more responsive.
- Reduced cognitive load → better trading focus.

---

### Implementation Roadmap

1. **Phase 1 (1–2 hours)**: Oscillator visibility persistence + settings integration.
2. **Phase 2 (2–3 hours)**: Shared oscillator container + deprecation.
3. **Phase 3 (30 min)**: AI context trim + hardening.
4. **Phase 4**: Update memory system files + benchmark re-run.

I can provide **exact code diffs/patches** for any/all files immediately upon your go-ahead.

---

### Verification & Benchmark Plan

```bash
# After changes
python backend/tests/perf_ask_ai_bench.py --iterations 20 --models grok-4-fast,gemma-local --ui-modes modal,insights

# Manual checks
- Toggle oscillators → refresh page → settings persist
- Ask AI modal → confirm context size reduction (Dev Tools Network tab)
- Chart load time improvement
- Full backend test suite: python -m pytest backend/tests/ -q --tb=no
```

---

### Required Memory System Updates

After implementation:
- `activeContext.md` — record completion + next steps.
- `progress.md` — mark oscillator persistence + OPT-3 as ✅.
- `systemPatterns.md` — add “Core Indicator Set for Binary Options” section.
- `productContext.md` — optional success metrics update.

---

**Next Steps**  
This document serves as the single source of truth for the refactor.  

**Would you like me to execute the implementation now?**  
Reply with:
- “Implement full plan” (all changes + memory updates), or
- “Start with Phase 1 only”, or
- Any specific subset.

I will deliver complete, ready-to-apply code changes, verification commands, and updated `.agent-memory/` files in the next response.

This refactor is a high-leverage win for QuFLX-v2 as your AI-powered binary options platform. Ready when you are.