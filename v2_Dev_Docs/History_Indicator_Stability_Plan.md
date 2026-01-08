# History & Indicator Stability Implementation Plan
**Created:** 2026-01-08  
**Status:** ✅ COMPLETED  
**Estimated Time:** 30-45 minutes  
**Difficulty:** Intermediate

---

## 🎯 Objective

Fix the critical timeout mismatch and `CapResult` contract violation that prevents the history collection pipeline from functioning correctly on Windows. After completing this plan, the history bootstrap endpoint should return successfully within 15 seconds, and error codes should propagate correctly to the frontend.

---

## 📋 Prerequisites

Before starting, ensure:
1. [x] You have access to edit files in the `c:\QuFLX\v2` directory
2. [x] python environent with nedded requirements 'C:\QuFLX\v2> (C:\Users\piete\anaconda3\shell\condabin\conda-   hook.ps1) ; (conda activate QuFLX-v2)'
3. [x] The Gateway server is stopped (we'll restart after changes)
4. [x] You understand basic Python dataclass syntax

---

## 🔧 PHASE 1: Fix CapResult Contract Violation [x]

**Goal:** Add the missing `error_code` field to the `CapResult` dataclass so that `history_collector.py` can pass error codes without raising `TypeError`.

**Relevant Principle:** #8 - Defensive & Explicit Error Handling (Zero Silent Failures)

---

### Step 1.1: Update `CapResult` Dataclass [x]

**File:** `capabilities_v2/base.py`

**What to change:** Add an `error_code` field to the `CapResult` dataclass.

**BEFORE (current code around line 20-27):**
```python
@dataclass
class CapResult:
    ok: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    artifacts: Tuple[str, ...] = tuple()
```

**AFTER (what it should look like):**
```python
@dataclass
class CapResult:
    ok: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    error_code: Optional[str] = None
    artifacts: Tuple[str, ...] = tuple()
```

**🧪 TEST POINT 1.1: [x]**
After this change, run in terminal:
```powershell
cd c:\QuFLX\v2
python -c "from capabilities_v2.base import CapResult; r = CapResult(ok=False, error='test', error_code='test_code'); print(r)"
```
**Expected:** No error. Output shows the CapResult with error_code field.

---

### Step 1.2: Update `CapResult.fail()` Helper Method [x]

**File:** `capabilities_v2/base.py`

**What to change:** Update the `fail()` static method to accept and use `error_code`.

**BEFORE (current code around line 28-31):**
```python
    @staticmethod
    def fail(error: str, data: Optional[Dict[str, Any]] = None, artifacts: Tuple[str, ...] = tuple()) -> CapResult:
        """Create a failed result."""
        return CapResult(ok=False, error=error, data=data or {}, artifacts=artifacts)
```

**AFTER (what it should look like):**
```python
    @staticmethod
    def fail(error: str, error_code: Optional[str] = None, data: Optional[Dict[str, Any]] = None, artifacts: Tuple[str, ...] = tuple()) -> CapResult:
        """Create a failed result."""
        return CapResult(ok=False, error=error, error_code=error_code, data=data or {}, artifacts=artifacts)
```

**🧪 TEST POINT 1.2: [x]**
```powershell
python -c "from capabilities_v2.base import CapResult; r = CapResult.fail('test error', error_code='my_code'); print(r.error_code)"
```
**Expected:** Output is `my_code`

---

### Step 1.3: Update Runner to Serialize `error_code` [x]

**File:** `capabilities_v2/runner.py`

**What to change:** Add `error_code` to the JSON output dictionary.

**BEFORE (current code around line 85-90):**
```python
        output = {
            "ok": result.ok,
            "data": result.data,
            "error": result.error,
            "artifacts": result.artifacts
        }
```

**AFTER (what it should look like):**
```python
        output = {
            "ok": result.ok,
            "data": result.data,
            "error": result.error,
            "error_code": result.error_code,
            "artifacts": result.artifacts
        }
```

**🧪 TEST POINT 1.3: [x]**
```powershell
python -c "import json; from capabilities_v2.base import CapResult; r = CapResult.fail('err', error_code='test'); o = {'ok': r.ok, 'error': r.error, 'error_code': r.error_code}; print(json.dumps(o))"
```
**Expected:** JSON output includes `"error_code": "test"`

---

## 🔧 PHASE 2: Fix Timeout Mismatch [x]

**Goal:** Align the timeouts across all layers so that the subprocess has enough time to complete before being killed.

**Relevant Principle:** #9 - Fail Fast, Fail Loud, Fail Predictably

---

### Step 2.1: Update Frontend Default Wait Time [x]

**File:** `gui/Dashboard/src/store/settingsStore.js`

**What to change:** Increase `historyWaitTime` from 8 to 15 seconds.

**BEFORE (current code around line 16):**
```javascript
  automation: {
    historyWaitTime: 8,
    autoSelectAssets: true,
    retryAttempts: 2,
    retryDelay: 500,
  },
```

**AFTER (what it should look like):**
```javascript
  automation: {
    historyWaitTime: 15,
    autoSelectAssets: true,
    retryAttempts: 2,
    retryDelay: 500,
  },
```

**🧪 TEST POINT 2.1: [x]** 
Open the file and verify the change was made. No runtime test needed yet.

---

### Step 2.2: Update Gateway Subprocess Timeout [x]

**File:** `backend/services/gateway/routes/history.py`

**What to change:** Increase the timeout buffer from +10 to +15 seconds.

**BEFORE (current code around line 87):**
```python
                timeout=duration_s + 10  # Add 10s buffer for subprocess overhead
```

**AFTER (what it should look like):**
```python
                timeout=duration_s + 15  # Add 15s buffer for subprocess overhead
```

**🧪 TEST POINT 2.2: [x]**
Verify the change in the file. Search for `timeout=duration_s` to find the line.

---

### Step 2.3: Reduce History Collector Hardcoded Minimum [x]

**File:** `capabilities_v2/history_collector.py`

**What to change:** Change the hardcoded minimum wait from 8 to 3 seconds.

**BEFORE (current code around line 183-186):**
```python
        # Use duration_s if provided and larger than 8s, otherwise default to 8s
        # This allows the frontend to control the timeout (e.g. 15s for manual mode)
        wait_time = max(8, duration_s) if duration_s > 0 else 8
```

**AFTER (what it should look like):**
```python
        # Use duration_s if provided and larger than 3s, otherwise default to 3s
        # This allows the frontend to control the timeout (e.g. 15s for manual mode)
        wait_time = max(3, duration_s) if duration_s > 0 else 3
```

**🧪 TEST POINT 2.3: [x]**
Search the file for `max(8,` to find and verify the change.

---

## 🔧 PHASE 3: Integration Testing [x]

**Goal:** Verify all changes work together correctly.

---

### Step 3.1: Start the Gateway Server [x]

**Command:**
```powershell
cd c:\QuFLX\v2\backend\services\gateway
python main.py
```

**Expected:** Server starts on port 8000 without errors.

---

### Step 3.2: Test History Bootstrap Endpoint [x]

**Prerequisite:** Chrome must be running with remote debugging on port 9222. Start it with:
```powershell
start_hybrid_session.bat
```

**Test Command (using curl or Invoke-WebRequest):**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/history/bootstrap-history" -Method POST -ContentType "application/json" -Body '{"asset": "EURUSD", "timeframe": "1m", "duration": 15}'
```

**Expected Results:**
- Response within 30 seconds (15s wait + 15s buffer)
- JSON response with `"ok": true` and `"candles": [...]`
- No `TimeoutExpired` errors in the Gateway logs

---

### Step 3.3: Test Error Code Propagation [x]

**Test with invalid asset (to trigger an error):**
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/history/bootstrap-history" -Method POST -ContentType "application/json" -Body '{"asset": "", "timeframe": "1m", "duration": 3}'
```

**Expected:**
- Response should contain `"error_code"` field
- Error should be structured, not a generic 500

---

## ✅ Success Criteria Checklist

After completing all phases, verify:

- [x] `POST /api/v1/history/bootstrap-history` returns 200 OK within 15 seconds
- [x] History candles are returned in-memory and saved to CSV
- [x] No `TypeError` in Gateway logs (the contract violation is fixed)
- [x] No `TimeoutExpired` in Gateway logs (timeout mismatch is fixed)
- [x] Error responses include `error_code` field

---

## 📁 Files Modified Summary

| File | Change |
|------|--------|
| `capabilities_v2/base.py` | Added `error_code` field to `CapResult` + updated `fail()` method |
| `capabilities_v2/runner.py` | Added `error_code` to output JSON |
| `gui/Dashboard/src/store/settingsStore.js` | Changed `historyWaitTime: 8` → `15` |
| `backend/services/gateway/routes/history.py` | Changed timeout from `+10` → `+15` |
| `capabilities_v2/history_collector.py` | Changed `max(8, ...)` → `max(3, ...)` |

---

## 🚨 Troubleshooting

### If you still get TimeoutExpired:
1. Check that ALL timeout values were updated (there might be multiple occurrences)
2. Verify Chrome is responding on port 9222: `netstat -an | findstr 9222`
3. Increase timeouts further if Chrome attachment is slow

### If you still get TypeError:
1. Verify the `CapResult` dataclass was saved correctly
2. Check that Python has reloaded the module (restart the gateway)
3. Run the test commands in Phase 1 to verify the fix

### If error_code is still None:
1. Verify `runner.py` includes `error_code` in the output dict
2. Check that `history_collector.py` is using the updated `CapResult`

---

## 📚 Related Documents

- **Stability Report:** `reports/report_2026-01/report_history_indicator_stability_26-01-08.md`
- **Architecture:** `v2_Dev_Docs/Architecture_v2.md`
- **Error Models:** `backend/models/errors.py`
- **Core Principles:** `.agents/CORE_PRINCIPLES.md`

---

**Plan Compiled by:** Cline (Team Leader Mode)  
**Date:** 2026-01-08
