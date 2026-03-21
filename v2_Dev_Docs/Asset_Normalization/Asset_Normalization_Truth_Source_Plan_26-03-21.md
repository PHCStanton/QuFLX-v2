# Asset Normalization — Single Source of Truth Plan
**File:** `v2_Dev_Docs/Asset_Normalization/Asset_Normalization_Truth_Source_Plan_26-03-21.md`  
**Date:** 2026-03-21  
**Author:** @Investigator (Forensic Analysis) → Plan compiled for @Coder / @Architect  
**Status:** 🔴 Not Started

---

## Executive Summary

### The Problem

QuFLX-v2 currently has **four separate, partially-inconsistent implementations** of asset name normalization spread across the backend and frontend. There is one canonical backend function (`normalize_asset` in `backend/utils/asset_utils.py`) but it is:

1. **Not applied at all entry points** — the `POST /api/v1/indicators` route uses the raw payload `asset` string as a cache key without normalizing it first, causing cache thrash when different callers send different formats of the same asset.
2. **Duplicated three times in the frontend** — `marketStore.js`, `TickerTape.jsx`, and `assetUtils.js` each define their own local copy of the same regex logic with no shared import.
3. **Contradicted by a reverse-normalizer** in the SSID executor (`_normalize_asset_symbol`) that converts back to PocketOption's `EURUSD_otc` format — this reverse function has a broken round-trip for stock symbols with a `#` prefix.
4. **Inconsistently applied in `history_utils.py`** — the directory name and filename base are computed with two different calls that can diverge for assets with parentheses in their name (e.g. `EURUSD (OTC)`).

Additionally, the Alert Dispatcher's asset folder map has a non-deterministic "exact match wins" preference that is documented in a comment but not actually implemented in code.

### What This Plan Will Resolve

| # | Problem | Resolution |
|---|---------|------------|
| 1 | Indicators cache key uses raw (un-normalized) asset string | Normalize `asset` at route entry before cache lookup |
| 2 | Three frontend copies of `normalizeAsset` | Consolidate into single export from `assetUtils.js` |
| 3 | Stock symbol `#` prefix lost by `normalize_asset()` | Document limitation OR add prefix preservation |
| 4 | `history_utils.py` directory vs. filename base divergence | Simplify to single `normalize_asset(asset)` call for both |
| 5 | Alert Dispatcher folder map "exact match wins" is a no-op | Implement the preference correctly |
| 6 | Two deprecated `normalize_asset_name()` aliases | Delete both |
| 7 | `formatAssetLabel` in ChartContainer can receive un-normalized input | Add normalization guard at function entry |

---

## Architecture: The Three Normalization Contexts

Understanding the system requires recognizing that asset names serve **three distinct purposes**, each requiring a different format:

```
PocketOption WebSocket (raw)          Internal / Storage / Redis          UI Display
─────────────────────────────         ──────────────────────────          ──────────────
  EURUSD_otc                    →       EURUSDOTC                   →     EUR/USD OTC
  EUR/USD OTC                   →       EURUSDOTC                   →     EUR/USD OTC
  #AAPL_otc                     →       AAPOTC (⚠️ broken)          →     AAP OTC (⚠️)
  AUDNZD_otc                    →       AUDNZDOTC                   →     AUD/NZD OTC
```

**Context 1 — Canonical Internal Key** (`normalize_asset`):  
Used for Redis keys, filesystem directories, cache keys, tick matching, subscription keys.  
Format: `EURUSDOTC` (all alphanumeric, uppercase, no separators).

**Context 2 — PocketOption API Symbol** (`_normalize_asset_symbol`):  
Used only when sending trade orders to PocketOption's WebSocket API.  
Format: `EURUSD_otc` (uppercase base + lowercase `_otc` suffix).

**Context 3 — UI Display Label** (`formatAssetLabel`):  
Used only for chart watermarks and visible labels.  
Format: `EUR/USD OTC` (slash-separated, human-readable).

These three contexts must never be confused. The current codebase has several places where Context 1 and Context 2 are mixed.

---

## Current State Map

### Backend

