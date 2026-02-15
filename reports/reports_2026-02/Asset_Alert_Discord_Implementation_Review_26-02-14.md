# Asset Alert & Discord Implementation Review
**Date:** 2026-02-14  
**Author:** Team Leader (Delegated: @Investigator, @Reviewer, @Backend-Specialist, @Frontend-Specialist)  
**Scope:** Signals & Alerts System — Quality, Functional & Structural Review  

---

## Executive Summary

A comprehensive forensic review of the QuFLX v2 Signals & Alerts system was conducted across **5 primary files** and **3 supporting infrastructure files**. The review identified **28 issues** including **3 critical bugs** that directly impact signal accuracy and alert delivery, **8 high-severity** structural problems, and **17 medium/low** improvements.

The most impactful finding is a **Bollinger Band width semantic mismatch** between `pandas-ta` and the fallback calculation that causes breakout squeeze detection to **never trigger** when `pandas-ta` is installed. Additionally, the Discord embed and AI verification prompt reference an indicator column (`ema165`) that doesn't exist in the regime detector output, causing alerts to display incomplete data.

The system's architecture shows signs of organic growth with **three different Support/Resistance implementations**, a **duplicated MarketCondition enum**, and a potentially **dead `indicator_wrapper.py` module**. These create maintenance burden and drift risk.

---

## Files Reviewed

| File | Role | LOC (approx) |
|------|------|---------------|
| `backend/services/strategy/indicators.py` | Technical Indicators Pipeline (canonical) | ~450 |
| `backend/services/strategy/indicator_wrapper.py` | Unified indicator wrapper (maps pipeline → regime names) | ~80 |
| `backend/services/strategy/regime_detector.py` | Market regime detection (pure functions) | ~280 |
| `backend/scripts/otc_alert_dispatch.py` | Alert dispatcher service (scanner + AI + Discord) | ~900 |
| `gui/Dashboard/src/components/AnalysisPanel.jsx` | Frontend signals/alerts UI | ~170 |
| `backend/services/gateway/routes/alerts.py` | Gateway alert start/stop/status routes | ~130 |
| `gui/Dashboard/src/hooks/useAlerts.js` | Frontend hook for alert lifecycle | ~80 |
| `gui/Dashboard/src/store/marketStore.js` | Alert feed & heartbeat state (partial) | — |

---

## 🔴 CRITICAL Issues (3)

### C1. Bollinger Band Width Semantic Mismatch
**Files:** `indicators.py` (line ~175-185), `regime_detector.py` (line ~195)  
**Severity:** 🔴 CRITICAL — Breakout detection silently broken  

**Problem:**  
- `pandas-ta`'s `BBB` (Bollinger Band Bandwidth) returns bandwidth as a **percentage** (e.g., `4.0` means 4%).  
- The manual fallback calculates `(upper - lower) / middle` which returns a **decimal** (e.g., `0.04`).  
- `regime_detector.py` uses the threshold `bb_wband < 0.04` for squeeze detection.  

**Impact:**  
- When `pandas-ta` is installed: `bb_width` ≈ `4.0` (percentage) → `4.0 < 0.04` is **always false** → **Breakout regime NEVER triggers**.  
- When `pandas-ta` is NOT installed: `bb_width` ≈ `0.04` (decimal) → threshold works correctly.  
- This means the system behaves differently depending on which library is available, with the more common case (pandas-ta installed) being broken.

**Fix:**  
Normalize `bb_width` to a consistent scale. After pandas-ta calculation, divide by 100:
```python
# In indicators.py, after pandas-ta BBB calculation:
df['bb_width'] = bb_data[f"BBB_..."] / 100  # Normalize percentage to decimal
```
Or adjust the threshold in `regime_detector.py` to handle both scales.

---

### C2. Discord Embed References Non-Existent `ema165` Key
**Files:** `otc_alert_dispatch.py` (line ~330, ~620, ~640)  
**Severity:** 🔴 CRITICAL — Discord alerts show incomplete data  

**Problem:**  
The Discord embed constructs indicator text using:
```python
f"**EMA-16/165:** {tech.get('ema16', '---')} / {tech.get('ema165', '---')}\n"
```
But `regime_detector.detect_regime()` outputs the technicals dict with key `ema89`, not `ema165`:
```python
"ema89": round(float(ema89), 2),
```

