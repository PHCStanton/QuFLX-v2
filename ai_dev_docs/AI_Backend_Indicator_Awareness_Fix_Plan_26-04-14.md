# QuFLX v2 — AI Backend Indicator Awareness Fix Plan

**Date:** 2026-04-14  
**Owner:** Team Leader → @Coder (implementation), @Reviewer (phase-gate)  
**Priority:** CRITICAL — Recurring regression, AI analysis quality directly impacted  
**Scope:** `_inject_backend_indicators()` in `backend/services/gateway/routes/ai.py` + frontend context assembly in `gui/Dashboard/src/utils/aiContext.js`
**Implementation Status:** COMPLETE  
**Plan Status:** CLOSED

---

## 1. Executive Summary

The feature that ensures **technical indicators are always available to the AI for analysis** — regardless of whether the user has toggled indicators on the frontend chart — has regressed. The root cause is that `_inject_backend_indicators()` in `ai.py` still uses the **old subprocess-based architecture** (spawning `capabilities_v2/runner.py` → `indicator_calculator.py`) that was explicitly replaced by OPT-1 in the indicator route (`routes/indicators.py`). This subprocess path is inherently fragile on Windows, adds ~500ms+ latency per AI request, and breaks silently whenever the import chain or environment changes.

**Goal:** Rewrite `_inject_backend_indicators()` to use the same **in-process `TechnicalIndicatorsPipeline`** that the indicator route already uses, and change the injection logic from "all-or-nothing" to "always supplement" so the AI always has a complete indicator set.

---

## 2. Investigation Findings (from @Investigator report, 2026-04-13)

### 2.1 Root Cause: Subprocess Architecture in AI Route

**File:** `backend/services/gateway/routes/ai.py`, lines 246–377  
**Evidence:**

```python
# Line 270-271 — Resolves path to runner.py via fragile relative path
runner_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py")
)

# Lines 284-308 — Spawns a full Python subprocess
args = [sys.executable, runner_path, "indicator_calculator", "--inputs", json.dumps(inputs)]
result = await asyncio.to_thread(run_indicator_calc)  # subprocess.run inside
```

**Why this keeps breaking:**
1. Spawns a **new Python process** every AI request (~500ms+ overhead)
2. `runner.py` imports Selenium/Chrome dependencies even for non-browser capabilities — fragile import chain
3. Uses `parse_script_json()` to parse stdout — brittle if any logging leaks to stdout
4. Path resolution via `../../../../` breaks on any directory restructure
5. Environment variable propagation is unreliable on Windows
6. **No test coverage** for this critical path

**Contrast:** The indicator route (`routes/indicators.py`) was already migrated to in-process execution via OPT-1:
```python
# routes/indicators.py — CORRECT architecture (in-process)
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
result_df, series, row_count = await asyncio.to_thread(
    _calculate_in_thread, csv_path, asset, pipeline_params, current_candle, timeframe_min
)
```

### 2.2 Frontend Context Assembly Gap

**File:** `gui/Dashboard/src/utils/aiContext.js`, lines 55–63

```javascript
if (seriesForKey && Array.isArray(activeIndicators)) {
    activeIndicators.forEach((ind) => {
      if (!ind || !ind.key) return;
      const series = seriesForKey[ind.key];
      if (!Array.isArray(series) || series.length === 0) return;
      indicatorSnapshots[name] = tail;
    });
}
```

- `indicatorSnapshots` is built **only from `activeIndicators`** — indicators the user has toggled ON in the UI
- If user has **zero active indicators** → `indicatorSnapshots = {}` → backend injection triggers (but via broken subprocess)
- If user has **one indicator** (e.g., just RSI) → `indicatorSnapshots` has 1 entry → backend injection **skipped entirely** → AI gets incomplete data

### 2.3 All-or-Nothing Skip Logic

**File:** `backend/services/gateway/routes/ai.py`, line 226

```python
if (existing_snapshots and len(existing_snapshots) > 0) or not asset or not timeframe:
    return  # Skip injection
```

