# Active Context

- ## Current Focus (as of 05-04-2026)
- **Data Collection & Persistence Refactor (2026-03-29):** Implementation, verification, and final review are complete. The refactor task is now closed.
- **Plan Location:** `v2_Dev_Docs/History_Handeling/Data_Collection_Persistence_Refactor_Plan_26-03-29.md`
- **Report Location:** `@reports_2026-03/Data_Collection_Persistence_Refactor_Report_26-03-29.md`
- **Status:** Complete — ready for the next task assignment.

### Data Persistence Refactor — Plan Summary (29-03-2026)
**Root Cause:** Every history load spawns a new Python subprocess that creates a new Selenium/Chrome DevTools connection and destructively consumes Chrome performance logs — competing with the running CollectorService. This causes intermittent failures after the first 1-2 requests.

**Solution:** 7-phase plan to:
1. Create `backend/utils/data_store.py` — Single Source of Truth for all data path resolution and read/write (replaces scattered `history_utils.py` functions)
2. Redirect all persistence to `data/supabase_migration_data/candles/{ASSET}_{TF}.csv` (one file per asset+timeframe, append-only, deduped by timestamp, ascending sort)
3. Refactor `bootstrap_history()` to in-process `asyncio.to_thread()` — eliminates subprocess and Chrome log contention
4. Update all consumers (`indicators.py`, `ai.py`, `strategy.py`, `collector/main.py`, `history_collector.py`) to use `data_store`
5. Replace `history_utils.py` with thin deprecation wrappers for backward compatibility
6. Add frontend chart persistence — `historyCandles[asset]` cache survives asset switches; no re-bootstrap on switch-back
7. Full verification suite with 18+ unit tests, integration script, and multi-agent final review

**Key Design Decisions:**
- Schema is Supabase-ready: each CSV maps directly to a future `COPY FROM` import
- Supports all 8 timeframes: 1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D
- Session tracking via `sessions/sessions.jsonl` (JSONL, one record per bootstrap)
- Atomic writes (temp file + rename) prevent partial CSV corruption
- `_get_shared_driver()` reuses the collector's existing Chrome connection — no new Selenium session

### Architecture Review Checkpoint (14-03-2026)
- Confirmed `RiskManagerPanel.jsx` and `CalendarJournalPanel.jsx` remain placeholder implementations.
- Confirmed `OscillatorPanel.jsx` currently renders panes but does not persist visibility state through `settingsStore`.
- Confirmed `profileStore.js` currently supports CRUD and active profile sync, but has no import-from-JSON action.
- Confirmed `/api/v1/ai/ask` validates prompt/context/image size/shape but still uses flexible `context: Dict[str, Any]` (strict TradingContext schema enforcement still pending).

## Recent Changes (chronological)

### Asset Normalization Single Source of Truth (2026-03-21)
- **Unified Normalization:** Consolidated 4 separate implementations into canonical utilities (`asset_utils.py` for backend, `assetUtils.js` for frontend).
- **Indicators Cache Fix:** Applied `normalize_asset` at the indicator route entry to prevent cache thrashing.
- **History Utility Hardening:** Fixed filename base divergence in `history_utils.py`.
- **Alert Dispatcher Fix:** Implemented deterministic "exact match wins" logic for asset folder mapping.
- **Frontend Consolidation:** Replaced local `normalizeAsset` duplicates in `marketStore.js` and `TickerTape.jsx` with shared imports.
- **Defensive UI Labels:** Added normalization guard to `formatAssetLabel` in `ChartContainer.jsx`.
- **API Symbol Context:** Maintained separate Context 2 (`_normalize_asset_symbol`) for PocketOption API compatibility while cross-referencing documentation.

### Indicator Stack Optimization & Plan Closure (14-03-2026)
- Completed implementation of the remaining item in `Indicator_Fixes_Optimizations_Plan_2026-03-05.md`:
  - **OPT-1** (`backend/services/gateway/routes/indicators.py`) migrated from subprocess-based execution to in-process pipeline execution.
- Added in-process route architecture:
  - `TechnicalIndicatorsPipeline` called directly in gateway route.
  - CPU-bound work moved to `asyncio.to_thread()`.
  - Per-asset in-memory cache introduced (`_df_cache`) keyed by `(asset, csv_path)`.
  - Cache bypass for `current_candle` requests to preserve live-bar correctness.
  - Cache helper exposed: `_invalidate_cache(asset)` for future explicit invalidation hooks.