**Impact:**  
- Every Discord alert shows `EMA-16/165: 1.0580 / ---` — the long-period EMA is always missing.
- The AI verification prompt correctly references `EMA89` but the Discord embed says `EMA-16/165`, creating user confusion.
- Test mode mock data also uses `ema165` key, masking this bug during testing.

**Fix:**  
Update Discord embed to use `ema89`:
```python
f"**EMA-16/89:** {tech.get('ema16', '---')} / {tech.get('ema89', '---')}\n"
```
Also update test mode mock data to use `ema89` instead of `ema165`.

---

### C3. AI Orchestrator Uses Wrong Model Name and Payload Format
**File:** `otc_alert_dispatch.py` (line ~290-300)  
**Severity:** 🔴 CRITICAL — AI verification calls will fail  

**Problem:**  
```python
payload = {
    "model": "gpt-4-turbo",  # Hardcoded OpenAI model name
    "prompt": prompt,          # Non-standard key
    "json": True
}
```
- The system uses **xAI/Grok** (per `techContext.md`), not OpenAI. `gpt-4-turbo` is not a valid xAI model.
- The internal `/api/v1/ai/ask` endpoint expects `{ "prompt": ..., "context": ... }` format, but the AI orchestrator posts directly to the AI URL with a different shape.
- The `"json": True` key is not a standard parameter for either API.

**Impact:**  
- If `QFLX_AI_ENDPOINT` points to the internal gateway (`/api/v1/ai/ask`), the `model` and `json` keys are ignored but the response parsing may still work.
- If it points to xAI directly, the request will fail with a 400/422 error.
- The `model` field should be configurable via settings or environment.

**Fix:**  
```python
payload = {
    "prompt": prompt,
    "context": {
        "asset": context.asset,
        "regime": regime_label,
        "direction": direction,
        "uiMode": "alert_verification",
        "responseVerbosity": "concise"
    }
}
```
Remove hardcoded model; let the AI service handle model selection.

---

## 🟡 HIGH Severity Issues (8)

### H1. Duplicate `MarketCondition` Enum
**Files:** `otc_alert_dispatch.py` (line ~55), `regime_detector.py` (line ~20)  
**Severity:** 🟡 HIGH — DRY violation, drift risk  

**Problem:** The `MarketCondition` enum is defined identically in both files. If one is updated without the other, regime labels will diverge, breaking Discord embeds and AI prompts.

**Fix:** Delete the enum from `otc_alert_dispatch.py` and import from `regime_detector.py`:
```python
from backend.services.strategy.regime_detector import MarketCondition, RegimeResult
```

---

### H2. `create_indicator_set` References Non-Existent `ema_165` Column
**File:** `indicators.py` (line ~370)  
**Severity:** 🟡 HIGH — Silent data loss  

**Problem:**  
```python
ema_165=self._safe_float(df_row.get('ema_165')),
```
The pipeline calculates `ema_89` (not `ema_165`). The `IndicatorSet` dataclass defines `ema_89`. This line will always return `None`.

**Fix:** Change to `ema_89=self._safe_float(df_row.get('ema_89'))`.

---

### H3. Duplicate `ema_fast` Key in Params Dict
**File:** `indicators.py` (line ~107-108)  
**Severity:** 🟡 HIGH — Code smell, potential masked bug  

**Problem:**  
```python
'ema_fast': 16,
'ema_fast': 16,  # Duplicate key — second overwrites first
```
Python silently accepts duplicate dict keys. While both have value `16`, this suggests a copy-paste error where a different parameter was intended.

**Fix:** Remove the duplicate line. Verify if a different parameter was intended (e.g., `ema_medium`).

---

### H4. `pivot_h`/`pivot_l` in Regime Detector is NOT Fractal Detection
**File:** `regime_detector.py` (line ~85-87)  
**Severity:** 🟡 HIGH — S/R levels are unreliable  

**Problem:**  
```python
result_df['pivot_h'] = result_df['high'].rolling(window=window, center=True).max()
result_df['pivot_l'] = result_df['low'].rolling(window=window, center=True).min()
```
This returns the **rolling maximum/minimum**, not fractal pivots. Every candle where `high == 5-bar rolling max` is flagged as a "pivot". This produces far too many false pivots.