- **1+ active indicators** → backend injection skipped (AI gets only user's selected indicators)
- **0 active indicators** → backend injection attempted (via broken subprocess)
- No "merge" or "supplement" logic exists

### 2.4 Missing Asset Normalization

**File:** `backend/services/gateway/routes/ai.py`, line 254

```python
csv_path = get_candle_path(asset, f"{tf_min}m")  # asset NOT normalized
```

The indicator route correctly normalizes (`asset = normalize_asset(asset)` at line 263), but the AI injection function does not. This causes file-not-found errors for assets like `EURUSD_otc` vs `EURUSDOTC`.

### 2.5 Duplicate Code (3 locations)

| Location | What |
|----------|------|
| `backend/services/gateway/routes/indicators.py` lines 205–246 | `_map_params()` function |
| `capabilities_v2/indicator_calculator.py` lines 72–110 | Inline param mapping (identical logic) |
| `backend/services/gateway/routes/ai.py` line 276 | Hardcoded defaults, no param mapping |

---

## 3. Current State Map

| Component | File | Current State | Issue |
|-----------|------|---------------|-------|
| Indicator Pipeline | `backend/services/strategy/indicators.py` | ✅ Stable | No issues — well-tested, comprehensive |
| Indicator Route | `backend/services/gateway/routes/indicators.py` | ✅ Stable | In-process via OPT-1, cached, fast |
| AI Route Injection | `backend/services/gateway/routes/ai.py` L216–377 | 🔴 BROKEN | Uses deprecated subprocess architecture |
| Frontend Context | `gui/Dashboard/src/utils/aiContext.js` L55–63 | 🟡 Partial | Only includes user-active indicators |
| AI Client | `gui/Dashboard/src/api/aiClient.js` | ✅ Stable | Correctly sends asset/timeframe top-level |
| useAskAi Hook | `gui/Dashboard/src/hooks/useAskAi.js` | ✅ Stable | Correctly builds and shrinks context |
| AI Service | `backend/services/ai/service.py` | ✅ Stable | Correctly serializes context into prompt |

---

## 4. Architecture: Before vs After

### BEFORE (Current — Broken)

```
Frontend: buildAiContext()
  → indicatorSnapshots = {} (if no active indicators)
  → POST /api/v1/ai/ask

Backend ai.py:
  → _inject_backend_indicators() check:
    → if indicatorSnapshots empty:
      → SPAWN SUBPROCESS: runner.py → indicator_calculator.py
      → Parse stdout JSON (fragile)
      → Inject into context
    → else: SKIP entirely
  → ai_service.ask()
```

### AFTER (Proposed — Stable)

```
Frontend: buildAiContext()
  → indicatorSnapshots = { user's active indicators }
  → POST /api/v1/ai/ask

Backend ai.py:
  → _inject_backend_indicators() — ALWAYS runs:
    → Import TechnicalIndicatorsPipeline directly (in-process)
    → normalize_asset() on asset
    → get_candle_path() for CSV
    → Run pipeline via asyncio.to_thread() (same as indicator route)
    → Build backend snapshots from result series
    → MERGE with existing frontend snapshots (frontend takes precedence)
    → Set backendDataInjected = True
  → ai_service.ask()
```

---

## 5. Implementation Plan

### Completion Summary

- [x] Phase 1 complete — created shared in-process utility in `backend/utils/indicator_utils.py`
- [x] Phase 2 complete — rewrote backend AI indicator injection in `backend/services/gateway/routes/ai.py`
- [x] Phase 3 complete — refactored `backend/services/gateway/routes/indicators.py` to reuse shared calculation utility
- [x] Phase 4 complete — verified deprecated AI subprocess path is removed; retained `indicator_calculator.py` only for existing CLI/runner usage outside this fix scope
- [x] Phase 5 complete — added regression coverage in `backend/tests/test_ai_routes.py` and `backend/tests/test_indicator_routes.py`
- [x] Phase 6 complete — full backend verification passed

### Phase 1: Extract Shared Indicator Calculation Utility

**Goal:** Create a reusable function that both `routes/indicators.py` and `routes/ai.py` can call, eliminating code duplication.

**File to create:** `backend/utils/indicator_utils.py`

**Contents:**
```python
"""
Shared indicator calculation utility.
Used by both the indicator API route and the AI backend injection.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple
from pathlib import Path

from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
from backend.utils.asset_utils import normalize_asset
from backend.utils.data_store import get_candle_path


def calculate_indicators_for_asset(
    asset: str,
    timeframe_min: int = 1,
    pipeline_params: Optional[Dict[str, Any]] = None,
    current_candle: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, int]:
    """
    Synchronous indicator calculation — safe to run in asyncio.to_thread().
    
    Returns (result_df, row_count).
    Raises ValueError if no history file found or file is empty.
    """
    asset = normalize_asset(asset)
    csv_path = get_candle_path(asset, f"{timeframe_min}m")
    
    if not csv_path or not csv_path.exists():
        raise FileNotFoundError(f"History not found for {asset} @ {timeframe_min}m")
    
    df = pd.read_csv(csv_path)
    
    # Append/update current candle if provided
    if current_candle:
        ts = current_candle.get("time") or current_candle.get("timestamp")
        new_row = {
            "timestamp": float(ts),
            "open": float(current_candle.get("open")),
            "high": float(current_candle.get("high")),
            "low": float(current_candle.get("low")),
            "close": float(current_candle.get("close")),
        }
        if not df.empty and float(df.iloc[-1]["timestamp"]) == float(ts):
            for k, v in new_row.items():
                df.loc[df.index[-1], k] = v
        else:
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    
    if df.empty:
        raise ValueError(f"History file is empty: {csv_path}")
    
    df.columns = [c.lower() for c in df.columns]
    
    pipeline = TechnicalIndicatorsPipeline(
        config={"indicator_params": pipeline_params or {}}
    )
    result_df = pipeline.calculate_indicators(df, timeframe_min=timeframe_min)
    
    return result_df, len(result_df)


def build_indicator_snapshots(
    result_df: pd.DataFrame,
    tail_count: int = 50,
) -> Dict[str, list]:
    """
    Build AI-friendly indicator snapshots from a calculated DataFrame.
    Returns a dict of { "Readable Name": [last N {time, value} points] }.
    """
    snapshots = {}
    
    # Define which columns to extract and their readable names
    indicator_map = {
        # Trend
        "sma_20": "SMA 20",
        "ema_16": "EMA 16",
        "ema_89": "EMA 89",
        "ema_21": "EMA 21",
        "ema_50": "EMA 50",
        "ema_100": "EMA 100",
        "wma_20": "WMA 20",
        # Momentum
        "rsi_14": "RSI 14",
        "rsi_21": "RSI 21",
        "stoch_k": "Stochastic K",
        "stoch_d": "Stochastic D",
        "williams_r": "Williams %R",
        "roc_10": "ROC 10",
        # MACD
        "macd": "MACD",
        "macd_signal": "MACD Signal",
        "macd_histogram": "MACD Histogram",
        # Bollinger Bands
        "bb_upper": "BB Upper",
        "bb_middle": "BB Middle",
        "bb_lower": "BB Lower",
        "bb_width": "BB Width",
        "bb_percent": "BB %B",
        # Volatility
        "atr_14": "ATR 14",
        "atr_21": "ATR 21",
        "adx": "ADX",
        "plus_di": "Plus DI",
        "minus_di": "Minus DI",
        # Custom
        "supertrend": "Supertrend",
        "supertrend_direction": "Supertrend Direction",
        "schaff_tc": "Schaff TC",
        "demarker": "DeMarker",
        "cci": "CCI",
        # Support/Resistance
        "support_level": "Support Level",
        "resistance_level": "Resistance Level",
        "dist_to_support": "Distance to Support %",
        "dist_to_resistance": "Distance to Resistance %",
        "support_freshness": "Support Freshness",
        "resistance_freshness": "Resistance Freshness",
        "sr_flip": "S/R Flip",
    }
    
    for col, name in indicator_map.items():
        if col not in result_df.columns:
            continue
        valid = result_df[["timestamp", col]].dropna()
        if valid.empty:
            continue
        tail = valid.tail(tail_count)
        points = []
        for _, row in tail.iterrows():
            val = row[col]
            # Convert to appropriate Python type
            if isinstance(val, (np.integer,)):
                val = int(val)
            elif isinstance(val, (np.floating,)):
                val = float(val)
            elif isinstance(val, (np.bool_,)):
                val = bool(val)
            else:
                val = str(val) if not isinstance(val, (int, float, bool, str)) else val
            points.append({"time": int(float(row["timestamp"])), "value": val})
        if points:
            snapshots[name] = points
    
    return snapshots
```

**Files touched:** New file only  
**Risk:** None — additive only

---

### Phase 2: Rewrite `_inject_backend_indicators()` — In-Process

**Goal:** Replace the subprocess-based implementation with a direct in-process call using the shared utility from Phase 1.

**File:** `backend/services/gateway/routes/ai.py`

**Changes:**
1. Remove all subprocess-related imports (`os`, `sys`, `subprocess`, `parse_script_json`)
2. Import the shared utility: `from backend.utils.indicator_utils import calculate_indicators_for_asset, build_indicator_snapshots`
3. Import `normalize_asset`: `from backend.utils.asset_utils import normalize_asset`
4. Rewrite `_inject_backend_indicators()` to:
   - **Always run** (not skip when frontend has some indicators)
   - Use `normalize_asset()` on the asset
   - Call `calculate_indicators_for_asset()` via `asyncio.to_thread()`
   - Call `build_indicator_snapshots()` on the result
   - **Merge** backend snapshots with existing frontend snapshots (frontend takes precedence)
   - Set `context['backendDataInjected'] = True`

**New implementation (replaces lines 216–377):**

```python
async def _inject_backend_indicators(
    context: Dict[str, Any],
    asset: Optional[str],
    timeframe: Optional[str],
) -> None:
    """
    Always injects backend-calculated technical indicators into the AI context.
    
    Behavior:
    - If frontend provided indicatorSnapshots, backend supplements with any
      missing indicators (frontend values take precedence).
    - If frontend provided none, backend provides the full set.
    - Can be disabled by passing skipBackendIndicators=True in context.
    
    Uses in-process TechnicalIndicatorsPipeline (same as indicator route).
    No subprocess spawn — fast, reliable, consistent.
    """
    import asyncio
    from backend.utils.indicator_utils import (
        calculate_indicators_for_asset,
        build_indicator_snapshots,
    )
    from backend.utils.asset_utils import normalize_asset

    # Simple enable/disable check
    if context.get('skipBackendIndicators'):
        logger.debug('Backend indicator injection: disabled by context flag')
        return

    if not asset or not timeframe:
        logger.debug('Backend indicator injection: skipped — missing asset or timeframe')
        return

    # Parse timeframe to minutes
    try:
        tf = timeframe.strip().lower()
        if tf.endswith('m'):
            tf_min = int(tf[:-1])
        elif tf.endswith('h'):
            tf_min = int(tf[:-1]) * 60
        elif tf.isdigit():
            tf_min = int(tf)
        else:
            logger.warning('Backend indicator injection: unsupported timeframe: %s', timeframe)
            return
    except Exception as e:
        logger.warning('Backend indicator injection: timeframe parse error: %s', e)
        return

    try:
        normalized_asset = normalize_asset(asset)
        
        # Run pipeline in thread pool (non-blocking, same as indicator route)
        result_df, row_count = await asyncio.to_thread(
            calculate_indicators_for_asset,
            normalized_asset,
            tf_min,
        )
        
        # Build AI-friendly snapshots (last 50 points per indicator)
        backend_snapshots = build_indicator_snapshots(result_df, tail_count=50)
        
        if not backend_snapshots:
            logger.warning('Backend indicator injection: pipeline returned no indicator data')
            return
        
        # Merge: frontend snapshots take precedence, backend fills gaps
        existing = context.get('indicatorSnapshots') or {}
        merged = {**backend_snapshots, **existing}  # existing overwrites backend
        
        context['indicatorSnapshots'] = merged
        context['backendDataInjected'] = True
        
        backend_only_keys = set(backend_snapshots.keys()) - set(existing.keys())
        logger.info(
            'Backend indicator injection: asset=%s tf=%sm total_keys=%d backend_added=%d frontend_kept=%d',
            normalized_asset, tf_min, len(merged), len(backend_only_keys), len(existing),
        )

    except FileNotFoundError:
        logger.info('Backend indicator injection: no history file for %s @ %sm', asset, tf_min)
    except Exception as e:
        logger.warning('Backend indicator injection failed: %s', e, exc_info=True)
```

**Files touched:** `backend/services/gateway/routes/ai.py`  
**Risk:** LOW — replaces broken code with proven architecture

---

### Phase 3: Update Indicator Route to Use Shared Utility

**Goal:** Refactor `routes/indicators.py` to use the shared `calculate_indicators_for_asset()` from Phase 1, eliminating the duplicated `_calculate_in_thread()` function.

**File:** `backend/services/gateway/routes/indicators.py`

**Changes:**
1. Import `calculate_indicators_for_asset` from `backend.utils.indicator_utils`
2. Refactor `_calculate_in_thread()` to delegate to the shared utility
3. Keep the caching layer and `_build_series()` extraction (these are route-specific)

**Note:** The indicator route's caching, series extraction, and response envelope are route-specific concerns and should NOT be moved to the shared utility. Only the core calculation logic is shared.

**Files touched:** `backend/services/gateway/routes/indicators.py`  
**Risk:** LOW — internal refactor, same behavior

---

### Phase 4: Cleanup Dead Code

**Goal:** Remove the now-unused subprocess infrastructure.

**Changes:**
1. In `ai.py`: Remove unused imports (`os`, `sys`, `subprocess`, `parse_script_json`)
2. Verify `capabilities_v2/indicator_calculator.py` is still needed by `runner.py` for CLI usage (it is — keep it)
3. Remove `common.py`'s `parse_script_json` only if no other route uses it (check first)

**Files touched:** `backend/services/gateway/routes/ai.py`, potentially `common.py`  
**Risk:** NONE — removing dead code

---

### Phase 5: Add Test Coverage

**Goal:** Ensure the backend indicator injection is tested and won't silently regress again.

**File to create:** `backend/tests/test_ai_indicator_injection.py`

**Test cases:**
1. `test_inject_with_no_frontend_indicators` — context has empty `indicatorSnapshots`, verify backend fills them
2. `test_inject_with_partial_frontend_indicators` — context has RSI only, verify backend adds MACD/BB/etc
3. `test_inject_frontend_takes_precedence` — context has custom RSI, verify backend doesn't overwrite it
4. `test_inject_skip_when_disabled` — context has `skipBackendIndicators: True`, verify no injection
5. `test_inject_skip_when_no_asset` — no asset provided, verify graceful skip
6. `test_inject_skip_when_no_history` — asset has no CSV file, verify graceful skip with log
7. `test_inject_normalizes_asset` — pass `EURUSD_otc`, verify it resolves to `EURUSDOTC` CSV

**Files touched:** New file only  
**Risk:** NONE — additive only

---

### Phase 6: Verification & Hardening

**Goal:** End-to-end verification that the AI always receives indicator data.

**Verification steps:**
1. Start gateway, ensure indicator route works: `POST /api/v1/indicators` with a known asset
2. Ask AI with **zero active indicators** on frontend → verify `backendDataInjected: true` in logs
3. Ask AI with **some active indicators** → verify merge (backend supplements, frontend preserved)
4. Ask AI with `skipBackendIndicators: true` in context → verify no injection
5. Ask AI with an asset that has no history → verify graceful degradation (no crash, warning logged)
6. Run full test suite: `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short`

---

## 6. Enable/Disable Design (Simple)

Per your requirement for a simple enable/disable without complicating the code:

### Backend (Default: ON)

```python
# In context dict, frontend can pass:
context['skipBackendIndicators'] = True  # to disable
```

- **Default behavior:** Always inject (no flag needed)
- **To disable:** Frontend passes `skipBackendIndicators: true` in the context object
- **No settings UI needed** — it's a developer/power-user context flag
- **No database/config file** — just a context field

### Frontend (Optional future toggle)

If you later want a UI toggle:
```javascript
// In settingsStore.js — add one field:
aiBackendIndicators: true,  // default ON

// In buildAiContext() — add one line:
if (!settingsStore.aiBackendIndicators) {
  context.skipBackendIndicators = true;
}
```

This keeps the code simple — one boolean flag, one conditional check.

---

## 7. Files Touched Summary

| File | Action | Phase |
|------|--------|-------|
| `backend/utils/indicator_utils.py` | **CREATE** — shared calculation utility + AI snapshot builder | 1 |
| `backend/services/gateway/routes/ai.py` | **MODIFY** — rewrite `_inject_backend_indicators()` to in-process supplement/merge flow | 2, 4 |
| `backend/services/gateway/routes/indicators.py` | **MODIFY** — delegate route calculation to shared utility | 3 |
| `backend/tests/test_ai_routes.py` | **MODIFY** — add AI indicator injection regression coverage | 5 |
| `backend/tests/test_indicator_routes.py` | **CREATE** — add indicator route delegation seam coverage | 5 |
| `gui/Dashboard/src/utils/aiContext.js` | **MODIFY** — expand shared frontend AI context for voice/instruction flows | 2 |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shared utility introduces import cycle | Low | Medium | `indicator_utils.py` only imports from `strategy/` and `utils/` — no gateway imports |
| In-process pipeline blocks event loop | Very Low | High | Already mitigated by `asyncio.to_thread()` — proven in indicator route |
| Merge logic overwrites user's custom params | Low | Medium | Frontend snapshots always take precedence (`{**backend, **frontend}`) |
| Context size exceeds 150KB limit | Low | Low | 50-point tail trim keeps each indicator small; 37 indicators × 50 points ≈ ~30KB |
| Test flakiness due to missing CSV fixtures | Medium | Low | Tests should create temp CSV fixtures or mock `get_candle_path()` |

---

## 9. Success Criteria

- [x] AI always receives indicator data regardless of frontend indicator toggle state
- [x] No subprocess spawned during AI requests
- [x] Backend injection now uses the in-process pipeline path instead of the deprecated subprocess path
- [x] Frontend indicator selections take precedence over backend defaults
- [x] `skipBackendIndicators` context flag works to disable injection
- [x] Asset normalization applied consistently
- [x] Focused injection and route regression tests pass
- [x] Full backend test suite passes: `139 passed`
- [x] No regressions in indicator route behavior

### Final Verification Results

- `conda run -n QuFLX-v2 python -m pytest backend/tests/test_indicator_routes.py backend/tests/test_ai_routes.py -q --tb=short` → `10 passed`
- `conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short` → `139 passed`
- IDE diagnostics were clean for all touched backend/frontend files at handoff time

---

## 10. CORE_PRINCIPLES Compliance

| Principle | How This Plan Complies |
|-----------|----------------------|
| #1 Functional Simplicity | One shared utility, one rewrite — no new frameworks or dependencies |
| #2 Sequential Logic | 6 phases, each building on the previous, with explicit verification |
| #3 Incremental Testing | Phase 5 adds dedicated tests; Phase 6 runs full suite |
| #4 Zero Assumptions | Asset normalization applied; timeframe parsing validated; file existence checked |
| #5 Code Integrity | No breaking changes — indicator route behavior preserved exactly |
| #6 Separation of Concerns | Shared utility handles calculation; route handles HTTP; AI handles context |
| #7 Stop Patching | This IS the clean rewrite — replacing the broken subprocess with proven architecture |
| #8 Defensive Error Handling | FileNotFoundError caught gracefully; all exceptions logged with context |
| #9 Fail Fast | Timeframe validation early; missing asset/timeframe returns immediately |

---

## 11. References

- **Investigation Report:** @Investigator forensic analysis, 2026-04-13
- **OPT-1 Implementation:** `backend/services/gateway/routes/indicators.py` (in-process pipeline)
- **Pipeline Source:** `backend/services/strategy/indicators.py` (`TechnicalIndicatorsPipeline`)
- **Frontend Context:** `gui/Dashboard/src/utils/aiContext.js` (`buildAiContext`)
- **AI Service:** `backend/services/ai/service.py` (context → prompt serialization)
- **Data Store:** `backend/utils/data_store.py` (`get_candle_path`)
- **Asset Utils:** `backend/utils/asset_utils.py` (`normalize_asset`)

---

*Compiled by: @Investigator → @Team_Leader*  
*Implementation completed by: @Coder with incremental phase-gate review*  
*Date: 2026-04-14*  
*Final Status: COMPLETE — VERIFIED — CLOSED*
