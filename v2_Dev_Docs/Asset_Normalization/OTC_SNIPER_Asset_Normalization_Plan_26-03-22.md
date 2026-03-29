# OTC SNIPER — Asset Normalization Alignment Plan
**File:** `v2_Dev_Docs/Asset_Normalization/OTC_SNIPER_Asset_Normalization_Plan_26-03-22.md`  
**Date:** 2026-03-22  
**Author:** @Investigator (Forensic Analysis) → Plan compiled for @Coder / @Architect  
**Scope:** `ssid/web_app` (OTC SNIPER) project — Asset Normalization alignment with QuFLX-v2 canonical standard  
**Status:** 🟢 In Progress (Phase 7 Complete, Phase 6 Verification Pending Post-Deploy)

---

## Executive Summary

The OTC SNIPER project (`ssid/web_app`) currently normalizes all asset names by **stripping the OTC suffix entirely** (e.g., `EURUSD_otc` → `EURUSD`). This is architecturally incorrect for a Pocket Option trading system because:

1. **Pocket Option provides BOTH regular Forex pairs AND OTC pairs** — they are different instruments with different data feeds, different payouts, and different trading hours. The current normalization makes it **impossible to distinguish** `EURUSD` (regular Forex) from `EURUSD_otc` (OTC) at any layer of the system.

2. **The OTC SNIPER has 4 separate normalization implementations** across 3 backend files + 1 frontend file, and they all strip OTC — meaning this is a systemic architectural flaw, not a single-file bug.

3. **The format is incompatible with QuFLX-v2** — any feature ported between projects will silently break because the canonical key formats are different (`EURUSD` vs `EURUSDOTC`).

### Decision: Adopt `EURUSDOTC` Format (QuFLX-v2 Standard)

The canonical internal key format for **both projects** shall be `EURUSDOTC`:
- Strips all non-alphanumeric characters
- Uppercases the result
- Preserves the `OTC` suffix as part of the key
- Works as Redis keys, filesystem paths, URL segments, JSON keys, and JS object keys without escaping
- Distinguishes OTC from regular Forex (`EURUSDOTC` ≠ `EURUSD`)
- Extensible to all asset classes: `BTCUSDOTC` (Crypto), `AAPLOTC` (Stocks), `XAUUSDOTC` (Commodities)

---

## Architecture: The Three Normalization Contexts

Both projects must respect the same three normalization contexts:

```
PocketOption WebSocket (raw)          Internal / Storage / Redis          UI Display
─────────────────────────────         ──────────────────────────          ──────────────
  EURUSD_otc                    →       EURUSDOTC                   →     EUR/USD OTC
  EUR/USD OTC                   →       EURUSDOTC                   →     EUR/USD OTC
  EURUSD_OTC                    →       EURUSDOTC                   →     EUR/USD OTC
  BTCUSD_otc                    →       BTCUSDOTC                   →     BTC/USD OTC
  #AAPL_otc                     →       AAPLOTC                     →     AAPL OTC
  XAUUSD_otc                    →       XAUUSDOTC                   →     XAU/USD OTC
```

| Context | Purpose | Format | Function |
|---------|---------|--------|----------|
| **Context 1** — Internal Key | Redis keys, filesystem dirs, cache keys, tick matching, subscriptions, Socket.IO rooms | `EURUSDOTC` | `normalize_asset()` |
| **Context 2** — PocketOption API | Trade execution via PocketOption WebSocket | `EURUSD_otc` | `to_pocket_option_format()` (NEW) |
| **Context 3** — UI Display | Human-readable labels in the frontend | `EUR/USD OTC` | `formatAssetLabel()` (NEW) |

---

## Current State Map — OTC SNIPER

### Backend Normalization (Current — BROKEN)

| File | Function | Current Output | Problem |
|------|----------|----------------|---------|
| `ssid/web_app/backend/src/asset_utils.py` | `normalize_asset()` | `EURUSD_otc` → `EURUSD` | Strips OTC — loses instrument distinction |
| `ssid/web_app/backend/data_streaming/redis_gateway.py:68` | Fallback `normalize_asset()` | `EURUSD_otc` → `EURUSD` | Fallback also strips OTC |
| `ssid/web_app/backend/main.py` | **NONE** | Raw passthrough | No normalization in trade execution path |

