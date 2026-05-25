# History Payload Flow Robustness & Timeframe Fixes — Implementation Plan

This plan addresses the runtime issue where history candles fail to load from the payload (especially on non-1m timeframes) and implements the task requirements to make history collection extremely robust, deterministic, and explicit for exactly ~100 candles.

## User Review Required

> [!IMPORTANT]
> To fully fix non-1m timeframe history collection, we must modify the background collector service (`backend/services/collector/main.py`). The current service hardcodes `timeframe_min = 1`, which corrupts `1m` candles with `5m`/`15m` payloads and blocks correct timeframes. We propose adding dynamic timeframe detection to the collector daemon.

> [!WARNING]
> Spawning the `history_collector` fallback via subprocess runner when the background collector fails introduces a short wait (up to 15s) in the UI during a fresh bootstrap, but guarantees data is captured.

## Proposed Changes

---

### Backend Collector & Data Store

#### [MODIFY] [main.py](file:///c:/QuFLX/v2/backend/services/collector/main.py)
- Implement `detect_timeframe_minutes(candles)` helper using candle timestamp deltas.
- Update `_process_history_events()` to dynamically detect timeframe rather than hardcoding `timeframe_min = 1`.
- Reject/skip events containing candles with invalid or zero timestamps.

#### [MODIFY] [data_store.py](file:///c:/QuFLX/v2/backend/utils/data_store.py)
- Ensure `read_candles` handles `limit` parameter strictly to return exactly the most recent `limit` candles.
- Update `upsert_candles` to add an early validation guard: reject timestamps less than `1,000,000,000` (Unix epoch seconds) to prevent `0` timestamp corruptions.

---

### Backend Gateway Routing

#### [MODIFY] [history.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/history.py)
- Update `get_history` route parameter to accept `num_candles: int = 100` (keeping `limit` as a backward-compatible alias).
- Update `bootstrap_history` route to extract `num_candles` (default 100) from the payload body.
- Implement `_run_history_collector_capability` helper to spawn `runner.py history_collector` as an asynchronous subprocess.
- Implement a robust fallback in `bootstrap_history`: if `_poll_for_fresh_candles` times out, trigger on-demand collection via `_run_history_collector_capability` and poll again before raising an error.

---

### Capabilities

#### [MODIFY] [history_collector.py](file:///c:/QuFLX/v2/capabilities_v2/history_collector.py)
- Update `_collect_and_save` and `_collect_only` to poll the data store first for updates before reading performance logs, avoiding Chrome logs contention if the background collector service is running.
- Add `ts < 1000000000` validation check inside `_parse_candles` and `_parse_history_payload`.

---

### Frontend State & Chart

#### [MODIFY] [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)
- Update `loadHistory(asset, numCandles = 100)` to query `/api/v1/history/{asset}` using `num_candles=${numCandles}` query parameter.
- Update `bootstrapHistoryForAsset(asset, options = {})` to pass `num_candles` (default 100) in the body payload.

#### [MODIFY] [ChartWorkspace.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartWorkspace.jsx)
- Ensure the initial load and force refreshes query exactly 100 candles.

## Verification Plan

### Automated Tests
Run history, datastore, and route verification suites:
```powershell
conda run -n QuFLX-v2 python -m pytest backend/tests/test_data_store.py -v
conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v
conda run -n QuFLX-v2 python -m pytest backend/tests/test_validation.py -v
```

### Manual Verification
1. Open the UI, switch timeframe to `5m`.
2. Clear cache / select a new asset.
3. Verify that the `5m` history is fetched and populated, and that no `1m` history is corrupted with 5m candles.
4. Verify the chart displays exactly 100 candles.
5. Check backend logs to confirm:
   - Timeframe detection logs correct timeframe.
   - Fallback is executed when collector is offline.
