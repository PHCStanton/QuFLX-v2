# Active Context

- ## Current Focus (as of 17-04-2026)
- **AI Multi-Model Routing Phase 1 (2026-04-17):** Backend implementation complete and verified. 175/175 tests passing. Phase 2 (Frontend) pending.
- **Plan Location:** `v2_Dev_Docs/AI_Model_Routing/AI_Multi_Model_Routing_Plan_26-04-17.md`
- **Status:** Phase 1 ✅ Complete — awaiting Phase 2 execution.

### AI Multi-Model Routing — Phase 1 Summary (17-04-2026)
**Root Cause:** Single AIService singleton used for all AI requests — no per-provider config, no model selection, no context size awareness per provider.

**Solution (Phase 1):** Full rewrite per Core Principle #7:
1. `providers.py` — `ProviderSpec` frozen dataclass + grok-4 / grok-4-fast / gemma-local configs
2. `service.py` — `AIService` now accepts `ProviderSpec`; `base_url` treated as root; `probe()` method added
3. `registry.py` — `AIProviderRegistry` with `get()`, `resolve_default(ui_context)`, `probe_all()`, `close_all()`
4. `local_process.py` — `LocalAIProcessManager` with `asyncio.to_thread()` stop() + stdout/stderr log capture to `system_LOGS/llama-server-{ts}.log`
5. Gateway lifespan wires local_ai manager + registry
6. Route `/ask` accepts `model` field (whitelist: grok-4, grok-4-fast, gemma-local); provider-aware context size check after indicator injection → 413 if exceeded
7. Route `/providers` returns all 3 providers with availability status

**Key Design Decisions:**
- `ProviderSpec` is frozen/immutable — safe to share across async contexts
- `AIService._enabled = bool(api_key) or spec.is_local` — local providers don't need API keys
- `x-grok-conv-id` header NOT attached for `is_local=True` providers
- Context size guard fires AFTER `_inject_backend_indicators()` so the limit reflects the full post-injection payload
- `local_process.py` stdout/stderr → `system_LOGS/llama-server-{timestamp}.log` (never swallowed)

---

## Prior Focus Areas (Completed)

### Data Collection & Persistence Refactor (2026-03-29) ✅
- Plan: `v2_Dev_Docs/History_Handeling/Data_Collection_Persistence_Refactor_Plan_26-03-29.md`
- Report: `@reports_2026-03/Data_Collection_Persistence_Refactor_Report_26-03-29.md`
- 7 phases complete — `data_store.py` Single Source of Truth, in-process bootstrap, all consumers updated

### Asset Normalization Single Source of Truth (2026-03-21) ✅
- `backend/utils/asset_utils.py` + `gui/Dashboard/src/utils/assetUtils.js`
- `EURUSD_otc` → `EURUSDOTC` normalization across all UI and backend components

### Indicator Stack Optimization (14-03-2026) ✅
- `POST /api/v1/indicators` migrated to in-process pipeline with per-asset DataFrame cache
- All 11 items in `Indicator_Fixes_Optimizations_Plan_2026-03-05.md` complete

---

## Current State

### Backend
- Collector / Strategy / Gateway operational
- SSID Service running as standalone FastAPI microservice
- History endpoints explicit and reliable
- Indicator endpoint in-process with DataFrame cache (no subprocess)
- Profile system — full CRUD + active profile sync
- **AI Multi-Provider Registry** — 3 providers (grok-4, grok-4-fast, gemma-local) with `AIProviderRegistry`
- **`/api/v1/ai/providers`** — health endpoint returning key/label/available/capabilities for all 3
- **`/api/v1/ai/ask`** — `model` field, provider-aware 413 enforcement, `model_validate` + serializable errors
- `LocalAIProcessManager` — Gemma auto-start/stop integrated into Gateway lifespan
- Voice WS relay at `/api/v1/ai/voice/realtime`
- Settings: `GET/PUT /api/v1/settings` + versioned `data/settings/settings.json`
- Local Ops endpoints (opt-in via `QFLX_ENABLE_OPS=1`)