### Frontend Normalization (Current — BROKEN)

| File | Function | Current Output | Problem |
|------|----------|----------------|---------|
| `ssid/web_app/frontend/src/components/TradingPlatform.jsx:24` | `normalizeAssetId()` | `EURUSDOTC` → `EURUSD` | Strips OTC — 4th divergent implementation |

### Asset Name Flow Through System (Current — BROKEN)

```
PocketOption WS → Chrome Interceptor → normalize_asset() → "EURUSD"
                                                              ↓
                                                    Redis Pub/Sub channel
                                                              ↓
                                              redis_gateway enrichment_handler()
                                                    normalize_asset() → "EURUSD"
                                                              ↓
                                                    Socket.IO room: market_data:EURUSD
                                                              ↓
                                              Frontend TradingPlatform.jsx
                                                    normalizeAssetId() → "EURUSD"

PocketOption API → /api/assets → asset.id (raw format, e.g. "EURUSD_otc")
                                      ↓
                              Frontend selectedAsset.id → "EURUSD_otc"
                                      ↓
                              /api/trade → dm.select_asset("EURUSD_otc") → PocketOption WS
```

**The streaming path uses `EURUSD` but the trading path uses `EURUSD_otc`** — these are disconnected.

---

## Target State Map — After This Plan

### Backend Normalization (Target — CORRECT)

| File | Function | Target Output | Notes |
|------|----------|---------------|-------|
| `ssid/web_app/backend/src/asset_utils.py` | `normalize_asset()` | `EURUSD_otc` → `EURUSDOTC` | Matches QuFLX-v2 |
| `ssid/web_app/backend/src/asset_utils.py` | `to_pocket_option_format()` | `EURUSDOTC` → `EURUSD_otc` | NEW — reverse normalizer |
| `ssid/web_app/backend/data_streaming/redis_gateway.py` | Uses `normalize_asset()` | `EURUSD_otc` → `EURUSDOTC` | No code change needed — just function output changes |
| `ssid/web_app/backend/main.py` | Normalize at trade entry | `EURUSD_otc` → `EURUSDOTC` → `EURUSD_otc` | Add normalization + reverse |

### Frontend Normalization (Target — CORRECT)

| File | Function | Target Output | Notes |
|------|----------|---------------|-------|
| `ssid/web_app/frontend/src/utils/assetUtils.js` | `normalizeAsset()` | `EURUSD_otc` → `EURUSDOTC` | NEW shared utility |
| `ssid/web_app/frontend/src/components/TradingPlatform.jsx` | Import from assetUtils | `EURUSD_otc` → `EURUSDOTC` | Replace inline function |

### Asset Name Flow Through System (Target — CORRECT)

```
PocketOption WS → Chrome Interceptor → normalize_asset() → "EURUSDOTC"
                                                              ↓
                                                    Redis Pub/Sub channel
                                                              ↓
                                              redis_gateway enrichment_handler()
                                                    normalize_asset() → "EURUSDOTC"
                                                              ↓
                                                    Socket.IO room: market_data:EURUSDOTC
                                                              ↓
                                              Frontend TradingPlatform.jsx
                                                    normalizeAsset() → "EURUSDOTC"
                                                    focus_asset emit → "EURUSDOTC"

PocketOption API → /api/assets → asset.id (raw format, e.g. "EURUSD_otc")
                                      ↓
                              Frontend selectedAsset.id → "EURUSD_otc"
                                      ↓
                              /api/trade → normalize_asset() → "EURUSDOTC"
                                      ↓
                              to_pocket_option_format() → "EURUSD_otc"
                                      ↓
                              dm.select_asset("EURUSD_otc") → PocketOption WS
```

---

## Implementation Plan

### Phase 1 — Backend: Rewrite `asset_utils.py` (CRITICAL — Do First)
> **Impact:** All downstream consumers automatically get the correct format. This is the single most important change.

