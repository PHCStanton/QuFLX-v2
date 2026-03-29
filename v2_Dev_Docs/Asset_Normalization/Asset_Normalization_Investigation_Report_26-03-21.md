# Asset Normalization — @Investigator Forensic Report
**File:** `v2_Dev_Docs/Asset_Normalization/Asset_Normalization_Investigation_Report_26-03-21.md`  
**Date:** 2026-03-21  
**Agent:** @Investigator (Read-Only Forensic Analysis)  
**Scope:** All logic that handles, determines, and parses Asset Normalization in QuFLX-v2  
**Status:** ✅ Investigation Complete — No code was modified

---

## 1. Summary

QuFLX-v2 uses **three distinct normalization contexts** for asset names, served by **two canonical normalizer functions** (one backend, one frontend) plus **one reverse-normalizer** for the PocketOption API. An existing plan document (`Asset_Normalization_Truth_Source_Plan_26-03-21.md`) was found in the same directory — this report **validates that plan against the actual current codebase**, corrects several stale claims, and provides the definitive current-state map.

**Key finding:** Several items the plan marks as broken have **already been fixed** in the current codebase (indicators cache key, history_utils divergence, alert dispatcher folder map, deprecated aliases). The remaining open issues are **frontend duplication** (3 copies of the same regex) and **missing normalization in the trade execution path**.

---

## 2. Critical Issues

### CRITICAL — No Asset Normalization in Trade Execution Path
- **Severity:** CRITICAL
- **File:** `gui/Dashboard/src/store/tradingStore.js` → `executeTrade()`
- **Line:** ~148 (`const payload = { asset, direction, ... }`)
- **Evidence:** The `asset` field is sent raw to `POST /api/v1/trading/execute` without any normalization. The value comes from `selectedAsset` which stores whatever format the user selected (e.g. `EURUSD_otc` from the payout panel, or `EURUSDOTC` from the market store).
- **Why it matters:** The SSID executor's `_normalize_asset_symbol()` in `backend/services/ssid_service/executor.py` (line 11) handles the conversion to PocketOption format (`EURUSD_otc`), so this works **by accident** — but only because the executor strips all non-alphanumeric chars and re-adds `_otc`. If the executor logic ever changes, or if a non-OTC asset is traded, the raw format mismatch could cause silent trade failures.
- **Recommendation:** @Coder should normalize the asset in `tradingStore.js` before sending, OR document that the executor is the normalization boundary for Context 2.

### HIGH — Three Duplicate `normalizeAsset` Implementations in Frontend
- **Severity:** HIGH
- **Files & Lines:**
  1. `gui/Dashboard/src/utils/assetUtils.js:1` — `normalizeSpecificAsset()` ← **canonical**
  2. `gui/Dashboard/src/store/marketStore.js:42` — `const normalizeAsset = (asset) => { ... }` ← **duplicate**
  3. `gui/Dashboard/src/components/TickerTape.jsx:2` — `import { normalizeSpecificAsset as normalizeAsset }` ← ✅ **already fixed** (imports from assetUtils)
- **Evidence:** `marketStore.js` line 42 defines a local `normalizeAsset` with identical logic: `String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase()`. This is the same regex as `normalizeSpecificAsset` in `assetUtils.js`.
- **Why it matters:** If the normalization logic ever needs to change (e.g., to handle `#` stock prefixes), the `marketStore.js` copy would be missed, causing divergent behavior between the market store and all other components.
- **Correction to existing plan:** The plan claims TickerTape.jsx has a local copy — **this is WRONG**. TickerTape.jsx already imports from `assetUtils.js` (line 2: `import { normalizeSpecificAsset as normalizeAsset } from '../utils/assetUtils'`). Only `marketStore.js` still has the duplicate.
- **Recommendation:** @Coder should replace the local definition in `marketStore.js` with an import from `assetUtils.js`.

