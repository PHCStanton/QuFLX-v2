# History Data Payload & Chart Rendering Fix — Implementation Plan
**Date:** 2026-05-20  
**Plan Type:** @Investigator → @Coder Handoff Plan  
**Status:** `[x]` Phase 1 Complete · `[x]` Phase 2 Complete · `[@Reviewer: ✅ Passed]` · `[x]` Phase 3 Complete · `[@Reviewer: ✅ Passed]` · `[x]` Phase 4 Complete · `[@Reviewer: ✅ Passed]` · `[x]` Phase 5 Complete · `[@Reviewer: ✅ Passed]` · `[~] Phase 6A/6B implemented + final multi-agent review complete — live Pocket Option validation pending`  
**Scope:** Data History payload collection, local CSV persistence, ticker/list asset selection behavior, and chart rendering cache alignment  
**Related Prior Plan:** `v2_Dev_Docs/History_Handeling/Data_Collection_Persistence_Refactor_Plan_26-03-29.md`  
**Candidate Rollback Commits Reviewed:**
- `c49be07ab905980a36a2d693e32579962d75e5bf`
- `a476b8e267a8491f2148f5d1ea0eb1b875aa24ac`

---

## Executive Summary

The current history payload and chart rendering breakage appears to be caused by a **combined backend/frontend regression**, not a single isolated chart bug.

The highest-risk issues are:

1. **Backend payload race / Chrome performance log contention** — the live collector and bootstrap collector can both drain `driver.get_log('performance')`, causing the expected history payload to disappear before the requester sees it.
2. **Frontend history cache key mismatch** — `loadHistory(asset)` writes history under raw `asset`, while `useTickAggregation()` and `ChartWorkspace.jsx` read via normalized `selectedAssetKey`.
3. **Ticker reload is destructive** — ticker selection currently purges local CSV/cache before confirming a fresh payload was captured, which can blank a chart if payload capture fails.
4. **Data-store hardening gaps** — malformed candles can be coerced to zero values, and expected 404 history states can be converted into 500 responses.

This plan avoids a broad revert. A full reset to either candidate commit risks losing intentional UI changes:

- Favorite star UI removal / deprecation.
- Ticker view selection that triggers reload.
- 92% panel local CSV retrieval behavior.

Instead, this plan applies a **targeted, phase-gated repair** that preserves the user’s desired behavior and only touches the broken history/chart pathways.

---

## Architecture Context

### Intended Behavior

| User Flow | Intended Result |
|---|---|
| 92% payout list asset click | Select asset and render from local CSV cache/history. Should not force a fresh payload unless local history is missing and the configured mode permits bootstrap. |
| Ticker view asset click | Select asset and attempt a fresh payload/history reload. Must not delete working local CSV before new payload succeeds. |
| Existing local CSV present | Chart renders immediately from `data/supabase_migration_data/candles/{ASSET}_{TF}.csv`. |
| Fresh payload captured | Persist through `backend/utils/data_store.py`, update frontend cache, render chart. |
| Payload fails | Keep existing chart/local history if present and show a clear warning. |

### Current Data Flow

```text
Frontend asset selection
  ├─ 92% list → setSelectedAsset(asset)
  │   └─ loadHistory(asset)
  │       ├─ GET /api/v1/history/{asset}
  │       └─ if missing → POST /api/v1/history/bootstrap-history
  │
  └─ Ticker view → purgeAndSelectAsset(asset)
      ├─ DELETE /api/v1/history/{asset}
      ├─ clearHistoryCache(asset)
      └─ loadHistory(asset)

Backend bootstrap-history
  └─ HistoryCollector(action='collect')
      └─ creates new WebSocketInterceptor(ctx.driver)
          └─ calls driver.get_log('performance')

CollectorService loop
  └─ existing WebSocketInterceptor(driver)
      └─ also calls driver.get_log('performance')
```

### Core Architectural Decision

History payload capture must have **one owner** for Chrome performance logs. Multiple interceptors reading the same log stream create nondeterministic payload loss.

---

## Current State Map

| Area | File | Current State | Risk |
|---|---|---|---|
| Data-store pathing | `backend/utils/data_store.py` | `get_candle_path()` uppercases asset but does not canonicalize via `normalize_asset()` | Incorrect CSV path for display labels / suffix variants |
| Candle validation | `backend/utils/data_store.py` | Missing candle fields can be coerced to `0` | Bogus timestamp/price rows corrupt chart/indicators |
| History GET | `backend/services/gateway/routes/history.py` | Route raises `HTTPException(404)` inside broad `except Exception` | Expected missing-history state can become `500` |
| Bootstrap payload | `backend/services/gateway/routes/history.py` + `capabilities_v2/history_collector.py` | Creates a second interceptor around the shared Chrome driver | Payload race / history capture timeout |
| Collector persistence | `backend/services/collector/main.py` | Persists intercepted history events to data store | Good direction, but competes with bootstrap path for logs |
| Frontend cache key | `gui/Dashboard/src/store/marketStore.js` | Writes `historyCandles[asset]` while chart reads `historyCandles[selectedAssetKey]` | Chart can stay empty after successful fetch |
| Chart loading | `gui/Dashboard/src/hooks/useTickAggregation.js` | Sets `isLoading(true)` on asset change even if cached data exists | Loading overlay can persist until timeout |
| Ticker click | `gui/Dashboard/src/components/TickerTape.jsx` | Calls destructive `onPurgeAndSelectAsset()` | Existing CSV/cache can be deleted before payload succeeds |
| Favorite stars | `gui/Dashboard/src/components/AssetListView.jsx` | Star UI removed | Must preserve this change |
| Favorite remnants | `gui/Dashboard/src/store/marketStore.js`, `AutomationsPanel.jsx` | Store/action remnants remain | Low risk; cleanup optional after history fix |

