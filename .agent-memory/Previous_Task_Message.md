# Executive Summary

## Ask AI Performance Optimization
- Phases A and B were implemented and incrementally reviewed.
- The Ask AI stack now includes pooled provider probes, local probe fallbacks, provider-aware indicator caching, cache-friendly prompt layout, shared AI request preparation, SSE streaming, abortable frontend requests, a shared provider store, and streamed modal rendering.
- The old `useAiProviders.js` path was removed after the store migration to reduce confusion and dead code.

## Validation Completed
- Backend AI test suites passed after each relevant implementation batch.
- Frontend production builds passed after each relevant frontend batch.
- Focused tests were added for streaming, probe fallbacks, prompt layout, and indicator cache behavior.

## Benchmark Harness
- A reusable benchmark harness was added at `backend/tests/perf_ask_ai_bench.py`.
- It measures TTFT, total latency, payload size, cache-hit data, answer size, and optional backend indicator timing.
- It writes a Markdown benchmark artifact for every run.

## Live Benchmark Outcome
- Live benchmark report: `v2_Dev_Docs/AI_Model_Routing/Reports/Ask_AI_Bench_26-04-18.md`.
- Command executed: `python backend/tests/perf_ask_ai_bench.py --iterations 20 --models grok-4,grok-4-fast,gemma-local --ui-modes modal,insights`.
- Total samples: `120`.
- Result profile:
- `grok-4`: 0/20 modal, 0/20 insights.
- `grok-4-fast`: 0/20 modal, 1/20 insights.
- `gemma-local`: 0/20 modal, 0/20 insights.
- Most failed requests clustered around `30000ms`, indicating timeout-dominated failure rather than healthy interactive streaming.
- The only success was `grok-4-fast insights`, but it was still too slow for acceptable UX: `TTFT 43438.87ms`, `Total 53105.79ms`.
- `gemma-local insights` still triggered a `413 context_too_large` failure in at least one run.

## Current Assessment
- The implementation work is in place and benchmarkable.
- The benchmark results do not support calling the optimization effort operationally successful yet.
- The main remaining work is runtime diagnosis, especially timeout behavior, provider connectivity, and local-provider context reduction.

## Recommended Next Actions
- Improve benchmark exception reporting so failures are more actionable.
- Diagnose streaming-path timeout/provider behavior.
- Apply additional provider-aware context shrinking for `gemma-local insights`.
- Re-run a smaller live benchmark matrix first, then repeat the full benchmark after remediation.
