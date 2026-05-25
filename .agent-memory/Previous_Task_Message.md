__History Refresh / Asset Control Remediation Status — 2026-05-24__

The History Data Payload / Chart Rendering remediation has progressed beyond the 2026-05-23 blocking report. The remaining runtime blocker was isolated to Selenium-driven Pocket Option asset-panel detection in `backend/services/gateway/asset_control.py`; follow-up remediation has now been implemented and documented, with automated validation green. Final production closeout still requires live Chrome/Pocket Option validation.

__Plan document updated__

- `v2_Dev_Docs/History_Handeling/History_Data_Payload_Chart_Rendering_Fix_Plan_26-05-20.md`
- Added Phase 6A / 6B / 6C remediation sections:
  1. Phase 6A — Make clear-cache non-destructive.
  2. Phase 6B — Harden `asset_control.py` selectors and panel-open detection.
  3. Phase 6C — Final validation and closeout requirements.
- Recorded final multi-agent review protocol:
  - @Reviewer — ✅ Passed for correctness, maintainability, and plan alignment.
  - @Debugger — ⚠️ Passed for automated/runtime guard coverage; live Pocket Option DOM validation still required.
  - @Optimizer — ✅ Passed.
  - @Code_Simplifier — ✅ Passed.
  - @Team_Leader final verdict — implementation complete and automated validation green; production closeout pending live Chrome/Pocket Option workflow validation.

__Code changes completed__

1. `gui/Dashboard/src/components/ChartHeader.jsx`
   - Replaced the destructive clear-cache button flow with `reloadHistoryFromPayload(selectedAsset)`.
   - Removed the direct `clearHistoryCache()` / `loadHistory()` path from the header button.
   - Uses normalized `selectedAssetKey` for history loading-state checks.
   - Updated tooltip from destructive clear-cache wording to `Refresh current asset history from payload`.
   - Result: the refresh-history button now attempts fresh payload bootstrap without deleting existing backend/frontend history first.

2. `backend/services/gateway/asset_control.py`
   - Removed stale favorite-star command/helper path and star-based panel detection assumptions.
   - `_is_assets_panel_open()` now detects visible search inputs, asset rows, asset-list containers, and modern asset/pair class patterns instead of relying on old `fa-star` DOM markers.
   - `_open_assets_dropdown()` now returns `bool`, uses 3 bounded retry rounds, clears stale cached elements on retry, expands selector coverage, and logs selector diagnostics when the panel cannot be opened.
   - `_select_asset()` now waits longer for modern search/list DOM, logs candidate row counts, and logs visible candidate row text when a target asset is not found.

__Validation completed__

Automated checks run successfully:

```powershell
conda run -n QuFLX-v2 python -m py_compile backend/services/gateway/asset_control.py
conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v
conda run -n QuFLX-v2 python -m pytest backend/tests -q --tb=short
npm --prefix gui/Dashboard run build
git diff --check -- v2_Dev_Docs/History_Handeling/History_Data_Payload_Chart_Rendering_Fix_Plan_26-05-20.md gui/Dashboard/src/components/ChartHeader.jsx backend/services/gateway/asset_control.py
```

Results:

- `asset_control.py` compile check ✅
- Focused history route suite: `10 passed` ✅
- Full backend suite: `197 passed, 7 warnings` ✅
- Frontend production build ✅
- `git diff --check` ✅

__Current runtime behavior__

- `reloadHistoryFromPayload()` remains the preferred non-destructive refresh path.
- The chart refresh button in `ChartHeader.jsx` now uses that same non-destructive path.
- The old delete-path route bug remains fixed.
- Backend bootstrap still follows the collector-owned polling model; no competing Chrome performance-log reader was reintroduced.
- `asset_control.py` is now more observable: selector failures should include diagnostics instead of only `Failed to open assets panel`.

__Remaining live validation required__

Phase 6A/6B are implemented and reviewed, but should stay `[~]` rather than `[x]` until live validation confirms current Pocket Option DOM behavior.

Required live checks:

1. Start/attach Chrome + Pocket Option session.
2. Start Gateway/collector as normal.
3. Trigger `POST /api/v1/history/bootstrap-history` for at least one OTC asset.
4. Confirm `asset_control.py` can open/detect the current asset panel.
5. Confirm the target asset can be selected.
6. Confirm collector-owned fresh history persists to CSV/data store.
7. Confirm frontend chart refreshes from returned/persisted candles without deleting old history on failure.

__Related report__

- `reports/reports_2026-05/asset_control_history_blocking_report_26-05-23.md`

__Important note for next agent__

Do not mark Phase 6 fully `[x]` closed until live Chrome/Pocket Option validation passes or the user explicitly accepts the remaining live-validation risk.