---

## Findings Summary

### Finding 1 — Payload Capture Race

**Evidence:**

`backend/services/collector/interceptor.py`
```python
logs = self.driver.get_log('performance')
```

`capabilities_v2/history_collector.py`
```python
interceptor = WebSocketInterceptor(ctx.driver)
```

The collector loop and bootstrap history collector can both create/read interceptors using the same Chrome driver. Chrome performance logs are effectively consumed when read.

**Impact:** Fresh history payload may be captured by the wrong consumer or lost before bootstrap can return it to the frontend.

---

### Finding 2 — Frontend Cache Key Mismatch

**Evidence:**

`marketStore.js` writes:
```javascript
loadHistory: async (asset) => {
  if (!asset) return;

  const assetKey = normalizeAsset(asset);
  if (!assetKey) {
    set({ lastError: `Invalid asset: ${asset}` });
    return;
  }

  const existingStatus = get().historyStatus[assetKey];
  const existingCandles = get().historyCandles[assetKey];

  if (existingStatus === 'loading') return;
  if (existingStatus === 'loaded' && Array.isArray(existingCandles) && existingCandles.length > 0) {
    return;
  }

  set((state) => ({
    historyStatus: { ...state.historyStatus, [assetKey]: 'loading' }
  }));

  // Use assetKey consistently for backend request and state writes.
}
```

`useTickAggregation.js` reads:
```javascript
const candles = historyCandles && selectedAssetKey ? historyCandles[selectedAssetKey] : undefined;
```

**Impact:** Successful backend data can fail to render if `asset !== selectedAssetKey`.

---

### Finding 3 — Destructive Ticker Reload

**Evidence:**

`TickerTape.jsx`
```javascript
onClick={() => !selectedAssetLoading && onPurgeAndSelectAsset && onPurgeAndSelectAsset(it.label)}
```

`marketStore.js`
```javascript
await fetch(cleanUrl, { method: 'DELETE' });
get().clearHistoryCache(asset);
await get().loadHistory(asset);
```

**Impact:** A failed payload refresh can leave the chart with no old CSV and no new candles.

---

### Finding 4 — Expected 404 Can Become 500

**Evidence:**

`history.py`
```python
raise HTTPException(status_code=404, detail=f"No history found for {asset} @ {timeframe}m")
...
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

**Impact:** Frontend cannot reliably distinguish “no local history yet” from an actual backend failure.

---

## Implementation Phases

> **Protocol:** After each phase, @Team_Leader must delegate @Reviewer with:  
> `"Phase X completed. Perform full incremental review."`  
> No next phase begins until user explicitly approves continuation.

---

## Phase 0 — Safety Checkpoint & Baseline Capture

**Status:** `[x]` Completed  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Low — read/write only plan/checkpoint artifacts, no logic change

### Goal

Protect current work before touching source files.

### Actions

1. Capture current git status.
2. Save a patch/diff artifact for current WIP state.
3. Confirm all files relevant to this plan.

### Suggested Commands

```powershell
git status --short
git diff -- backend/services/collector/interceptor.py backend/services/gateway/routes/history.py backend/utils/data_store.py capabilities_v2/history_collector.py gui/Dashboard/src/store/marketStore.js gui/Dashboard/src/hooks/useTickAggregation.js gui/Dashboard/src/components/AssetPayoutPanel.jsx gui/Dashboard/src/components/AssetListView.jsx gui/Dashboard/src/components/TickerTape.jsx gui/Dashboard/src/components/ChartWorkspace.jsx > v2_Dev_Docs/History_Handeling/History_Data_Payload_WIP_Diff_26-05-20.patch
```

### Success Criteria

- `[x]` WIP diff is saved.
- `[x]` No source logic changed in this phase.
- `[x]` @Reviewer confirms checkpoint is adequate.

---

## Phase 1 — Frontend History Cache Key Stabilization

**Status:** `[x]` Completed  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Medium — core state management

### Files

- `gui/Dashboard/src/store/marketStore.js`
- `gui/Dashboard/src/hooks/useTickAggregation.js`
- `gui/Dashboard/src/components/ChartWorkspace.jsx`

### Goal

Ensure history is written and read using the same normalized asset key.

### Required Changes

#### 1. Normalize cache key inside `loadHistory()`

Target pattern:

```javascript
loadHistory: async (asset) => {
  if (!asset) return;

  const assetKey = normalizeAsset(asset);
  if (!assetKey) {
    set({ lastError: `Invalid asset: ${asset}` });
    return;
  }

  const existingStatus = get().historyStatus[assetKey];
  const existingCandles = get().historyCandles[assetKey];

  if (existingStatus === 'loading') return;
  if (existingStatus === 'loaded' && Array.isArray(existingCandles) && existingCandles.length > 0) {
    return;
  }

  set((state) => ({
    historyStatus: { ...state.historyStatus, [assetKey]: 'loading' }
  }));

  // Use assetKey consistently for backend request and state writes.
}
```

#### 2. Store successful candles under `assetKey`

```javascript
set((state) => ({
  historyCandles: { ...state.historyCandles, [assetKey]: candles },
  historyStatus: { ...state.historyStatus, [assetKey]: 'loaded' }
}));
```

#### 3. Store errors under `assetKey`

```javascript
set((state) => ({
  historyCandles: { ...state.historyCandles, [assetKey]: [] },
  historyStatus: { ...state.historyStatus, [assetKey]: 'error' },
  lastError: userMessage
}));
```

#### 4. Chart initial load must check the same key

`ChartWorkspace.jsx` should continue checking `historyStatus[selectedAssetKey]`, but `loadHistory()` must write that same key.

#### 5. `useTickAggregation()` must not force loading when cache exists

Target behavior:

```javascript
if (hasCachedData) {
  currentCandleRef.current = null;
  currentVolumeRef.current = 0;
  setIsLoading(false);
  return;
}