Compare with `indicator_wrapper.py` which correctly uses:
```python
lambda x: x.iloc[2] if len(x) == 5 and x.iloc[2] == x.max() else np.nan
```
And `indicators.py` which uses proper fractal detection with `shift(n)` for non-repainting.

**Impact:** The S/R proximity check in `detect_regime()` (`near_sr`) is unreliable, and Trend Reversal detection (which requires price near S/R) produces false signals.

**Fix:** Use proper fractal detection logic (match `indicator_wrapper.py` or `indicators.py` approach).

---

### H5. Three Different S/R Implementations
**Files:** `indicators.py`, `indicator_wrapper.py`, `regime_detector.py`  
**Severity:** 🟡 HIGH — Architectural fragmentation  

**Problem:** Three files implement Support/Resistance differently:

| File | Method | Output Columns | Correct? |
|------|--------|---------------|----------|
| `indicators.py` | Fractal detection + `shift(n)` (non-repainting) | `resistance_level`, `support_level` | ✅ Best |
| `indicator_wrapper.py` | Lambda fractal detection (center=True) | `pivot_h`, `pivot_l` | ⚠️ Repaints |
| `regime_detector.py` | Rolling max/min (NOT fractals) | `pivot_h`, `pivot_l` | ❌ Wrong |

**Fix:** Consolidate to a single implementation. The `indicators.py` approach is the most correct. Map its output columns to what regime_detector expects.

---

### H6. `indicator_wrapper.py` Appears to be Dead Code
**File:** `indicator_wrapper.py`  
**Severity:** 🟡 HIGH — Maintenance burden, confusion  

**Problem:** This module is not imported by `otc_alert_dispatch.py` or `regime_detector.py`. The dispatch chain is:
```
otc_alert_dispatch.py → regime_detector.calculate_indicators() → indicators.TechnicalIndicatorsPipeline
```
`indicator_wrapper.py` duplicates the same column mapping and body analysis that `regime_detector.calculate_indicators()` already does.

**Fix:** Either delete `indicator_wrapper.py` or make it the single canonical wrapper that `regime_detector.py` imports (eliminating the duplicate mapping code in regime_detector).

---

### H7. Cooldown Set Prematurely After AI Evaluation
**File:** `otc_alert_dispatch.py` (line ~680)  
**Severity:** 🟡 HIGH — Suppresses valid signals  

**Problem:**  
```python
# In the AI Check block:
if self.enable_ai_confirm and not self.test_mode:
    ai_verdict = await self.ai.verify_setup(ctx)
    if ai_verdict.confidence < self.min_ai_confidence:
        logger.info(f"AI low confidence for {asset}...")
        return  # ← Returns WITHOUT setting cooldown (correct)
    # Update cooldown only on successful AI evaluation
    self.cooldowns[asset] = now  # ← Sets cooldown even if AI says "not confirmed"
```
Then later:
```python
if ai_verdict.confirmed:
    self.cooldowns[asset] = now  # ← Sets cooldown again (redundant)
```

**Impact:** If AI returns `confirmed=False` but `confidence >= min_ai_confidence`, the cooldown is still set, blocking the next scan for that asset for the full cooldown period. A valid signal that AI initially rejects could be suppressed for 5 minutes.

**Fix:** Only set cooldown when the alert is actually dispatched (inside the `if ai_verdict.confirmed:` block). Remove the premature cooldown set.

---

### H8. Gateway Alerts Route Has No Security
**File:** `backend/services/gateway/routes/alerts.py`  
**Severity:** 🟡 HIGH — Security gap  

**Problem:** Unlike `ops.py` which has local-only IP checks and optional token authentication, `alerts.py` has zero security. Any network client can:
- Start the dispatcher (`POST /api/v1/alerts/start`)
- Stop the dispatcher (`POST /api/v1/alerts/stop`)
- Query status (`GET /api/v1/alerts/status`)

**Fix:** Apply the same security pattern as `ops.py`:
- Local-only client enforcement (`127.0.0.1` / `::1`)
- Optional token gate via `QFLX_OPS_TOKEN`

---

## 🟢 MEDIUM Severity Issues (10)

### M1. No Error Display in AnalysisPanel
**File:** `AnalysisPanel.jsx`  
The `useAlerts` hook tracks `error` state but `AnalysisPanel` never renders it. If start/stop fails, the user gets no feedback.

**Fix:** Add an error toast or inline error message near the Start/Stop button.