### MEDIUM — Stock Symbol `#` Prefix Silently Stripped
- **Severity:** MEDIUM
- **File:** `backend/utils/asset_utils.py:7` — `normalize_asset()`
- **Evidence:** The regex `re.sub(r"[^A-Za-z0-9]", "", str(asset))` strips `#` from stock symbols like `#AAPL_otc`, producing `AAPLOTC` instead of preserving the prefix.
- **File:** `backend/services/ssid_service/executor.py:11` — `_normalize_asset_symbol()`
- **Evidence:** This function correctly preserves `#` for PocketOption API calls (line 30: `prefix = "#" if asset.startswith("#") else ""`), but the round-trip is broken: `normalize_asset('#AAPL_otc')` → `AAPLOTC` → `_normalize_asset_symbol('AAPLOTC')` → `AAPL_otc` (missing `#`).
- **Why it matters:** Stock OTC assets (e.g., `#AAPL_otc`, `#TSLA_otc`) would fail to execute trades if the canonical key is used as input to the executor. Currently mitigated because the trade path uses raw asset strings, but this is fragile.
- **Recommendation:** @Architect should decide: either (a) document that `#` stocks require special handling and the canonical key intentionally strips `#`, or (b) modify `normalize_asset()` to preserve `#` as a special prefix.

---

## 3. Detailed Findings

### 3.1 The Three Normalization Contexts

| Context | Purpose | Function | Location | Format Example |
|---------|---------|----------|----------|----------------|
| **Context 1** — Internal Key | Redis keys, filesystem dirs, cache keys, tick matching, subscriptions | `normalize_asset()` | `backend/utils/asset_utils.py:4` | `EURUSDOTC` |
| **Context 2** — PocketOption API | Trade execution via PocketOption WebSocket | `_normalize_asset_symbol()` | `backend/services/ssid_service/executor.py:11` | `EURUSD_otc` |
| **Context 3** — UI Display | Chart watermarks, human-readable labels | `formatAssetLabel()` | `gui/Dashboard/src/components/ChartContainer.jsx:17` | `EUR/USD OTC` |

### 3.2 Backend — Context 1 Normalizer (Canonical)

**File:** `backend/utils/asset_utils.py`  
**Function:** `normalize_asset(asset: str) -> str`  
**Logic:** `re.sub(r"[^A-Za-z0-9]", "", str(asset)).upper()`  
**Behavior:** Strips ALL non-alphanumeric characters, uppercases result.

**Consumers (verified via search — 14 files import this function):**

| File | How Used | Status |
|------|----------|--------|
| `backend/services/collector/interceptor.py:7` | Normalizes raw WebSocket tick asset names | ✅ Correct |
| `backend/services/collector/main.py:10` | Imported but used indirectly via interceptor | ✅ Correct |
| `backend/services/gateway/routes/indicators.py:16` | Normalizes asset at route entry before cache lookup | ✅ **Already Fixed** (line 198: `asset = normalize_asset(asset)`) |
| `backend/services/gateway/routes/history.py:11` | Normalizes asset in `get_history()` | ✅ **Already Fixed** (line 38: `asset = normalize_asset(asset)`) |
| `backend/services/gateway/routes/assets.py:9` | Normalizes include/ignore asset lists | ✅ Correct |
| `backend/services/gateway/routes/common.py:4` | Imported but no `normalize_asset_name` alias found | ✅ **Already Cleaned** |
| `backend/services/gateway/asset_control.py:14` | Normalizes for Selenium asset matching | ✅ Correct |
| `backend/utils/history_utils.py:12,55` | Normalizes for directory names and file lookup | ✅ **Already Fixed** (`asset_base = asset_clean`, no split) |
| `backend/scripts/otc_alert_dispatch.py:5` | Normalizes for dispatcher asset matching and folder map | ✅ **Already Fixed** (exact-match preference implemented) |
| `capabilities_v2/favorite_star_select.py:1` | Normalizes for OTC/FX filtering | ✅ Correct |
| `capabilities_v2/history_collector.py:1` | Normalizes for history file matching | ✅ Correct |

### 3.3 Backend — Context 2 Normalizer (PocketOption API)

**File:** `backend/services/ssid_service/executor.py`  
**Function:** `_normalize_asset_symbol(asset: str) -> str`  
**Logic:**
1. Preserve leading `#` for stock symbols
2. Strip all non-alphanumeric chars
3. Remove trailing `OTC`/`otc` (case-insensitive)
4. Re-add `_otc` suffix with uppercase base

**Behavior:** Converts ANY format → `EURUSD_otc` (PocketOption expected format)

**Consumers:**
- `executor.py:56` — `OTCExecutor.execute_trade()` calls `_normalize_asset_symbol(asset)` before sending to PocketOption WebSocket.
- This is the ONLY place Context 2 normalization is used. It is correctly scoped.

### 3.4 Frontend — Context 1 Normalizer

**File:** `gui/Dashboard/src/utils/assetUtils.js`  
**Function:** `normalizeSpecificAsset(asset)`  
**Logic:** `String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase()`  
**Behavior:** Identical to backend `normalize_asset()` — strips non-alphanumeric, uppercases.