### Frontend
- Core Dashboard stable for streaming and visualization
- `ChartWorkspace.jsx` modular (<250 LOC)
- Overlay indicators: SuperTrend, Bollinger Bands, EMA Cross-Over, Support/Resistance
- Oscillator panes: RSI, MACD, Stochastic, CCI — time-scale synchronized
- Ask AI: Modal + AI Insights Panel
- Voice: dictation + TTS read-back (browser + xAI server modes)
- Settings Panel: Save & Close, Export Config, SSID badges
- Profile system UI: ProfileMenu, ProfilePicEditorModal
- Statement Analysis page at `/statement-analysis`
- Strategy Lab: CSV upload, chart integration
- Alert Dispatcher page with log viewer

## Active Files (Key)

### AI Multi-Provider (Phase 1)
- `backend/services/ai/providers.py` — ProviderSpec + 3 configs
- `backend/services/ai/service.py` — AIService with ProviderSpec injection
- `backend/services/ai/registry.py` — AIProviderRegistry
- `backend/services/ai/local_process.py` — LocalAIProcessManager
- `backend/services/gateway/routes/ai.py` — /providers, /ask with model param
- `backend/services/gateway/main.py` — lifespan wires registry + local_ai
- `backend/tests/test_ai_routing.py` — 22 tests (Phase 1 validation suite)

### General Backend
- `backend/services/gateway/main.py` — Gateway startup, lifespan, routes
- `backend/services/gateway/routes/indicators.py` — in-process indicator API
- `backend/services/gateway/routes/trading.py` — SSID proxy
- `backend/services/gateway/routes/profiles.py` — profile CRUD
- `backend/services/ssid_service/routes.py` — SSID Service
- `backend/utils/data_store.py` — Single Source of Truth for candle data
- `backend/utils/asset_utils.py` — Asset normalization
- `backend/scripts/otc_alert_dispatch.py` — Alert Dispatcher

### Frontend
- `gui/Dashboard/src/store/marketStore.js` — market state, socket, tickers
- `gui/Dashboard/src/store/settingsStore.js` — platform settings
- `gui/Dashboard/src/store/tradingStore.js` — live trading + SSID status
- `gui/Dashboard/src/store/profileStore.js` — profile CRUD + settings sync
- `gui/Dashboard/src/components/SettingsPanel.jsx` — settings UI
- `gui/Dashboard/src/components/LiveTradingPanel.jsx` — trading UI
- `gui/Dashboard/src/components/Dashboard.jsx` — layout orchestrator
- `gui/Dashboard/src/components/ChartWorkspace.jsx` — chart core
- `gui/Dashboard/src/components/AskAiModal.jsx` — Ask AI modal

## Next Steps

### AI Multi-Model Routing (In Progress)
- [ ] **Phase 0**: `.env` harmonization — user to confirm `GROK_API_KEY`, `LOCAL_AI_BASE_URL`, `QFLX_LOCAL_AI_AUTOSTART=1`
- [ ] **Phase 2**: Frontend model selector — `AiModelSelector.jsx`, `useAiProviders.js` hook, Settings Panel integration
- [ ] **Phase 3**: Benchmark harness + final multi-agent review

### Backlog (Post-Multi-Model)
1. Oscillator pane visibility toggle persistence in settings
2. Profile import from exported JSON (round-trip with Export Config)
3. AI TradingContext contract enforcement (schema + size limits)
4. Risk Manager Panel (`RiskManagerPanel.jsx` — placeholder)
5. Calendar & Journal Panel (`CalendarJournalPanel.jsx` — placeholder)
6. Comprehensive integration tests for SSID service, profile sync, trading flow
7. Alert Dispatcher Q2 improvements — CHUNK_SIZE 1000→200, stale-data log throttling