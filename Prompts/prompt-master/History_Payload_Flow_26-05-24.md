You are an expert senior Python + React engineer working on QuFLX v2 — a high-performance binary options platform for Pocket Option.

**TARGET TOOL:** Cline (VS Code agentic coding assistant, formerly Claude Dev) — or Cursor if Cline is not available.

**STARTING STATE (Current Implementation):**
- History payload flow is documented in .agent-memory/ files (productContext.md, systemPatterns.md, techContext.md, activeContext.md, progress.md).
- Data capture happens via capabilities_v2/ (history_collector.py, collect_history_loop.py, timeframe_select_sync.py, runner.py) using Selenium + Chrome DevTools WebSocket interceptor.
- Captured ticks/candles are saved as CSV in data/ or Historical_Data/ (asset-normalized via backend/utils/asset_utils.py).
- Persistence layer is backend/utils/data_store.py (Single Source of Truth after 2026-03-29 refactor).
- Backend serving: backend/services/gateway/routes/history.py — unified {candles: [...]} contract with explicit bootstrap and error handling.
- Frontend: gui/Dashboard/src/store/marketStore.js fetches history → gui/Dashboard/src/components/ChartWorkspace.jsx renders ~100 historical candles using Lightweight Charts.
- Automation settings (historyWaitTime + retryAttempts) from SettingsPanel are injected into capabilities_v2 via runner.py.
- Indicators are calculated in-process via POST /api/v1/indicators with per-asset DataFrame cache.

**CURRENT BEHAVIOR (what happens today):**
When user clicks an asset/timeframe in Pocket Option:
1. Automation waits `historyWaitTime` seconds.
2. Collector intercepts WS payloads → saves CSV.
3. Frontend calls history endpoint → gets candles (number of candles is currently implicit / not strictly controlled).
4. ChartWorkspace renders the data + overlays + oscillators.
5. Live ticks continue via Redis Pub/Sub + Socket.IO.

**DESIRED TARGET STATE:**
Make the full history payload functionality **extremely robust, deterministic, and explicit** for exactly ~100 historical candles (configurable but default 100) on the selected asset + timeframe.

**Specific Requirements:**
- Add a clean, explicit parameter `num_candles: int = 100` to the history bootstrap and GET endpoints.
- Ensure `data_store.py` always returns exactly the requested number of most recent candles (or all available if fewer).
- Strengthen capture logic in capabilities_v2 so that after manual asset click + wait, it reliably captures and saves a full fresh set of candles.
- Add robust fallback: if CSV is missing/stale, trigger on-demand collection via runner.
- Guarantee the Main Chart (ChartWorkspace) always receives a clean, consistent ~100-candle payload for initial load + indicators.
- Improve error resilience and logging around the entire flow (capture → persist → serve → render).
- Keep all existing contracts (unified "candles" key, asset normalization, Redis live streaming) intact.

**FILE SCOPE (only edit these):**
- backend/utils/data_store.py
- backend/services/gateway/routes/history.py
- capabilities_v2/history_collector.py (and related files in capabilities_v2/ if truly needed)
- gui/Dashboard/src/components/ChartWorkspace.jsx
- gui/Dashboard/src/store/marketStore.js (only if necessary for fetching the new param)

**DO NOT TOUCH:**
- SettingsPanel.jsx or AutomationSettings Pydantic model
- Indicator pipeline (backend/services/gateway/routes/indicators.py)
- Live trading / SSID service
- Any voice or AI files
- Any profile or settings persistence logic

**DONE WHEN:**
- The history endpoint reliably returns exactly the requested number of candles (default 100) for any selected asset + timeframe.
- After manual asset click in Pocket Option, the Main Chart is populated with a fresh, clean ~100-candle payload within a few seconds.
- All existing tests in backend/tests/ that touch history still pass.
- Clear, well-commented code + updated comments in .agent-memory/activeContext.md and progress.md reflecting the changes.
- No breaking changes to any public API contracts or frontend rendering behavior.

**EXTRA INSTRUCTIONS:**
- Prefer explicit, readable code over cleverness.
- Add meaningful logging at key steps (capture complete, candles saved, payload served, chart rendered).
- Think step-by-step: analyze current code → propose minimal changes → implement → verify.
- After any file edit, run relevant pytest commands and report results.

Start by reading the key files listed above, then confirm you understand the full flow before making any changes. Respond with [MEMORY SYSTEM: ACTIVE] when you begin.