- [x] **1.1** Rewrite `ssid/web_app/backend/src/asset_utils.py` with the new canonical logic:

```python
"""
asset_utils.py — Shared Asset Name Normalization
=================================================
Single source of truth for asset name normalization across the OTC SNIPER backend.

Aligned with QuFLX-v2 canonical standard (backend/utils/asset_utils.py).

Three normalization contexts:
  Context 1 — Internal Key:     EURUSDOTC  (Redis keys, filesystem, cache, subscriptions)
  Context 2 — PocketOption API: EURUSD_otc (trade execution WebSocket format)
  Context 3 — UI Display:       EUR/USD OTC (human-readable labels — handled in frontend)

Usage:
    from asset_utils import normalize_asset, to_pocket_option_format

    normalize_asset("EURUSD_OTC")   → "EURUSDOTC"
    normalize_asset("EURUSD_otc")   → "EURUSDOTC"
    normalize_asset("#EURUSD")      → "EURUSDOTC"  (# stripped — intentional for internal keys)
    normalize_asset("EURUSD-OTC")   → "EURUSDOTC"
    normalize_asset("OTCQ-EURUSD")  → "OTCQEURUSD" (prefix preserved as alphanumeric)
    normalize_asset("eurusd_otc")   → "EURUSDOTC"
    normalize_asset("")             → ""

    to_pocket_option_format("EURUSDOTC")  → "EURUSD_otc"
    to_pocket_option_format("BTCUSDOTC")  → "BTCUSD_otc"
    to_pocket_option_format("AAPLOTC")    → "AAPL_otc"
"""

import re


def normalize_asset(raw: str) -> str:
    """
    Normalize an asset name to the canonical internal key format.

    Strips ALL non-alphanumeric characters and converts to uppercase.
    This is Context 1 normalization — used for Redis keys, filesystem
    directories, cache keys, tick matching, and Socket.IO room names.

    Examples:
        normalize_asset("EURUSD_otc")   → "EURUSDOTC"
        normalize_asset("EUR/USD OTC")  → "EURUSDOTC"
        normalize_asset("EURUSD_OTC")   → "EURUSDOTC"
        normalize_asset("BTCUSD_otc")   → "BTCUSDOTC"
        normalize_asset("#AAPL_otc")    → "AAPLOTC"   (# stripped — intentional)
        normalize_asset("eurusd")       → "EURUSD"    (non-OTC Forex pair)

    NOTE: Stock symbols with '#' prefix (e.g. '#AAPL_otc') will have
    the '#' stripped → 'AAPLOTC'. This is intentional for internal key
    consistency. Use to_pocket_option_format() when sending to the API.

    Returns:
        Canonical uppercase alphanumeric key, e.g. "EURUSDOTC".
        Empty string if input is empty or None.
    """
    if not raw:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(raw)).upper()


def to_pocket_option_format(asset: str) -> str:
    """
    Convert a canonical internal key to PocketOption API format.

    This is Context 2 normalization — used ONLY when sending trade orders
    to the PocketOption WebSocket API. The API expects UPPERCASE base with
    lowercase '_otc' suffix.

    Examples:
        to_pocket_option_format("EURUSDOTC")  → "EURUSD_otc"
        to_pocket_option_format("BTCUSDOTC")  → "BTCUSD_otc"
        to_pocket_option_format("AAPLOTC")    → "AAPL_otc"
        to_pocket_option_format("EURUSD")     → "EURUSD"  (non-OTC, no suffix added)

    NOTE: This function assumes the input is already in canonical format
    (output of normalize_asset()). Do not pass raw PocketOption strings.

    Returns:
        PocketOption API format string, e.g. "EURUSD_otc".
        Empty string if input is empty or None.
    """
    if not asset:
        return ""
    s = str(asset).strip().upper()
    if s.endswith("OTC"):
        base = s[:-3]  # strip trailing OTC
        return f"{base}_otc"
    return s
```