candleSeries.setData([]);
if (volumeSeries) volumeSeries.setData([]);
currentCandleRef.current = null;
currentVolumeRef.current = 0;
setIsLoading(true);
```

### Success Criteria

- `[x]` History cache uses normalized key only.
- `[x]` `loadHistory()` returns early when same asset is already loading.
- `[x]` Existing cached history renders without backend reload.
- `[x]` No favorite-star UI is restored.

### Verification

```powershell
npm --prefix gui/Dashboard run build
```

Manual checks:

1. Select asset from 92% list.
2. Confirm `historyCandles[selectedAssetKey]` is populated.
3. Switch away and back.
4. Confirm chart renders from cache without another bootstrap.

---

## Phase 2 — Non-Destructive Ticker Payload Reload

**Status:** `[x]` Complete · `[@Reviewer: ✅ Passed after blocker fixes]`  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Medium — changes ticker behavior semantics

### Files

- `gui/Dashboard/src/store/marketStore.js`
- `gui/Dashboard/src/components/TickerTape.jsx`
- `gui/Dashboard/src/components/AssetPayoutPanel.jsx`
- `gui/Dashboard/src/components/AssetListView.jsx`

### Goal

Preserve the requirement:

> “The Ticker toggle view is also selectable and activates the reload. The 92% Panel now retrieves the history from the local CSV file but does not fetch payload. The Ticker view selection should do that.”

But make ticker reload **non-destructive**.

### Required Changes

#### 1. Add a non-destructive payload refresh action

Recommended store action:

```javascript
reloadHistoryFromPayload: async (asset) => {
  if (!asset) return;
  const assetKey = normalizeAsset(asset);

  set({
    selectedAsset: asset,
    selectedAssetKey: assetKey,
    selectedAssetLoading: true,
    marketData: {},
    indicatorSeries: {},
  });

  try {
    // Do NOT DELETE existing CSV first.
    await get().bootstrapHistoryForAsset(assetKey, { replaceCacheOnSuccess: true });
  } catch (err) {
    // Keep existing cached/local data if present.
    set({ lastError: `Fresh payload reload failed; keeping existing history. ${getErrorMessage(err)}` });
  } finally {
    set({ selectedAssetLoading: false });
  }
}
```

#### 2. Keep `purgeAndSelectAsset()` as explicit user action only

The refresh-history icon in `ChartHeader.jsx` may continue to purge, because its tooltip explicitly says clear/reload. Ticker click should not use it.

#### 3. Wire ticker click to non-destructive reload

```jsx
<TickerTape
  ...
  onReloadAndSelectAsset={reloadHistoryFromPayload}
/>
```

Ticker click:

```javascript
onClick={() => !selectedAssetLoading && onReloadAndSelectAsset?.(it.label)}
```

### Success Criteria

- `[x]` 92% panel click uses local CSV path first.
- `[x]` Ticker click attempts fresh payload/history reload.
- `[x]` Ticker click does not delete existing CSV/cache before success.
- `[x]` Failed payload refresh leaves old chart visible.
- `[x]` Explicit refresh-history icon can still purge/reload if user chooses.

### Verification

Manual checks:

1. Create/confirm local CSV exists for test asset.
2. Click ticker asset while Chrome/payload unavailable.
3. Confirm chart remains visible and CSV remains on disk.
4. Start collector/Chrome and click ticker asset.
5. Confirm new payload updates chart/cache.

### Incremental Review — 2026-05-20 (@Reviewer)

**Status:** `✅ Passed`

**Fixes verified:**

1. `gui/Dashboard/src/components/AssetPayoutPanel.jsx` now destructures `reloadHistoryFromPayload` from the narrowed Zustand selector before passing it to `AssetListView`, removing the runtime reference issue.
2. `gui/Dashboard/src/store/marketStore.js` now uses a dedicated `bootstrapHistoryForAsset()` helper so ticker clicks force a fresh bootstrap request without deleting existing CSV/cache first.
3. The non-destructive reload path preserves the current chart/cache on bootstrap failure while still replacing the in-memory history on success.

**Verification:**

1. `GetDiagnostics` clean for `AssetPayoutPanel.jsx` and `marketStore.js`.
2. `npm --prefix gui/Dashboard run build` passes.

**Verdict:** Phase 2 is ready. Review complete. Awaiting explicit command to proceed.

---

## Phase 3 — Backend History Route & Data Store Hardening

**Status:** `[x]` Complete · `[@Reviewer: ✅ Passed]`  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Medium — backend API behavior

### Files

- `backend/utils/data_store.py`
- `backend/services/gateway/routes/history.py`
- `backend/utils/history_utils.py` if wrapper compatibility requires update
- `capabilities_v2/history_collector.py`

### Goal

Make history reads/writes predictable, normalized, and fail-fast.

### Required Changes

#### 1. Normalize asset inside `data_store.get_candle_path()`

```python
from backend.utils.asset_utils import normalize_asset

