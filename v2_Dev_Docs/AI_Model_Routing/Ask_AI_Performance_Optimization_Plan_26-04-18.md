# Ask AI — Performance Optimization & Misalignment Fixes Plan

**Plan authors:** @Investigator (lead, read-only) · with findings from @Debugger, @Engineer, @Optimizer
**Date:** 2026-04-18
**Status:** 🟡 Draft — awaiting user approval to begin Phase A
**Predecessor:** `v2_Dev_Docs/AI_Model_Routing/AI_Multi_Model_Routing_Plan_26-04-17.md` (Phase 2A complete)
**Related:** `ai_dev_docs/ai_integration_ask_ai_overview_25-12-19.md`, `.clinerules/PHASE_REVIEW_PROTOCOL.md`

---

## Executive Summary

The Ask AI pipeline is **functionally correct** after Phase 2A R-1, but suffers from **2 CRITICAL, 5 HIGH, 5 MEDIUM, and 3 LOW** issues that compound to roughly **+1.5 to +4 s of avoidable latency per Ask** and a **near-zero xAI prompt-cache hit rate** (xAI documented potential: 60–90%).

The root causes are architectural:
1. Dynamic market-data JSON is welded into the **user message** before the user prompt, breaking prefix caching.
2. The `/providers` health check creates a **fresh `httpx.AsyncClient`** on every probe, negating pooling.
3. Modal-mounted memos rebuild **100 candles + 34×50 indicator snapshots** on every WebSocket tick — even when the user never opens conversation mode.
4. The response is **not streamed**, so the UX spinner lasts 5–15 s instead of showing the first token in ~0.7–2.5 s.
5. There is **no `AbortSignal`** on `askAI()`, so closing the modal during a request leaks the request.

This plan delivers those fixes in two phases: **Phase A (Quick Wins, ~3–4 h)** and **Phase B (Targeted Rewrite, ~6–8 h)**, followed by **Phase C (Benchmark + Multi-Agent Review)**.

### Estimated gains after full plan

| Metric | Before | After | Δ |
|---|---|---|---|
| Time-to-first-token (modal) | 5–15 s | **0.7–2.5 s** | ~80% ⬇ |
| Input tokens per Ask (modal mode) | ~25–30 K | **~6–8 K + cache** | ~70% ⬇ |
| Prompt-cache hit rate (xAI) | <10% | **60–85%** | 6–8× ⬆ |
| Idle-modal CPU (browser) | continuous memo re-runs / tick | **~0** | ~100% ⬇ |
| `/providers` cold probe | 3× fresh TLS / mount | **0–1× reused TLS / 60 s** | ~90% ⬇ |
| `gemma-local` usable in modal mode | ❌ (413) | **✅** | — |

---

## Architecture Context

```
USER CLICK "Ask AI"
        ▼
AskAiModal.jsx ── (reads) ── marketStore, settingsStore
        │
        ├─► useAiProviders() ──► GET /api/v1/ai/providers ──► registry.probe_all() ──► 3× probe() ──► fresh AsyncClient ❌
        │
        ├─► useAskAi.ask() ──► buildAiContext() ──► aiClient.askAI() ──► fetch POST /api/v1/ai/ask  (no AbortSignal ❌)
        │
        │                                                                                          │
        │                                                                                          ▼
        │                                                     routes/ai.py: _inject_backend_indicators (no cache ❌)
        │                                                     → AIService.ask() → httpx.AsyncClient.post → xAI / llama-server
        │                                                     → stream=False ❌ → full string returned after 5–15s
        │
        └─► while mounted: useMemo(contextInstructions) rebuilds 80 KB JSON per tick ❌
```

---

## Current State Map

| Surface | File | Lines | Issue |
|---|---|---|---|
| Backend probe | `backend/services/ai/service.py` | 82–92 | New `httpx.AsyncClient` per probe |
| Backend non-stream | `backend/services/ai/service.py` | 259–266 | `stream: False` hard-coded |
| Backend message layout | `backend/services/ai/service.py` | 201–247 | Dynamic TRADING_CONTEXT sits before USER PROMPT inside user message |
| Backend indicator cache | `backend/utils/indicator_utils.py` | 9–67 | No `(asset, tf, mtime)` memoization |
| Backend snapshot trim (dead) | `backend/services/gateway/routes/ai.py` | 330–342 | `{**backend, **existing}` overwrites trim |
| FE modal memo | `gui/Dashboard/src/components/AskAiModal.jsx` | 223–248 | Rebuilds on every tick regardless of conversationMode |
| FE providers hook | `gui/Dashboard/src/hooks/useAiProviders.js` | entire | Not shared, no TTL, loading-leak-on-abort |
| FE API client | `gui/Dashboard/src/api/aiClient.js` | 25–31 | No `AbortSignal` |
| FE timeout detection | `gui/Dashboard/src/hooks/useAskAi.js` | 30–33 | String-matching `'code=timeout'` |
| FE payload size | `gui/Dashboard/src/utils/aiContext.js` | 71, 112 | Always 50-point snapshots + 100 candles |
| Route cleanup | `backend/services/gateway/routes/ai.py` | 6 | Dead `lru_cache` import |

