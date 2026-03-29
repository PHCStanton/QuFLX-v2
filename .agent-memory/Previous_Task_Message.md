## LATEST TASK MESSAGE:
The implementation plan has been compiled and saved to:

__`v2_Dev_Docs/History_Handeling/Data_Collection_Persistence_Refactor_Plan_26-03-29.md`__

The plan is a complete, phase-gated implementation document derived from the forensic report and all source code reviewed in this session. It covers 7 phases:

- __Phase 0__ — Directory bootstrap for `data/supabase_migration_data/` (5 min, zero risk)
- __Phase 1__ — New `backend/utils/data_store.py` as the Single Source of Truth, with full unit test suite (`test_data_store.py`) covering 18+ test cases including upsert deduplication, atomic writes, session logging, and timeframe conversion
- __Phase 2__ — `history.py` refactored to in-process bootstrap via `asyncio.to_thread()` (eliminates the subprocess/Chrome log contention root cause), with session tracking and structured 503 when Chrome is not connected
- __Phase 3__ — All 5 backend consumers (`indicators.py`, `ai.py`, `strategy.py`, `collector/main.py`, `history_collector.py`) updated to use `data_store` directly
- __Phase 4__ — `history_utils.py` replaced with thin deprecation wrappers for backward compatibility
- __Phase 5__ — Frontend chart persistence in `marketStore.js` (cache-hit path skips bootstrap on asset switch-back) and `useTickAggregation.js` (skip chart clear when cached data exists, improved timeout message with actionable user guidance)
- __Phase 6__ — Full verification suite including regression tests, integration script, multi-asset sequential loading, and final multi-agent review per `PHASE_REVIEW_PROTOCOL.md`

Each phase includes exact code snippets (FIND/REPLACE format), verification commands, and a mandatory @Reviewer gate before proceeding. No code changes are made until you issue an explicit `"Proceed with Phase 0"` command.


## MORE CONTEXT ON CURRENT TASK
<condense>
<context>
1. Previous Conversation:
- User reported intermittent failures loading history candles in the dashboard chart and suspected a silent failure or hardware/processing bottleneck.
- They provided a prior forensic report (`@reports\reports_2026-01\forensic_analysis_history_loading_26-01-06.md`) that identified a race condition and a fragile bootstrap/polling design in the history loading flow.
- The investigation then expanded into current code in the frontend and backend to see what has changed since that report.
- After analysis, the assistant concluded the older race condition was largely addressed on the frontend, but the backend subprocess-based history capture remained fragile and likely the root of the intermittent behavior.
- The user then clarified they had backed up and removed the old history CSVs from the project root and wanted the system redesigned to save future data in `@data\supabase_migration_data` in a format that is easy to migrate into Supabase later, while still remaining local for now.
- The user also asked for a plan that streamlines history fetching, structures the fill/collection optimally for chart retrieval, and keeps streaming ticks linked to candle payloads if possible.
- The assistant responded with a proposed Supabase-ready local architecture and asked for confirmation before any modifications.
- The final step in the conversation was a context-compaction request; the user asked to condense the conversation for continuity.

2. Current Work:
- The work reached the planning stage for a **new local history data architecture**.
- No code edits have been made in this condensed thread.
- The assistant investigated and documented the current history loading flow, data path references, CSV storage format, and tick/candle pipeline.
- A high-level architecture proposal was drafted for a migration-friendly local store under `data/supabase_migration_data/`, including a candles folder, ticks folder, sessions metadata, and a single source of truth utility for path resolution and storage behavior.
- The assistant is currently waiting for user confirmation on architecture decisions before moving to a detailed implementation plan and then Act mode.

