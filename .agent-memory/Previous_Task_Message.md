I have completed the History + Assets + Indicators alignment hardening work and refactored the Dashboard ChartWorkspace for long-term maintainability.

**Recent Major Tasks (2026-01-18):**
- Backend history bootstrap now returns correct HTTP status codes (4xx/5xx) with structured error bodies (no semantic 200 failures).
- History API response shape unified around `candles` (GET includes `candles` and keeps legacy `data` for compatibility).
- Crosshair sync is now unidirectional (Main → Oscillators); removed oscillator → main feedback path.
- Dashboard UI messaging standardized (removed all `window.alert()` calls); AI answers display via an in-app modal.
- `ChartWorkspace.jsx` refactored into smaller hooks/components and reduced to ~240 LOC (<250 target met).
- Vite build chunk-size warning eliminated via manual chunking.
- Verification run and passing:
  - Backend: `python -m pytest -q`
  - Dashboard: `npm run lint`, `npm run build`, `npm run test:qa`

**Summary of Current Direction:**
- Keep backend as the canonical source of indicator series and regimes.
- Keep frontend as a visualization layer (overlays + oscillator panes) and avoid re-implementing heavy indicator math.
- Maintain strict API semantics:
  - Non-200 for failures.
  - Stable, unified response shapes (`candles`).
- Continue AI integration incrementally:
  - `/api/v1/ai/ask` is usable today.
  - AI Gateway + TradingContext builder remain the intended end-state.

**Next Steps (high level):**
1. Implement overlay indicators on main chart (EMA, Bollinger Bands, SuperTrend).
2. Implement oscillator panes (RSI, MACD histogram) synchronized with main time scale.
3. Replace `window.prompt()` with an in-app Ask-AI panel (include context/screenshot toggles).
4. Build AI Gateway skeleton + TradingContext builder so `/api/v1/ai/ask` becomes a thin adapter.

**Additional Task Completed – Settings Architecture Foundation:**
- Introduced a dedicated settings architecture aligned with `v2_Dev_Docs/Settings_Architecture_Endpoints.md`, including:
  - A versioned settings schema and persistent JSON file at `data/settings/settings.json` managed by helper functions in `backend/services/gateway/main.py`.
  - New Gateway endpoints `GET /api/v1/settings` and `PUT /api/v1/settings` for retrieving and updating platform settings.
  - A new Zustand `useSettingsStore` in `gui/Dashboard/src/store/settingsStore.js` that keeps settings separate from `useMarketStore` while mirroring the Global/User/AI + per-tab sections.
  - A frontend `settingsClient` in `gui/Dashboard/src/api/settingsClient.js` that talks to the new settings endpoints.
  - Sidebar tab ordering updated so `Calendar & Journal` and `Settings` are the final two sidebar items, with `Settings` pinned last, matching the settings/layout design notes.


Additional tasks completed around PocketOption topdown v2 capabilities:
- Implemented `capabilities_v2/timeframe_select_sync.py` as a robust timeframe selection capability with retries, chart-focus recovery, and diagnostics.
- Updated `capabilities_v2/topdown_select_test_2.py` to optionally call `timeframe_select_sync`, enabling A/B testing between direct `timeframe_menu` usage and the robust sync wrapper.
- Integrated `timeframe_select_sync` into `capabilities_v2/collect_history_loop.py` so that history collection can enforce a specific timeframe per asset before invoking `history_collector`.
- Wired all relevant capabilities into `capabilities_v2/runner.py` and verified that `python -m pytest -q` still passes.
- Authored `capabilities_v2/topdown_select_v2_guide.md` summarizing the architecture, flows, and usage patterns for topdown v2 and data collection.