---

### M2. Hardcoded Heartbeat Staleness Threshold
**File:** `AnalysisPanel.jsx` (line ~10)  
```javascript
const isHeartbeatActive = scanHeartbeat && (Date.now() - scanHeartbeat.receivedAt < 120000);
```
The 120-second threshold is hardcoded. It should be derived from `settings.alerts.scanIntervalSeconds` (e.g., `scanInterval * 3`).

---

### M3. No Loading Spinner on Start/Stop Button
**File:** `AnalysisPanel.jsx`  
The button shows `disabled:opacity-50` when loading but no visual spinner. Users may click multiple times.

**Fix:** Add a spinner icon when `loading` is true, similar to the AI "thinking" indicator.

---

### M4. Alert Feed Missing AI Confidence Score
**File:** `AnalysisPanel.jsx`  
The feed shows `AI ✓` badge but not the confidence percentage. Traders need to see confidence to gauge signal quality.

**Fix:** Add `{Math.round(alert.ai_confidence * 100)}%` next to the AI badge.

---

### M5. Wasteful 5-Second Polling in useAlerts
**File:** `useAlerts.js`  
The hook polls `/api/v1/alerts/status` every 5 seconds regardless of dispatcher state. When stopped, this is unnecessary overhead.

**Fix:** Use Socket.IO events for status changes, or increase polling interval to 30s when `running === false`.

---

### M6. `REGIME_PROMPTS` Dict Keys Don't Match All `MarketCondition` Values
**File:** `otc_alert_dispatch.py`  
The `REGIME_PROMPTS` dict has entries for all regimes, but the keys are string literals that must exactly match `MarketCondition.value`. Any typo or enum value change will silently fall through to the generic prompt.

**Fix:** Use `MarketCondition` enum values as keys:
```python
REGIME_PROMPTS = {
    MarketCondition.STRONG_MOMENTUM_UP.value: "...",
    ...
}
```

---

### M7. `TickLogger.flush()` Silently Drops Data on Write Failure
**File:** `otc_alert_dispatch.py` (line ~430)  
```python
except Exception as e:
    logger.error(f"Failed to log ticks for {asset}: {e}")
    # Re-queue on failure? For now, drop to avoid memory leak
```
Data is permanently lost on write failure. At minimum, the buffer should be preserved for retry.

---

### M8. `RedisSubscriber.run()` Has No Graceful Shutdown
**File:** `otc_alert_dispatch.py`  
The subscriber runs in an infinite loop with no cancellation token or shutdown signal. When the dispatcher stops, the subscriber task may leak.

---

### M9. `scan_available_assets()` Filesystem Scan is Synchronous
**File:** `otc_alert_dispatch.py`  
The `scan_available_assets()` method performs synchronous filesystem I/O (`iterdir()`, `glob()`) on the event loop. For large history directories, this blocks the async loop.

**Fix:** Wrap in `asyncio.to_thread()`.

---

### M10. `fetch_data()` Creates a New `aiohttp.ClientSession` Per Call
**File:** `otc_alert_dispatch.py` (line ~560)  
```python
async with aiohttp.ClientSession() as session:
```
Each API fallback call creates and destroys a session. This wastes TCP connections.

**Fix:** Use the persistent session pattern (like `AIOrchestrator.get_session()`).

---

## 🔵 LOW Severity Issues (7)

### L1. No Alert Sound/Browser Notification on New Signal
**File:** `AnalysisPanel.jsx` / `marketStore.js`  
New alerts arrive silently. A trading platform should play an audio cue and/or show a browser notification.

### L2. No "Clear Feed" or "Export" Button for Alert Feed
**File:** `AnalysisPanel.jsx`  
The feed accumulates up to 50 items with no way to clear or export for journaling.

### L3. Alert Feed Items Not Keyboard Accessible
**File:** `AnalysisPanel.jsx`  
Alert items use `<div onClick>` instead of `<button>` — not accessible via keyboard navigation.

### L4. `useAlerts` Hook Has No Error Recovery
**File:** `useAlerts.js`  
If `fetchStatus` fails, the error persists with no retry or backoff logic.

### L5. `_cleanup_if_exited()` Swallows All Exceptions
**File:** `alerts.py` (line ~50)  
```python
except Exception:
    pass
```
This violates Core Principle #8 (Zero Silent Failures).

