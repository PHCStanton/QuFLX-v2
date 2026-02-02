# Forensic Analysis: History Data Loading Failure
**Date:** 2026-01-06  
**Investigator:** @Investigator (via Team Leader)  
**Severity:** CRITICAL  
**Status:** Root Causes Identified – Awaiting Action Decision

---

## Executive Summary
Historical data fails to load when selecting assets in the Dashboard despite the backend CLI (`python -m capabilities_v2.history_collector`) working correctly. The issue stems from **multiple critical architectural problems** including race conditions, asset normalization mismatches, error swallowing, and unreachable code. This is NOT a simple path fix – the pipeline has accumulated technical debt that violates **CORE_PRINCIPLES #7, #8, and #9**.

**Recommendation:** Clean rewrite of the history loading flow in both frontend and backend integration layer.

---

## Critical Issues

### 1. CRITICAL: Race Condition in Frontend Polling (marketStore.js:298-355)
**Severity:** CRITICAL  
**Violates:** CORE_PRINCIPLES #9 (Fail Fast, Fail Loud)

**Location:** `gui/Dashboard/src/store/marketStore.js:298-355`

**The Problem:**
```javascript
// Line 318: Bootstrap is triggered but NOT awaited
const bootstrapPromise = fetch('http://localhost:8000/api/v1/history/bootstrap-history', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ asset, timeframe, duration: 15 })
});

// Line 325: Polling starts IMMEDIATELY (doesn't wait for bootstrap to even start subprocess)
const pollStart = Date.now();
const pollTimeout = 20000;
while (Date.now() - pollStart < pollTimeout) {
  const pollRes = await fetch(`http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}...`);
  // ...
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1s
}

// Line 349: ONLY NOW does it check bootstrap result (but polling already gave up)
const finalRes = await bootstrapPromise;
```

**Why This Fails:**
1. Bootstrap endpoint spawns a subprocess (`history_collector.py`) which takes 2-5 seconds just to initialize Chrome CDP connection.
2. Frontend polling starts immediately and checks every 1 second for a CSV file that **hasn't been created yet** because the subprocess hasn't even started intercepting.
3. After 20 seconds of empty polling, it finally awaits `bootstrapPromise` – but by then the subprocess has either:
   - Timed out (15s manual click window expired)
   - Created the file (but frontend already gave up and moved on)
4. Lines 354-365 are **UNREACHABLE** because the `return` on line 346 happens inside the polling loop.

**Evidence:**
- Console error: `"Manual Mode: Waiting for user to click..."` appears AFTER the 404 polling has already started
- Bootstrap 500 error happens because the subprocess times out while frontend is still polling
- When backend CLI is run directly, it works because there's no race – it waits properly

---

### 2. CRITICAL: Asset Normalization Mismatch (Frontend ↔ Backend)
**Severity:** CRITICAL  
**Violates:** CORE_PRINCIPLES #4 (Zero Assumptions)

**Location:** 
- Frontend: `gui/Dashboard/src/store/marketStore.js:298` 
- Backend: `backend/services/gateway/routes/history.py:25`

**The Problem:**
```javascript
// Frontend (Line 298)
const initialCheck = await fetch(
  `http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}?timeframe=...`
);
// "AED/CNY OTC" becomes "AED%2FCNY%20OTC"
```

```python
# Backend (history.py:25)
@router.get("/{asset}")
async def get_history(asset: str, timeframe: int = 1, limit: int = 100):
    logger.info(f"HISTORY: Fetching history for asset={asset}, timeframe={timeframe}")
    csv_path = get_recent_history_file(asset, timeframe)
    # asset is now "AED/CNY OTC" (FastAPI decodes %2F back to /)
```

```python
# Backend (history_utils.py:37-38)
def get_recent_history_file(asset: str, timeframe_min: int) -> Optional[Path]:
    from .asset_utils import normalize_asset
    asset_clean = normalize_asset(asset)  # "AED/CNY OTC" -> "AEDCNYOTC"
```