- Retained output compatibility:
  - Same response envelope (`ok`, `asset`, `timeframe`, `series`, `count`).
  - Series includes numeric/string/bool/int indicator fields (including S/R enhancement fields).
- Audit status from plan now effectively:
  - **10/11 implemented prior** + **OPT-1 now implemented** = **all actionable items completed**.

### Live Trading Panel Refinement
- Added dedicated Demo/Real toggle in `LiveTradingPanel` using `isDemoMode` from `tradingStore`.
- Implemented seamless mode switching (POST `/switch-mode`) with persistent SSIDs per mode.
- OTC asset labels normalized from `EURUSD_otc` → `EURUSDOTC` across all UI components.
- Asset dropdown sorted by payout percentage (descending). Asset selection synced across panels.

### OTC Asset Expansion
- Extended `ssid_service/routes.py` OTC asset categories to include: Cryptocurrencies, Commodities, Stocks, Indices (in addition to existing Currencies).
- No disruption to existing Currencies handling.

### Statement Analysis Page
- Built `/statement-analysis` full-page route (`StatementAnalysisPage.jsx`).
- Allows CSV upload, displays trading performance metrics, AI coaching insights.
- Accessible via "Statements & Logs" group in the ProfileMenu dropdown.

### Strategy Lab Integration
- `StrategyLabPanel.jsx` supports CSV upload and file management.
- `marketStore.selectedStrategyFileId` tracks active strategy file.
- `ChartWorkspace` fetches and renders strategy-lab OHLC data when a file is selected.
- `ChartHeader` CSV dropdown selects strategy files.

### Oscillator Panes
- `OscillatorChart.jsx` renders secondary charts (RSI, MACD, Stochastic, CCI).
- `OscillatorPanel.jsx` manages panel visibility and toggle controls.
- Time-scale synchronized with main chart via `lightweight-charts` API.

### Profile System (Full CRUD)
- `backend/services/gateway/routes/profiles.py`: Full CRUD + active profile management.
- `profileStore.js`: Zustand store with debounced settings sync to active profile.
- `ProfileMenu.jsx`: UI for creating, switching, renaming profiles with avatar and display name.
- `ProfilePicEditorModal.jsx`: Avatar editing.
- Profiles stored in `data/profiles/*.json` (one file per profile).

### SSID Persistence Fixes (28-02-2026)
- **Fix 1** (`trading.py`): `ConnectRequest.ssid` changed to `default=""` — validator skips empty SSID.
- **Fix 2** (`ssid_service/routes.py`): New `GET /ssid-status` endpoint — returns `{hasDemoSsid, hasRealSsid}` booleans only.
- **Fix 3** (`trading.py`): Gateway proxy for `/ssid-status`.
- **Fix 4** (`tradingStore.js`): `hasDemoSsid`/`hasRealSsid` state + `fetchSsidStatus()` action.
- **Fix 5a** (`SettingsPanel.jsx`): SSID saved badges on mount; smart placeholder text.
- **Fix 5b** (`LiveTradingPanel.jsx`): "✓ Saved SSID ready" indicator; `fetchSsidStatus()` on mount.
- **Fix 6** (`SettingsPanel.jsx`): "Save & Close" — saves settings + profile flush + toast + navigates to `'analysis'` tab.
- **Fix 7** (`SettingsPanel.jsx`): "Export Config (JSON)" — triggers browser download of settings JSON.

### Test File Reorganization
- Moved 10 `test_*.py` + `smoke_test.py` from root → `backend/tests/` (8 files) and `tests/` (2 files).
- Moved 7 `verify_*.py` / `check_*.py` / `debug_*.py` / `diagnose_*.py` → `backend/tests/` (3 files) and `tests/` (4 files).
- All files with `Path(__file__)` root resolution corrected to use proper `.parents[N]` offset.

## Current State

### Backend
- Collector / Strategy / Gateway are operational.
- SSID Service (`ssid_service`) is running as a standalone FastAPI microservice.
- History endpoints are explicit and reliable (`POST .../bootstrap-history`, `GET .../history/{asset}`).
- Indicator endpoint (`POST /api/v1/indicators`) now runs in-process with thread offload and per-asset DataFrame cache (no subprocess spawn).
- Profile system fully operational — CRUD, active profile, settings sync.
- AI Service integrated into Gateway lifespan with persistent `aiohttp` client.
- `/api/v1/ai/ask` supports prefix caching via `x-grok-conv-id`.
- Voice WS relay at `/api/v1/ai/voice/realtime`.
- Settings: `GET/PUT /api/v1/settings` + versioned `data/settings/settings.json`.
- Local Ops endpoints implemented (local-only, opt-in via `QFLX_ENABLE_OPS=1`).
- `GET /api/v1/trading/ssid-status` — new endpoint for SSID config status.

