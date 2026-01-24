I have completed the Voice Dictation + AI Read-Back (TTS) work and hardened the AI/Voice UX across the Dashboard.

**Recent Major Tasks (2026-01-23):**
- Voice dictation works in both the Ask AI Modal and AI Insights Panel via the realtime voice WS relay.
- Added browser TTS read-back (SpeechSynthesis) so AI answers can be spoken:
  - AI Insights: Speak per-message + Pause/Resume/Stop controls.
  - Ask AI Modal: optional auto “Read answer aloud”.
- Added Settings controls for read-back (enable, rate, pitch, voice selection).
- Hardened Ask AI response shaping (modal vs insights + verbosity influences backend system prompt + max token limits).
- Fixed gateway logging robustness for `run_id` formatter issues and improved voice WS close reason reporting.
- Verification run and passing:
  - Backend: `python -m pytest -q`
  - Dashboard: `npm run lint`, `npm run build`

**Summary of Current Direction:**
- Keep backend as the canonical source of indicator series and regimes.
- Keep frontend as a visualization layer (overlays + oscillator panes) and avoid re-implementing heavy indicator math.
- Maintain strict API semantics:
  - Non-200 for failures.
  - Stable, unified response shapes (`candles`).
- Continue AI integration incrementally:
  - `/api/v1/ai/ask` remains the canonical answer generator (text + vision context).
  - Voice is treated as an input modality (dictation) plus optional read-back, without turning the modal into a chat surface.
  - AI Gateway + TradingContext builder remain the intended end-state.

**Next Steps (high level):**
1. Implement overlay indicators on main chart (EMA, Bollinger Bands, SuperTrend).
2. Implement oscillator panes (RSI, MACD histogram) synchronized with main time scale.
3. Harden `/api/v1/ai/ask` contract (schema validation, size limits, safe logging).
4. (Optional) Add realtime conversation mode in AI Insights; keep modal as quick-response.

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