### L6. `DiscordDispatcher` Rate Limit Comment is Misleading
**File:** `otc_alert_dispatch.py` (line ~340)  
The comment says "Rate Limit Check - REMOVED" but doesn't explain that the dispatcher-level cooldown replaces it. Future maintainers may re-add it.

### L7. Logging Setup Incomplete
**File:** `otc_alert_dispatch.py`  
`LOG_DIR` is created but no `FileHandler` is configured. The logger only outputs to stdout (captured by the gateway's subprocess redirect). Direct file logging would be more robust.

---

## Architecture Simplification Recommendations

### 1. Consolidate Indicator Calculation Chain
**Current (fragmented):**
```
indicators.py (Pipeline) → indicator_wrapper.py (dead?) → regime_detector.py (duplicate mapping)
```

**Recommended:**
```
indicators.py (Pipeline) → regime_detector.py (imports pipeline, adds regime-specific columns only)
```
- Delete `indicator_wrapper.py` or merge its unique logic into `regime_detector.py`.
- Move body_ratio/large_body/pivot calculations into `indicators.py` as optional methods.
- `regime_detector.calculate_indicators()` should ONLY add columns that the pipeline doesn't already provide.

### 2. Single Source of Truth for MarketCondition
Move `MarketCondition` enum to `regime_detector.py` (already there). All other files import from there. Delete the duplicate in `otc_alert_dispatch.py`.

### 3. Unify S/R Implementation
Use the `indicators.py` fractal approach (non-repainting, shift-based) as the canonical implementation. Map output columns (`resistance_level` → `pivot_h`) in one place.

### 4. Replace AI Orchestrator Direct HTTP with Internal API Call
Instead of the `AIOrchestrator` making raw HTTP calls with a hardcoded model, have it call the internal `/api/v1/ai/ask` endpoint which already handles model selection, caching, and error handling.

### 5. Event-Driven Alert Status (Replace Polling)
Replace the 5-second polling in `useAlerts.js` with Socket.IO events:
- `alert:status_changed` → emitted by gateway when dispatcher starts/stops
- `scan:heartbeat` → already implemented, can carry status info

### 6. Add Security to Alert Routes
Apply the same `ops.py` security pattern (local-only + optional token) to `alerts.py`.

---

## Priority Implementation Order

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | C1: Fix `bb_width` normalization | 15 min | Breakout detection restored |
| 2 | C2: Fix Discord `ema165` → `ema89` | 5 min | Correct alert display |
| 3 | C3: Fix AI payload format | 30 min | AI verification functional |
| 4 | H7: Fix premature cooldown | 5 min | Stop suppressing valid signals |
| 5 | H4: Fix pivot detection in regime_detector | 30 min | Reliable S/R levels |
| 6 | H1: Consolidate MarketCondition enum | 10 min | Eliminate drift risk |
| 7 | H6: Remove/consolidate indicator_wrapper.py | 20 min | Reduce confusion |
| 8 | H8: Add security to alerts route | 15 min | Close security gap |
| 9 | M1-M4: Frontend UX improvements | 1 hr | Better trader experience |
| 10 | M5: Replace polling with Socket.IO | 30 min | Reduce overhead |

**Estimated total effort for Critical + High fixes: ~2.5 hours**

---

## Verification Commands

After implementing fixes, run:
```powershell
# Backend tests
python -m pytest -q

# Specific indicator tests
python -m pytest tests/test_indicators_adx_cci.py -v
python -m pytest tests/test_integration_indicator_params.py -v

# Frontend
cd gui/Dashboard
npm run lint
npm run build
```

---

---

## Systematic Implementation Plan

> **Legend:** `[x]` = Complete | `[~]` = In Progress | `[ ]` = Not Started  
> **Rule:** Each step must be tested before proceeding to the next (Core Principle #3).  
> **Estimated Total Effort:** ~4–5 hours across all phases.

---

### Phase 1: Critical Bug Fixes (Backend — Signal Accuracy)
*Goal: Restore correct signal detection and alert delivery. No frontend changes.*  
*Estimated: 50 minutes*

- [ ] **Step 1.1 — Fix `bb_width` normalization in `indicators.py`**
  - File: `backend/services/strategy/indicators.py`
  - Action: After pandas-ta `BBB` calculation, divide by 100 to normalize percentage → decimal
  - Also ensure the fallback path produces the same scale
  - Test: `python -m pytest tests/test_indicators_adx_cci.py -v`
  - Test: Manually verify `bb_width` values are in 0.00–0.10 range for typical forex pairs

- [ ] **Step 1.2 — Fix Discord embed `ema165` → `ema89`**
  - File: `backend/scripts/otc_alert_dispatch.py`
  - Action: Change `tech.get('ema165', '---')` → `tech.get('ema89', '---')` in Discord embed
  - Action: Change embed label from `EMA-16/165` → `EMA-16/89`
  - Action: Update test mode mock data: `"ema165": 1.0500` → `"ema89": 1.0500`
  - Test: Run `python backend/scripts/test_discord_alert.py` (if available) or `--test-alert` mode

- [ ] **Step 1.3 — Fix AI Orchestrator payload format**
  - File: `backend/scripts/otc_alert_dispatch.py` → `AIOrchestrator._execute_request()`
  - Action: Remove hardcoded `"model": "gpt-4-turbo"` and `"json": True`
  - Action: Restructure payload to match `/api/v1/ai/ask` expected format:
    ```python
    payload = {
        "prompt": prompt,
        "context": {
            "asset": context.asset,
            "regime": regime_label,
            "direction": direction,
            "uiMode": "alert_verification",
            "responseVerbosity": "concise"
        }
    }
    ```
  - Action: Update response parsing to handle `data.get('answer', '')` (already partially correct)
  - Test: Start dispatcher with `--test-alert` and verify AI call succeeds or gracefully fails

- [ ] **Step 1.4 — Fix premature cooldown (H7)**
  - File: `backend/scripts/otc_alert_dispatch.py` → `process_asset()`
  - Action: Remove `self.cooldowns[asset] = now` from the AI Check block (after semaphore)
  - Action: Keep only the cooldown set inside `if ai_verdict.confirmed:` block
  - Test: Review logic flow — rejected signals should NOT set cooldown

- [ ] **Phase 1 Verification Gate**
  - Run: `python -m pytest -q` (all backend tests pass)
  - Run: `python backend/scripts/otc_alert_dispatch.py --test-alert` (mock alert completes)

---

### Phase 2: Structural Consolidation (Backend — Eliminate Duplication)
*Goal: Single source of truth for enums, indicators, and S/R. Reduce maintenance burden.*  
*Estimated: 1 hour*

- [ ] **Step 2.1 — Consolidate `MarketCondition` enum (H1)**
  - File: `backend/scripts/otc_alert_dispatch.py`
  - Action: Delete the local `MarketCondition` class definition
  - Action: Add import: `from backend.services.strategy.regime_detector import MarketCondition, RegimeResult`
  - Action: Also import `AlertContext` dataclass's `condition` type annotation if needed
  - Test: `python -m pytest -q`

- [ ] **Step 2.2 — Fix `create_indicator_set` `ema_165` reference (H2)**
  - File: `backend/services/strategy/indicators.py`
  - Action: Change `ema_165=self._safe_float(df_row.get('ema_165'))` → `ema_89=self._safe_float(df_row.get('ema_89'))`
  - Test: `python -m pytest tests/test_integration_indicator_params.py -v`

- [ ] **Step 2.3 — Remove duplicate `ema_fast` key (H3)**
  - File: `backend/services/strategy/indicators.py`
  - Action: Delete the duplicate `'ema_fast': 16,` line from `self.params`
  - Test: `python -m pytest -q`

- [ ] **Step 2.4 — Fix pivot detection in `regime_detector.py` (H4)**
  - File: `backend/services/strategy/regime_detector.py` → `calculate_indicators()`
  - Action: Replace rolling max/min with proper fractal detection:
    ```python
    # Correct fractal detection (center bar must be the extremum)
    result_df['pivot_h'] = result_df['high'].rolling(window=window, center=True).apply(
        lambda x: x.iloc[len(x)//2] if x.iloc[len(x)//2] == x.max() else np.nan, raw=False
    )
    result_df['pivot_l'] = result_df['low'].rolling(window=window, center=True).apply(
        lambda x: x.iloc[len(x)//2] if x.iloc[len(x)//2] == x.min() else np.nan, raw=False
    )
    ```
  - Test: `python -m pytest tests/test_indicators_adx_cci.py -v`
  - Test: Verify S/R levels are sparse (not every candle) with sample data

- [ ] **Step 2.5 — Evaluate and remove `indicator_wrapper.py` (H6)**
  - File: `backend/services/strategy/indicator_wrapper.py`
  - Action: Search codebase for any imports of `indicator_wrapper` or `calculate_indicators_unified`
  - Decision: If no imports found → delete the file
  - Decision: If imports found → refactor callers to use `regime_detector.calculate_indicators()` instead
  - Test: `python -m pytest -q`

- [ ] **Phase 2 Verification Gate**
  - Run: `python -m pytest -q` (all backend tests pass)
  - Run: `python -m pytest tests/test_integration_indicator_params.py -v`
  - Confirm: Only ONE `MarketCondition` definition exists in codebase
  - Confirm: Only ONE S/R implementation is used by the dispatch chain

---

### Phase 3: Security & Reliability (Backend — Gateway)
*Goal: Close security gaps and improve resilience.*  
*Estimated: 30 minutes*

- [ ] **Step 3.1 — Add security to alerts route (H8)**
  - File: `backend/services/gateway/routes/alerts.py`
  - Action: Import security helpers from `ops.py` (local-only check, token validation)
  - Action: Apply to `start_alerts`, `stop_alerts`, and `get_alerts_status` endpoints
  - Action: Use same env vars: `QFLX_ENABLE_OPS`, `QFLX_OPS_TOKEN`
  - Test: Verify endpoints return 403 from non-local IPs (if testable)

- [ ] **Step 3.2 — Fix `_cleanup_if_exited()` silent exception swallowing (L5)**
  - File: `backend/services/gateway/routes/alerts.py`
  - Action: Replace `except Exception: pass` with `except Exception as e: logger.warning(f"Cleanup check: {e}")`
  - Test: `python -m pytest -q`

- [ ] **Step 3.3 — Use `REGIME_PROMPTS` keys from enum values (M6)**
  - File: `backend/scripts/otc_alert_dispatch.py`
  - Action: Verify all `REGIME_PROMPTS` dict keys exactly match `MarketCondition.*.value` strings
  - Action: Optionally refactor to use enum values as keys for compile-time safety
  - Test: Add assertion in test that all `MarketCondition` values have a matching prompt

- [ ] **Phase 3 Verification Gate**
  - Run: `python -m pytest -q`
  - Confirm: Alert routes require local-only access

---

### Phase 4: Frontend UX Improvements (Dashboard)
*Goal: Better trader experience with error feedback, loading states, and richer signal data.*  
*Estimated: 1 hour*

- [ ] **Step 4.1 — Display error state in AnalysisPanel (M1)**
  - File: `gui/Dashboard/src/components/AnalysisPanel.jsx`
  - Action: Destructure `error` from `useAlerts()` (already returned)
  - Action: Add inline error banner below the Start/Stop button when `error` is truthy
  - Test: `npm run lint` + `npm run build`

- [ ] **Step 4.2 — Add loading spinner to Start/Stop button (M3)**
  - File: `gui/Dashboard/src/components/AnalysisPanel.jsx`
  - Action: When `loading` is true, show a spinner icon inside the button (replace Play/Square icon)
  - Test: `npm run lint` + `npm run build`

- [ ] **Step 4.3 — Show AI confidence percentage in alert feed (M4)**
  - File: `gui/Dashboard/src/components/AnalysisPanel.jsx`
  - Action: In the alert feed item, change `AI ✓` badge to include confidence:
    ```jsx
    <div className="...">AI ✓ {Math.round(alert.ai_confidence * 100)}%</div>
    ```
  - Test: `npm run lint` + `npm run build`

- [ ] **Step 4.4 — Derive heartbeat staleness from settings (M2)**
  - File: `gui/Dashboard/src/components/AnalysisPanel.jsx`
  - Action: Replace hardcoded `120000` with `(settings.alerts?.scanIntervalSeconds || 60) * 3 * 1000`
  - Test: `npm run lint` + `npm run build`

- [ ] **Step 4.5 — Add alert sound on new signal (L1)**
  - File: `gui/Dashboard/src/store/marketStore.js`
  - Action: In the `socket.on('new_alert', ...)` handler, play an audio cue
  - Action: Respect a `settings.alerts.enableAlertSound` toggle (default true)
  - Test: `npm run lint` + `npm run build`

- [ ] **Phase 4 Verification Gate**
  - Run: `cd gui/Dashboard && npm run lint && npm run build`
  - Visual: Start dashboard, verify error display, loading spinner, confidence scores render

---

### Phase 5: Performance & Cleanup (Backend + Frontend)
*Goal: Reduce overhead, clean up dead code, improve async patterns.*  
*Estimated: 45 minutes*

- [ ] **Step 5.1 — Replace 5s polling with adaptive interval (M5)**
  - File: `gui/Dashboard/src/hooks/useAlerts.js`
  - Action: When `running === false`, poll every 30s instead of 5s
  - Action: When `running === true`, keep 5s interval
  - Test: `npm run lint` + `npm run build`

- [ ] **Step 5.2 — Use persistent session in `fetch_data()` (M10)**
  - File: `backend/scripts/otc_alert_dispatch.py`
  - Action: Add a `_market_session` to `OTCDispatcher` (similar to `AIOrchestrator.get_session()`)
  - Action: Use it in `fetch_data()` API fallback instead of creating a new session per call
  - Action: Close in `OTCDispatcher.close()`
  - Test: `python -m pytest -q`

- [ ] **Step 5.3 — Wrap `scan_available_assets()` in `asyncio.to_thread()` (M9)**
  - File: `backend/scripts/otc_alert_dispatch.py`
  - Action: Make `scan_available_assets()` sync, call it via `await asyncio.to_thread(self.scan_available_assets)` in `run_loop()`
  - Test: `python -m pytest -q`

- [ ] **Step 5.4 — Preserve tick buffer on flush failure (M7)**
  - File: `backend/scripts/otc_alert_dispatch.py` → `TickLogger.flush()`
  - Action: On write failure, re-prepend the chunk back to the buffer (with a max retry count to prevent infinite growth)
  - Test: `python -m pytest -q`

- [ ] **Phase 5 Verification Gate**
  - Run: `python -m pytest -q`
  - Run: `cd gui/Dashboard && npm run lint && npm run build`

---

### Phase 6: Final Validation & Documentation
*Goal: Full system verification and memory update.*  
*Estimated: 20 minutes*

- [ ] **Step 6.1 — Full test suite**
  - Run: `python -m pytest -q` (all pass)
  - Run: `python -m pytest tests/test_indicators_adx_cci.py tests/test_integration_indicator_params.py -v`
  - Run: `cd gui/Dashboard && npm run lint && npm run build`

- [ ] **Step 6.2 — Smoke test dispatcher**
  - Run: `python backend/scripts/otc_alert_dispatch.py --test-alert`
  - Verify: Mock alert completes without errors
  - Verify: Discord embed shows correct EMA-16/89 values (if webhook configured)

- [ ] **Step 6.3 — Update `.agent-memory/activeContext.md`**
  - Document completed fixes
  - Update "Current State" section with consolidated indicator chain
  - Note any remaining items deferred to future sprints

- [ ] **Step 6.4 — Update this report**
  - Mark all completed steps with `[x]`
  - Add any new issues discovered during implementation
  - Record actual effort vs estimates

---

### Deferred Items (Future Sprints)

These items are valid improvements but lower priority than the fixes above:

- [ ] **L2:** Add "Clear Feed" / "Export" button to AnalysisPanel
- [ ] **L3:** Make alert feed items keyboard-accessible (`<button>` instead of `<div onClick>`)
- [ ] **L4:** Add exponential backoff to `useAlerts` error recovery
- [ ] **L6:** Clarify Discord rate limit comment
- [ ] **L7:** Add direct file logging to dispatcher (FileHandler)
- [ ] **M8:** Add graceful shutdown signal to `RedisSubscriber`
- [ ] **Arch #4:** Replace AI Orchestrator direct HTTP with internal `/api/v1/ai/ask` call
- [ ] **Arch #5:** Full Socket.IO event-driven alert status (replace polling entirely)

---

*Plan compiled by Team Leader. Each phase is independent and can be paused/resumed. Phases 1–3 are backend-only and can be done without touching the frontend. Phase 4 is frontend-only.*

*Report compiled by Team Leader with delegation to @Investigator (forensic analysis), @Reviewer (code quality), @Backend-Specialist (indicator pipeline), and @Frontend-Specialist (AnalysisPanel UX).*