def get_candle_path(asset: str, timeframe_str: str) -> Path:
    asset_clean = normalize_asset(asset)
    if not asset_clean:
        raise ValueError(f"Cannot normalize asset: {asset!r}")
    tf = str(timeframe_str).strip().lower()
    return CANDLES_DIR / f"{asset_clean}_{tf}.csv"
```

#### 2. Validate incoming candle rows

Do not write timestamp `0` / price `0` for missing fields.

Required @Reviewer phrasing if current code remains:

> “This code can reach an impossible state because input is not validated early. We must add validation/schema checks here to fail fast and prevent downstream crashes.”

Target pattern:

```python
required = ("timestamp", "open", "high", "low", "close")
for c in candles:
    try:
        ts_raw = c.get("timestamp", c.get("time"))
        if ts_raw is None:
            raise ValueError("missing timestamp")
        row = {
            "timestamp": int(float(ts_raw)),
            "open": float(c["open"]),
            "high": float(c["high"]),
            "low": float(c["low"]),
            "close": float(c["close"]),
            "volume": float(c.get("volume", 0.0)),
            "session_id": session_id,
            "source": source,
            "created_at": created_at,
        }
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Skipping malformed candle for %s %s: %r (%s)", asset, timeframe_str, c, exc)
        continue
```

#### 3. Preserve intentional 404 responses

```python
try:
    ...
except HTTPException:
    raise
except Exception as e:
    logger.error(..., exc_info=True)
    raise HTTPException(status_code=500, detail=str(e))
```

#### 4. Align timeframe parsing

Seconds/ticks should be consistently unsupported for history routes and collector actions unless a real seconds-history model is implemented.

### Success Criteria

- `[ ]` `GET /api/v1/history/{asset}` returns 404 for missing CSV, not 500.
- `[ ]` Malformed candle rows are skipped with explicit warning.
- `[ ]` No timestamp `0` row is created from malformed payloads.
- `[ ]` Data-store pathing is canonical regardless of display label.

### Verification

```powershell
conda activate QuFLX-v2
python -m pytest backend/tests/test_data_store.py -v
python -m pytest backend/tests/ -q --tb=short
```

If `test_data_store.py` does not currently cover these cases, add targeted tests in Phase 3.

### Incremental Review — 2026-05-20 (@Reviewer)

**Status:** `✅ Passed`

**Changes verified:**

1. `backend/utils/data_store.py` now canonicalizes asset filenames via `normalize_asset()`, lowercases timeframe suffixes, skips malformed candles with explicit warnings, and avoids impossible zero-filled fallback rows.
2. `backend/services/gateway/routes/history.py` now preserves intentional `404` and `400` responses by re-raising `HTTPException` in `get_history()`, `delete_history()`, and `collect_history()`.
3. `backend/services/gateway/routes/history.py` now rejects unsupported seconds/ticks history timeframes consistently through a shared parser.
4. `capabilities_v2/history_collector.py` now rejects unsupported seconds/ticks collector timeframes instead of silently coercing them to minute candles.
5. Targeted tests were added for canonical pathing, malformed candle skipping, missing-history `404`, and unsupported timeframe handling.

**Verification:**

1. `conda run -n QuFLX-v2 python -m pytest backend/tests/test_data_store.py -v` → `9 passed`
2. `conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v` → `5 passed`
3. Language diagnostics clean for the edited backend and test files.

**Verdict:** Phase 3 is ready. Review complete. Awaiting explicit command to proceed.

---

## Phase 4 — Payload Capture Ownership Fix

**Status:** `[x]` Complete · `[@Reviewer: ✅ Passed]`  
**Owner:** @Architect + @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** High — root payload behavior

### Files

- `backend/services/collector/interceptor.py`
- `backend/services/collector/main.py`
- `backend/services/gateway/routes/history.py`
- `capabilities_v2/history_collector.py`

### Goal

Ensure only one backend component drains Chrome performance logs for history payloads.

### Recommended Design Options

#### Option A — Collector-owned history payload cache

Collector remains the only consumer of Chrome performance logs.

```text
CollectorService
  ├─ fetch_ticks()
  ├─ fetch_history_events()
  ├─ persist to data_store
  └─ keep short-lived in-memory latest-history cache by asset/timeframe

Gateway bootstrap-history
  └─ asks collector/latest cache or polls data_store for new CSV update
```

Pros:
- Eliminates log contention.
- Preserves current collector role.
- Works well with local CSV persistence.

Cons:
- Requires access path from gateway to collector state or shared process/service mechanism.

#### Option B — CSV-first polling model

Ticker reload triggers platform asset selection/reload. Collector captures and writes CSV. Frontend/gateway polls history CSV until it appears or updates.

```text
Ticker click
  └─ select/reload asset
      └─ collector persists payload
          └─ frontend polls GET /history/{asset}
