### Task: Refactor AIService for Persistent httpx.AsyncClient

**Background and Problem Explanation**:
- The AIService (located in `backend/services/ai/service.py`) handles requests to the external Grok API for trading analysis, alert verification, and other AI-driven features.
- Current Issue: For every AI request, the service creates a **fresh httpx.AsyncClient** instance inside an `async with` block:
  ```python
  async with httpx.AsyncClient(timeout=timeout_seconds) as client:
      response = await client.post(...)
  ```
  This approach is inefficient for our use-case:
    - **Overhead**: Each request incurs a new TCP handshake, TLS negotiation, and connection setup/teardown. In high-frequency scenarios (e.g., 1-minute candle closes triggering 10+ concurrent asset analyses), this leads to unnecessary latency spikes.
    - **Timeouts During Bursts**: When multiple requests hit simultaneously (e.g., at :59:59Z during shutdown or candle sync), the fresh connections compete for resources, increasing the chance of "AI provider timeout" errors (client-side aborts after 30-75 seconds).
    - **Shutdown Fragility**: During app shutdown, in-flight requests with fresh clients are more likely to be orphaned or force-timeout as the event loop winds down.
    - **Scalability Limit**: No connection pooling means we're not reusing keep-alive connections, which Grok API supports for better throughput.
- Impact: Observed in logs as clustered timeouts during peaks or shutdowns. This reduces reliability for real-time trading signals and could miss profitable entries if analyses fail.
- Goal: Refactor to a **persistent, pooled httpx.AsyncClient** shared across the service lifecycle. This will:
  - Reuse connections (keep-alive enabled by default in httpx).
  - Reduce per-request overhead by 20-50ms+.
  - Handle concurrent spikes better (pool limits can queue safely).
  - Make shutdowns cleaner (graceful close of shared client).

**Step 1: Thorough Inspection and Assessment (Mandatory First Action)**:
Before proposing any code, perform a detailed inspection of the current implementation:
- Review Key Files:
  - `backend/services/ai/service.py`: Focus on the `AIService` class, specifically the `ask` and `ask_stream` methods where httpx is used. Note how timeouts are set (30s fast, 75s complex) and any error handling (e.g., retries, logging).
  - `backend/services/gateway/routes/ai.py` and `ai_voice.py`: Check how AIService is instantiated and called (e.g., per-request or shared instance?).
  - Any related configs: Scan for env vars like `GROK_API_KEY`, timeouts, or concurrency limits.
- Assess Current Behavior:
  - Identify all entry points that trigger AI calls (e.g., OTC alert dispatcher, user "Ask AI" queries, voice relay).
  - Evaluate Concurrency: How many simultaneous requests are typical? (e.g., from `otc_alert_dispatch.py` processing 10+ assets at once).
  - Check for Existing Pooling/Sharing: Is AIService a singleton? Are there any shared clients already?
  - Potential Risks: Note any stateful elements (e.g., auth headers with API key) that must be preserved in a shared client.
  - Dependencies: Confirm httpx version (should be >=0.23 for async pooling); check for other async libs (e.g., aiohttp) that might interact.
  - Performance Baselines: If possible, simulate 10 concurrent requests in a dev env and measure connection times (use `httpx` tracing or logs).
- Output Your Assessment: Compile a markdown report covering:
  - Summary of current httpx usage patterns.
  - Pros/cons of fresh-per-request vs. persistent.
  - Estimated impact (e.g., "Could reduce timeouts by 80% during bursts").
  - Any edge cases (e.g., thread safety in multi-worker setups).
  - Confirmation that this aligns with Grok API best practices (persistent connections are encouraged for repeated calls).

Submit this assessment report for review. **Do not proceed to implementation until promoted.**

**Step 2: Implementation Plan (Upon Promotion)**:
Once approved, refactor as follows:
- **Core Change**: Make `AIService` use a **shared httpx.AsyncClient**:
  - Initialize the client in `__init__` (or a class-level attribute for singleton if applicable).
  - Set defaults: `timeout=httpx.Timeout(75.0, connect=10.0)` (adjustable per-request if needed).
  - Enable pooling: Use `limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)` for concurrency control.
  - Headers: Pre-set common ones (e.g., 'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json').
  - Graceful Shutdown: Add an `async def close(self)` method to call `await self.client.aclose()`; integrate with app lifecycle (e.g., via FastAPI lifespan hooks if applicable).
- **Per-Request Adjustments**: In `ask`/`ask_stream`, use the shared client directly (no `async with`):
  - Override timeout per-call if needed (e.g., `response = await self.client.post(..., timeout=timeout_seconds)`).
- **Error Handling Enhancements**:
  - Add retries for timeouts (e.g., using `tenacity` lib if available, 3 attempts with backoff).
  - Log connection stats (e.g., active connections via client internals if exposed).
- **Testing**:
  - Unit Tests: Mock Grok API responses; test concurrent calls (use `asyncio.gather` to simulate bursts).
  - Integration: Run with `otc_alert_dispatch.py` on 10+ assets; monitor logs for timeouts.
  - Benchmark: Measure avg request time before/after.
- **Code Style**: Follow PEP8; add docstrings/comments explaining the persistent client benefits.

**Compile a Report**
report_async_client_aiservice_26-02-08.md and save in @reports\reports_2026-02 folder

Proceed with Step 1 inspection and assessment.