### Frontend
- Core Dashboard stable for streaming and visualization.
- `ChartWorkspace.jsx` is modular (<250 LOC).
- Overlay indicators on main chart: SuperTrend, Bollinger Bands, EMA Cross-Over (21/50/100), Support/Resistance.
- Oscillator panes: RSI, MACD, Stochastic, CCI — time-scale synchronized.
- Ask AI: Modal (quick assist) + AI Insights Panel (thread).
- Voice: dictation in Modal + Insights; TTS read-back (browser + xAI voice).
- Settings Panel: fully wired (Save & Close → profile flush + toast + navigate; Export Config → JSON download).
- SSID saved badges in Settings Panel and LiveTradingPanel.
- Profile system UI: ProfileMenu, ProfilePicEditorModal, profile sync.
- Statement Analysis page at `/statement-analysis`.
- Strategy Lab: CSV upload, chart integration, file selector in ChartHeader.
- `MarketStore`: emits `update_active_ticker` for Alert Dispatcher whitelist sync.
- Supplementary pages (AlertDispatchPage, CollectorPage, DevLogsPage, VoiceParticlePage, KnowledgeBase).

## Active Files (Key)

### Frontend
- `gui/Dashboard/src/store/marketStore.js` — market state, socket, tickers, activeTab
- `gui/Dashboard/src/store/settingsStore.js` — platform settings
- `gui/Dashboard/src/store/tradingStore.js` — live trading + SSID status
- `gui/Dashboard/src/store/profileStore.js` — profile CRUD + settings sync
- `gui/Dashboard/src/components/SettingsPanel.jsx` — settings UI (Save&Close, Export, SSID badges)
- `gui/Dashboard/src/components/LiveTradingPanel.jsx` — trading UI (SSID indicator, connect, trade)
- `gui/Dashboard/src/components/Dashboard.jsx` — layout orchestrator
- `gui/Dashboard/src/components/ContextPanelRouter.jsx` — tab → panel routing
- `gui/Dashboard/src/components/ChartWorkspace.jsx` — chart core
- `gui/Dashboard/src/components/ProfileMenu.jsx` — profile switcher UI

### Backend
- `backend/services/gateway/main.py` — Gateway startup, lifespan, routes
- `backend/services/gateway/routes/indicators.py` — in-process indicator API (OPT-1), series extraction, DataFrame cache
- `backend/services/gateway/routes/trading.py` — SSID proxy (Fix 1, Fix 3)
- `backend/services/gateway/routes/profiles.py` — profile CRUD
- `backend/services/ssid_service/routes.py` — SSID Service (Fix 2)
- `backend/services/ssid_service/connector.py` — PocketOption WS connector
- `backend/services/strategy/regime_detector.py` — market regime detection
- `backend/services/strategy/indicators.py` — `TechnicalIndicatorsPipeline`
- `backend/scripts/otc_alert_dispatch.py` — Alert Dispatcher with MarketScanner

## Next Steps

### ✅ Completed — Data Collection & Persistence Refactor
- All phases (0–6) are complete and documented in the plan/report.
- Final review passed; the task is closed.
- The updated memory files now reflect the completed state.

### Backlog (Post-Refactor)
1. **Oscillator pane polish** — toggle visibility per pane, persist visibility pref in settings.
2. **Profile UX** — import/export profile JSON (round-trip with Export Config).
3. **AI TradingContext hardening** — enforce strict Pydantic schema + size limits on `/api/v1/ai/ask`.
4. **Risk Manager Panel** — currently a placeholder (`RiskManagerPanel.jsx`), needs implementation.
5. **Calendar & Journal** — currently a placeholder (`CalendarJournalPanel.jsx`), needs implementation.
6. **Comprehensive integration tests** — especially for SSID service, profile sync, and trading flow.
7. **Alert Dispatcher Q2 improvements** — CHUNK_SIZE 1000→200, stale-data log throttling (per `Mutli_Feature_Implementaton_Plan_26-03-17.md`).