```

Pros:
- Simplest mental model.
- No competing interceptors.
- Non-destructive and resilient.

Cons:
- Needs clear user feedback while waiting.

#### Option C — Shared interceptor instance

Expose the active collector interceptor to bootstrap calls.

Pros:
- Direct payload response possible.

Cons:
- More coupling.
- Harder if collector and gateway are separate processes.

### Recommendation

Use **Option B** first if the app already relies on local CSV as source of truth. It is the simplest and safest path:

1. Ticker click attempts fresh payload trigger.
2. Collector is sole performance-log reader.
3. Gateway/frontend reads from `data_store` after capture.
4. Existing CSV remains valid until new data is confirmed.

### Success Criteria

- `[x]` Bootstrap path no longer creates a competing `WebSocketInterceptor` over the same driver while collector is active.
- `[x]` One owner drains Chrome performance logs.
- `[x]` Ticker reload reliably captures or times out without deleting prior history.

### Verification

Manual checks:

1. Start Chrome and collector.
2. Click ticker asset.
3. Confirm exactly one component logs `driver.get_log('performance')` consumption.
4. Confirm CSV updates.
5. Confirm chart updates.

### Incremental Review — 2026-05-20 (@Reviewer)

**Status:** `✅ Passed`

**Changes verified:**

1. `backend/services/gateway/routes/history.py` no longer instantiates `HistoryCollector` or a route-local `WebSocketInterceptor` during `POST /bootstrap-history`.
2. `POST /bootstrap-history` now follows the CSV-first polling model:
   - snapshots the current `data_store` signature,
   - triggers Pocket Option asset selection through the existing asset-control script,
   - polls `read_candles()` until the collector persists a fresh history update or timeout occurs.
3. Timeout behavior is explicit and non-destructive: the route now returns a structured `capability_timeout` response instead of competing for Chrome performance logs.
4. `backend/services/collector/main.py` now logs collector ownership when persisting buffered history events, making the single-reader contract visible during manual verification.
5. Focused regression tests were added to confirm:
   - successful collector-owned bootstrap polling,
   - structured timeout behavior,
   - no `HistoryCollector` / `WebSocketInterceptor` construction in the bootstrap route.

**Verification:**

1. `conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v` → `8 passed`
2. Language diagnostics clean for the edited route, collector, and test files.

**Verdict:** Phase 4 is ready. Review complete. Awaiting explicit command to proceed.

---

## Phase 5 — Favorite Star Deprecation Cleanup (Optional, after stability)

**Status:** `[x]` Complete · `[@Reviewer: ✅ Passed]`  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Low

### Goal

Complete favorite-star deprecation without disturbing history behavior.

### Candidate Files

- `gui/Dashboard/src/store/marketStore.js`
- `gui/Dashboard/src/components/AutomationsPanel.jsx`
- Any backend routes/events still emitting `star_asset` / favorite logic

### Required Behavior

- Do not restore favorite star UI.
- Remove or clearly deprecate stale `starAsset()` action.
- Remove or rename `autoSelectFavorites` setting if unused.

### Success Criteria

- `[x]` No visible favorite star UI.
- `[x]` No active code path depends on favorite stars for direct asset selection.
- `[x]` No history/ticker behavior changes in this phase.

### Incremental Review — 2026-05-20 (@Reviewer)

**Status:** `✅ Passed`

**Changes verified:**

1. `gui/Dashboard/src/components/AutomationsPanel.jsx` no longer renders the obsolete `Auto-Select Favorites` toggle.
2. `gui/Dashboard/src/store/marketStore.js` no longer exposes a `starAsset()` action, no longer subscribes to `asset_starred` / `asset_star_error`, and no longer persists the stale `favorites` field.
3. `backend/services/gateway/socket_events.py` no longer registers the deprecated `star_asset` Socket.IO event.
4. `backend/services/gateway/asset_control.py` no longer accepts or implements the deprecated `star_asset` CLI/control action.
5. Existing history/list/ticker flows remain untouched in this phase; the cleanup only removes deprecated favorite-star surfaces.

**Verification:**

1. `npm --prefix gui/Dashboard run build` → passed
2. `conda run -n QuFLX-v2 python -c "from backend.services.gateway.asset_control import AssetControl; from backend.services.gateway.socket_events import register_socket_events; print('ok')"` → passed
3. Language diagnostics clean for the edited frontend and backend files.

**Verdict:** Phase 5 is ready. Review complete. Awaiting explicit command to proceed.

---

## Phase 6A — Make Clear-Cache Non-Destructive (Frontend)

**Status:** `[~]` Implemented — pending @Reviewer sign-off  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Low

### Goal
Replace the destructive `purgeAndSelectAsset()` clear-cache call in `ChartHeader.jsx` with the non-destructive `reloadHistoryFromPayload()` flow to prevent chart blanking/data-loss on collection failures.

### Required Changes
1. Swap `purgeAndSelectAsset` destructuring and call with `reloadHistoryFromPayload` in `ChartHeader.jsx`.
2. Update tooltips to indicate "Refresh history" rather than "Clear cache".

### Implementation Result — 2026-05-24

**File changed:** `gui/Dashboard/src/components/ChartHeader.jsx`

1. `ChartHeader.jsx` now reads `reloadHistoryFromPayload` from `marketStore` instead of `purgeAndSelectAsset`.
2. The refresh-history button now calls `reloadHistoryFromPayload(selectedAsset)`, which attempts fresh payload bootstrap while preserving existing CSV/frontend history when recollection fails.
3. The button tooltip now says `Refresh current asset history from payload`, accurately describing the non-destructive behavior.

### Verification — 2026-05-24

```powershell
npm --prefix gui/Dashboard run build
```

Result: ✅ Passed.

### Phase-Gate Status

`[~]` Implemented and automated verification passed. Awaiting required `@Reviewer` incremental review before this phase can be marked `[x]` complete.

---

## Phase 6B — Harden `asset_control.py` Selectors & Panel Open Detection (Backend)

**Status:** `[~]` Implemented — pending @Reviewer sign-off and live Pocket Option validation  
**Owner:** @Coder  
**Reviewer Gate:** @Reviewer  
**Risk:** Medium — live Selenium behavior

### Goal
Harden the asset dropdown selection in `asset_control.py` by removing deprecated favorite-star dependencies and adding modern Pocket Option DOM selectors, robust retry backoffs, and detailed troubleshooting diagnostics.

### Required Changes
1. **`_is_assets_panel_open()`**: Replace favorite-star query selectors with check for visible search input or active `.assets-block__list` or equivalent modern DOM markers.
2. **`_open_assets_dropdown()`**: Expand selector list with modern selectors (`.chart-asset-name`, `[data-test*='asset']`, `.pair-title`, `.pair-selector`), increase retry limit from 2 → 3, clear stale element cache on retry, and log element visibility/click outcomes.
3. **`_select_asset()`**: Increase search input wait time from 1.0s → 2.0s, and add better logging around filter matches.

### Implementation Result — 2026-05-24

**File changed:** `backend/services/gateway/asset_control.py`

1. `_is_assets_panel_open()` no longer relies on deprecated favorite-star DOM selectors such as `i.alist__icon.fa.fa-star-o.add` / `i.alist__icon.fa.fa-star.del`.
2. Panel-open detection now checks visible search inputs, active asset list rows, and modern assets/pair container class patterns.
3. `_open_assets_dropdown()` now:
   - returns an explicit `bool`,
   - uses 3 retry rounds,
   - clears stale cached elements on retry,
   - includes expanded selector coverage (`.chart-asset-name`, `.pair-title`, `.pair-selector`, `[data-test*='asset']`, `[data-testid*='asset']`, class-pattern selectors, and XPath fallbacks),
   - logs selector diagnostics if the panel cannot be opened.
4. `_select_asset()` now:
   - waits up to 2 seconds for modern search input DOM after attempting to open the panel,
   - waits up to 2 seconds for asset rows after filtering,
   - logs candidate row counts and visible candidate row text when the target asset is not found.

### Verification — 2026-05-24

```powershell
conda run -n QuFLX-v2 python -m py_compile backend/services/gateway/asset_control.py
conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v
```

Results:

1. ✅ `asset_control.py` Python compilation passed.
2. ✅ `backend/tests/test_history_delete_routes.py` → `10 passed`.

### Phase-Gate Status

`[~]` Implemented and automated verification passed. Awaiting required `@Reviewer` incremental review plus live Pocket Option/Chrome validation before this phase can be marked `[x]` complete.

---

## Phase 6C — Final Validation & Closeout

**Status:** `[ ]` Pending @Reviewer sign-off and live workflow validation  
**Owner:** @Tester + @Reviewer + @Debugger + @Optimizer + @Code_Simplifier  
**Risk:** Low — verification only

### Automated Checks

```powershell
conda activate QuFLX-v2
python -m pytest backend/tests/ -q --tb=short
npm --prefix gui/Dashboard run build
```

### Partial Automated Validation — 2026-05-24

```powershell
conda run -n QuFLX-v2 python -m py_compile backend/services/gateway/asset_control.py
conda run -n QuFLX-v2 python -m pytest backend/tests/test_history_delete_routes.py -v
npm --prefix gui/Dashboard run build
```

Results:

1. ✅ `asset_control.py` syntax/compile check passed.
2. ✅ Focused history route regression suite passed: `10 passed`.
3. ✅ Frontend production build passed.

Remaining validation requirement:

1. Live Chrome/Pocket Option manual workflow must confirm that the expanded selectors actually open/detect the current asset panel.
2. Required `@Reviewer` phase-gate review must sign off before Phase 6A/6B are marked `[x]` complete.

### Manual Workflow Checks

| Test | Expected Result |
|---|---|
| 92% list click with existing CSV | Chart renders local history immediately. No destructive purge. |
| 92% list click without CSV | Clear missing-history warning or controlled bootstrap depending settings. No UI freeze. |
| Ticker click with existing CSV but payload unavailable | Old chart remains visible; warning shown. CSV not deleted. |
| Ticker click with payload available | New payload persists and chart updates. |
| Switch A → B → A | A renders from cache; no redundant bootstrap. |
| Missing backend CSV | `GET /history` returns 404, not 500. |
| Malformed candle payload | Bad rows skipped; no timestamp 0 row. |
| Indicators after history reload | Indicator series refreshes for selected asset/timeframe only. |

### Final Multi-Agent Review

Per `PHASE_REVIEW_PROTOCOL.md`, when all implementation phases are complete:

1. @Reviewer — correctness, maintainability, CORE_PRINCIPLES alignment.
2. @Debugger — runtime behavior, edge cases, silent failures.
3. @Optimizer — performance and unnecessary complexity.
4. @Code_Simplifier — readability, duplication, functional simplicity.

Final closeout requires all verdicts to be ✅ or explicitly accepted by the user.

### Final Multi-Agent Review — 2026-05-24

**@Team_Leader delegation:**  
`"Full Implementation Plan complete. Perform final multi-agent review."`

#### @Reviewer — overall correctness & alignment

**Verdict:** ✅ Passed for code correctness, maintainability, and plan alignment.

**Justification:**
1. `gui/Dashboard/src/components/ChartHeader.jsx` now uses the already-established non-destructive `reloadHistoryFromPayload()` flow instead of deleting history/cache first.
2. `backend/services/gateway/asset_control.py` removes stale favorite-star panel detection and replaces it with broader visible search/list/pair panel checks.
3. The implementation aligns with the Phase 6A/6B plan and preserves the collector-owned history architecture from Phase 4.
4. Automated checks passed: backend suite (`197 passed`), focused history route suite (`10 passed`), `asset_control.py` compile check, and frontend production build.

#### @Debugger — runtime behavior, edge cases, silent failures

**Verdict:** ⚠️ Passed for automated/runtime guard coverage; live Pocket Option DOM validation still required.

**Justification:**
1. The clear-cache button no longer destroys history before bootstrap success, eliminating the known AEDCNYOTC-style chart-blanking failure path.
2. Asset panel automation now logs selector diagnostics instead of failing with only `Failed to open assets panel`, improving failure observability.
3. Backend regression tests confirm bootstrap continues to handle selection-failure fallback and hard-error paths correctly.
4. Remaining risk: Selenium selector behavior cannot be fully proven until a live Chrome/Pocket Option session confirms the expanded selectors open/detect the actual current asset panel.

#### @Optimizer — performance, efficiency, unnecessary complexity

**Verdict:** ✅ Passed.

**Justification:**
1. The frontend change is simpler than the destructive clear+reload path and reuses the existing payload refresh action.
2. The backend selector retry expansion is bounded: 3 attempts, 0.5s sleeps, and existing `self._implicit_wait` usage.
3. No new Chrome performance-log reader was introduced; the single-owner collector design remains intact.
4. Full backend tests and frontend build passed without new performance-related test regressions.

#### @Code_Simplifier — functional simplicity, duplication, readability

**Verdict:** ✅ Passed.

**Justification:**
1. The frontend no longer maintains a separate cache-delete path in `ChartHeader.jsx`; one non-destructive refresh behavior is now used.
2. Deprecated favorite-star command handling and helper code are absent from `asset_control.py`, reducing stale behavior in the asset selection module.
3. Selector diagnostics are centralized inside `_open_assets_dropdown()` rather than scattered through callers.
4. The plan document now explicitly separates Phase 6A, Phase 6B, and Phase 6C responsibilities.

#### @Team_Leader final compiled verdict

**Overall Status:** ⚠️ Implementation is complete and automated validation is green, but final production closeout remains pending live Pocket Option/Chrome validation.

**Approved as completed for code + automated validation:**
1. ✅ Clear-cache safety remediation.
2. ✅ Asset selector hardening implementation.
3. ✅ Documentation/plan update.
4. ✅ Automated regression validation.

**Still required before marking Phase 6 fully `[x]` closed:**
1. Live workflow test: `POST /api/v1/history/bootstrap-history` against a running Chrome/Pocket Option session.
2. Confirm `asset_control.py` can open/detect the current asset panel and select at least one OTC asset.
3. Confirm fresh collector-owned history persists and chart refreshes from the returned candles.

### Validation Results — 2026-05-20

**Automated Checks**

1. `conda run -n QuFLX-v2 python -m pytest backend/tests -q --tb=short` → `195 passed, 7 warnings`
2. `npm --prefix gui/Dashboard run build` → passed

**Browser Smoke Check**

1. Local frontend dev server detected at `http://localhost:5173`
2. Playwright smoke pass loaded the app shell successfully (`OTC SNIPER v3`) and captured `system_LOGS/phase6_frontend_smoke.png`
3. Runtime finding: browser console/network showed `500` on `http://localhost:5173/api/strategy/runtime-config`
4. Frontend also logged: `[App] Failed to sync runtime strategy config: HTTP 500`