| File | Function | Context | Status |
|------|----------|---------|--------|
| `backend/utils/asset_utils.py` | `normalize_asset()` | Context 1 (canonical) | ✅ Correct |
| `backend/utils/asset_utils.py` | `normalize_asset_name()` | Deprecated alias | ⚠️ Dead code |
| `backend/utils/history_utils.py` | `persist_history_csv()` | Context 1 | ⚠️ Partial — filename base diverges |
| `backend/utils/history_utils.py` | `get_recent_history_file()` | Context 1 | ✅ Correct |
| `backend/services/collector/interceptor.py` | `_parse_single_tick()` | Context 1 | ✅ Correct |
| `backend/services/collector/interceptor.py` | `_parse_single_tick_dict()` | Context 1 | ✅ Correct |
| `backend/services/gateway/routes/indicators.py` | `calculate_indicators()` | Context 1 | 🔴 Missing — raw asset used as cache key |
| `backend/services/gateway/routes/assets.py` | `parse_assets()` | Context 1 | ✅ Correct |
| `backend/services/gateway/routes/history.py` | `get_history()` | Context 1 | ⚠️ Imported but not called on path param |
| `backend/services/gateway/routes/common.py` | `normalize_asset_name()` | Deprecated alias | ⚠️ Dead code |
| `backend/services/ssid_service/executor.py` | `_normalize_asset_symbol()` | Context 2 | ✅ Correct for purpose, ⚠️ broken for `#` stocks |
| `backend/services/ssid_service/routes.py` | `TradeRequest.validate_asset()` | None | ⚠️ No normalization — passes raw to executor |
| `backend/scripts/otc_alert_dispatch.py` | `scan_available_assets()` | Context 1 | ⚠️ "Exact match wins" logic is a no-op |
| `capabilities_v2/favorite_star_select.py` | `normalize_asset()` | Context 1 | ✅ Correct |
| `capabilities_v2/history_collector.py` | `_normalize_asset()` | Context 1 | ✅ Correct |

### Frontend

| File | Function | Context | Status |
|------|----------|---------|--------|
| `gui/Dashboard/src/utils/assetUtils.js` | `normalizeSpecificAsset()` | Context 1 | ✅ Correct — should be the single export |
| `gui/Dashboard/src/utils/assetUtils.js` | `parseSpecificAssets()` | Context 1 | ✅ Correct |
| `gui/Dashboard/src/store/marketStore.js` | `normalizeAsset()` (local) | Context 1 | ⚠️ Duplicate — should import from assetUtils |
| `gui/Dashboard/src/components/TickerTape.jsx` | `normalizeAsset()` (local) | Context 1 | ⚠️ Duplicate — should import from assetUtils |
| `gui/Dashboard/src/components/ChartContainer.jsx` | `formatAssetLabel()` | Context 3 | ⚠️ No guard for un-normalized input |
| `gui/Dashboard/src/components/AssetListView.jsx` | Uses `normalizeSpecificAsset` | Context 1 | ✅ Correct import |
| `gui/Dashboard/src/components/AssetPayoutPanel.jsx` | Uses `normalizeSpecificAsset` | Context 1 | ✅ Correct import |
| `gui/Dashboard/src/components/LiveTradingPanel.jsx` | Uses `normalizeSpecificAsset` | Context 1 | ✅ Correct import |

---

## Implementation Plan

### Phase 1 — Backend: Fix the Indicators Cache Key (CRITICAL)
> **Impact:** Eliminates cache thrash, ensures consistent indicator freshness regardless of asset string format sent by frontend.

- [ ] **1.1** In `backend/services/gateway/routes/indicators.py`, add `from backend.utils.asset_utils import normalize_asset` import at the top of the file.
- [ ] **1.2** In `calculate_indicators()`, normalize `asset` immediately after the null check:
  ```python
  asset = payload.get("asset")
  if not asset:
      raise HTTPException(status_code=400, detail="asset required")
  asset = normalize_asset(asset)   # ← ADD THIS LINE
  ```
- [ ] **1.3** Verify that `_df_cache` keys are now always in canonical `EURUSDOTC` format by running the backend regression suite: `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short`

---

### Phase 2 — Backend: Fix history_utils.py Filename Base Divergence (MEDIUM)
> **Impact:** Prevents directory/filename mismatch for assets with parentheses in their name.

