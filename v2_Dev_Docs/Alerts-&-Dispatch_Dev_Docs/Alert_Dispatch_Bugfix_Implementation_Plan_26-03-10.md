# Alert Dispatch — Bugfix & Optimization Implementation Plan
> **Date:** 2026-03-10  
> **Based on:** [Alert Dispatch Assessment Report](../../.gemini/../)  
> **Priority:** Critical bugs first → Frontend fixes → Backend cleanup  

**Status Legend:** `[x]` Complete · `[~]` In Progress · `[ ]` Not Started

---

## Phase 1 — Critical Backend Bugs
> **Goal:** Eliminate production-breaking issues that cause data loss, crashes, and phantom alerts.

### Step 1.1 — Fix Unicode Emoji Logging Crash (BUG-1)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** Every emoji-prefixed log message throws `UnicodeEncodeError` on Windows `cp1252`, silently dropping the log message and polluting log files with stack traces.

**Changes:**
- Force UTF-8 encoding on the `StreamHandler` at logging setup (L74-80):
  ```python
  handlers=[logging.StreamHandler(
      open(sys.stdout.fileno(), 'w', encoding='utf-8', closefd=False)
  )]
  ```
- Add `encoding='utf-8'` to the `FileHandler` if one is configured.
- This is a 3-line fix at the logging configuration block.

---

### Step 1.2 — Add `None` Guard in `process_asset()` (BUG-2)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** `self.scanner.analyze()` returns `None` when there aren't enough candles. The next line accesses `result['condition']` causing `TypeError`.

**Changes:**
- Insert after L1082 (the `scanner.analyze()` call):
  ```python
  if result is None:
      return
  ```
- Single-line guard before the `AlertContext` construction at L1084.

---

### Step 1.3 — Skip Stale Data Processing (BUG-3)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** The dispatcher processes CSV data that is hours old, generating phantom alerts on stale market conditions.

**Changes:**
- In `fetch_data()` (around L1008-1016), change the stale data behavior from a warning to a skip:
  ```python
  STALE_THRESHOLD = int(os.getenv("STALE_DATA_THRESHOLD_SECONDS", "300"))  # 5 min default
  if age > STALE_THRESHOLD:
      logger.warning(f"Data for {asset} is STALE ({age}s old). Skipping scan.")
      return []  # Return empty → process_asset() will exit early
  ```
- Keep the warning log so it's visible, but return no data so the pipeline stops.
- Make threshold configurable via env var `STALE_DATA_THRESHOLD_SECONDS`.

---

### Step 1.4 — Fix Graceful Shutdown (BUG-4)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** Worker and subscriber tasks are never cancelled on shutdown, causing "Task was destroyed but it is pending" errors and `RuntimeError`.

**Changes:**
- Update `OTCDispatcher.close()` (L932-939) to cancel all worker and subscriber tasks:
  ```python
  async def close(self):
      logger.info("Closing OTC Dispatcher components...")
      # Cancel all asset workers
      for asset, task in self._asset_tasks.items():
          if not task.done():
              task.cancel()
      # Wait briefly for cancellation
      if self._asset_tasks:
          await asyncio.gather(*self._asset_tasks.values(), return_exceptions=True)
      self._asset_tasks.clear()
      # Close service components
      await self.ai.close()
      await self.discord.close()
      if self._redis_client:
          await self._redis_client.aclose()  # Fix deprecated close()
  ```
- In `TickerSubscriber.run()` and `SettingsSubscriber.run()`, replace `await client.close()` with `await client.aclose()` (fixes deprecation warning).
- Store subscriber task references in `run_loop()` so they can be cancelled in `close()`.

---

## Phase 2 — Frontend Fixes
> **Goal:** Fix UI behavior issues in `AlertDispatchPage.jsx`.

### Step 2.1 — Fix Pause Button (ISSUE-5)  `[x]`

**File:** `gui/Dashboard/src/components/AlertDispatchPage.jsx`  
**Problem:** The Socket.IO event handler closes over the initial value of `paused` (always `false`) because the `useEffect` has `[]` deps. Pause never works.

**Changes:**
- Add a `pausedRef` that stays in sync with state:
  ```jsx
  const pausedRef = useRef(false);
  // Sync ref with state
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  ```
- Inside the Socket.IO handler, read `pausedRef.current` instead of `paused`:
  ```jsx
  if (pausedRef.current) {
      pauseBuffer.current.push(entry);
      return;
  }
  ```

---

### Step 2.2 — Fix Heartbeat Staleness Auto-Update (ISSUE-6)  `[x]`

**File:** `gui/Dashboard/src/components/AlertDispatchPage.jsx`  
**Problem:** `heartbeatAge` and `heartbeatStale` are only recalculated on re-render, so the "STALE" indicator may show "SYNC" indefinitely if no new events arrive.

**Changes:**
- Add a `tick` state variable + interval to force periodic recalculation:
  ```jsx
  const [tick, setTick] = useState(0);
  useEffect(() => {
      const id = setInterval(() => setTick(t => t + 1), 5000);
      return () => clearInterval(id);
  }, []);
  ```
- Include `tick` in the `heartbeatAge` / `heartbeatStale` calculation block (or wrap in `useMemo` with `tick` dep) so it refreshes every 5 seconds.

---

### Step 2.3 — Fix Log File Double-Fetch (ISSUE-7)  `[x]`