---

## Severity-Ranked Findings (full)

| # | Severity | Title |
|---|---|---|
| **C-1** | 🔴 CRITICAL | `probe()` creates new `httpx.AsyncClient` every call |
| **C-2** | 🔴 CRITICAL | `AskAiModal.contextInstructions` rebuilds 80 KB JSON per tick |
| **H-1** | 🟠 HIGH | xAI prefix-cache defeated by dynamic JSON in user msg |
| **H-2** | 🟠 HIGH | `stream: false` → 5–15 s spinner UX |
| **H-3** | 🟠 HIGH | `useAiProviders` duplicated across components, no TTL cache |
| **H-4** | 🟠 HIGH | No `AbortSignal` on `askAI()` — leaks on modal close |
| **H-5** | 🟠 HIGH | 80–100 KB payload for every Ask, even modal quick-assist |
| **M-1** | 🟡 MEDIUM | `_inject_backend_indicators` recomputes pipeline every request |
| **M-2** | 🟡 MEDIUM | `useAiProviders` `loading=true` leak on AbortError |
| **M-3** | 🟡 MEDIUM | `tail_count` trim overridden by snapshot merge |
| **M-4** | 🟡 MEDIUM | Fragile `'code=timeout'` string-match in `useAskAi` |
| **M-5** | 🟡 MEDIUM | `/models` probe may falsely fail for local `llama-server` |
| **L-1** | 🟢 LOW | Dead `lru_cache` import in `routes/ai.py` |
| **L-2** | 🟢 LOW | New `Audio()` per click for submit sound |
| **L-3** | 🟢 LOW | `selectedModel` not synced to settings mid-open |

Full evidence for each is in the pre-plan investigation report delivered with this file.

---

## Implementation Phases

### Phase A — Quick Wins (~3–4 h, low risk, no rewrites)

Scope: Fix all **CRITICAL**, **LOW**, and the easier **HIGH / MEDIUM** items without changing message structure or introducing streaming.

#### A.1 — [ ] R-1: Reuse pooled client inside `probe()`

**File:** `backend/services/ai/service.py` (lines 82–92)

```python
# BEFORE
async def probe(self) -> bool:
    if not self._enabled or not self._client:
        return False
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            headers = self._client.headers if self._client else {}
            r = await c.get(f"{self.spec.base_url}/models", headers=headers)
            return r.status_code == 200
    except Exception:
        return False
```
```python
# AFTER
async def probe(self) -> bool:
    if not self._enabled or not self._client:
        return False
    try:
        r = await self._client.get(
            f"{self.spec.base_url.rstrip('/')}/models",
            timeout=2.0,
        )
        return r.status_code == 200
    except httpx.TimeoutException:
        return False
    except httpx.RequestError:
        return False
```

Owner: **@Coder** · Est.: 15 min · Risk: 🟢 Low

#### A.2 — [ ] R-2: Defer `contextInstructions` build when not in conversation mode

**File:** `gui/Dashboard/src/components/AskAiModal.jsx` (lines 223–248)

```jsx
// BEFORE — runs every tick even when unused
const contextInstructions = useMemo(() => { /* 80 KB build */ }, [...9 deps]);
```
```jsx
// AFTER — only rebuild when actually needed by voice-agent
const contextInstructions = useMemo(() => {
  if (!conversationMode) return '';          // hot path exit
  const custom = customInstructions;
  const ctx = buildAiContext({ /* ... */ });
  const dataCtx = { ...ctx };
  delete dataCtx.asset; delete dataCtx.timeframe;
  let base = `You are analyzing ${asset || 'the market'} on ${timeframe || 'the chart'}.\n\n`;
  base += `Current Market Data Context:\n${JSON.stringify(dataCtx)}\n\n`;   // no pretty-print
  base += `Respond concisely...`;
  if (custom) base = `${custom}\n\n${base}`;
  return base;
}, [conversationMode, asset, timeframe, customInstructions, marketData, historyCandles, selectedAssetKey, indicatorSeries, activeIndicators]);
```