**Why This Works (but is fragile):**
- FastAPI automatically URL-decodes path parameters, so `AED%2FCNY%20OTC` becomes `AED/CNY OTC`
- `normalize_asset()` strips everything, producing `AEDCNYOTC`
- CSV directory is `data/data_output/history/AEDCNYOTC/`
- This happens to work... **BUT**:
  - The frontend assumes encoding is necessary (it's not for path params)
  - If backend changes to query params, this breaks
  - No explicit validation that asset normalization matches between systems

**Risk:**
- Currently **NOT the root cause** but a **latent bug** that will break if routing changes
- Violates **Zero Assumptions** – frontend guesses at encoding, backend guesses at decoding

---

### 3. HIGH: Error Swallowing in Frontend (marketStore.js:369-372)
**Severity:** HIGH  
**Violates:** CORE_PRINCIPLES #8 (Defensive & Explicit Error Handling)

**Location:** `gui/Dashboard/src/store/marketStore.js:369-372`

```javascript
} catch (err) {
  console.error('Failed to load history:', err);
  set((state) => ({
    historyCandles: { ...state.historyCandles, [asset]: [] },
    historyStatus: { ...state.historyStatus, [asset]: 'error' },
    lastError: `History Load Error: ${err.message}`
  }));
}
```

**The Problem:**
- Error is caught and logged but **the user only sees a console message**
- `lastError` is set in store but **no UI component actively displays it** (no toast, no modal)
- Chart just stays blank with "loading" state
- User has no idea if:
  - Backend is down
  - Subprocess failed to spawn
  - Manual click window expired
  - Chrome CDP isn't connected

**Required Action:**
> "This catch block swallows the error and will cause silent failures in production. Must either log + re-throw, return a proper error response, or show a user-friendly message."

---

### 4. HIGH: Unreachable Code After Polling Loop (marketStore.js:354-365)
**Severity:** HIGH  
**Violates:** CORE_PRINCIPLES #1 (Functional Simplicity), #7 (Stop Patching)

**Location:** `gui/Dashboard/src/store/marketStore.js:354-365`

```javascript
// Line 325-346: Polling loop with early return on success
while (Date.now() - pollStart < pollTimeout) {
  const pollRes = await fetch(...);
  if (pollRes.ok) {
    const hist = await pollRes.json();
    if (Array.isArray(hist.data) && hist.data.length > 0) {
      set((state) => ({
        historyCandles: { ...state.historyCandles, [asset]: hist.data },
        historyStatus: { ...state.historyStatus, [asset]: 'loaded' }
      }));
      console.log(`Manual Mode: History caught for ${asset}!`);
      return;  // ← EARLY RETURN
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Line 349-365: This code is NEVER executed because of early return above
const finalRes = await bootstrapPromise;
if (!finalRes.ok) {
  const errorData = await finalRes.json().catch(() => ({}));
  throw new Error(errorData.detail || 'Manual click not detected or bootstrap failed');
}

set((state) => ({
  historyCandles: { ...state.historyCandles, [asset]: [] },
  historyStatus: { ...state.historyStatus, [asset]: histRes.status === 404 ? 'not_found' : 'error' }
  // ← "histRes" is not even defined!
}));
```

**Why This Matters:**
- If polling loop times out (20s), execution jumps to `catch` block on line 368
- Lines 349-365 are dead code
- `histRes` variable on line 358 doesn't exist (leftover from refactor)
- This is a symptom of **multiple failed patch attempts** (CORE_PRINCIPLES #7)

---

### 5. MEDIUM: Backend Subprocess Error Handling (history.py:121-127)
**Severity:** MEDIUM  
**Violates:** CORE_PRINCIPLES #8 (Zero Silent Failures)

**Location:** `backend/services/gateway/routes/history.py:121-127`

```python
if process.returncode != 0:
    err_msg = stderr.decode().strip()
    logger.error(f"Bootstrap history failed: {err_msg}")
    raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")
```

**The Problem:**
- Good: Returns 500 with error detail
- Bad: Frontend receives generic `"Script execution failed: ..."` which doesn't distinguish:
  - Subprocess spawn failure (e.g., runner.py not found)
  - Chrome CDP not connected (interceptor can't attach)
  - Manual click timeout (user didn't click in 15s)
  - Payload parsing failure (wrong asset format)

**Recommendation:**
- Use structured error codes (e.g., `CHROME_NOT_CONNECTED`, `MANUAL_TIMEOUT`, `PAYLOAD_PARSE_ERROR`)
- Frontend can then show targeted guidance:
  - "Chrome not connected. Please start Chrome with remote debugging."
  - "Manual click not detected. Click the asset in Pocket Option within 15 seconds."

---

### 6. MEDIUM: Deprecated Dead Code (marketStore.js:187-191)
**Severity:** MEDIUM  
**Violates:** CORE_PRINCIPLES #1 (Functional Simplicity)

**Location:** `gui/Dashboard/src/store/marketStore.js:187-191`

```javascript
syncAssetUi: async () => {
  console.log('syncAssetUi is deprecated. Please use Manual Mode.');
},
```

**Also Deprecated:**
- Line 43: `autoSyncAssetOnSelect` and `selectionWorkflowConfig` (marked as deprecated in comment)
- These were part of the "Auto Select" feature that was removed

**Impact:**
- Clutters codebase
- Confuses new developers
- Takes up mental load when debugging

**Action:** Delete all deprecated functions before any new features are added.

---

## Detailed Findings

### Asset Name Encoding Flow (End-to-End)

1. **User clicks asset in AssetPanel.jsx (line 312)**
   ```javascript
   onClick={() => setSelectedAsset(asset)}
   // asset = "AED/CNY OTC" (raw string from payoutAssets array)
   ```

2. **Frontend store normalizes for subscription keys**
   ```javascript
   const normalizeAsset = (asset) => {
     return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
   };
   // "AED/CNY OTC" -> "AEDCNYOTC" (used for Socket.IO rooms)
   ```

3. **Frontend sends HTTP request with URL encoding**
   ```javascript
   fetch(`http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}?timeframe=1&limit=200`)
   // "AED/CNY OTC" -> "AED%2FCNY%20OTC"
   ```

4. **Backend FastAPI decodes automatically**
   ```python
   @router.get("/{asset}")
   async def get_history(asset: str, ...):
       # asset = "AED/CNY OTC" (decoded)
   ```

5. **Backend normalizes for file lookup**
   ```python
   asset_clean = normalize_asset(asset)  # "AEDCNYOTC"
   asset_dir = root / "data" / "data_output" / "history" / asset_clean
   ```

6. **CSV filename format (from history_collector.py:571-577)**
   ```python
   asset_base = normalize_asset(asset.split("(")[0])  # "AEDCNY"
   asset_type = "otc" if "otc" in asset.lower() else "fx"  # "otc"
   tf_str = "1m"
   now_ts = "2026_01_06_20_09_03"
   filename = f"{asset_base}_{asset_type}_{tf_str}_{now_ts}.csv"
   # Result: "AEDCNY_otc_1m_2026_01_06_20_09_03.csv"
   ```

**Verdict:** Asset normalization is **consistent** but overly complex. Works correctly when all pieces are in sync.

---

### Bootstrap Flow Timing Analysis

**Expected Flow (Manual Mode):**
1. User clicks asset in Dashboard → `setSelectedAsset("AED/CNY OTC")`
2. Frontend calls `bootstrap-history` endpoint → Gateway receives request
3. Gateway spawns subprocess → `history_collector.py` starts
4. Subprocess attaches to Chrome CDP → 2-5 seconds
5. User clicks asset in Pocket Option → Interceptor catches payload
6. Subprocess saves CSV → Returns success to gateway
7. Gateway returns response → Frontend polls and finds CSV
8. Chart loads history → Live ticks start streaming

**Actual Flow (Current Broken State):**
1. User clicks asset → Frontend triggers bootstrap (doesn't await)
2. Frontend starts polling immediately (subprocess hasn't even spawned yet)
3. Poll loop runs for 20 seconds checking for CSV that doesn't exist
4. Subprocess spawns (2s later), waits 15s for manual click
5. User clicks (or times out) → CSV is created
6. Frontend polling loop has already finished and entered catch block
7. Chart shows "Error: Manual click not detected" even though CSV exists

**Timeline:**
```
T+0s:   Frontend calls bootstrap (async, not awaited)
T+0s:   Frontend starts polling (every 1s for 20s)
T+1s:   Subprocess spawns
T+3s:   Subprocess attaches to Chrome CDP
T+5s:   User clicks asset in PO
T+6s:   CSV saved to disk
T+7s:   Frontend poll #7 → Still 404 (gateway hasn't indexed new file yet?)
T+20s:  Frontend gives up, shows error
T+21s:  Subprocess returns success to gateway
T+22s:  Gateway returns 200 to frontend's bootstrap promise (but frontend already gave up)
```

---

## Simplification Opportunities

### Redundant/Deprecated Code Eligible for Removal

1. **marketStore.js:187-191** – `syncAssetUi` (deprecated, logs message only)
2. **marketStore.js:43** – `autoSyncAssetOnSelect` and `selectionWorkflowConfig` (commented as deprecated)
3. **history.py:148-197** – `collect_history` endpoint (uses background Popen, never called by frontend)
4. **history_collector.py:96-167** – `_collect_only` action (unused, `collect_and_save` does same thing)

**Total Lines to Remove:** ~150 lines across 3 files

---

## Risk Forecast

**If ignored:**
1. **Silent Failures Continue** – Users will blame "broken data" when it's actually a race condition
2. **Support Burden Increases** – Every new user will hit this issue and need manual intervention
3. **Technical Debt Compounds** – Each patch attempt adds more complexity (already at 2-3 failed fixes)
4. **Feature Development Blocked** – Cannot add indicators, backtesting, or CSV export until history loading is stable

**CORE_PRINCIPLES #7 Trigger:**
> "More than 2–3 incremental fixes attempted" ✅  
> "Code is becoming tangled, duplicated, or unstable" ✅  
> "The same bug keeps resurfacing" ✅

**Mandated Response:**
> "Further patching will increase complexity and risk. I strongly recommend a clean rewrite of the history loading module instead of another incremental fix. This will be faster, safer, and more maintainable long-term. Shall I prepare the rewritten version?"

---

## Recommendations

### Option 1: Targeted Fixes (NOT RECOMMENDED)
**Estimated Effort:** 2-3 hours  
**Risk:** Medium-High (may introduce new race conditions)

1. Change frontend to await bootstrap before polling
2. Add structured error codes in backend
3. Display user-friendly error messages in UI
4. Remove deprecated code

**Why NOT Recommended:**
- Band-aid on architectural problem
- Race condition still possible if subprocess is slow
- Violates CORE_PRINCIPLES #7

---

### Option 2: Clean Rewrite (RECOMMENDED)
**Estimated Effort:** 4-6 hours  
**Risk:** Low (fresh start with explicit contracts)

#### Frontend Changes (`marketStore.js`)
1. **New `loadHistory` function:**
   - Step 1: Check for existing CSV (quick lookup)
   - Step 2: If not found, call bootstrap and **await** response
   - Step 3: Bootstrap returns CSV data directly in response (no file polling)
   - Step 4: Store candles immediately, return success

2. **Explicit timeout handling:**
   - Bootstrap has 15s timeout (manual click window)
   - Frontend shows countdown timer: "Click asset in PO (12s remaining)"
   - If timeout, show clear error: "Manual click not detected. Please try again."

3. **Error UI component:**
   - Toast notification for all history errors
   - Actionable messages (e.g., "Start Chrome with debugging" vs "Click asset in PO")

#### Backend Changes (`history.py`)
1. **Bootstrap endpoint returns data immediately:**
   ```python
   # Instead of returning after subprocess finishes:
   result = cap.run(ctx, inputs)
   if result.ok:
       candles = result.data.get("candles", [])
       return {"ok": True, "asset": asset, "candles": candles}
   ```

2. **Structured error codes:**
   ```python
   class HistoryError(HTTPException):
       def __init__(self, code: str, detail: str):
           super().__init__(status_code=500, detail=detail)
           self.error_code = code
   
   # Usage:
   raise HistoryError("CHROME_NOT_CONNECTED", "Chrome debugging not available")
   ```

3. **Remove polling dependency:**
   - Frontend never polls for CSV files
   - Bootstrap returns data in-memory
   - CSV is saved as a side effect (for persistence)

#### Capabilities Changes (`history_collector.py`)
1. **Increase manual click feedback:**
   - Log every 2 seconds: "Waiting for manual click... (10s remaining)"
   - Return partial data if timeout (e.g., "Captured 0 history candles, 5 live ticks")

2. **Better asset matching:**
   - Already has fuzzy matching (line 118-126), but add debug logs
   - Show which events were checked and why they didn't match

---

## Comparison to Working Commits

**Working Commit:** `af22858e1cc22be83473ca712086a04021494cfe`  
**Report Reference:** `implementation_report_topdown_select_25-12-31.md`

**What Changed:**
1. Introduction of "Manual Mode" workflow (removed auto-click)
2. Refactor of `marketStore.js` into slices (2025-12-19)
3. Bootstrap endpoint switched from sync to async subprocess

**What Broke:**
- Old version: Bootstrap was synchronous, returned data immediately
- New version: Bootstrap spawns subprocess, frontend polls for file
- Root cause: **Architectural change without updating frontend contract**

---

## Action Plan (for Team Leader)

### Immediate Actions (Choose One)

**A. Apply Targeted Fixes (2-3 hours)**
- Fix race condition by awaiting bootstrap before polling
- Add error UI components
- Remove deprecated code
- ⚠️ Risk: May still have edge case failures

**B. Clean Rewrite (4-6 hours) – RECOMMENDED**
- Redesign bootstrap to return data in-memory
- Remove polling logic entirely
- Add structured error codes
- Implement countdown timer UI
- ✅ Benefit: Solves root cause, prevents future bugs

### Delegation

**If Option A (Targeted Fixes):**
- @Coder: Fix frontend race condition
- @Frontend-Specialist: Add error toast component
- @Code-Simplifier: Remove deprecated code

**If Option B (Clean Rewrite):**
- @Architect: Design new bootstrap contract (in-memory response)
- @Coder: Implement frontend + backend changes
- @Tester: Create integration test for manual mode workflow
- @Reviewer: Final sign-off on simplification

---

## Conclusion

The history loading failure is **NOT a simple bug** – it's a symptom of architectural drift and accumulated technical debt. The pipeline has violated **CORE_PRINCIPLES #7** (multiple patch attempts), **#8** (error swallowing), and **#9** (lack of early validation).

**CORE_PRINCIPLES #7 Mandate Triggered:**
> "Further patching will increase complexity and risk. I strongly recommend a clean rewrite of the history loading module instead of another incremental fix. This will be faster, safer, and more maintainable long-term."

**Developer Decision Required:**
1. Accept Option B (clean rewrite) and allocate 4-6 hours
2. Accept Option A (targeted fixes) and accept residual risk
3. Request clarification or alternative approach

**Next Step:** Update `v2_Dev_Docs/History_data_Payload_Aggregation.md` with chosen action plan.

---

**Investigation Complete**  
*@Investigator forensic analysis – 2026-01-06 20:40 UTC*