3. Key Technical Concepts:
- Frontend state management with Zustand (`marketStore.js`, `useTickAggregation.js`)
- Chart rendering with lightweight-charts (`ChartWorkspace.jsx`, `ChartWorkspaceOverlays.jsx`, `prepareChartData`, `normalizeTimestamp`)
- Backend FastAPI gateway routes (`history.py`, `indicators.py`, `strategy.py`, `ai.py`)
- History collection via Selenium/WebSocket interception (`capabilities_v2/history_collector.py`, `backend/services/collector/interceptor.py`)
- CSV-based local persistence with `get_recent_history_file()`, `persist_history_csv()`, and `append_candle_to_history()`
- Structured error model (`backend/models/errors.py`) using `HistoryErrorCode`, `HistoryErrorResponse`, and user-facing messages
- Chrome DevTools performance log consumption and contention
- Proposed migration-ready data layout with local files designed to map cleanly to future Supabase/Postgres tables
- Session linking concept between tick streams and candle payloads via a `session_id`

4. Relevant Files and Code:
- `gui/Dashboard/src/hooks/useTickAggregation.js`
  - Contains the history load timeout warning: `History load timeout - forcing isLoading(false)`.
  - The safety timeout is a symptom of upstream history-loading stalls.
  - It consumes `historyCandles` and `historyStatus`, and clears chart series on asset changes.

- `gui/Dashboard/src/store/marketStore.js`
  - Current `loadHistory(asset)` flow:
    1. `GET /api/v1/history/{asset}` for existing CSV
    2. if missing, `POST /api/v1/history/bootstrap-history`
    3. stores candles in `historyCandles[asset]` and sets `historyStatus[asset]`
  - Uses `normalizeSpecificAsset` for subscription keys and `selectedAsset` for UI.
  - Shows explicit error handling via `lastError` and `setError`-style state.
  - `setSelectedAsset()` triggers `loadHistory()` unless data source mode is streaming-only.

- `gui/Dashboard/src/components/ChartWorkspace.jsx`
  - Orchestrates the chart, history loading, indicators, overlays, and error display.
  - Uses `loadHistory(selectedAsset)` on asset changes.
  - Passes `isLoading` from `useTickAggregation` to overlays.

- `gui/Dashboard/src/components/ChartWorkspaceOverlays.jsx`
  - Displays a spinner and the text `Loading data for {selectedAsset}...` while loading.

- `gui/Dashboard/src/utils/chartData.js`
  - `prepareChartData()` normalizes timestamps, sorts ascending, and deduplicates timestamps for lightweight-charts.

- `gui/Dashboard/src/utils/time.js`
  - `normalizeTimestamp()` converts milliseconds to unix seconds and validates numeric inputs.

- `backend/services/gateway/routes/history.py`
  - `GET /{asset}` reads the most recent CSV using `get_recent_history_file()` and returns `candles` and `data`.
  - `POST /bootstrap-history` now runs `capabilities_v2/runner.py history_collector --inputs ...` in a subprocess using `subprocess.run()`.
  - It parses stdout via `parse_script_json()`, maps capability errors to structured history errors, and returns candle data directly.
  - `POST /append-candle` appends or updates the latest history CSV.
  - `POST /collect-history` exists as a background Popen-based operation.

- `backend/utils/history_utils.py`
  - `persist_history_csv(asset, timeframe_min, candles)` currently writes to `data/data_output/history/{asset_clean}/{asset_base}_{asset_type}_{tf_str}_{now_ts}.csv`.
  - `get_recent_history_file(asset, timeframe_min)` scans a directory and picks the newest matching CSV.
  - `append_candle_to_history()` updates the last row or appends a new row.
  - This module is a central place needing redirection to the new storage path.

- `backend/utils/asset_utils.py`
  - `normalize_asset(asset)` strips non-alphanumeric chars and uppercases.
  - This is the canonical asset normalization function used across the pipeline.

- `capabilities_v2/history_collector.py`
  - `HistoryCollector` supports `collect_and_save`, captures history payloads from WebSocket interceptor logs, merges them with ticks, and saves CSVs.
  - It already returns `candles` directly in the success payload and emits structured `error_code` values such as `chrome_not_connected`, `manual_click_timeout`, `no_history_data_received`, etc.
  - `_save_csv()` currently writes to the old `data/data_output/history/...` path and uses unified filenames.

- `backend/models/errors.py`
  - Defines `HistoryErrorCode` with values like `CHROME_NOT_CONNECTED`, `MANUAL_CLICK_TIMEOUT`, `NO_HISTORY_DATA_RECEIVED`, `FILE_WRITE_FAILED`, etc.
  - `create_error_response()` maps technical errors to user-facing `user_message` strings.