Owner: **@Frontend-Specialist + @Coder** · Est.: 20 min · Risk: 🟢 Low

#### A.3 — [ ] R-4: Add `AbortController` to Ask AI request

**Files:**
- `gui/Dashboard/src/api/aiClient.js` — accept `signal`
- `gui/Dashboard/src/hooks/useAskAi.js` — create + forward controller
- `gui/Dashboard/src/components/AskAiModal.jsx` — abort on close/unmount

```js
// aiClient.js
export async function askAI({ prompt, model, context = {}, image = null, signal = null }) {
  /* ... */
  const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  /* ... */
}
```

```js
// useAskAi.js — inside ask()
const controller = new AbortController();
abortRef.current = controller;
try {
  const image = await resolveImage(requestImageSource);
  return askAI({ prompt, model, context, image, signal: controller.signal });
} catch (err) {
  if (err.name === 'AbortError') return null;  // swallowed intentionally
  throw err;
}
```

```jsx
// AskAiModal.jsx — cleanup
useEffect(() => {
  if (!isOpen) abortRef.current?.abort();
}, [isOpen]);
```

Owner: **@Coder** · Est.: 40 min · Risk: 🟡 Medium (must verify no UI flicker on abort)

#### A.4 — [ ] R-5: UI-mode-aware payload shrink in `aiContext.js`

**File:** `gui/Dashboard/src/utils/aiContext.js`

```js
// BEFORE
indicatorSnapshots[name] = series.slice(-50);                 // line 71
const recentCandles = Array.isArray(rawCandles) ? rawCandles.slice(-100) : [];  // line 112
```
```js
// AFTER — accept uiMode param
export const buildAiContext = ({
  /* existing params */,
  uiMode = 'insights',                                        // NEW
}) => {
  const snapKeep    = uiMode === 'modal' ? 5  : 50;
  const candleKeep  = uiMode === 'modal' ? 10 : 100;
  const tickKeep    = uiMode === 'modal' ? 5  : 20;
  /* ... */
};
```

Update `AskAiModal.jsx` + `useAskAi.js` callers to pass `uiMode = 'modal'` and `'insights'` respectively.

Owner: **@Engineer (design) + @Coder (impl)** · Est.: 30 min · Risk: 🟡 Medium

#### A.5 — [ ] R-8: TTL cache on `calculate_indicators_for_asset`

**File:** `backend/utils/indicator_utils.py`

```python
from functools import lru_cache
import os, time

_CACHE: dict[tuple, tuple] = {}   # (asset, tf_min) -> (mtime, result_df, row_count)
_CACHE_TTL = 5.0                  # seconds

def calculate_indicators_for_asset(asset, timeframe_min, pipeline_params=None, current_candle=None):
    csv_path = get_candle_path(normalize_asset(asset), timeframe_to_str(timeframe_min))
    if not csv_path or not csv_path.exists():
        raise FileNotFoundError(...)

    # Cache bypass if current_candle supplied
    if current_candle is None:
        mtime = csv_path.stat().st_mtime
        cached = _CACHE.get((asset, timeframe_min))
        now = time.monotonic()
        if cached and cached[0] == mtime and (now - cached[3]) < _CACHE_TTL:
            return cached[1], cached[2]

    # ... existing compute path ...
    if current_candle is None:
        _CACHE[(asset, timeframe_min)] = (mtime, result_df, len(result_df), time.monotonic())
    return result_df, len(result_df)
```

Owner: **@Coder** · Est.: 30 min · Risk: 🟢 Low (bypassed when `current_candle` provided → safe)

#### A.6 — [ ] R-9: Fix `tail_count` merge precedence

**File:** `backend/services/gateway/routes/ai.py` (line 341)

```python
# BEFORE — frontend's 50-point wins, backend's 5-point ignored
merged_snapshots = {**backend_snapshots, **existing_snapshots}
```
```python
# AFTER — backend-trimmed wins when ui_mode == modal
if ui_mode == 'modal':
    merged_snapshots = {**existing_snapshots, **backend_snapshots}  # backend wins
else:
    merged_snapshots = {**backend_snapshots, **existing_snapshots}  # frontend wins (full detail)
```