**Consumers (verified):**

| File | Import | Status |
|------|--------|--------|
| `gui/Dashboard/src/components/AssetListView.jsx` | `import { normalizeSpecificAsset }` | ✅ Correct |
| `gui/Dashboard/src/components/AssetPayoutPanel.jsx` | `import { normalizeSpecificAsset, parseSpecificAssets }` | ✅ Correct |
| `gui/Dashboard/src/components/LiveTradingPanel.jsx` | `import { normalizeSpecificAsset }` | ✅ Correct |
| `gui/Dashboard/src/components/TickerTape.jsx` | `import { normalizeSpecificAsset as normalizeAsset }` | ✅ Correct |
| `gui/Dashboard/src/store/marketStore.js` | **LOCAL DUPLICATE** (line 42) | ⚠️ Should import from assetUtils |

### 3.5 Frontend — Context 3 Display Formatter

**File:** `gui/Dashboard/src/components/ChartContainer.jsx`  
**Function:** `formatAssetLabel(asset)`  
**Logic:**
1. Normalize input (strip non-alphanumeric, uppercase)
2. Detect OTC suffix
3. Split 6+ char base into `XXX/YYY` format
4. Append ` OTC` if applicable

**Status:** ✅ Already has normalization guard at entry (line 19: `const normalized = asset.replace(/[^A-Za-z0-9]/g, '').toUpperCase()`). The existing plan's Phase 7 claim that this is missing is **INCORRECT** — it was already implemented.

### 3.6 Frontend — `parseSpecificAssets()` Helper

**File:** `gui/Dashboard/src/utils/assetUtils.js`  
**Function:** `parseSpecificAssets(value)`  
**Logic:** Splits comma/semicolon/newline/space-separated asset strings, handles `OTC` as a suffix token, normalizes each via `normalizeSpecificAsset`, deduplicates.  
**Consumers:** `AssetPayoutPanel.jsx` for include/ignore asset list parsing.  
**Status:** ✅ Correct.

### 3.7 Alert Dispatcher — Folder Map Resolution

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Function:** `scan_available_assets()`  
**Logic:** Scans `data/data_output/history/` directories, normalizes each folder name, builds `asset_folder_map[normalized] = raw_folder_name`. Exact-match preference: if `norm_name == raw_name`, it overwrites any previous underscored variant.  
**Status:** ✅ **Already Fixed** — the "exact match wins" logic is implemented (confirmed in search results: `if raw_name == norm_name: self.asset_folder_map[norm_name] = raw_name`).

---

## 4. Corrections to Existing Plan

The existing plan (`Asset_Normalization_Truth_Source_Plan_26-03-21.md`) contains several claims that are **no longer accurate** based on the current codebase:

| Plan Phase | Plan Claim | Actual Current State | Verdict |
|------------|-----------|---------------------|---------|
| Phase 1 | Indicators cache key uses raw asset | `indicators.py:198` already has `asset = normalize_asset(asset)` | ✅ **Already Fixed** |
| Phase 2 | `history_utils.py` has `asset_base = normalize_asset(asset.split("(")[0])` divergence | `history_utils.py:27` now has `asset_base = asset_clean` (no split) | ✅ **Already Fixed** |
| Phase 3 | Alert Dispatcher folder map "exact match wins" is a no-op | `otc_alert_dispatch.py` now implements the preference correctly | ✅ **Already Fixed** |
| Phase 4 | History route doesn't normalize path param | `history.py:38` already has `asset = normalize_asset(asset)` | ✅ **Already Fixed** |
| Phase 5 | Two deprecated `normalize_asset_name()` aliases exist | Search for `normalize_asset_name` returns 0 results in both files | ✅ **Already Cleaned** |
| Phase 6.3 | TickerTape.jsx has a local `normalizeAsset` copy | TickerTape.jsx imports from `assetUtils.js` | ✅ **Already Fixed** |
| Phase 7 | `formatAssetLabel` has no normalization guard | ChartContainer.jsx line 19 already normalizes input | ✅ **Already Fixed** |
| Phase 8 | `normalize_asset()` needs doc comment about `#` prefix | Comment already exists in current code | ✅ **Already Documented** |

**Only Phase 6.2 remains open:** `marketStore.js` still has a local duplicate of `normalizeAsset`.

---

## 5. Recommendations

### For @Coder:

| Priority | Action | File | Effort |
|----------|--------|------|--------|
| HIGH | Replace local `normalizeAsset` in `marketStore.js` (line 42) with import from `assetUtils.js` | `gui/Dashboard/src/store/marketStore.js` | 5 min |
| MEDIUM | Add normalization to `tradingStore.js` `executeTrade()` before sending asset to backend, OR add a code comment documenting that the SSID executor handles normalization | `gui/Dashboard/src/store/tradingStore.js` | 5 min |

### For @Architect:

| Priority | Action | Scope |
|----------|--------|-------|
| MEDIUM | Decide on `#` stock symbol handling strategy: preserve in canonical key or document as intentional stripping | Cross-cutting: `asset_utils.py`, `executor.py` |
| LOW | Update the existing plan document to mark completed phases and correct stale claims | `v2_Dev_Docs/Asset_Normalization/Asset_Normalization_Truth_Source_Plan_26-03-21.md` |

### For @Reviewer:

| Priority | Action |
|----------|--------|
| LOW | After @Coder implements the `marketStore.js` import change, verify `npm run lint` and `npm run build` pass cleanly |

---

## 6. Risk Forecast — What Breaks Next If Ignored

1. **marketStore.js duplicate (HIGH risk):** If the normalization regex ever needs to change (e.g., to handle `#` stock prefixes), the `marketStore.js` local copy will be missed, causing subscription mismatches — the market store would generate different asset keys than the rest of the frontend, leading to missing tick data and broken indicator lookups.

2. **Trade execution without normalization (MEDIUM risk):** Currently works by accident because the SSID executor re-normalizes. If a future refactor removes or changes the executor's normalization, trades could silently fail or target wrong assets.

3. **Stock `#` prefix round-trip (LOW risk, future):** If stock OTC assets become more prominent, the broken round-trip (`#AAPL_otc` → `AAPLOTC` → `AAPL_otc` missing `#`) will cause trade execution failures for stock symbols.

---

## 7. Complete File Map — All Normalization Touchpoints

```
BACKEND (Context 1 — Canonical Internal Key)
├── backend/utils/asset_utils.py .............. normalize_asset()  [SINGLE SOURCE OF TRUTH]
├── backend/utils/history_utils.py ............ persist_history_csv(), get_recent_history_file()
├── backend/services/collector/interceptor.py . _parse_single_tick(), _parse_single_tick_dict()
├── backend/services/collector/main.py ........ imports normalize_asset (used via interceptor)
├── backend/services/gateway/routes/indicators.py  calculate_indicators() — normalizes at entry
├── backend/services/gateway/routes/history.py .... get_history() — normalizes path param
├── backend/services/gateway/routes/assets.py ..... parse_assets() — normalizes include/ignore lists
├── backend/services/gateway/routes/common.py ..... imports normalize_asset (utility module)
├── backend/services/gateway/asset_control.py ..... _select_asset(), _star_asset() — Selenium matching
├── backend/scripts/otc_alert_dispatch.py ......... scan_available_assets(), process_asset()
├── capabilities_v2/favorite_star_select.py ....... OTC/FX filtering, star/unstar matching
└── capabilities_v2/history_collector.py .......... _normalize_asset(), history file matching

BACKEND (Context 2 — PocketOption API Symbol)
└── backend/services/ssid_service/executor.py ..... _normalize_asset_symbol()  [TRADE EXECUTION ONLY]

FRONTEND (Context 1 — Canonical Internal Key)
├── gui/Dashboard/src/utils/assetUtils.js ......... normalizeSpecificAsset()  [SINGLE SOURCE OF TRUTH]
├── gui/Dashboard/src/store/marketStore.js ........ normalizeAsset() ⚠️ LOCAL DUPLICATE
├── gui/Dashboard/src/components/TickerTape.jsx ... imports from assetUtils ✅
├── gui/Dashboard/src/components/AssetListView.jsx  imports from assetUtils ✅
├── gui/Dashboard/src/components/AssetPayoutPanel.jsx imports from assetUtils ✅
└── gui/Dashboard/src/components/LiveTradingPanel.jsx imports from assetUtils ✅

FRONTEND (Context 3 — UI Display Label)
└── gui/Dashboard/src/components/ChartContainer.jsx  formatAssetLabel()  [DISPLAY ONLY]
```

---

*This report was produced by @Investigator in strict read-only mode. No code was modified during the investigation phase.*  
*Recommended next step: Delegate @Coder for the two remaining fixes (marketStore.js import + tradingStore.js documentation/normalization).*
