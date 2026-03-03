# Trade Execution Issues — Session Summary
**Date:** 2026-03-02  
**Session:** Account Trade Execution — SSID Service Debugging

---

## Overview

This session focused entirely on why `POST /api/v1/trading/execute` was returning `400 Bad Request` for all trade attempts. By end of session the root causes were fully identified and fixes were applied across 4 files.

---

## Issues, Error Messages & Root Causes

### Issue 1 — Hardcoded Asset Whitelist (BLOCKER)
**Error:**
```
INFO: "POST /api/v1/trading/execute HTTP/1.1" 400 Bad Request
SSID Service: "Invalid OTC asset: AUDCHF_otc"
```
**Root Cause:** `executor.py` contained a hardcoded list of 13 currency pairs (`OTC_ASSETS`). Any asset not in this list (stocks, crypto, commodities) was rejected before even reaching PocketOption.  
**Fix:** Deleted `OTC_ASSETS` entirely from `executor.py` and `routes.py`. PocketOption's API is the correct authority for asset validation.  
**Files:** `executor.py`, `routes.py`

---

### Issue 2 — Asset Name Format Mismatch (BLOCKER)
**Error:**
```
PocketOptionInstance_Demo | Sending buy order: put 22.0 AUD/CHF OTC (60s)
AsyncWrapper_Demo | Trade failed: UnexpectedError
```
**Root Cause:** The `selectedAsset` stored in the frontend was the display-formatted name (`AUD/CHF OTC`) rather than the raw API symbol (`audchf_otc`). PocketOption's API rejects display names with `UnexpectedError`.  
**Fix:** Added `_normalize_asset_symbol()` to `executor.py` which converts any input format to the correct `audchf_otc` API symbol:
- `AUD/CHF OTC` → `audchf_otc`
- `AUDCHFOTC` → `audchf_otc`
- `AUDCHF_otc` → `audchf_otc`
- `#BA_otc` → `ba_otc`

**Files:** `executor.py`

---

### Issue 3 — Auth Never Sent (BLOCKER)
**Error:**
```
PocketOptionInstance_Demo | Sending buy order: put 21.0 cadchf_otc (60s) [ID: 17b6ed80]
PocketOptionInstance_Demo | Buy order timeout [ID: 17b6ed80]
AsyncWrapper_Demo | Trade failed: Timeout waiting for order confirmation
INFO: "POST /api/trade HTTP/1.1" 400 Bad Request
```
**Root Cause:** The Socket.io auth trigger condition was wrong:
```python
# OLD (broken) — Python evaluates this as just: "sid" in message
elif "40" in message and "sid" in message:

# NEW (correct) — detects the namespace-connected frame
elif message.startswith("40") and not message.startswith("42"):
```
The server's namespace-connected response is just `40` with no `sid` field. The old condition never fired, so the auth message (`42["auth",{...}]`) was **never sent**. PocketOption silently dropped all trades from the unauthenticated session.  
**Fix:** Changed condition to `message.startswith("40") and not message.startswith("42")`.  
**Files:** `pocket_option_instance.py`

---

### Issue 4 — `successauth` & `successopenOrder` Silently Dropped (BLOCKER)
**Error:**
```
Auth timeout — no successauth received within 15s. SSID may be expired.
```
(Even with a fresh, valid SSID — confirmed working in browser.)

**Root Cause:** PocketOption sends `successauth` and `successopenOrder` as `451-[...]` Socket.io frames, **not** `42[...]`. Our `_process_message()` only handled `42[...]`. The `451-[` branch existed in the reference `client.py` but was missing entirely from our implementation.

> This was confirmed by cross-referencing `ssid_integration_package/pocketoptionapi/ws/client.py` (reference) vs `backend/services/ssid_service/pocketoptionapi/pocket_option_instance.py` (our service). The reference handles `successauth` and `successopenOrder` **exclusively** in the `451-[` branch.

**Fix:** Added a complete `451-[` handler branch to `_process_message()` covering:
- `successauth` → signals `_auth_event`, unlocking `connect()`
- `successopenOrder` / `failopenOrder` → resolves the pending trade `asyncio.Future`
- `updateBalance` → updates balance state
- `updateClosedDeals` → logged (data follows via binary branch)

Also added `_resolve_pending_trade()` shared helper called from both `451-[` and `42[` branches.  

Also added `_auth_event` (`asyncio.Event`) and `_auth_failed` flag so `connect()` blocks until `successauth` arrives (or times out), preventing trades on unauthenticated sessions.  
**Files:** `pocket_option_instance.py`

---

### Issue 5 — Real Account 401 (Timeout Cascade)
**Error:**
```
HTTP Request: POST http://127.0.0.1:8001/api/connect "HTTP/1.1 401 Unauthorized"
INFO: "POST /api/v1/trading/connect HTTP/1.1" 401 Unauthorized
```
**Root Cause:** The connector-level `connect()` timeout was `20 seconds`. Real account has 5 fallback URLs × 8s auth wait = up to 40s needed. The wrapper hit 20s and returned `False` → 401, even when the SSID was perfectly valid. Demo only has 2 URLs so it finished within 20s.

**Fix:**
- Raised wrapper `connect()` timeout: `20s → 90s`
- Reduced per-URL auth wait: `15s → 8s` (valid SSID authenticates in <3s; worst case now 5×8=40s)

**Files:** `connector.py`, `pocket_option_instance.py`

---

## Files Changed (All in `backend/services/ssid_service/`)

| File | Changes |
|------|---------|
| `executor.py` | Removed `OTC_ASSETS` whitelist; added `_normalize_asset_symbol()` |
| `routes.py` | Removed `OTC_ASSETS` import; updated `/api/assets` endpoint |
| `connector.py` | Raised `connect()` timeout: 20s → 90s |
| `pocketoptionapi/pocket_option_instance.py` | Fixed auth trigger condition; added `451-[` handler; added `_auth_event`; added `_resolve_pending_trade()` helper; reduced per-URL auth wait to 8s |

---

## Status at End of Session

| Fix | Status |
|-----|--------|
| Asset whitelist removed | ✅ Done |
| Asset name normalisation | ✅ Done |
| Auth message send trigger fixed | ✅ Done |
| `451-[` handler added | ✅ Done |
| Auth race condition (connect waits for successauth) | ✅ Done |
| Connector timeout raised for real account | ✅ Done |
| **Trades actually executing end-to-end** | ⏳ Pending test after service restart |
| WIN/LOSS result polling hardening (P1) | 🔲 Not started — next session |

---

## Important Notes for Next Session

1. **Service must be restarted** after each of the above fixes. The service does not hot-reload.
2. **The order in which to connect:** Start SSID service → click SSID badge → system auto-connects from `.env` SSIDs. Both Demo and Real SSIDs must be fresh (grabbed from browser session cookie).
3. **Reference implementation** at `ssid_integration_package/pocketoptionapi/` is the authoritative guide for how the PocketOption WebSocket protocol works. Always cross-check against it when adding new event handlers.
4. **WIN/LOSS result handling** (P1) still needs attention: `check_win()` only scans passively-received `closed_deals`. No active retry polling. Frontend uses a single one-shot `setTimeout`. This should be the first task next session.
5. **All 4 changed files compile clean** (`py_compile` verified).