Owner: **@Coder** · Est.: 5 min · Risk: 🟢 Low

#### A.7 — [ ] R-10: Structured timeout error in `aiClient`

**File:** `gui/Dashboard/src/api/aiClient.js`

```js
// Throw structured Error with attached fields instead of concat string
const err = new Error(`AI request failed: ${detail}${suffix}`);
err.code = code;
err.retryable = !!data?.retryable;
err.requestId = requestId;
throw err;
```
```js
// useAskAi.js
const isTimeoutError = (err) => err && (err.code === 'timeout' || err.name === 'AbortError' ? false : /* keep fallback */ /timeout/i.test(err.message));
```

Owner: **@Coder** · Est.: 15 min · Risk: 🟢 Low

#### A.8 — [ ] R-11: Local probe fallback for llama-server

**File:** `backend/services/ai/service.py` — extend `probe()`:

```python
async def probe(self) -> bool:
    if not self._enabled or not self._client:
        return False
    base = self.spec.base_url.rstrip('/')
    urls = [f"{base}/models"]
    if self.spec.is_local:
        urls.append(f"{base}/health")            # llama-server default
        urls.append(base.rsplit('/v1', 1)[0])    # root ping
    for url in urls:
        try:
            r = await self._client.get(url, timeout=1.5)
            if r.status_code < 500:
                return True
        except (httpx.TimeoutException, httpx.RequestError):
            continue
    return False
```

Owner: **@Investigator** (verify actual local endpoints) → **@Coder** · Est.: 20 min · Risk: 🟡 Medium

#### A.9 — [ ] R-12 + L-1/L-2/L-3: Cleanup

- [ ] `useAiProviders.js` — move `setLoading(false)` into a truly unconditional `finally`, guard stale results with a `requestId` counter
- [ ] `routes/ai.py` line 6 — remove dead `from functools import lru_cache`
- [ ] `AskAiModal.jsx` — hoist `askAiSubmitSound` audio into a module-level `new Audio()` reused via `.currentTime = 0; .play()`
- [ ] `AskAiModal.jsx` — sync `selectedModel` via `useEffect` on `settings?.ai?.defaultModel`

Owner: **@Coder** · Est.: 25 min · Risk: 🟢 Low

### 🛑 End of Phase A → **MANDATORY `@Reviewer` phase-gate** per `PHASE_REVIEW_PROTOCOL.md`

---

### Phase B — Targeted Rewrite (~6–8 h, higher risk, high gain)

Scope: Restructure message layout, add SSE streaming, promote provider state to shared slice.

#### B.1 — [ ] R-3: Promote `useAiProviders` to shared zustand slice with 60 s TTL

**New file:** `gui/Dashboard/src/store/aiProvidersStore.js`

```js
import { create } from 'zustand';
import { getApiBaseUrl } from '../api/apiBase';

const STALE_MS = 60_000;

const useAiProvidersStore = create((set, get) => ({
  providers: [],
  error: null,
  loading: false,
  lastFetched: 0,
  _controller: null,
  refresh: async ({ force = false } = {}) => {
    const { lastFetched, loading, _controller } = get();
    if (!force && Date.now() - lastFetched < STALE_MS) return;
    if (loading && _controller) _controller.abort();
    const c = new AbortController();
    set({ loading: true, error: null, _controller: c });
    try {
      const r = await fetch(`${getApiBaseUrl()}/api/v1/ai/providers`, { signal: c.signal });
      if (!r.ok) throw new Error(`providers ${r.status}`);
      const d = await r.json();
      set({ providers: Array.isArray(d.providers) ? d.providers : [], lastFetched: Date.now(), loading: false });
    } catch (e) {
      if (e.name === 'AbortError') return;
      set({ error: 'AI providers unavailable — check Gateway connection', providers: [], loading: false });
    }
  },
}));

export default useAiProvidersStore;
```

Replace both callers (`AskAiModal`, `AiInsightsPanel`) with this store. Delete legacy `useAiProviders.js` after migration. Fail fast — `refresh()` is auto-called on first component mount.

Owner: **@Architect** (design) → **@Coder** · Est.: 90 min · Risk: 🟡 Medium

#### B.2 — [ ] R-6: Restructure message assembly for prefix-caching

**File:** `backend/services/ai/service.py`

