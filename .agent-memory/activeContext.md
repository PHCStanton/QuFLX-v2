# Active Context

## Current Focus (as of 28-02-2026)
- **SSID Persistence**: 7 targeted fixes implemented and verified — gateway validator, /ssid-status endpoint, store badges, SettingsPanel Save&Close/Export, LiveTradingPanel indicator.
- **Settings Panel**: "Save & Close" and "Export Config (JSON)" are now fully functional.
- **Test Organization**: All test files have been moved from project root into `backend/tests/` and `tests/`. Path references fixed.
- **Next Priorities**: Oscillator pane polish, Profile UX enhancements, AI TradingContext hardening.

## Recent Changes (chronological)

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
- `backend/services/gateway/routes/trading.py` — SSID proxy (Fix 1, Fix 3)
- `backend/services/gateway/routes/profiles.py` — profile CRUD
- `backend/services/ssid_service/routes.py` — SSID Service (Fix 2)
- `backend/services/ssid_service/connector.py` — PocketOption WS connector
- `backend/services/strategy/regime_detector.py` — market regime detection
- `backend/services/strategy/indicators.py` — `TechnicalIndicatorsPipeline`
- `backend/scripts/otc_alert_dispatch.py` — Alert Dispatcher with MarketScanner

## Next Steps
1. **Oscillator pane polish** — toggle visibility per pane, persist visibility pref in settings.
2. **Profile UX** — import/export profile JSON (round-trip with Export Config).
3. **AI TradingContext hardening** — enforce strict Pydantic schema + size limits on `/api/v1/ai/ask`.
4. **Risk Manager Panel** — currently a placeholder (`RiskManagerPanel.jsx`), needs implementation.
5. **Calendar & Journal** — currently a placeholder (`CalendarJournalPanel.jsx`), needs implementation.
6. **Comprehensive integration tests** — especially for SSID service, profile sync, and trading flow.