- `backend/services/gateway/routes/common.py`
  - `parse_script_json(stdout)` attempts direct JSON parsing, then falls back to extracting the last JSON block from mixed stdout.

- `backend/services/collector/interceptor.py`
  - `fetch_history_events()` refreshes Chrome performance logs and returns buffered history payloads.
  - It also buffers tick data separately.
  - This confirms the history payload capture and tick capture both compete for Chrome performance log entries.

- `capabilities_v2/runner.py`
  - Attaches to Chrome on port 9222 when browser-backed capabilities run.
  - Invokes the requested capability and prints JSON to stdout.

- `capabilities_v2/base.py`
  - `CapResult` includes `ok`, `data`, `error`, `error_code`, and `artifacts`.
  - Confirms structured error information can be propagated out of capabilities.

- `data/data_output/history/AUDNZDOTC/AUDNZDOTC_otc_1m_2026_03_27_17_24_07.csv`
  - Sample file showed reverse-chronological rows (newest timestamp first).
  - This implies `df.tail(limit)` in `get_history()` is semantically awkward if rows are not pre-sorted.

- `backend/services/gateway/routes/indicators.py`
  - Search results show it uses `get_recent_history_file(asset, timeframe_min)` and caches DataFrames by `(asset, csv_path, params_hash)`.
  - This makes it another consumer that will need to follow the new data store abstraction.

5. Problem Solving:
- The initial forensic analysis showed the old frontend race condition (bootstrap started without awaiting and then polled) is no longer the primary issue in the current codebase.
- The current history loading flow now does the following:
  - tries existing CSVs first,
  - then invokes the backend bootstrap subprocess,
  - and expects the subprocess to return candle data directly.
- The root failure mode appears to be architectural and operational rather than a simple fetch bug:
  - subprocess startup overhead,
  - Chrome performance log contention,
  - repeated request loads,
  - and file proliferation in the old storage layout.
- Important observation: there are many CSVs under `data/data_output/history/AUDNZDOTC/`, indicating repeated one-request-one-file writes. This is bad for retrieval performance and is not migration-friendly.
- A second important observation: there is a stray alternative directory naming pattern in the repo (`AED_CNY_OTC_/` and `AEDCNYOTC/`), which reinforces the need for a single source of truth for file-path generation.
- The assistant proposed a migration-ready local structure that is still local now but mirrors Supabase/Postgres semantics.

6. Pending Tasks and Next Steps:
- The user has now explicitly requested a rewrite of the data location and architecture direction: keep local for now, but move future data to `@data\supabase_migration_data` and structure it so later Supabase import is straightforward.
- The next steps before any edits are:
  1. get user confirmation on the proposed data architecture,
  2. create a detailed implementation plan document in `v2_Dev_Docs/`,
  3. then switch to Act mode for implementation.
- The proposed architecture from the last plan response was:
  - `data/supabase_migration_data/candles/` for one-file-per-asset-timeframe candle stores,
  - `data/supabase_migration_data/ticks/` for tick logs partitioned by date,
  - `data/supabase_migration_data/sessions/` for session metadata JSONL,
  - `_metadata/schema_version.json` for local-only schema/version metadata,
  - and a new backend utility (suggested name: `backend/utils/data_store.py`) as the single source of truth for local data paths and read/write operations.
- The architecture also suggested linking tick streams to candle payloads through a `session_id` captured when history bootstrap starts and reused by subsequent ticks.
- Verbatim next-step quote from the conversation:
  - User: "We can then continue with setting up a detailed report and implementation plan before making any modifications."
  - Assistant: "Once you confirm the direction and answer the questions above, I'll produce a detailed implementation plan document in `v2_Dev_Docs/` with exact code snippets for each phase. Then we can toggle to Act mode to implement."
- Open questions that were raised and should be resolved before implementation:
  - Do you want tick-level storage from day one or only candles first?
  - Should old backup CSVs be migrated into the new format now or left as archived backups?
  - Should the schema support multiple timeframes per asset from the start?