```python
# NEW 3-message structure
messages = [
    # 1. FULLY STABLE SYSTEM (unchanged QuFLX AI core rules) → perfect prefix cache anchor
    {"role": "system", "content": CORE_SYSTEM_PROMPT},

    # 2. STABLE-PER-SESSION SYSTEM (UI mode + verbosity + custom instructions)
    #    Grouped here so prefix hash stays stable across a conversation
    {"role": "system", "content": session_directives_text},

    # 3. DYNAMIC USER MESSAGE — context first (compact JSON), then user prompt LAST
    {"role": "user", "content": [
        {"type": "text", "text": f"TRADING_CONTEXT:\n{compact_json}\n\n---\n\nUSER PROMPT: {prompt_text}"},
        *([{"type": "image_url", "image_url": {"url": image}}] if image else [])
    ]},
]
```

Rationale: xAI docs — *“keep user-specific content at the end”*. Keeping the user prompt at the tail maximizes common-prefix overlap across turns in the same `x-grok-conv-id`.

Owner: **@Architect** → **@Coder** · Est.: 60 min · Risk: 🟠 High (changes prompt semantics; must re-run test_ai_service.py + test_ai_routes.py + test_ai_routing.py suites)

#### B.3 — [ ] R-7: SSE streaming end-to-end