- [x] **1.2** Verify the new function produces correct output for all known asset types:
  - `normalize_asset("EURUSD_otc")` → `"EURUSDOTC"` ✓
  - `normalize_asset("BTCUSD_otc")` → `"BTCUSDOTC"` ✓
  - `normalize_asset("#AAPL_otc")` → `"AAPLOTC"` ✓
  - `normalize_asset("XAUUSD_otc")` → `"XAUUSDOTC"` ✓
  - `to_pocket_option_format("EURUSDOTC")` → `"EURUSD_otc"` ✓
  - `to_pocket_option_format("AAPLOTC")` → `"AAPL_otc"` ✓

---

### Phase 2 — Backend: Update Redis Gateway (HIGH — Rooms Change)
> **Impact:** Socket.IO rooms change from `market_data:EURUSD` to `market_data:EURUSDOTC`. Frontend must be updated in the same deployment.

- [x] **2.1** In `ssid/web_app/backend/data_streaming/redis_gateway.py`, the `enrichment_handler()` already calls `normalize_asset(raw_asset)` — **no code change needed**. The room name will automatically become `market_data:EURUSDOTC` once Phase 1 is deployed.

- [x] **2.2** In `ssid/web_app/backend/data_streaming/redis_gateway.py`, the `focus_asset` Socket.IO handler already calls `normalize_asset(raw_asset)` — **no code change needed**.

- [x] **2.3** Verify the fallback `normalize_asset()` in `redis_gateway.py` (lines 68-70) is also updated. Since it's a fallback for import failure, update it to match the new logic:
  ```python
  def normalize_asset(raw: str) -> str:  # type: ignore[misc]
      """Fallback no-op normalization when asset_utils import fails."""
      if not raw:
          return ""
      return re.sub(r"[^A-Za-z0-9]", "", str(raw)).upper()
  ```

- [x] **2.4** Restart the Redis Gateway service and verify logs show `market_data:EURUSDOTC` room names.

---

### Phase 3 — Backend: Fix Trade Execution Path in `main.py` (HIGH)
> **Impact:** Ensures the trade execution path uses the same canonical key as the streaming path, with a proper reverse normalizer for the PocketOption API.

- [x] **3.1** In `ssid/web_app/backend/main.py`, add the import at the top:
  ```python
  import sys
  from pathlib import Path
  _SRC_DIR = Path(__file__).resolve().parent / "src"
  if str(_SRC_DIR) not in sys.path:
      sys.path.insert(0, str(_SRC_DIR))
  from asset_utils import normalize_asset, to_pocket_option_format
  ```

- [x] **3.2** In the `/api/trade` endpoint, normalize the asset before passing to `dm.select_asset()`:
  ```python
  @app.post("/api/trade")
  async def execute_trade(request: TradeRequest):
      account_type = "demo" if request.demo else "real"
      dm = sessions.get(account_type)

      if not dm:
          raise HTTPException(status_code=400, detail=f"{account_type.capitalize()} account not connected")

      # Normalize to canonical key, then convert to PocketOption API format
      canonical_asset = normalize_asset(request.asset_id)
      po_asset = to_pocket_option_format(canonical_asset)

      if not dm.select_asset(po_asset):
          raise HTTPException(status_code=404, detail=f"Asset not found: {po_asset}")

      loop = asyncio.get_running_loop()
      result = await loop.run_in_executor(
          None,
          lambda: dm.execute_trade(
              direction=request.direction,
              amount=request.amount,
              expiration=request.expiration
          )
      )
      return result
  ```

- [x] **3.3** Test with demo account: send a trade for `EURUSD_otc` and verify it executes correctly.

---

### Phase 4 — Frontend: Create Shared `assetUtils.js` (HIGH — Must Match Backend)
> **Impact:** Eliminates the 4th divergent normalization implementation. Ensures frontend and backend use identical logic.

- [x] **4.1** Create `ssid/web_app/frontend/src/utils/assetUtils.js`:

