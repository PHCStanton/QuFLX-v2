## Previous Conversation Condenced
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


# 🔍 Forensic Investigation Report: History Candle Loading Failures
**Date:** 2026-03-29 | **Delegated Agents:** @Investigator, @Debugger, @Backend_Specialist

---

## Executive Summary

The history candle loading pipeline has **significant architectural bottlenecks** that explain the intermittent failures you're experiencing. The core issue is that **every history load spawns a new subprocess** that must attach to Chrome via Selenium, intercept WebSocket frames, match the asset, parse candles, save CSV, and return — all within a tight timeout window. This is inherently fragile and explains why it works "1-2 times after restart" then fails.

The previous forensic report (Jan 6) identified the race condition correctly, and the **frontend side was properly fixed** (bootstrap is now awaited, no more polling). However, the **backend subprocess architecture remains the fundamental bottleneck** and has not been addressed.

---

## 🔴 CRITICAL FINDINGS

### Finding 1: CRITICAL — Subprocess-per-Request Architecture is the Root Cause
**Files:** `history.py:bootstrap_history()` → `runner.py` → `history_collector.py`

**The Problem:**
Every single history load request:
1. Spawns a **new Python subprocess** (`subprocess.run()`)
2. That subprocess imports Selenium, creates a new Chrome DevTools connection
3. Attaches to Chrome via `debuggerAddress: 127.0.0.1:9222`
4. Creates a `WebSocketInterceptor` that calls `driver.get_log('performance')`
5. Polls for history events in a loop (every 0.5s)
6. Parses, saves CSV, returns JSON via stdout

**Why this fails intermittently:**
- **Chrome performance logs are consumed destructively** — `driver.get_log('performance')` returns logs and **clears them**. If the main collector service is also running and consuming logs, the subprocess may get an empty buffer.
- **Selenium connection contention** — Multiple Selenium sessions attached to the same Chrome instance via port 9222 compete for the DevTools protocol. The first connection after a restart gets clean logs; subsequent ones may get stale or empty buffers.
- **Subprocess startup overhead** — Each subprocess takes 2-5 seconds just to import modules and attach to Chrome. With a `duration` of 1.5-3s (from settings `historyWaitTime`), the subprocess may timeout before it even starts intercepting.

**Evidence from your symptoms:**
- "Works 1-2 times after restart" → First subprocess gets fresh Chrome logs
- "Then struggles" → Subsequent subprocesses find empty log buffers (already consumed)
- "History load timeout - forcing isLoading(false)" → 10-second safety timeout in `useTickAggregation.js:156` fires because the subprocess never returns candles

### Finding 2: HIGH — Performance Log Contention Between Collector and History Subprocess
**Files:** `backend/services/collector/interceptor.py`, `capabilities_v2/history_collector.py`

Both the **main collector service** (running continuously for live ticks) and the **history subprocess** (spawned per-request) create their own `WebSocketInterceptor` instances that call `driver.get_log('performance')`. 

Chrome's performance log is a **single FIFO queue** — once consumed by one reader, those entries are gone. This means:
- If the collector service reads the logs first → history subprocess gets nothing
- If the history subprocess reads first → collector misses ticks temporarily
- After a gateway restart, the collector may not be running yet → history subprocess gets the logs (explains "works after restart")

### Finding 3: HIGH — CSV File Accumulation (190+ files for one asset)
**Location:** `data/data_output/history/AUDNZDOTC/`

There are **190+ CSV files** for a single asset, many created seconds apart. Each bootstrap attempt creates a new file. The `get_recent_history_file()` function must glob and sort all of these every time. This is:
- A performance drag (filesystem I/O on every request)
- A sign that the bootstrap is being called repeatedly (user retrying)
- Wasted disk space

### Finding 4: HIGH — History CSV Data is Reverse-Sorted (Newest First)
**Location:** `data/data_output/history/AUDNZDOTC/AUDNZDOTC_otc_1m_2026_03_27_17_24_07.csv`

The CSV timestamps go from `1774638900` (newest) down to `1774609500` (oldest). The data is **reverse chronological**. However:
- `history.py:get_history()` uses `df.tail(limit)` which returns the **last N rows** — these are the OLDEST candles
- `prepareChartData()` sorts by time ascending, so it will display correctly
- But `df.tail(limit)` is semantically wrong — it should be `df.head(limit)` for reverse-sorted data, or the data should be sorted first

This means you may be getting **stale candles** (the oldest ones) instead of the most recent ones when `limit < total_rows`.

### Finding 5: MEDIUM — The `loadHistory` Quick-Check Path Works, But Bootstrap Path is Fragile
**Location:** `marketStore.js:loadHistory()`

The flow is:
1. **Quick check** (`GET /history/{asset}`) — looks for existing CSV → ✅ Works reliably when CSV exists
2. **Bootstrap** (`POST /bootstrap-history`) — spawns subprocess → ❌ Fragile due to Finding 1