**Backend — `backend/services/gateway/routes/ai.py`:**
```python
@router.post('/ask/stream')
async def ask_ai_stream(payload: Dict[str, Any] = Body(...), request: Request = None):
    # ... parse + validate as /ask ...
    async def event_stream():
        async for chunk in ai_service.ask_stream(prompt=..., context=..., image=..., ...):
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**`backend/services/ai/service.py`:** add `ask_stream(...)` generator using `self._client.stream("POST", ..., json={..., "stream": True})` and yield `choices[0].delta.content` chunks.

**Frontend — `aiClient.js`:**
```js
export async function* askAIStream({ prompt, model, context, image, signal }) {
  const r = await fetch(`${getApiBaseUrl()}/api/v1/ai/ask/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, context, image_base64: image,
                           asset: context?.asset, timeframe: context?.timeframe }),
    signal,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split('\n\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        yield JSON.parse(data);
      }
    }
    buf = buf.endsWith('\n\n') ? '' : buf.split('\n\n').pop();
  }
}
```

**`AskAiModal.jsx`:** consume generator, call `setAnswer(prev => prev + delta)` per chunk.

Owner: **@Engineer** (design) → **@Coder** · Est.: 150 min · Risk: 🟠 High

### 🛑 End of Phase B → **MANDATORY `@Reviewer` phase-gate**

---

### Phase C — Benchmark & Multi-Agent Final Review

#### C.1 — [ ] Build a reproducible benchmark harness
`backend/tests/perf_ask_ai_bench.py` — measures:
- Time-to-first-token (TTFT)
- Total latency
- Cache hit rate (from `meta.cache.hit_rate`)
- Payload size (bytes)
- Backend CPU time in `_inject_backend_indicators`

Run 20 iterations per model (grok-4, grok-4-fast, gemma-local) × 2 UI modes (modal, insights).

#### C.2 — [ ] Final multi-agent review per `.clinerules/PHASE_REVIEW_PROTOCOL.md`:
- @Reviewer — correctness & plan alignment
- @Debugger — edge cases (abort mid-stream, 413 error, cache invalidation on CSV rewrite)
- @Optimizer — before/after metrics from C.1 with Big-O notes
- @Code_Simplifier — functional simplicity sweep
- @Team_Leader compiles verdicts.

---

## Verification Checklist

- [ ] `probe()` no longer spawns new AsyncClient (check with `lsof`/netstat during `/providers` spam)
- [ ] Chrome Performance tab: modal open with no user interaction — no continuous `JSON.stringify` CPU bursts
- [ ] Cache hit rate from `meta.cache.hit_rate` ≥ 60% after 3 consecutive asks on same `(asset, tf)`
- [ ] Closing modal during in-flight request → `AbortError` logged, no UI warning, no response attributed post-close
- [ ] Modal-mode payload (captured via DevTools → Network → POST /ask) ≤ 15 KB
- [ ] `gemma-local` chip shows ✅ green when llama-server is running
- [ ] `gemma-local` selected in modal mode → no 413
- [ ] All existing tests pass: `pytest backend/tests/test_ai_routing.py backend/tests/test_ai_service.py backend/tests/test_ai_routes.py`
- [ ] New: bench script recorded in `v2_Dev_Docs/AI_Model_Routing/Reports/Ask_AI_Bench_26-04-18.md`
- [ ] First token visible in Ask AI Modal < 2.5 s P95
- [ ] `.agent-memory/activeContext.md` + `progress.md` updated
- [ ] @Reviewer sign-off per Phase A and Phase B
- [ ] Multi-agent final review verdict recorded

---

## Files Touched Summary

| File | Phase | Change |
|---|---|---|
| `backend/services/ai/service.py` | A, B | Reuse pooled client in `probe()`; fallback URLs; add `ask_stream()`; restructure messages |
| `backend/services/ai/registry.py` | — | (No change) |
| `backend/services/gateway/routes/ai.py` | A, B | Fix merge precedence; drop dead import; add `/ask/stream` route |
| `backend/utils/indicator_utils.py` | A | Add mtime-keyed TTL cache |
| `backend/tests/perf_ask_ai_bench.py` | C | **NEW** — benchmark harness |
| `gui/Dashboard/src/components/AskAiModal.jsx` | A, B | Defer memo; AbortController; consume SSE; sound hoist; model sync |
| `gui/Dashboard/src/components/AiInsightsPanel.jsx` | B | Migrate to `aiProvidersStore` |
| `gui/Dashboard/src/hooks/useAskAi.js` | A, B | AbortController; structured error; stream consumer |
| `gui/Dashboard/src/hooks/useAiProviders.js` | B | **DELETE** after store migration |
| `gui/Dashboard/src/store/aiProvidersStore.js` | B | **NEW** — shared TTL-cached slice |
| `gui/Dashboard/src/api/aiClient.js` | A, B | Structured throw; `askAIStream()` generator |
| `gui/Dashboard/src/utils/aiContext.js` | A | `uiMode`-aware payload shrink |
| `v2_Dev_Docs/AI_Model_Routing/Reports/Ask_AI_Bench_26-04-18.md` | C | **NEW** — benchmark results |
| `.agent-memory/activeContext.md` | end | Update focus |
| `.agent-memory/progress.md` | end | Mark phases complete |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Message restructure changes model output quality | Medium | High | Run full test suite + 5-prompt smoke test against grok-4-fast before merging Phase B |
| SSE implementation leaks async tasks on disconnect | Medium | Medium | Use `try/finally` with `aclose()` on the httpx `stream()` context manager |
| TTL cache serves stale indicators after CSV rewrite | Low | Medium | Key by `mtime` — invalidates automatically when collector writes; TTL=5s as belt-and-suspenders |
| AbortController cancels while xAI billing starts | Low | Low | xAI docs: billing starts at token generation; early abort before first token is free |
| Local probe `/health` not standard | Medium | Low | Multi-URL fallback (models → health → root) covers all common cases |
| Shared zustand store over-fetches | Low | Low | TTL=60s hard gate |
| `@Reviewer` rejects Phase B restructure | Medium | Low | Plan explicitly maps to xAI documented best-practice ordering |

---

## References

1. [xAI — Prompt Caching: Maximizing Cache Hits](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits)
2. [xAI — Prompt Caching: Best Practices](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices)
3. [xAI — Prompt Caching: How It Works](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/how-it-works)
4. [Groq Docs — Prompt Caching (cross-provider best practice)](https://console.groq.com/docs/prompt-caching)
5. [HTTPX — Resource Limits (shared long-lived AsyncClient)](https://www.python-httpx.org/advanced/resource-limits/)
6. [HTTPX — Timeouts (granular connect/read/write/pool)](https://www.python-httpx.org/advanced/timeouts/)
7. [OpenAI — Latency Optimization (streaming)](https://developers.openai.com/api/docs/guides/latency-optimization)
8. [OpenAI Cookbook — Streaming Completions](https://developers.openai.com/cookbook/examples/how_to_stream_completions)
9. Internal: `.clinerules/PHASE_REVIEW_PROTOCOL.md`
10. Internal: `.clinerules/agent-investigation-workflow.md`
11. Internal: `v2_Dev_Docs/AI_Model_Routing/AI_Multi_Model_Routing_Plan_26-04-17.md`

---

## Handoff

**From:** @Investigator (plan author)
**To:** @Coder (execution, after user approval)
**Gate:** @Reviewer must sign off at end of Phase A *and* Phase B before proceeding.
**Protocol:** Strict — no next-phase start without explicit user "Proceed" / "Approved" / "Next Phase" per `PHASE_REVIEW_PROTOCOL.md`.

**Awaiting user command** to begin Phase A.