```javascript
/**
 * assetUtils.js — Shared Asset Name Normalization
 * ================================================
 * Single source of truth for asset name normalization in the OTC SNIPER frontend.
 *
 * Aligned with QuFLX-v2 canonical standard (gui/Dashboard/src/utils/assetUtils.js).
 *
 * Three normalization contexts:
 *   Context 1 — Internal Key:     EURUSDOTC  (Socket.IO rooms, state keys, comparisons)
 *   Context 2 — PocketOption API: EURUSD_otc (handled by backend — do not use in frontend)
 *   Context 3 — UI Display:       EUR/USD OTC (use formatAssetLabel())
 *
 * Usage:
 *   import { normalizeAsset, formatAssetLabel } from '../utils/assetUtils';
 *
 *   normalizeAsset("EURUSD_otc")   → "EURUSDOTC"
 *   normalizeAsset("EURUSD_OTC")   → "EURUSDOTC"
 *   normalizeAsset("eurusd_otc")   → "EURUSDOTC"
 *   normalizeAsset("")             → ""
 *
 *   formatAssetLabel("EURUSDOTC")  → "EUR/USD OTC"
 *   formatAssetLabel("BTCUSDOTC")  → "BTC/USD OTC"
 *   formatAssetLabel("AAPLOTC")    → "AAPL OTC"
 */

/**
 * Normalize an asset name to the canonical internal key format.
 * Strips ALL non-alphanumeric characters and converts to uppercase.
 *
 * @param {string} asset - Raw asset name in any format
 * @returns {string} Canonical uppercase key, e.g. "EURUSDOTC"
 */
export const normalizeAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

/**
 * Format a canonical asset key for human-readable UI display.
 * Converts "EURUSDOTC" → "EUR/USD OTC", "AAPLOTC" → "AAPL OTC".
 *
 * @param {string} asset - Canonical asset key (output of normalizeAsset)
 * @returns {string} Human-readable label, e.g. "EUR/USD OTC"
 */
export const formatAssetLabel = (asset) => {
  if (!asset || typeof asset !== 'string') return '';
  // Normalize first to ensure consistent input format
  const normalized = String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const isOtc = normalized.endsWith('OTC');
  const base = isOtc ? normalized.slice(0, -3) : normalized;
  // Split 6-char currency pairs into XXX/YYY format
  const formatted = base.length === 6
    ? `${base.slice(0, 3)}/${base.slice(3)}`
    : base;
  return isOtc ? `${formatted} OTC` : formatted;
};
```

- [x] **4.2** Verify the utility produces correct output:
  - `normalizeAsset("EURUSD_otc")` → `"EURUSDOTC"` ✓
  - `normalizeAsset("BTCUSD_otc")` → `"BTCUSDOTC"` ✓
  - `formatAssetLabel("EURUSDOTC")` → `"EUR/USD OTC"` ✓
  - `formatAssetLabel("AAPLOTC")` → `"AAPL OTC"` ✓
  - `formatAssetLabel("BTCUSDOTC")` → `"BTC/USD OTC"` ✓

---

### Phase 5 — Frontend: Update `TradingPlatform.jsx` (HIGH — Must Deploy With Phase 2)
> **Impact:** Frontend Socket.IO room joins must match the new backend room names (`market_data:EURUSDOTC`).

- [x] **5.1** In `ssid/web_app/frontend/src/components/TradingPlatform.jsx`:
  - Add import at the top: `import { normalizeAsset, formatAssetLabel } from '../utils/assetUtils';`
  - Remove the inline `normalizeAssetId` function (line 24)

- [x] **5.2** Replace all usages of `normalizeAssetId` with `normalizeAsset`:
  ```javascript
  // BEFORE (line 24):
  const normalizeAssetId = (id) =>
    id ? id.toUpperCase().replace(/_OTC$/i, '').replace(/OTC$/i, '').replace(/^OTC/i, '').trim() : '';

  // AFTER: Remove this function entirely — use imported normalizeAsset instead
  ```