When you already have a CSV file for the asset, Step 1 succeeds immediately and the chart loads. The problem only manifests when:
- No CSV exists yet (first time for an asset)
- You want fresh data (but the system always uses the most recent existing CSV)

### Finding 6: MEDIUM — Safety Timeout in useTickAggregation is a Symptom, Not the Cause
**Location:** `useTickAggregation.js:155-161`

```javascript
// Safety timeout to prevent infinite loading state
if (isLoading) {
  timeoutId = setTimeout(() => {
    console.warn('History load timeout - forcing isLoading(false)');
    setIsLoading(false);
  }, 10000);
}
```

This 10-second timeout fires because:
1. `setIsLoading(true)` is set when asset changes (line 35)
2. The history load effect (line 44) waits for `historyCandles` and `historyStatus` to update
3. If the bootstrap subprocess hangs or returns empty candles, `historyStatus` stays at `'loading'`
4. After 10 seconds, the safety timeout forces `isLoading(false)` — this is the console message you see

---

## 📊 Data Flow Analysis (Current State)

```
User clicks asset → setSelectedAsset()
  ↓
marketStore.loadHistory(asset)
  ↓
Step 1: GET /history/{asset} → get_recent_history_file() → glob 190+ CSVs → sort → read latest
  ↓ (if 404)
Step 2: POST /bootstrap-history → subprocess.run(runner.py history_collector)
  ↓
runner.py → Selenium attach to Chrome:9222 → WebSocketInterceptor
  ↓
interceptor.fetch_history_events() → driver.get_log('performance') ← CONTENTION POINT
  ↓
Parse candles → save CSV → return JSON via stdout
  ↓
parse_script_json(stdout) → return candles to frontend
  ↓
useTickAggregation → prepareChartData() → candleSeries.setData()
```

---

## 🛠️ Recommendations

### Option A: **In-Process History Loading (RECOMMENDED — Eliminates Subprocess)**
**Effort:** 4-6 hours | **Risk:** Low | **Impact:** Eliminates root cause

Instead of spawning a subprocess, load history **in-process** within the gateway, similar to how `POST /api/v1/indicators` was refactored (OPT-1 from the indicator plan).

**Changes:**
1. **`history.py:bootstrap_history()`** — Replace `subprocess.run()` with direct `HistoryCollector` invocation via `asyncio.to_thread()` (same pattern as indicators route)
2. **Share the Chrome driver** — The gateway already has access to Chrome via the collector service. Pass the existing driver reference instead of creating a new Selenium session
3. **Dedicated history log buffer** — Instead of competing with the collector for `get_log('performance')`, use the collector's existing interceptor instance to fetch history events
4. **CSV cleanup** — Add a retention policy (keep only last 5 CSVs per asset per timeframe)

### Option B: **Gateway-Level History Cache with Collector Integration**
**Effort:** 6-8 hours | **Risk:** Low-Medium | **Impact:** Most robust long-term

Instead of intercepting WebSocket frames for history, leverage the fact that the **collector service is already running and intercepting all WebSocket traffic**.

**Changes:**
1. **Collector publishes history events to Redis** — When the interceptor sees a history payload, publish it to a Redis channel (`history:{asset}`)
2. **Gateway subscribes to history channel** — When bootstrap is requested, gateway subscribes and waits for the history event
3. **No subprocess needed** — The collector already has the Chrome connection and is already parsing logs
4. **Frontend triggers asset click detection** — Gateway emits a Socket.IO event telling the collector to watch for a specific asset's history payload

### Option C: **Quick Fixes (Stabilization Only)**
**Effort:** 2-3 hours | **Risk:** Medium | **Impact:** Reduces failures but doesn't eliminate root cause

1. **Increase `historyWaitTime` default** from 1.5s to 5s
2. **Add retry logic** in `loadHistory()` — retry bootstrap up to 3 times with exponential backoff
3. **Fix `df.tail()` bug** — Sort CSV data before taking tail, or use head for reverse-sorted data
4. **Add CSV cleanup** — Delete old CSVs on successful bootstrap
5. **Improve the safety timeout message** — Show a toast instead of just console.warn

---

## 🎯 Recommended Implementation Plan (Option A + Quick Fixes)

### Phase 1: Quick Stabilization (Immediate)
1. Fix `df.tail()` → sort data before slicing
2. Add retry with backoff in `loadHistory()`
3. Improve loading state feedback (toast on timeout)
4. CSV cleanup (keep last 5 per asset)

### Phase 2: In-Process History Loading (Core Fix)
1. Refactor `bootstrap_history()` to use in-process `HistoryCollector`
2. Share Chrome driver from collector service context
3. Use collector's existing interceptor (no log contention)
4. Add proper timeout handling with structured error codes