- [ ] **2.1** In `backend/utils/history_utils.py`, `persist_history_csv()`, simplify the `asset_base` line:
  ```python
  # BEFORE:
  asset_base = normalize_asset(asset.split("(")[0])
  # AFTER:
  asset_base = normalize_asset(asset)   # same as asset_clean — no split needed
  ```
- [ ] **2.2** Verify existing history files are still found correctly by running `get_recent_history_file()` for a known asset.

---

### Phase 3 — Backend: Fix Alert Dispatcher Folder Map (MEDIUM)
> **Impact:** Makes asset folder resolution deterministic when both `EURUSDOTC/` and `EURUSD_otc/` directories exist on disk.

- [ ] **3.1** In `backend/scripts/otc_alert_dispatch.py`, `scan_available_assets()`, replace the no-op `if raw_name != norm_name: pass` block with actual preference logic:
  ```python
  if norm_name in self.asset_folder_map:
      # Prefer exact match (already-normalized folder name) over underscored variant
      if raw_name == norm_name:
          self.asset_folder_map[norm_name] = raw_name  # exact match wins
      # else: keep existing entry (don't overwrite exact match with underscored variant)
  else:
      self.asset_folder_map[norm_name] = raw_name
  ```
- [ ] **3.2** Add a log line when a conflict is detected: `logger.debug(f"Asset folder conflict: {norm_name} → keeping {self.asset_folder_map[norm_name]}, ignoring {raw_name}")`

---

### Phase 4 — Backend: Normalize Asset in History Route (LOW)
> **Impact:** Defensive hardening — ensures `GET /api/v1/history/{asset}` always resolves correctly even if the path param is in a non-canonical format.

- [ ] **4.1** In `backend/services/gateway/routes/history.py`, `get_history()`, normalize the path param:
  ```python
  async def get_history(asset: str, timeframe: int = 1, limit: int = 100):
      asset = normalize_asset(asset)   # ← ADD THIS LINE
  ```
  *(Note: `normalize_asset` is already imported in this file.)*

---

### Phase 5 — Backend: Remove Deprecated Aliases (LOW)
> **Impact:** Eliminates dead code and prevents future confusion about which function to use.

- [ ] **5.1** Delete `normalize_asset_name()` from `backend/utils/asset_utils.py`.
- [ ] **5.2** Delete `normalize_asset_name()` from `backend/services/gateway/routes/common.py`.
- [ ] **5.3** Search for any remaining callers: `grep -r "normalize_asset_name" backend/` — confirm zero results before deleting.

---

### Phase 6 — Frontend: Consolidate to Single normalizeAsset Export (MEDIUM)
> **Impact:** Eliminates three divergent copies of the same logic. Any future change to normalization logic only needs to be made in one place.

- [ ] **6.1** In `gui/Dashboard/src/utils/assetUtils.js`, confirm `normalizeSpecificAsset` is already exported (it is — ✅).
- [ ] **6.2** In `gui/Dashboard/src/store/marketStore.js`:
  - Add import: `import { normalizeSpecificAsset as normalizeAsset } from '../utils/assetUtils';`
  - Delete the local `const normalizeAsset = (asset) => { ... }` definition.
- [ ] **6.3** In `gui/Dashboard/src/components/TickerTape.jsx`:
  - Add import: `import { normalizeSpecificAsset as normalizeAsset } from '../utils/assetUtils';`
  - Delete the local `const normalizeAsset = (asset) => { ... }` definition.
- [ ] **6.4** Run `npm run lint` and `npm run build` in `gui/Dashboard/` to confirm no regressions.

---

### Phase 7 — Frontend: Guard formatAssetLabel Against Un-normalized Input (LOW)
> **Impact:** Prevents malformed display labels (e.g. `EUR/USD_OT C`) if a raw `EURUSD_otc` string ever reaches the chart watermark formatter.

- [ ] **7.1** In `gui/Dashboard/src/components/ChartContainer.jsx`, update `formatAssetLabel`:
  ```javascript
  const formatAssetLabel = (asset) => {
    if (!asset || typeof asset !== 'string') return '';
    // Normalize first to ensure consistent input format
    const normalized = asset.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const isOtc = normalized.endsWith('OTC');
    const base = isOtc ? normalized.slice(0, -3) : normalized;
    const formatted = base.length >= 6
      ? `${base.slice(0, 3)}/${base.slice(3)}`
      : base;
    return isOtc ? `${formatted} OTC` : formatted;
  };
  ```