- [x] **5.3** In the `warmup_status` handler, update the comparison:
  ```javascript
  socketRef.current.on('warmup_status', (data) => {
    const incomingAsset = normalizeAsset(data.asset);          // was: normalizeAssetId
    const currentAsset  = normalizeAsset(selectedAssetRef.current?.id);  // was: normalizeAssetId
    if (incomingAsset && incomingAsset === currentAsset) {
      setOteoWarmup({
        ready: data.ready,
        ticks: data.ticks_received,
        asset: data.asset,
      });
    }
  });
  ```

- [x] **5.4** In the `focus_asset` emit, normalize the asset ID before sending:
  ```javascript
  useEffect(() => {
    if (socketRef.current && selectedAsset && streamStatus === 'connected') {
      // Normalize before emitting so backend room matching is consistent
      socketRef.current.emit('focus_asset', { asset: normalizeAsset(selectedAsset.id) });
      setStreamPrices([]);
    }
  }, [selectedAsset, streamStatus]);
  ```

- [x] **5.5** Run `npm run build` in `ssid/web_app/frontend/` to confirm no regressions.

---

### Phase 6 — Tick Logger & Signal Logger Verification (LOW)
> **Impact:** Verify that tick log directories now use `EURUSDOTC/` format. No code changes needed.

- [~] **6.1** After deploying Phases 1-5, start the system and observe a few ticks. *(Pending fresh post-deploy runtime data)*
- [~] **6.2** Verify that `ssid/web_app/data/tick_logs/` now contains directories named `EURUSDOTC/`, `BTCUSDOTC/`, etc. (not `EURUSD/`). *(Pending fresh post-deploy runtime data)*
- [~] **6.3** Verify that `ssid/web_app/data/signals/` records use the `EURUSDOTC` format in the `asset` field. *(Pending fresh post-deploy runtime data)*
- [x] **6.4** Note: Existing tick log data in old `EURUSD/` directories will remain. Add a migration note in the README if needed.

---

### Phase 7 — Documentation Update (LOW)
> **Impact:** Prevents future engineers from reverting to the old format.

- [x] **7.1** Update `ssid/web_app/backend/src/asset_utils.py` docstring to document all three contexts (already included in Phase 1 code above).

- [x] **7.2** Update `ssid/web_app/README.md` to document the normalization standard:
  ```markdown
  ## Asset Normalization

  All asset names are normalized to the canonical `EURUSDOTC` format internally.
  This matches the QuFLX-v2 standard. The PocketOption API format (`EURUSD_otc`)
  is only used at the trade execution boundary via `to_pocket_option_format()`.
  ```

- [x] **7.3** Add a comment to `TradingPlatform.jsx` near the `focus_asset` emit explaining the normalization:
  ```javascript
  // Normalize asset ID to canonical format (EURUSDOTC) before emitting.
  // Backend rooms use this format: market_data:EURUSDOTC
  ```

---

## Verification Checklist (Post-Implementation)

### Backend Verification
- [x] `normalize_asset("EURUSD_otc")` returns `"EURUSDOTC"` (not `"EURUSD"`)
- [x] `normalize_asset("BTCUSD_otc")` returns `"BTCUSDOTC"`
- [x] `normalize_asset("#AAPL_otc")` returns `"AAPLOTC"`
- [x] `to_pocket_option_format("EURUSDOTC")` returns `"EURUSD_otc"`
- [x] `to_pocket_option_format("AAPLOTC")` returns `"AAPL_otc"`
- [x] Redis Gateway logs show `market_data:EURUSDOTC` room names
- [~] Tick log directories are `data/tick_logs/EURUSDOTC/` (not `EURUSD/`)

### Frontend Verification
- [x] `normalizeAsset("EURUSD_otc")` returns `"EURUSDOTC"`
- [x] `formatAssetLabel("EURUSDOTC")` returns `"EUR/USD OTC"`
- [x] `focus_asset` Socket.IO emit sends `{ asset: "EURUSDOTC" }`
- [x] `warmup_status` handler correctly matches incoming asset to selected asset
- [x] `npm run build` passes with zero errors

### End-to-End Verification
- [~] Select `EURUSD_otc` asset in the frontend
- [~] Verify streaming data appears (Socket.IO room join succeeds)
- [~] Verify OTEO warmup status updates correctly
- [~] Execute a demo trade and verify it succeeds
- [~] Verify tick logs are written to `EURUSDOTC/` directory