### Phase 3: Verification & Hardening
1. Test with multiple assets in sequence
2. Test after gateway restart
3. Test with collector running simultaneously
4. Verify CSV data ordering

---

## One clarifying question: 
Is the **collector service** (the one that streams live ticks) always running when you attempt history loading, or do you sometimes try to load history before starting the stream?

ANSWER:
Not always, but sometimes. I should be able to do both or have Warning notification popup to Infom the User of Correct Method.

## USER PROMPT:
Ok, I backedup the History Candles that are saved in @data\data_output\history and moved the files to my local disk. So it's not in the project's Root any more. 
I would like to make provision from this point forward to save the data in an easy to migrate format that can be imported into supabase later when we move our data operations at a later stage of the project. But for now I still want it local
So you can streamline the fetching process and structure the filling optimally for chart retrieval and fetching i.e. structure an optimal architechture for this process.

Please redirect the data location to @data\supabase_migration_data where I created this folder. 
We must also keepin mind that the streaming Tick need to somehow be linked to a specific payload of candles if at all possible when designing and creating this architechture.

Provide some feedback on the above proposal and tell me your best suggestions.

We can then continue with setting up a detailed report and implementation plan before making any modifications.

## AGENT RECOMMENDATONS:


# 🏗️ Architecture Proposal: Supabase-Ready History Data Pipeline

Great decisions — moving to a structured, migration-ready format now will save enormous effort later. Here's my analysis and recommendations:

---

## 📋 Feedback on Your Proposal

### ✅ What's Excellent
1. **`data/supabase_migration_data/`** — Clean separation from the old chaotic `data_output/history/` with its 190+ files per asset
2. **Supabase-ready format** — Designing for migration now means zero data transformation later
3. **Linking ticks to candle payloads** — This is the key insight for data integrity and is absolutely achievable

### ⚠️ Considerations
1. **Supabase uses PostgreSQL** — so our local format should mirror a relational schema (tables → CSV/JSON files that map 1:1 to future Supabase tables)
2. **One file per asset per timeframe** (append model) vs. the current "new file every request" model — this is the single biggest improvement we can make
3. **Tick-to-candle linkage** — We can achieve this via a `session_id` that groups a history payload capture with its subsequent tick stream

---

## 🎯 Proposed Data Architecture

### Directory Structure
```
data/supabase_migration_data/
├── candles/                          # ← Maps to future `candles` Supabase table
│   ├── AUDNZDOTC_1m.csv             # One file per asset+timeframe (append-only)
│   ├── AUDNZDOTC_5m.csv
│   ├── EURUSDOTC_1m.csv
│   └── ...
├── ticks/                            # ← Maps to future `ticks` Supabase table
│   ├── AUDNZDOTC_2026-03-29.csv     # One file per asset per day (append-only)
│   └── ...
├── sessions/                         # ← Maps to future `collection_sessions` table
│   └── sessions.jsonl                # JSONL (one JSON object per line, easy to import)
└── _metadata/                        # ← Local-only operational metadata
    └── schema_version.json           # Schema version for migration tooling
```

### Schema Design (Supabase-Ready)

#### `candles` table (one CSV per asset+timeframe)
```csv
timestamp,open,high,low,close,volume,session_id,source,created_at
1774638900,1.18412,1.18454,1.18366,1.18454,97,sess_abc123,history_capture,2026-03-27T17:24:07Z
1774638960,1.18454,1.18470,1.18440,1.18465,12,sess_abc123,tick_aggregation,2026-03-27T17:25:07Z
```

| Column | Type | Purpose |
|--------|------|---------|
| `timestamp` | int (unix seconds) | Candle open time — **PRIMARY KEY** (with asset+tf) |
| `open/high/low/close` | float | OHLC prices |
| `volume` | float | Tick volume |
| `session_id` | string | Links to collection session (tick↔candle linkage) |
| `source` | enum | `history_capture` / `tick_aggregation` / `manual_import` |
| `created_at` | ISO8601 | When this row was written |

**Key design decisions:**
- **Append-only, deduplicated by timestamp** — If a candle with the same timestamp exists, update it (upsert semantics)
- **Sorted ascending** (fixes the reverse-sort bug from the old format)
- **One file = one future Supabase table partition** — `AUDNZDOTC_1m.csv` → `WHERE asset='AUDNZDOTC' AND timeframe='1m'`

#### `ticks` table (one CSV per asset per day)
```csv
timestamp,price,session_id,source
1774638901.234,1.18420,sess_abc123,live_stream
1774638901.567,1.18422,sess_abc123,live_stream
```

| Column | Type | Purpose |
|--------|------|---------|
| `timestamp` | float (unix seconds, ms precision) | Tick time |
| `price` | float | Tick price |
| `session_id` | string | Links to the candle session |
| `source` | string | `live_stream` / `history_replay` |