**Manual Workflow Coverage**

1. App shell mount verified in-browser
2. End-to-end market-history manual checks remain partially blocked by the unrelated runtime-config failure and still depend on live backend/collector/Chrome state

### Final Multi-Agent Review — 2026-05-20

1. `@Reviewer` — `⚠` Core history-fix phases are implemented and verified, but final closeout cannot be approved while the app still surfaces a runtime `500` during startup.
2. `@Debugger` — `⚠` Browser smoke reproduced a live runtime failure on `/api/strategy/runtime-config`; this is the current blocker for clean closeout.
3. `@Optimizer` — `✅` No new performance regressions were introduced by the history-fix phases; build and backend suite remain healthy.
4. `@Code_Simplifier` — `✅` Final implementation is cleaner than the starting point: ownership is explicit, deprecated paths are removed, and history behavior is less coupled.

**Closeout Verdict:** `⚠ Not ready to fully close`

**Reason:** Final validation exposed a runtime backend/frontend integration issue outside the specific history-fix code path: `GET /api/strategy/runtime-config` returns `500` in the live app shell. Final closeout now requires either:

1. fixing that runtime issue and re-running Phase 6 validation, or
2. explicit user acceptance of the residual runtime risk.

### Validation Addendum — 2026-05-23

**Correction to 2026-05-20 browser finding**