---

## Files Touched Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `ssid/web_app/backend/src/asset_utils.py` | **REWRITE** — new logic + `to_pocket_option_format()` | Phase 1 |
| `ssid/web_app/backend/data_streaming/redis_gateway.py` | Update fallback normalizer only | Phase 2 |
| `ssid/web_app/backend/main.py` | Add normalization + reverse normalizer in trade path | Phase 3 |
| `ssid/web_app/frontend/src/utils/assetUtils.js` | **NEW FILE** — shared utility | Phase 4 |
| `ssid/web_app/frontend/src/components/TradingPlatform.jsx` | Replace inline normalizer with import | Phase 5 |
| `ssid/web_app/README.md` | Add normalization documentation | Phase 7 |

**Total files:** 6  
**Estimated effort:** ~2–3 hours (all changes are targeted and low-risk)

---

## Risk Assessment

| Phase | Risk Level | Notes |
|-------|-----------|-------|
| Phase 1 (asset_utils rewrite) | 🟡 Low-Medium | Core change — all downstream consumers affected. Test immediately after. |
| Phase 2 (redis gateway) | 🟡 Low-Medium | Socket.IO room names change — must deploy with Phase 5 (frontend) together |
| Phase 3 (trade execution) | 🟡 Low-Medium | Test with demo account before real account |
| Phase 4 (frontend utility) | 🟢 Low | New file — no existing code affected |
| Phase 5 (TradingPlatform) | 🟡 Low-Medium | Must deploy with Phase 2 — room names must match |
| Phase 6 (verification) | 🟢 None | Read-only verification |
| Phase 7 (documentation) | 🟢 None | Comments and docs only |

### Critical Deployment Note
**Phases 2 and 5 MUST be deployed together.** If the backend uses `market_data:EURUSDOTC` rooms but the frontend still emits `focus_asset` with `EURUSD`, the client will join the wrong room and receive no data.

### Data Migration Note
Existing tick log files in `data/tick_logs/EURUSD/` directories will remain on disk. They will not be automatically migrated. New ticks will be written to `data/tick_logs/EURUSDOTC/`. This is acceptable — old data is still accessible for analysis.

---

## Comparison: QuFLX-v2 vs OTC SNIPER (Before/After)

| Aspect | QuFLX-v2 | OTC SNIPER (Before) | OTC SNIPER (After) |
|--------|----------|---------------------|-------------------|
| **Internal Key Format** | `EURUSDOTC` | `EURUSD` ❌ | `EURUSDOTC` ✅ |
| **Backend Canonical** | `backend/utils/asset_utils.py` | `backend/src/asset_utils.py` (wrong logic) | `backend/src/asset_utils.py` (aligned) ✅ |
| **Frontend Canonical** | `gui/Dashboard/src/utils/assetUtils.js` | Inline in TradingPlatform.jsx | `frontend/src/utils/assetUtils.js` ✅ |
| **Reverse Normalizer** | `_normalize_asset_symbol()` in executor.py | **None** ❌ | `to_pocket_option_format()` ✅ |
| **Redis Room Format** | `market_data:EURUSDOTC` | `market_data:EURUSD` ❌ | `market_data:EURUSDOTC` ✅ |
| **Tick Log Dirs** | `data/.../EURUSDOTC/` | `data/tick_logs/EURUSD/` ❌ | `data/tick_logs/EURUSDOTC/` ✅ |
| **OTC vs Forex Distinction** | ✅ Preserved | ❌ Lost | ✅ Preserved |
| **Crypto/Stock/Commodity OTC** | ✅ Works | ❌ Collisions | ✅ Works |

---

*This plan was produced by @Investigator (read-only forensic analysis) and is ready for @Coder implementation.*  
*No code was modified during the investigation phase.*  
*Delegate @Coder for Phase 1-5 implementation. Delegate @Reviewer after each Phase per PHASE_REVIEW_PROTOCOL.md.*