**Tick-to-candle linkage:** Both share the same `session_id`. When you load history candles, a session is created. All subsequent ticks for that asset inherit the session ID until a new history load occurs.

#### `sessions` metadata (JSONL)
```json
{"session_id":"sess_abc123","asset":"AUDNZDOTC","timeframe":"1m","started_at":"2026-03-27T17:24:07Z","candle_count":100,"source":"history_capture","status":"complete"}
```

### Why This Design is Optimal

1. **Chart retrieval is O(1)** — Read one file, `df.tail(200)`, done. No globbing 190+ files.
2. **Supabase migration** — Each CSV maps directly to a `COPY FROM` import. The `session_id` column becomes a foreign key.
3. **Tick linkage** — `session_id` connects ticks to their parent candle payload. You can query "show me all ticks that contributed to this candle session."
4. **Append-only** — No file proliferation. One file grows over time, deduped by timestamp.
5. **Day-partitioned ticks** — Prevents tick files from growing unbounded. Easy to archive old days.

---

## 🔧 Implementation Plan Overview

### Phase 1: Data Layer Foundation
- Create `data/supabase_migration_data/` directory structure
- Create `backend/utils/data_store.py` — **Single Source of Truth** for all data path resolution
  - `get_candle_path(asset, timeframe)` → `data/supabase_migration_data/candles/AUDNZDOTC_1m.csv`
  - `get_tick_path(asset, date)` → `data/supabase_migration_data/ticks/AUDNZDOTC_2026-03-29.csv`
  - `get_session_path()` → `data/supabase_migration_data/sessions/sessions.jsonl`
  - Upsert/append functions with deduplication
  - Session ID generation

### Phase 2: History Loading Refactor (Fixes the Core Bug)
- Refactor `bootstrap_history()` to **in-process execution** (no subprocess)
- History candles written to new `candles/` format (append + dedup)
- `get_history()` reads from new single-file-per-asset format
- Session tracking for tick-candle linkage

### Phase 3: Update All Consumers
- `history.py` — Use new `data_store` for read/write
- `indicators.py` — Use new `data_store` for CSV path resolution
- `ai.py` — Use new `data_store` for history file lookup
- `strategy.py` — Use new `data_store` for history file lookup
- `history_collector.py` — Use new `data_store` for CSV save
- `history_utils.py` — Deprecate old functions, redirect to `data_store`

### Phase 4: Frontend Stabilization
- Add retry with exponential backoff in `loadHistory()`
- Improve loading state feedback (toast on timeout instead of just console.warn)
- Fix the safety timeout to show actionable user message

### Phase 5: Tick Integration
- Collector service writes ticks to `ticks/` directory with session linkage
- `appendCandle()` uses new upsert logic
- Tick files partitioned by day

---

## 📊 Files That Need Modification

| File | Change Type | Description |
|------|------------|-------------|
| `backend/utils/data_store.py` | **NEW** | Central data path resolution + read/write |
| `backend/utils/history_utils.py` | **MODIFY** | Redirect to `data_store`, deprecate old functions |
| `backend/services/gateway/routes/history.py` | **MODIFY** | In-process bootstrap, new data paths |
| `backend/services/gateway/routes/indicators.py` | **MODIFY** | Use `data_store` for CSV lookup |
| `backend/services/gateway/routes/ai.py` | **MODIFY** | Use `data_store` for CSV lookup |
| `backend/services/gateway/routes/strategy.py` | **MODIFY** | Use `data_store` for CSV lookup |
| `capabilities_v2/history_collector.py` | **MODIFY** | Use `data_store` for save path |
| `gui/Dashboard/src/store/marketStore.js` | **MODIFY** | Add retry logic, improve error handling |
| `gui/Dashboard/src/hooks/useTickAggregation.js` | **MODIFY** | Better timeout feedback |
| `gui/Dashboard/src/components/ChartWorkspaceOverlays.jsx` | **MODIFY** | Show actionable error messages |

---

## 🤔 Questions Before We Proceed

1. **Tick storage priority** — Do you want tick-level storage from day one, or should we focus on candles first and add tick persistence in a follow-up phase? (Tick files can grow large quickly)

2. **Historical data import** — You mentioned you backed up the old CSVs. Do you want a migration script to import those into the new format, or start fresh?

3. **Timeframes** — Currently only `1m` is collected. Should the schema support multiple timeframes per asset from the start (e.g., `AUDNZDOTC_1m.csv`, `AUDNZDOTC_5m.csv`)?

---

Once you confirm the direction and answer the questions above, I'll produce a detailed implementation plan document in `v2_Dev_Docs/` with exact code snippets for each phase. Then we can toggle to Act mode to implement.

## ANSWERS:
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