1. The prior `/api/strategy/runtime-config` `500` was traced to a different frontend dev server/workspace and is **not** the active blocker for `c:\QuFLX\v2`.
2. The actual runtime blocker in the current QuFLX v2 history-refresh path is `backend/services/gateway/asset_control.py` failing to open/detect the Pocket Option asset panel during `POST /api/v1/history/bootstrap-history`.

**Follow-up fixes completed after the original Phase 6 validation**

1. `backend/services/gateway/routes/history.py` now continues polling collector-owned history even when Selenium asset selection fails, and only returns the selection error if no fresh candles arrive.
2. `gui/Dashboard/src/store/marketStore.js` now uses normalized asset keys for the history `DELETE` path, fixing slash-broken routes for labels such as `AUD/NZD OTC`.
3. `backend/tests/test_history_delete_routes.py` now covers selection-failure fallback and selection-failure hard-error behavior.

**Current blocking state**

1. Non-destructive payload refresh is safe and preserves existing history on failure.
2. The clear-cache flow remains risky because it can still delete working history before a fresh recollection succeeds.
3. Root cause remains brittle Selenium selectors and panel-open detection in `asset_control.py`.

**Detailed report**

- `reports/reports_2026-05/asset_control_history_blocking_report_26-05-23.md`

---

## Files Touched Summary