**File:** `gui/Dashboard/src/components/AlertDispatchPage.jsx`  
**Problem:** The log file index `useEffect` has `selectedFile` in its dependency array, causing a re-fetch loop when `selectedFile` is auto-set.

**Changes:**
- Remove `selectedFile` from the dependency array of the log index effect (L164):
  ```diff
  - }, [tab, selectedFile]);
  + }, [tab]);
  ```
- The auto-selection of the latest file already happens inside the effect, so `selectedFile` as a dep is unnecessary and causes the loop.

---

## Phase 3 — Backend Cleanup & Optimization
> **Goal:** Improve code quality, reduce duplication, and fix minor issues per Core Principles.

### Step 3.1 — DRY `DiscordDispatcher` Session Management (ISSUE-8)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** Session creation is copy-pasted in 3 methods (`send_alert`, `send_market_warning`, `send_developing_alert`).

**Changes:**
- Extract a private `_get_session()` method:
  ```python
  async def _get_session(self) -> aiohttp.ClientSession:
      if self._session is None or self._session.closed:
          self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
      return self._session
  ```
- Replace the 3 inline session checks with `session = await self._get_session()`.

---

### Step 3.2 — Fix Bare `except:` in `TickLogger` (ISSUE-10)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** `TickLogger.flush()` → `get_ts()` has a bare `except:` block (L651) that swallows all exceptions.

**Changes:**
- Replace with:
  ```python
  except Exception as e:
      logger.warning(f"Unparseable timestamp in tick data: {t!r} ({e})")
      return int(datetime.now().timestamp())
  ```

---

### Step 3.3 — Expand Correlation Groups (ISSUE-9)  `[x]`

**File:** `backend/scripts/otc_alert_dispatch.py`  
**Problem:** Correlation groups only cover AUD, EUR, GBP, USD — missing NZD, CHF, JPY, CAD.

**Changes:**
- Add missing groups at L856-861:
  ```python
  "NZD": ["NZDUSDOTC", "NZDJPYOTC", "AUDNZDOTC", "NZDCADOTC", "NZDCHFDOTC"],
  "JPY": ["USDJPYOTC", "EURJPYOTC", "GBPJPYOTC", "AUDJPYOTC", "NZDJPYOTC", "CADJPYOTC", "CHFJPYOTC"],
  "CAD": ["USDCADOTC", "EURCADOTC", "GBPCADOTC", "AUDCADOTC", "NZDCADOTC", "CADCHFDOTC", "CADJPYOTC"],
  "CHF": ["USDCHFDOTC", "EURCHFDOTC", "GBPCHFDOTC", "AUDCHFDOTC", "NZDCHFDOTC", "CADCHFDOTC", "CHFJPYOTC"],
  ```

---

## Phase 4 — Verification
> **Goal:** Confirm all fixes work correctly without regressions.

### Step 4.1 — Backend Smoke Test  `[x]`

**Result (2026-03-10):** PASS
```
2026-03-10T18:14:36Z | INFO | OTC_Dispatch | Starting OTC Dispatcher...
2026-03-10T18:14:36Z | WARNING | OTC_Dispatch | ⚠️ RUNNING IN TEST MODE (Mock Data) ⚠️
2026-03-10T18:14:36Z | INFO | OTC_Dispatch | Test Mode: Generating mock data for EURUSD_OTC
2026-03-10T18:14:36Z | INFO | OTC_Dispatch | Test Mode Complete.
2026-03-10T18:14:36Z | INFO | OTC_Dispatch | Closing OTC Dispatcher components...
2026-03-10T18:14:36Z | INFO | OTC_Dispatch | Cancelled 0 worker task(s).
```
- No `UnicodeEncodeError` entries ✅
- No `--- Logging error ---` blocks ✅  
- Clean exit with graceful shutdown message ✅
- `Cancelled 0 worker task(s).` confirms new close() runs correctly ✅

---

### Step 4.2 — Frontend Visual Verification  `[ ]`

**Method:** Start the dashboard dev server and manually verify:

1. **Pause Button** — click Pause, confirm events stop; click Resume, confirm buffer flushes
2. **Heartbeat Staleness** — observe indicator transitions to STALE within ~15s after backend disconnects (without interaction)
3. **Log Tab** — switch to Log Files tab, verify only 1 network request to `/api/v1/dev/logs/index`

---

### Step 4.3 — Stale Data Skip Test  `[ ]`

**Method:** Manual verification against the log output:
1. Ensure at least one asset's CSV data is older than 5 minutes
2. Run the dispatcher with that asset
3. **PASS Criteria:** Log should show `Data for X is STALE (Xs old). Skipping scan.` and **no** `Condition Met` or `Developing Setup` lines for that asset

---

## Files Modified Summary

| File | Phase | Changes |
|------|-------|---------|
| `backend/scripts/otc_alert_dispatch.py` | 1, 3 | UTF-8 logging, None guard, stale skip, shutdown fix, DRY sessions, bare except, correlation groups |
| `gui/Dashboard/src/components/AlertDispatchPage.jsx` | 2 | Pause ref fix, heartbeat timer, log fetch deps |

---

**Total Estimated Effort:** ~2-3 hours for all phases  
**Risk Level:** Low — all changes are surgical, no architectural modifications  
**Backward Compatibility:** Full — no API contracts or data formats change
