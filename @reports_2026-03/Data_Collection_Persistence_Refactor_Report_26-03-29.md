# 📊 Data Collection & Persistence Refactor Report
**Date:** 2026-03-29 | **Report Type:** @Reviewer Forensic Analysis + Architecture Proposal  
**Delegated Agents:** @Investigator (forensic read-only), @Reviewer (quality gate), @Architect (structural decisions)  
**Status:** 📋 Awaiting Developer Review → Refactor Plan

---

## Executive Summary

The QuFLX-v2 data collection and persistence layer has **critical architectural bottlenecks** that cause intermittent history loading failures and prevent future scalability. This report consolidates findings from two forensic investigations (2026-01-06 and 2026-03-29), maps every file that touches the data pipeline, and proposes a **Supabase-ready local architecture** that eliminates the root causes while maintaining backward compatibility with the streaming collector.

**Key Decision:** The user has backed up and removed all old history CSVs from `data/data_output/history/`. The new data store will be located at `data/supabase_migration_data/` with a schema designed for direct PostgreSQL/Supabase import at a later project stage.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Critical Findings](#2-critical-findings)
3. [Complete File Dependency Map](#3-complete-file-dependency-map)
4. [User Requirements & Decisions](#4-user-requirements--decisions)
5. [Proposed Architecture](#5-proposed-architecture)
6. [Data Schema Design (Supabase-Ready)](#6-data-schema-design-supabase-ready)
7. [Chart Persistence Feature](#7-chart-persistence-feature)
8. [Implementation Scope](#8-implementation-scope)
9. [Files Touched Summary](#9-files-touched-summary)
10. [Risk Assessment](#10-risk-assessment)
11. [Open Questions Resolved](#11-open-questions-resolved)
12. [Reviewer Sign-Off Criteria](#12-reviewer-sign-off-criteria)

---

## 1. Current Architecture Analysis

### 1.1 Data Flow (Current State)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CURRENT DATA PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks asset → setSelectedAsset()                                │
│       ↓                                                                 │
│  marketStore.loadHistory(asset)                                        │
│       ↓                                                                 │
│  Step 1: GET /history/{asset}                                          │
│       → get_recent_history_file() → glob 190+ CSVs → sort → read      │
│       ↓ (if 404)                                                       │
│  Step 2: POST /bootstrap-history                                       │
│       → subprocess.run(runner.py history_collector)                    │
│       → Selenium attach to Chrome:9222                                 │
│       → WebSocketInterceptor (NEW instance)                            │
│       → driver.get_log('performance') ← CONTENTION POINT              │
│       → Parse candles → save CSV → return JSON via stdout              │
│       ↓                                                                 │
│  parse_script_json(stdout) → return candles to frontend                │
│       ↓                                                                 │
│  useTickAggregation → prepareChartData() → candleSeries.setData()     │
│                                                                         │
│  PARALLEL: CollectorService._run_loop()                                │
│       → interceptor.fetch_ticks() → Redis publish                      │
│       → interceptor.fetch_history_events() → persist_history_csv()     │
│       → SAME driver.get_log('performance') ← CONTENTION POINT         │
│                                                                         │
│  PARALLEL: otc_alert_dispatch.py                                       │
│       → fetch_data(asset) → get_recent_history_file() → read CSV      │
│       → STALE check (300s threshold) → skip if stale                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Storage Layout

```
data/
├── data_output/
│   └── history/                    ← OLD LOCATION (now empty — user backed up)
│       └── {ASSET_CLEAN}/          ← One folder per asset
│           └── {ASSET}_{type}_{tf}_{timestamp}.csv  ← NEW file per request
│                                      (was 190+ files for single asset)
├── ticks/                          ← Tick logs from otc_alert_dispatch
│   ├── AEDCNYOTC/
│   ├── AUDCADOTC/
│   └── ...
└── supabase_migration_data/        ← NEW LOCATION (empty, ready)
```

### 1.3 Current Persistence Functions

| Function | File | Purpose | Issues |
|----------|------|---------|--------|
| `persist_history_csv()` | `backend/utils/history_utils.py` | Write candles to CSV | Creates NEW file every call; no dedup |
| `get_recent_history_file()` | `backend/utils/history_utils.py` | Find latest CSV for asset+tf | Globs all files, sorts by filename timestamp |
| `append_candle_to_history()` | `backend/utils/history_utils.py` | Append/update last candle | Reads entire CSV into DataFrame each time |

---

## 2. Critical Findings

### Finding 1: 🔴 CRITICAL — Subprocess-per-Request Architecture

**Files:** `history.py:bootstrap_history()` → `runner.py` → `history_collector.py`

Every history load request spawns a **new Python subprocess** that:
1. Imports Selenium and creates a new Chrome DevTools connection
2. Creates a **new** `WebSocketInterceptor` instance
3. Calls `driver.get_log('performance')` — which **destructively consumes** the log buffer
4. Competes with the running `CollectorService` for the same Chrome performance logs

**Impact:** 
- Works 1-2 times after restart (fresh Chrome logs), then fails (logs already consumed)
- 10-second safety timeout fires in `useTickAggregation.js:155` → `"History load timeout"`
- Subprocess startup overhead: 2-5 seconds before any interception begins

**Evidence:** `history.py` lines 97-130 — `subprocess.run()` with `ThreadPoolExecutor`

### Finding 2: 🔴 CRITICAL — Chrome Performance Log Contention

**Files:** `backend/services/collector/interceptor.py`, `capabilities_v2/history_collector.py`

Both the **CollectorService** (continuous) and the **history subprocess** (per-request) call `driver.get_log('performance')` on the same Chrome instance. Chrome's performance log is a **single FIFO queue** — once consumed by one reader, entries are gone.

**Evidence:** `interceptor.py:_refresh_logs()` line 30 — `logs = self.driver.get_log('performance')`

### Finding 3: 🟡 HIGH — File Proliferation (One File Per Request)

**Files:** `history_utils.py:persist_history_csv()`, `history_collector.py:_save_csv()`

Both functions create a **new CSV file** with a timestamp in the filename for every single write operation. This caused 190+ files for a single asset before the user cleaned up.

**Impact:**
- `get_recent_history_file()` must glob and sort all files on every read
- Disk I/O overhead scales linearly with file count
- No deduplication — same candles written repeatedly

### Finding 4: 🟡 HIGH — No Chart Persistence Across Asset Switches

**Files:** `marketStore.js:setSelectedAsset()`, `useTickAggregation.js`

When the user switches assets:
1. `marketData` is cleared immediately (`marketData: {}`)
2. `candleSeries.setData([])` clears the chart
3. A new `loadHistory()` call is triggered
4. If bootstrap fails → empty chart, no way to recover previous data

**User Request:** "I need a chart persistence feature so I can switch between charts without needing to collect a new candle payload."

### Finding 5: 🟡 HIGH — `df.tail(limit)` on Reverse-Sorted Data

**File:** `history.py:get_history()` line 62

The CSV data from Pocket Option arrives in **reverse chronological order** (newest first). Using `df.tail(limit)` returns the **oldest** candles instead of the most recent ones when `limit < total_rows`.

**Impact:** Users may see stale candles instead of the most recent data.

### Finding 6: 🟢 MEDIUM — Alert Dispatcher Stale Data Handling

**File:** `otc_alert_dispatch.py:fetch_data()`

The alert dispatcher reads CSVs via `get_recent_history_file()` and has a 300-second stale threshold. Current issues:
- `CHUNK_SIZE` is 1000 ticks (too high for cold-start latency) — Q2 plan recommends 200
- Stale warnings log every scan cycle (no throttling) — Q2 plan recommends 60s throttle
- No API fallback when CSV is stale

**Note:** These are addressed in the `Mutli_Feature_Implementation_Plan_26-03-17.md` (Q2) but have not been implemented yet.

### Finding 7: 🟢 MEDIUM — Collector Service Also Persists History

**File:** `backend/services/collector/main.py:_process_history_events()`

The `CollectorService._run_loop()` calls `_process_history_events()` which intercepts history WebSocket payloads and writes them via `persist_history_csv()`. This means:
- History CSVs are written **both** by the collector service AND by the bootstrap subprocess
- Two independent writers to the same directory with no coordination
- Potential for duplicate/conflicting files

### Finding 8: 🟢 MEDIUM — AI Route Uses Subprocess for Indicator Injection

**File:** `backend/services/gateway/routes/ai.py:_inject_backend_indicators()`

The AI route spawns a **subprocess** (`runner.py indicator_calculator`) to calculate indicators for context injection. While the main indicator route (`indicators.py`) was already refactored to in-process (OPT-1), the AI route still uses the old subprocess pattern.

**Note:** This is a separate concern from the data persistence refactor but should be noted for future optimization.

---

## 3. Complete File Dependency Map

### 3.1 Backend — Writers (Produce Data)

| File | Function | Writes To | Trigger |
|------|----------|-----------|---------|
| `history_utils.py` | `persist_history_csv()` | `data/data_output/history/{asset}/` | Called by collector + history_collector |
| `history_utils.py` | `append_candle_to_history()` | Same CSV (append) | Called by `POST /append-candle` |
| `history_collector.py` | `_save_csv()` | `data/data_output/history/{asset}/` | Called during bootstrap |
| `collector/main.py` | `_process_history_events()` | Via `persist_history_csv()` | Continuous loop |
| `otc_alert_dispatch.py` | `TickLogger.flush()` | `data/ticks/{asset}/` | Every CHUNK_SIZE ticks |

### 3.2 Backend — Readers (Consume Data)

| File | Function | Reads From | Purpose |
|------|----------|------------|---------|
| `history.py` | `get_history()` | `get_recent_history_file()` | `GET /history/{asset}` |
| `history.py` | `bootstrap_history()` | Subprocess → interceptor | `POST /bootstrap-history` |
| `indicators.py` | `calculate_indicators()` | `get_recent_history_file()` | `POST /indicators` |
| `ai.py` | `_inject_backend_indicators()` | `get_recent_history_file()` | `POST /ai/ask` |
| `strategy.py` | `load_from_history()` | `get_recent_history_file()` | `POST /strategy/load-history` |
| `otc_alert_dispatch.py` | `fetch_data()` | `get_recent_history_file()` | Alert scanning loop |

### 3.3 Frontend — Consumers

| File | State Key | Trigger |
|------|-----------|---------|
| `marketStore.js` | `historyCandles`, `historyStatus` | `loadHistory()`, `setSelectedAsset()` |
| `useTickAggregation.js` | Reads `historyCandles`, `historyStatus` | Asset change, history load |
| `ChartWorkspace.jsx` | Reads `historyCandles`, `historyStatus`, calls `loadHistory()` | Mount, asset change |
| `AiInsightsPanel.jsx` | Reads `historyCandles` | AI context building |
| `AskAiModal.jsx` | Reads `historyCandles` | AI context building |
| `useAskAi.js` | Reads `historyCandles` | AI context building |
| `aiContext.js` | Reads `historyCandles` | AI context building |
| `StrategyLabChartWorkspace.jsx` | Reads `historyCandles`, `historyStatus` | Strategy Lab |

### 3.4 Central Utility (Single Point of Redirection)

| File | Functions | Status |
|------|-----------|--------|
| `backend/utils/history_utils.py` | `persist_history_csv()`, `get_recent_history_file()`, `append_candle_to_history()` | **PRIMARY REFACTOR TARGET** |
| `backend/utils/asset_utils.py` | `normalize_asset()` | ✅ Already canonical — no changes needed |

---

## 4. User Requirements & Decisions

### 4.1 Confirmed Requirements

| # | Requirement | Source |
|---|-------------|--------|
| R1 | Redirect all data persistence to `data/supabase_migration_data/` | User directive |
| R2 | Format data for easy Supabase/PostgreSQL import later | User directive |
| R3 | Keep data local for now (no cloud dependency) | User directive |
| R4 | Streamline history fetching for optimal chart retrieval | User directive |
| R5 | Link streaming ticks to candle payloads via session concept | User directive |
| R6 | Chart persistence — switch assets without re-collecting | User directive |
| R7 | Support all Pocket Option timeframes: 1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D | User directive |
| R8 | Keep streaming collector operational during refactor | User directive |

### 4.2 User Answers to Architecture Questions

| Question | Answer | Impact |
|----------|--------|--------|
| Tick storage priority? | Candles first. Streaming collector is working fine — keep it operational. | Phase tick persistence as follow-up |
| Historical data import? | Not high priority. Design migration script after implementation is solid. | No migration script in initial plan |
| Timeframes? | All available: 1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D | Schema must support multi-timeframe from day one |

### 4.3 Chart Persistence Feature (User Suggestion)

> "Linking to the Ticker Asset Panel. This indicates which data streams are being received and have not gone stale. If the User can select an asset there to maintain the already rendered data, without calling the HistoryCollector. The HistoryCollector or bootstrap_history() is linked to the '92% PAYOUT LIST'."

**Interpretation:**
- **Ticker Panel assets** (already streaming) should allow chart switching **without** triggering `bootstrap_history()`
- **Payout List assets** (from `refreshAssets()`) trigger the full bootstrap flow
- Frontend should cache `historyCandles` per asset and reuse on switch-back
- Stale indicator in Ticker Panel shows which assets have fresh data

---

## 5. Proposed Architecture

### 5.1 New Directory Structure

```
data/supabase_migration_data/
├── candles/                              ← Maps to future `candles` Supabase table
│   ├── AUDNZDOTC_1m.csv                 ← One file per asset+timeframe (append-only, deduped)
│   ├── AUDNZDOTC_5m.csv
│   ├── AUDNZDOTC_15m.csv
│   ├── EURUSDOTC_1m.csv
│   └── ...
├── ticks/                                ← Maps to future `ticks` Supabase table (Phase 2)
│   ├── AUDNZDOTC_2026-03-29.csv         ← One file per asset per day (append-only)
│   └── ...
├── sessions/                             ← Maps to future `collection_sessions` table
│   └── sessions.jsonl                    ← JSONL (one JSON object per line)
└── _metadata/                            ← Local-only operational metadata
    └── schema_version.json               ← Schema version for migration tooling
```

### 5.2 Architecture Diagram (Proposed)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PROPOSED DATA PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks asset (Ticker Panel — has data)                           │
│       → Reuse cached historyCandles[asset] ← NO bootstrap call         │
│       → Chart renders immediately from in-memory cache                 │
│                                                                         │
│  User clicks asset (Payout List — no data)                             │
│       → loadHistory(asset)                                             │
│       → GET /history/{asset}?tf=1                                      │
│            → data_store.read_candles(asset, tf)                        │
│            → Single file read: candles/AUDNZDOTC_1m.csv               │
│       → If 404: POST /bootstrap-history                                │
│            → IN-PROCESS HistoryCollector (no subprocess)               │
│            → Uses collector's existing interceptor (no log contention) │
│            → data_store.upsert_candles(asset, tf, candles)             │
│            → Returns candles directly                                  │
│                                                                         │
│  CollectorService (continuous)                                         │
│       → fetch_ticks() → Redis publish → frontend                      │
│       → fetch_history_events() → data_store.upsert_candles()          │
│                                                                         │
│  Alert Dispatcher                                                      │
│       → data_store.read_candles(asset, tf) → single file read         │
│       → Stale check against last candle timestamp                      │
│                                                                         │
│  Indicator Route                                                       │
│       → data_store.get_candle_path(asset, tf) → cache key             │
│       → In-process pipeline (already refactored — OPT-1)              │
│                                                                         │
│  SINGLE SOURCE OF TRUTH: backend/utils/data_store.py                  │
│       → All path resolution                                           │
│       → All read/write/upsert operations                              │
│       → Session ID generation                                          │
│       → Deduplication by timestamp                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **One file per asset+timeframe** | `candles/AUDNZDOTC_1m.csv` — append-only, deduped by timestamp |
| **O(1) chart retrieval** | Read one file, `df.tail(200)`, done. No globbing. |
| **Sorted ascending** | All candle files sorted oldest→newest (fixes `df.tail()` bug) |
| **Upsert semantics** | Same timestamp → update row. New timestamp → append. |
| **Session linkage** | `session_id` column connects candles to collection sessions |
| **Multi-timeframe ready** | Separate file per timeframe from day one |
| **Supabase-compatible** | Each CSV maps to a `COPY FROM` import command |

---

## 6. Data Schema Design (Supabase-Ready)

### 6.1 Candles Table (`candles/{ASSET}_{TF}.csv`)

```csv
timestamp,open,high,low,close,volume,session_id,source,created_at
1774638900,1.18412,1.18454,1.18366,1.18454,97,sess_abc123,history_capture,2026-03-27T17:24:07Z
1774638960,1.18454,1.18470,1.18440,1.18465,12,sess_abc123,tick_aggregation,2026-03-29T11:00:00Z
```

| Column | Type | Supabase Type | Purpose |
|--------|------|---------------|---------|
| `timestamp` | int (unix seconds) | `BIGINT` | Candle open time — **PRIMARY KEY** (with asset+tf) |
| `open` | float | `DOUBLE PRECISION` | Open price |
| `high` | float | `DOUBLE PRECISION` | High price |
| `low` | float | `DOUBLE PRECISION` | Low price |
| `close` | float | `DOUBLE PRECISION` | Close price |
| `volume` | float | `DOUBLE PRECISION` | Tick volume |
| `session_id` | string | `TEXT` | Links to collection session |
| `source` | string | `TEXT` | `history_capture` / `tick_aggregation` / `collector_intercept` |
| `created_at` | ISO8601 | `TIMESTAMPTZ` | When this row was written |

**Constraints:**
- Sorted ascending by `timestamp`
- Deduplicated by `timestamp` (upsert: update if exists, append if new)
- `source` tracks provenance for data quality auditing

### 6.2 Sessions Table (`sessions/sessions.jsonl`)

```json
{"session_id":"sess_abc123","asset":"AUDNZDOTC","timeframe":"1m","started_at":"2026-03-27T17:24:07Z","candle_count":100,"source":"history_capture","status":"complete","duration_ms":3200}
{"session_id":"sess_def456","asset":"EURUSDOTC","timeframe":"5m","started_at":"2026-03-29T10:00:00Z","candle_count":0,"source":"history_capture","status":"failed","error_code":"manual_click_timeout"}
```

| Field | Type | Purpose |
|-------|------|---------|
| `session_id` | string | Unique session identifier |
| `asset` | string | Normalized asset name |
| `timeframe` | string | e.g. `1m`, `5m`, `1h` |
| `started_at` | ISO8601 | Session start time |
| `candle_count` | int | Number of candles captured |
| `source` | string | `history_capture` / `collector_intercept` |
| `status` | string | `complete` / `failed` / `partial` |
| `error_code` | string? | Error code if failed |
| `duration_ms` | int? | Collection duration |

### 6.3 Ticks Table (`ticks/{ASSET}_{DATE}.csv`) — Phase 2

```csv
timestamp,price,session_id,source
1774638901.234,1.18420,sess_abc123,live_stream
1774638901.567,1.18422,sess_abc123,live_stream
```

**Note:** Tick persistence is deferred to Phase 2 per user decision. The streaming collector continues writing to `data/ticks/` via the existing `TickLogger` in `otc_alert_dispatch.py`. The schema is defined here for future alignment.

### 6.4 Schema Version (`_metadata/schema_version.json`)

```json
{
  "version": 1,
  "created_at": "2026-03-29T11:00:00Z",
  "description": "Initial Supabase-ready local schema",
  "supported_timeframes": ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]
}
```

### 6.5 Supported Timeframes

| Timeframe | File Suffix | Candle Interval (seconds) |
|-----------|-------------|---------------------------|
| 1 minute | `_1m.csv` | 60 |
| 3 minutes | `_3m.csv` | 180 |
| 5 minutes | `_5m.csv` | 300 |
| 15 minutes | `_15m.csv` | 900 |
| 30 minutes | `_30m.csv` | 1800 |
| 1 hour | `_1h.csv` | 3600 |
| 4 hours | `_4h.csv` | 14400 |
| 1 day | `_1d.csv` | 86400 |

---

## 7. Chart Persistence Feature

### 7.1 Problem Statement

Currently, switching assets in the dashboard:
1. Clears `marketData` immediately
2. Clears the chart series
3. Triggers a new `loadHistory()` call
4. If bootstrap fails → empty chart with no recovery

### 7.2 Proposed Solution

**Frontend Cache Strategy:**
- `historyCandles` in `marketStore` already caches per-asset: `historyCandles[asset] = candles`
- **Do NOT clear** `historyCandles` on asset switch — only clear `marketData` (live ticks)
- On switch-back to a previously loaded asset, reuse `historyCandles[asset]` immediately
- Only call `loadHistory()` if `historyStatus[asset]` is `undefined` (never loaded)

**Ticker Panel Integration:**
- Assets in the Ticker Panel that are actively streaming have `marketData[assetKey]` populated
- When user clicks a Ticker Panel asset → check `historyCandles[asset]` first
- If cached → render immediately, no bootstrap
- If not cached → `GET /history/{asset}` (fast single-file read from new store)
- Only trigger `POST /bootstrap-history` if no local data exists at all

**Payout List Integration:**
- The "92% Payout List" (`refreshAssets()`) is the trigger for bootstrap collection
- These assets may not have any local data yet
- Full `loadHistory()` flow applies (check local → bootstrap if needed)

**Stale Data Indicator:**
- Ticker Panel shows a freshness indicator per asset
- Based on `lastTickTimestamp` or last candle timestamp vs. current time
- Green = fresh (<60s), Yellow = aging (60-300s), Red = stale (>300s)

### 7.3 Implementation Changes (Frontend)

| File | Change |
|------|--------|
| `marketStore.js:setSelectedAsset()` | Remove `marketData: {}` clear; keep `historyCandles` cache |
| `marketStore.js:loadHistory()` | Add early return if `historyCandles[asset]` exists and `historyStatus[asset] === 'loaded'` |
| `useTickAggregation.js` | Remove `candleSeries.setData([])` on asset change if cached data exists |
| `ChartWorkspace.jsx` | Check cache before calling `loadHistory()` |

---

## 8. Implementation Scope

### Phase 1: Data Layer Foundation
- [x] Create `backend/utils/data_store.py` — Single Source of Truth
  - `get_candle_path(asset, timeframe_str) → Path`
  - `read_candles(asset, timeframe_str, limit) → List[Dict]`
  - `upsert_candles(asset, timeframe_str, candles, session_id, source) → int`
  - `get_session_path() → Path`
  - `log_session(session_data) → None`
  - `generate_session_id() → str`
  - `timeframe_to_str(minutes) → str` (e.g. `1 → "1m"`, `60 → "1h"`)
- [x] Create directory structure under `data/supabase_migration_data/`
- [x] Create `_metadata/schema_version.json`
- [x] Unit tests for `data_store.py`

### Phase 2: History Route Refactor (Core Bug Fix)
- [x] Refactor `history.py:get_history()` to use `data_store.read_candles()`
- [~] Refactor `history.py:bootstrap_history()` — **in-process execution** (no subprocess)
  - Import `HistoryCollector` directly
  - Use `asyncio.to_thread()` (same pattern as `indicators.py` OPT-1)
  - Write results via `data_store.upsert_candles()`
- [x] Refactor `history.py:append_candle()` to use `data_store.upsert_candles()`
- [x] Fix `df.tail(limit)` bug — data now sorted ascending, tail is correct
- [x] Add session logging for every bootstrap attempt

### Phase 3: Update All Backend Consumers
- [x] `indicators.py` — Use `data_store.get_candle_path()` for CSV lookup
- [x] `ai.py` — Use `data_store.get_candle_path()` for history file lookup
- [x] `strategy.py:load_from_history()` — Use `data_store.get_candle_path()`
- [~] `otc_alert_dispatch.py:fetch_data()` — Use `data_store.read_candles()`
- [x] `collector/main.py:_process_history_events()` — Use `data_store.upsert_candles()`
- [x] `history_collector.py:_save_csv()` — Use `data_store.upsert_candles()`

### Phase 4: Deprecate Old Utilities
- [~] `history_utils.py:persist_history_csv()` — Redirect to `data_store.upsert_candles()` with deprecation warning
- [~] `history_utils.py:get_recent_history_file()` — Redirect to `data_store.get_candle_path()` with deprecation warning
- [~] `history_utils.py:append_candle_to_history()` — Redirect to `data_store.upsert_candles()` with deprecation warning
- [x] Keep old functions as thin wrappers for backward compatibility during transition

### Phase 5: Frontend — Chart Persistence & Stabilization
- [x] `marketStore.js:setSelectedAsset()` — Preserve `historyCandles` cache on asset switch
- [x] `marketStore.js:loadHistory()` — Early return if cached data exists
- [~] `useTickAggregation.js` — Skip chart clear if cached data available
- [x] Add retry with exponential backoff in `loadHistory()` (max 3 attempts)
- [x] Improve loading state feedback (toast on timeout instead of console.warn)
- [x] Add user-facing notification when bootstrap is needed vs. cache hit

### Phase 6: Verification & Hardening
- [x] Backend regression suite (`pytest backend/tests/`)
- [ ] Test multi-asset sequential loading
- [ ] Test asset switch-back (cache hit path)
- [ ] Test with collector running simultaneously (no log contention)
- [ ] Test all timeframes (1m through 1d)
- [ ] Verify CSV data ordering (ascending)
- [ ] Verify upsert deduplication

---

## 9. Files Touched Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/utils/data_store.py` | **Single Source of Truth** — all data path resolution + read/write |
| `data/supabase_migration_data/_metadata/schema_version.json` | Schema version metadata |
| `backend/tests/test_data_store.py` | Unit tests for data_store |

### Modified Files

| File | Change Type | Description |
|------|------------|-------------|
| `backend/utils/history_utils.py` | MODIFY | Redirect functions to `data_store`, add deprecation warnings |
| `backend/services/gateway/routes/history.py` | MODIFY | In-process bootstrap, use `data_store` for read/write |
| `backend/services/gateway/routes/indicators.py` | MODIFY | Use `data_store.get_candle_path()` for CSV lookup |
| `backend/services/gateway/routes/ai.py` | MODIFY | Use `data_store.get_candle_path()` for history lookup |
| `backend/services/gateway/routes/strategy.py` | MODIFY | Use `data_store.get_candle_path()` in `load_from_history()` |
| `backend/services/collector/main.py` | MODIFY | Use `data_store.upsert_candles()` in `_process_history_events()` |
| `backend/scripts/otc_alert_dispatch.py` | MODIFY | Use `data_store.read_candles()` in `fetch_data()` |
| `capabilities_v2/history_collector.py` | MODIFY | Use `data_store.upsert_candles()` in `_save_csv()` |
| `gui/Dashboard/src/store/marketStore.js` | MODIFY | Chart persistence cache, retry logic |
| `gui/Dashboard/src/hooks/useTickAggregation.js` | MODIFY | Skip chart clear on cached asset switch |

### Untouched Files (No Changes Needed)

| File | Reason |
|------|--------|
| `backend/utils/asset_utils.py` | Already canonical — no changes |
| `backend/models/errors.py` | Error codes remain valid |
| `gui/Dashboard/src/utils/chartData.js` | `prepareChartData()` is format-agnostic |
| `gui/Dashboard/src/utils/time.js` | `normalizeTimestamp()` unchanged |
| `gui/Dashboard/src/components/ChartWorkspaceOverlays.jsx` | Loading overlay unchanged |

---

## 10. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Breaking existing indicator cache | HIGH | LOW | `data_store.get_candle_path()` returns same `Path` type; indicator cache key unchanged |
| Collector service disruption during refactor | HIGH | MEDIUM | Keep `history_utils.py` as thin wrappers during transition; collector continues working |
| In-process bootstrap Chrome contention | MEDIUM | LOW | Share collector's existing interceptor instance; no new Selenium session |
| Data loss during transition | LOW | LOW | Old data already backed up by user; new store starts fresh |
| Alert dispatcher stale data during transition | MEDIUM | MEDIUM | `data_store.read_candles()` returns empty list (same as current stale behavior) |
| Frontend cache memory growth | LOW | LOW | `historyCandles` limited to ~200 candles per asset; typical session has <20 assets |
| Multi-timeframe file naming collision | LOW | LOW | Deterministic naming: `{ASSET}_{TF}.csv` — no timestamp in filename |

---

## 11. Open Questions Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Tick storage from day one? | **No.** Candles first. Streaming collector keeps working. Tick persistence is Phase 2. |
| Q2 | Migrate old CSVs? | **Not now.** User backed up data. Migration script designed after implementation is solid. |
| Q3 | Multiple timeframes? | **Yes.** All 8 timeframes supported from day one: 1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D. |
| Q4 | Chart persistence approach? | **Frontend cache.** Ticker Panel assets reuse cached data. Payout List triggers bootstrap. |
| Q5 | Collector running during history load? | **Both supported.** In-process bootstrap shares collector's interceptor. Warning notification if collector not running. |

---

## 12. Reviewer Sign-Off Criteria

Before the Implementation Plan is compiled, the following must be confirmed:

### Architecture Decisions (Developer Review Required)

- [ ] **Data store location confirmed:** `data/supabase_migration_data/candles/`
- [ ] **Schema columns confirmed:** timestamp, open, high, low, close, volume, session_id, source, created_at
- [ ] **One-file-per-asset-timeframe model confirmed** (append-only, deduped)
- [ ] **In-process bootstrap approach confirmed** (no subprocess)
- [ ] **Chart persistence approach confirmed** (frontend cache, no re-bootstrap on switch-back)
- [ ] **Timeframes confirmed:** 1M, 3M, 5M, 15M, 30M, 1H, 4H, 1D
- [ ] **Phase ordering confirmed:** Data Layer → History Route → Consumers → Deprecation → Frontend → Verification

### Quality Gates (Per PHASE_REVIEW_PROTOCOL.md)

Each implementation phase will require:
1. @Reviewer incremental review after completion
2. Backend regression suite pass (`pytest backend/tests/`)
3. Explicit user command to proceed to next phase

---

## Appendix A: Comparison — Current vs. Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Files per asset** | 190+ (one per request) | 1 per timeframe (append-only) |
| **Chart load time** | 2-5s (subprocess + glob) | <100ms (single file read) |
| **Bootstrap method** | Subprocess spawn | In-process `asyncio.to_thread()` |
| **Chrome log contention** | Two independent readers | Shared interceptor instance |
| **Data deduplication** | None | Upsert by timestamp |
| **Sort order** | Reverse (newest first) | Ascending (oldest first) |
| **Timeframe support** | 1m only (practical) | 8 timeframes |
| **Supabase migration** | Manual CSV transformation | Direct `COPY FROM` import |
| **Chart persistence** | None (clears on switch) | In-memory cache per asset |
| **Session tracking** | None | JSONL session log |

## Appendix B: Tick Aggregation Comparison

The user asked to compare `useTickAggregation.js` (frontend) with `otc_alert_dispatch.py` (backend) tick handling:

| Aspect | `useTickAggregation.js` | `otc_alert_dispatch.py` |
|--------|------------------------|------------------------|
| **Purpose** | Real-time chart rendering | Alert scanning & tick logging |
| **Input** | Socket.IO `market_data` events | Redis `market_data` channel |
| **Aggregation** | Per-tick → candle buckets (timeframe-aware) | `TickLogger` with CHUNK_SIZE flush |
| **Persistence** | In-memory only (chart series) | CSV files in `data/ticks/` |
| **Stale handling** | 10s safety timeout | 300s STALE_THRESHOLD |
| **Volume** | Tick count per candle | Tick count per chunk |
| **Chunk size** | N/A (continuous) | 1000 (recommended: 200 per Q2 plan) |

**Key Insight:** The frontend aggregates ticks into candles for display; the backend logs raw ticks for analysis. These are complementary, not competing. The proposed `data_store` will eventually unify both under the same schema (candles table + ticks table).

---

*Report compiled by @Investigator + @Reviewer. Ready for developer review.*  
*Next step: Developer confirms architecture decisions → Compile Implementation Plan.*