7. Context About the User’s Latest Explicit Direction:
- The user said they backed up history candles out of the project root and want future persistence in `data/supabase_migration_data`.
- They want an easy-to-migrate format for later Supabase use, but still local today.
- They asked for a streamlined, optimal architecture for chart retrieval and fetching, and want tick streams linked to candle payloads if possible.
- They asked for feedback and best suggestions, then wanted to continue with a detailed report and implementation plan before making any modifications.
</context>
<task_progress>
- [x] Read previous forensic report on history loading
- [x] Read useTickAggregation.js (source of the timeout error)
- [x] Read history-related backend routes (history.py)
- [x] Read marketStore.js (frontend socket/history state)
- [x] Read ChartWorkspace.jsx (chart rendering)
- [x] Read history_utils.py and asset_utils.py
- [x] Read history_collector.py (subprocess capability)
- [x] Read error models and common parse helper
- [x] Read chartData utility (prepareChartData)
- [x] Read time.js normalizeTimestamp utility
- [x] Read WebSocket interceptor (fetch_history_events)
- [x] Read runner.py (subprocess context creation)
- [x] Read base.py (CapResult class)
- [x] Check sample history CSV data format
- [x] Analyze full data flow and identify root causes
- [x] Compile findings and recommendations
- [x] Map all references to old data path
- [x] Design new data architecture for supabase-migration-ready format
- [ ] Get user confirmation on architecture decisions
- [ ] Create detailed implementation plan document
- [ ] Implement changes
</task_progress>
</condense>




## 🤔 AGENT Questions Before We Proceed

1. **Tick storage priority** — Do you want tick-level storage from day one, or should we focus on candles first and add tick persistence in a follow-up phase? (Tick files can grow large quickly)

2. **Historical data import** — You mentioned you backed up the old CSVs. Do you want a migration script to import those into the new format, or start fresh?

3. **Timeframes** — Currently only `1m` is collected. Should the schema support multiple timeframes per asset from the start (e.g., `AUDNZDOTC_1m.csv`, `AUDNZDOTC_5m.csv`)?

---

Once you confirm the direction and answer the questions above, I'll produce a detailed implementation plan document in `v2_Dev_Docs/` with exact code snippets for each phase. Then we can toggle to Act mode to implement.

## USER'S ANSWERS:
1. We can focus on candle collection first. The streaming collector is currently working fine. So if we can keep it opperational until the candle collection is stable and improved.

**IMPORTANT NOTE!!**   
Please look at the 
@v2_Dev_Docs\Alerts-&-Dispatch_Dev_Docs\Mutli_Feature_Implementaton_Plan_26-03-17.md file.
Under Heading -
## Proposed Changes
**Q2 — Tick Flush Threshold + Stale Data Improvements (Critical)**
[MODIFY] 
otc_alert_dispatch.py
Change default CHUNK_SIZE from 1000 → 200 (line 603):

diff
- self.CHUNK_SIZE = int(os.getenv("TICK_CHUNK_SIZE", "1000"))
+ self.CHUNK_SIZE = int(os.getenv("TICK_CHUNK_SIZE", "200"))
Add stale-data log throttling in 
fetch_data()
 (~line 1032): Track last STALE log per asset, only log once per 60s instead of every scan cycle:...

 (code snippets)
 ...
  
  You have a look at the difference between the `gui/Dashboard/src/hooks/useTickAggregation.js` and the `backend\scripts\otc_alert_dispatch.py`.

  I need a chart persistance feature so I can switch between charts without needing to collect a new chandle payload.

  **SUGGESTION:**
  Linking to the Ticker Asset Panel. This indicates which data streams are being received and have not gone stale.
  If the User can select an asset there to maintainthe already rendered data, without calling the HistoryCollector.
  The HsitoryCollector or Boostap_history() is linked to the "92% PAYOUT LIST" 
  
  2. Question 2 This is not a high priority. We will design the script after this implementation is Solid.

  3. **TImeframes**
  We should make provision for all the timeframes available. The data can be valuable for future Strategy development and unsderstanding the Pocket Option Asset Streaming Engine designed for their OTC Markets. As well as TopDown analysis.
  Timeframes to include:
  1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D