- [ ] **7.2** Verify chart watermark renders correctly for `EURUSDOTC`, `EURUSD_otc`, and `EUR/USD OTC` inputs.

---

### Phase 8 — Documentation: Stock Symbol Edge Case (LOW)
> **Impact:** Prevents future engineers from unknowingly breaking stock OTC support.

- [ ] **8.1** Add a comment to `normalize_asset()` in `backend/utils/asset_utils.py` documenting the `#` prefix limitation:
  ```python
  def normalize_asset(asset: str) -> str:
      """
      Canonical asset normalization - use everywhere for internal keys.
      Removes all non-alphanumeric characters and converts to uppercase.

      Example: 'EUR/USD (OTC)' -> 'EURUSDOTC'
      Example: 'EURUSD_otc'   -> 'EURUSDOTC'

      NOTE: Stock symbols with '#' prefix (e.g. '#AAPL_otc') will have
      the '#' stripped → 'AAPOTC'. This is intentional for internal key
      consistency. The SSID executor's _normalize_asset_symbol() handles
      the '#' prefix separately for PocketOption API calls.
      """
  ```
- [ ] **8.2** Add a corresponding comment to `_normalize_asset_symbol()` in `backend/services/ssid_service/executor.py` cross-referencing the above.

---

## Verification Checklist (Post-Implementation)

- [ ] `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short` → all tests pass
- [ ] `npm run lint` in `gui/Dashboard/` → zero errors
- [ ] `npm run build` in `gui/Dashboard/` → clean build
- [ ] Manual smoke test: send `POST /api/v1/indicators` with `asset: "EURUSD_otc"` and then `asset: "EURUSDOTC"` — both should return identical results and the second call should be a cache hit (check gateway logs for "Cache hit")
- [ ] Manual smoke test: chart watermark displays `EUR/USD OTC` correctly for all three input formats
- [ ] Manual smoke test: alert dispatcher resolves correct history folder for a known asset

---

## Files Touched Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `backend/services/gateway/routes/indicators.py` | Add `normalize_asset` import + call | Phase 1 |
| `backend/utils/history_utils.py` | Simplify `asset_base` computation | Phase 2 |
| `backend/scripts/otc_alert_dispatch.py` | Fix folder map preference logic | Phase 3 |
| `backend/services/gateway/routes/history.py` | Add `normalize_asset` call on path param | Phase 4 |
| `backend/utils/asset_utils.py` | Remove deprecated alias + add doc comment | Phase 5, 8 |
| `backend/services/gateway/routes/common.py` | Remove deprecated alias | Phase 5 |
| `backend/services/ssid_service/executor.py` | Add cross-reference doc comment | Phase 8 |
| `gui/Dashboard/src/store/marketStore.js` | Replace local copy with import | Phase 6 |
| `gui/Dashboard/src/components/TickerTape.jsx` | Replace local copy with import | Phase 6 |
| `gui/Dashboard/src/components/ChartContainer.jsx` | Add normalization guard to `formatAssetLabel` | Phase 7 |

**Total files:** 10  
**Estimated effort:** ~2–3 hours (all changes are small, targeted, and low-risk)

---

## Risk Assessment

| Phase | Risk Level | Notes |
|-------|-----------|-------|
| Phase 1 (indicators cache key) | 🟡 Low-Medium | Cache behavior change — verify with smoke test |
| Phase 2 (history_utils) | 🟢 Low | Only affects assets with `(` in name — rare in practice |
| Phase 3 (alert dispatcher) | 🟢 Low | Only affects systems with duplicate directory formats |
| Phase 4 (history route) | 🟢 Low | Defensive only — no behavior change for well-formed inputs |
| Phase 5 (remove deprecated) | 🟢 Low | Confirm zero callers before deleting |
| Phase 6 (frontend consolidation) | 🟡 Low-Medium | Touches two stores — run full lint + build |
| Phase 7 (formatAssetLabel guard) | 🟢 Low | Cosmetic only — no data path affected |
| Phase 8 (documentation) | 🟢 None | Comments only |

---

*This plan was produced by @Investigator (read-only forensic analysis) and is ready for @Coder implementation.*  
*No code was modified during the investigation phase.*
