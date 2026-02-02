# Stability Report: History Data & Indicator Pipeline
**Date:** 2026-01-08  
**Status:** ✅ Root Causes CONFIRMED – Implementation Plan Ready  
**Severity:** CRITICAL  
**Last Updated:** 2026-01-08 19:48 UTC

---

## 1. Executive Summary

Recent development on indicator display panels introduced regressions in the historical data collection pipeline. **Thorough forensic analysis has now CONFIRMED** a critical timing mismatch between the Gateway and the History Collector subprocess, as well as a **contract violation** in the `CapResult` dataclass that causes `TypeError` exceptions on Windows.

The indicator pipeline itself is structurally sound but is blocked by these underlying history collection issues.

---

## 2. Critical Root Causes (CONFIRMED)

### 2.1 History Collection Timeout Mismatch (CRITICAL) ✅ CONFIRMED

The system is currently hitting a hard timeout of 13 seconds in the Gateway, while the actual execution time frequently exceeds 15 seconds due to overhead and hardcoded minimums.

| Layer | Configuration | Actual Time (Observed) |
|-------|---------------|-------------------------|
| Frontend Request | `duration: 3` | N/A |
| Gateway Subprocess Timeout | `duration + 10 = 13s` | **13s (Hard Limit)** |
| History Collector Wait | `max(8, duration) = 8s` | 8s (Hardcoded Min) |
| Tick Collection | `min(2, duration)` | 2s |
| Chrome Attachment Overhead | N/A | 2-5s (Variable) |
| **Total Execution Time** | — | **12-15+ seconds** |

**Impact:** The subprocess is killed by the Gateway before it can return the collected candles, leading to `500 Internal Server Error` and `TimeoutExpired` logs.

**Files Affected:**
- `backend/services/gateway/routes/history.py` (line ~87: `timeout=duration_s + 10`)
- `capabilities_v2/history_collector.py` (line ~183: `wait_time = max(8, duration_s)`)
- `gui/Dashboard/src/store/settingsStore.js` (line 16: `historyWaitTime: 8`)

---

### 2.2 `CapResult` Contract Violation (CRITICAL) ✅ CONFIRMED

The `HistoryCollector` capability attempts to return an `error_code` field which **does not exist** in the base `CapResult` dataclass definition.

**Location:** `capabilities_v2/base.py` vs `capabilities_v2/history_collector.py`

**Current `CapResult` definition (base.py):**
```python
@dataclass
class CapResult:
    ok: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    artifacts: Tuple[str, ...] = tuple()
    # ❌ MISSING: error_code field!
```

**Violations in `history_collector.py`:** (5 instances found)
- Line ~163: `CapResult(ok=False, error="Chrome browser not connected", error_code="chrome_not_connected")`
- Line ~170: `CapResult(ok=False, error="Failed to import...", error_code="collector_not_running")`
- Line ~243: `error_code="manual_click_timeout"`
- Line ~246: `error_code="no_history_data_received"`
- Line ~249: `error_code="history_payload_empty"`

**Complete Data Flow Broken:**
1. ❌ `history_collector.py` tries `CapResult(error_code=...)` → Python `TypeError`
2. ❌ `runner.py` (lines 85-90) doesn't serialize `error_code` even if it existed
3. ❌ Gateway's `out.get("error_code")` always returns `None`
4. ❌ Frontend never receives structured error codes for user-friendly messages

**Impact:** On Windows, this exception results in a silent failure or a generic 500 error without the specific error code being surfaced to the UI. The well-designed `HistoryErrorCode` enum in `backend/models/errors.py` is **completely unreachable**.

---

### 2.3 Indicator Pipeline Status ✅ CONFIRMED OK

The indicator pipeline is currently functional but depends on valid history CSVs.

| Component | Status | Notes |
|-----------|--------|-------|
| `indicator_calculator.py` | ✅ OK | Properly uses `CapResult.fail()`/`.success()` helpers |
| `interceptor.py` | ✅ OK | Solid WebSocket parsing with proper error handling |
| `errors.py` models | ✅ OK | Well-designed, just needs to be connected to the data flow |
| Indicator pipeline | ✅ OK | Works when history CSV exists; fails with 404 if history collection fails |

**Dependency Chain:**
```
Frontend → Gateway → HistoryCollector → CSV → IndicatorCalculator
                     ↑ BREAKS HERE
```

---

## 3. Windows-Specific Compatibility Issues

1. **Subprocess Execution:** `asyncio.create_subprocess_exec` is unreliable on Windows with the default `SelectorEventLoop`. The current fallback to `subprocess.run` in a thread (in `history.py`) is correct but requires precise timeout management.

2. **Path Resolution:** The project uses deep relative paths (`../../../../`). While currently functional, these remain a point of fragility on Windows environments with different drive mappings.

3. **`TypeError` Silent Failure:** The dataclass contract violation causes Python to raise `TypeError`, which is caught and converted to a generic 500 error, losing the specific error context.

---

## 4. Proposed Remediation Plan

### Phase 1: Contract & Timing Fixes (Immediate)

| Step | File | Change | Principle |
|------|------|--------|-----------|
| 1.1 | `capabilities_v2/base.py` | Add `error_code: Optional[str] = None` to `CapResult` | #8 Zero Silent Failures |
| 1.2 | `capabilities_v2/runner.py` | Add `"error_code": result.error_code` to output dict | #8 Zero Silent Failures |
| 1.3 | `gui/Dashboard/src/store/settingsStore.js` | Change `historyWaitTime: 8` → `15` | #9 Fail Predictably |
| 1.4 | `backend/services/gateway/routes/history.py` | Change `timeout=duration_s + 10` → `duration_s + 15` | #9 Fail Predictably |
| 1.5 | `capabilities_v2/history_collector.py` | Change `max(8, duration_s)` → `max(3, duration_s)` | #1 Simplicity |

### Phase 2: Robustness Enhancements

1. **Early Exit:** Modify `HistoryCollector` to exit immediately once history candles are captured, rather than waiting for the full timeout.
2. **Structured Logging:** Ensure all subprocess failures return the structured `HistoryErrorResponse` instead of raw tracebacks.
3. **Integration Tests:** Add tests for timeout scenarios and error code propagation.

---

## 5. Success Criteria

- [ ] `POST /api/v1/history/bootstrap-history` returns 200 OK within 15 seconds
- [ ] History candles are returned in-memory and saved to CSV
- [ ] Indicators load successfully immediately after history bootstrap
- [ ] No `TypeError` or `TimeoutExpired` in Gateway logs
- [ ] Error codes properly propagate from capability → runner → gateway → frontend

---

## 6. Implementation Reference

**Detailed implementation plan:** See `v2_Dev_Docs/History_Indicator_Stability_Plan.md`

---

**Report Compiled by:** Cline (Team Leader Mode)  
**Analysis Confirmed:** 2026-01-08 19:35 UTC  
**Reference Logs:** 2026-01-08 14:18:49,947 - gateway.history - ERROR - Bootstrap history failed: TimeoutExpired