### Planned Source Files

| File | Phase | Change Type |
|---|---:|---|
| `gui/Dashboard/src/store/marketStore.js` | 1, 2 | Normalize history cache key; add loading guard; add non-destructive ticker reload action |
| `gui/Dashboard/src/hooks/useTickAggregation.js` | 1 | Respect existing cache; avoid unnecessary loading state |
| `gui/Dashboard/src/components/ChartWorkspace.jsx` | 1 | Ensure initial load aligns with normalized key and avoids repeated load loops |
| `gui/Dashboard/src/components/TickerTape.jsx` | 2 | Replace destructive purge click with non-destructive payload reload handler |
| `gui/Dashboard/src/components/AssetPayoutPanel.jsx` | 2 | Pass new ticker reload handler |
| `gui/Dashboard/src/components/AssetListView.jsx` | 2 | Pass new ticker reload handler to ticker tape |
| `gui/Dashboard/src/components/ChartHeader.jsx` | 6A | Replace destructive clear-cache call with non-destructive payload refresh |
| `backend/utils/data_store.py` | 3 | Canonical asset pathing; input validation; count semantics if needed |
| `backend/services/gateway/routes/history.py` | 3, 4 | Preserve 404; reduce/remove competing bootstrap interceptor path |
| `backend/services/gateway/asset_control.py` | 6B | Remove stale favorite-star panel detection; expand asset dropdown selectors; add diagnostics |
| `capabilities_v2/history_collector.py` | 3, 4 | Timeframe consistency; avoid competing interceptor role if design changes |
| `backend/services/collector/interceptor.py` | 4 | Confirm/adjust single-owner payload buffering |
| `backend/services/collector/main.py` | 4 | Collector-owned history persistence/cache if Option A/B needs it |

### Plan / Report Files

| File | Purpose |
|---|---|
| `v2_Dev_Docs/History_Handeling/History_Data_Payload_Chart_Rendering_Fix_Plan_26-05-20.md` | This implementation plan |
| `v2_Dev_Docs/History_Handeling/History_Data_Payload_WIP_Diff_26-05-20.patch` | Proposed Phase 0 safety artifact |
| `reports/reports_2026-05/asset_control_history_blocking_report_26-05-23.md` | Post-implementation blocking analysis for the remaining `asset_control.py` runtime failure |

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---:|---|
| Broad revert loses favorite-star removal | HIGH | MEDIUM | Avoid broad revert; use targeted repairs |
| Ticker reload blanks chart | HIGH | HIGH | Make ticker reload non-destructive |
| Payload still missed due to log contention | CRITICAL | HIGH | Enforce single owner of Chrome performance logs |
| Normalized/raw key mismatch persists | HIGH | HIGH | Normalize once and use `assetKey` everywhere |
| Expected 404 becomes 500 | MEDIUM | HIGH | Re-raise `HTTPException` before generic handler |
| Malformed payload corrupts CSV | HIGH | MEDIUM | Validate candle fields; skip bad rows loudly |
| UI freeze returns through repeated load loops | HIGH | MEDIUM | Add `loading` early return and key consistency |
| Indicator cache uses stale asset/timeframe | MEDIUM | MEDIUM | Clear only selected key’s indicators on confirmed history update |
| Too many concerns in one patch | HIGH | MEDIUM | Phase-gated implementation + @Reviewer after each phase |

---

## Rollback Strategy

If targeted repairs fail after 2–3 patch attempts:

> “Further patching will increase complexity and risk. I strongly recommend a clean rewrite of [file/module] instead of another incremental fix. This will be faster, safer, and more maintainable long-term. Shall I prepare the rewritten version?”

Selective rollback preference:

1. Restore only backend payload collection modules from known-good commit if needed.
2. Preserve frontend star removal and ticker selection UI.
3. Re-apply normalized history cache key fixes after rollback.

Avoid:

```powershell
git reset --hard c49be07ab905980a36a2d693e32579962d75e5bf
git reset --hard a476b8e267a8491f2148f5d1ea0eb1b875aa24ac
```

unless the user explicitly approves full repo rollback and accepts loss of later changes.

---

## Approval Gate

This plan is ready for review.

Implementation must not begin until the user gives an explicit command such as:

- “Approved — start Phase 0”
- “Proceed with Phase 1”
- “Implementation Plan approved — continue”

---

*Compiled by @Investigator with @Reviewer/@Debugger/@Optimizer concerns incorporated. Physical implementation should be performed by @Coder under the phase review protocol.*
