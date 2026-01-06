# Refactoring Plan: QuFLX-v2 Application Optimization
**Date:** 2026-01-03  
**Status:** Approved for Implementation  
**Reference:** `v2/reports/report_2026-01/report_full_app_26-01-03.md`  
**Author:** @Team-Leader with @Architect, @Engineer, @Coder, @Optimizer, @Debugger

---

## 1. Overview

This plan outlines the incremental refactoring and optimization of the QuFLX-v2 application. The primary goals are to eliminate critical bugs, significantly improve Selenium performance, and enhance architectural maintainability while strictly adhering to `CORE_PRINCIPLES.md`.

### Core Principles Adherence
- **Functional Simplicity First**: Each step uses the simplest solution to achieve the goal.
- **Sequential Logic**: Phases are ordered by priority and dependency.
- **Incremental Testing**: Every step includes specific test instructions.
- **Strict Separation of Concerns**: Refactoring focuses on modularizing the gateway and capabilities.

---

## 2. Refactoring Roadmap

### Phase 1: Critical Bug Fixes & Quick Wins
**Goal:** Resolve code integrity violations and immediate performance bottlenecks.

- [x] **Step 1.1: Remove Duplicate AI Endpoint**
  - **File:** `v2/backend/services/gateway/main.py`
  - **Action:** Delete the second definition of `@app.post("/api/v1/ai/ask")` (around line 530). Consolidate any unique logic into the first definition (around line 310).
  - **Test:** 
    - [x] Run `python -m py_compile v2/backend/services/gateway/main.py` (Exit code 0).
    - [x] Start gateway and verify `/api/v1/ai/ask` responds correctly via Postman or curl.

- [x] **Step 1.2: Optimize Selenium Click Delays**
  - **File:** `v2/config_files/92_Percent_config.json`
  - **Action:** Update `click_wait_s` from `2.0` to `0.5`.
  - **Test:** 
    - [x] Trigger an asset sync from the Dashboard.
    - [x] Verify the delay between the first click and double-click is visibly shorter (~0.5s).

- [x] **Step 1.3: Optimize Walk Selection Delays**
  - **File:** `v2/capabilities_v2/favorites_walk_select.py`
  - **Action:** Update `click_delay_ms` default to `500` (from 1500) and `step_delay_ms` to `100` (from 150).
  - **Test:** 
    - [x] Run `python v2/capabilities_v2/runner.py favorites_walk_select --verbose`.
    - [x] Measure time to select 3 assets; should be < 5 seconds.

---

### Phase 2: Performance Optimization (Selenium & Data)
**Goal:** Replace fixed sleeps with dynamic waits and improve data collection efficiency.

- [x] **Step 2.1: Implement Dynamic Waits in Selenium Utils**
  - **File:** `v2/local_selenium_utils/selenium_ui_controls.py`
  - **Action:** Replace `time.sleep()` in `scroll_favorites_*` and `click_chart_timeframe_dropdown` with `WebDriverWait` checking for DOM changes.
  - **Test:** 
    - [x] Verify favorites bar scrolling still works reliably without fixed delays.
    - [x] Verify timeframe menu opens correctly.

- [x] **Step 2.2: Early-Exit Pattern for History Collection**
  - **File:** `v2/capabilities_v2/history_collector.py`
  - **Action:** Refactor `_collect_only` and `_collect_and_save` loops to exit immediately when `interceptor.fetch_history_events()` returns data.
  - **Test:** 
    - [x] Trigger history bootstrap for an asset.
    - [x] Verify collection completes as soon as data arrives, rather than waiting the full 8s.

- [x] **Step 2.3: LRU Eviction for Message Deduplication**
  - **File:** `v2/backend/services/collector/interceptor.py`
  - **Action:** Replace `self.processed_messages.clear()` with `collections.OrderedDict` based LRU eviction (limit 10,000).
  - **Test:** 
    - [x] Run collector for 10+ minutes.
    - [x] Verify memory usage remains stable and no duplicate ticks are published after the 10,000 limit is reached.

---

### Phase 3: Architectural Refactoring (Gateway & Normalization)
**Goal:** Modularize the gateway monolith and standardize asset naming.

- [x] **Step 3.1: Modularize Gateway Routes**
  - **Files:** `v2/backend/services/gateway/main.py` -> `v2/backend/services/gateway/routes/*.py`
  - **Action:** Split endpoints into `assets.py`, `history.py`, `indicators.py`, `settings.py`, and `sync.py`.
  - **Test:** 
    - [x] Verify all REST endpoints remain functional after move.
    - [x] Verify Socket.IO connections still work.

- [x] **Step 3.2: Centralize Asset Normalization**
  - **File:** Create `v2/backend/utils/asset_utils.py`
  - **Action:** Implement a single `normalize_asset()` function and update all Python files to use it.
  - **Test:** 
    - [x] Run `pytest v2/backend/tests/test_validation.py` (add asset normalization tests).

- [x] **Step 3.3: Async Subprocess Execution**
  - **File:** `v2/backend/services/gateway/main.py` (or new route files)
  - **Action:** Replace `subprocess.run()` with `asyncio.to_thread()` or `asyncio.create_subprocess_exec()`.
  - **Test:** 
    - [x] Verify Dashboard remains responsive (no UI freeze) while a long-running capability (like `refresh_assets`) is executing.

- [x] **Step 3.4: Unified History Persistence**
  - **Files:** `v2/backend/services/gateway/main.py`, `v2/capabilities_v2/history_collector.py`
  - **Action:** Implement separate timestamped CSV files with unified naming (`{ASSET}_{type}_{tf}_{ts}.csv`) and column order (`timestamp,open,close,high,low`).
  - **Test:** 
    - [x] Trigger bootstrap history and verify new file format in `data/data_output/history/`.

---

### Phase 4: Code Quality & Robustness
**Goal:** Standardize logging, remove magic numbers, and fix silent failures.

- [x] **Step 4.1: Standardize Logging**
  - **Action:** Replace all `print()` calls in capabilities and services with `logging.getLogger(__name__)`.
- [x] **Step 4.2: Add Exception Context**
  - **File:** `v2/capabilities_v2/base.py`
  - **Action:** Update `take_screenshot_if` to capture more context (URL, window size) on error.
- [x] **Step 4.3: Add `CapResult` Helper**
  - **File:** `v2/capabilities_v2/base.py`
  - **Action:** Add `CapResult.fail(error, data)` static method to reduce boilerplate in `Capability` implementations.

---

## 3. Success Criteria

- [x] **Performance:** 10-asset selection completes in < 12 seconds.
- [ ] **Stability:** No "Maximum update depth exceeded" warnings in React console.
- [x] **Integrity:** No duplicate endpoints or blocking calls in the gateway.
- [x] **Maintainability:** Gateway `main.py` is < 200 lines, with logic delegated to modules.
- [x] **Compliance:** All changes pass `CORE_PRINCIPLES.md` review.

---

## 4. Implementation Instructions for Agents

1. **Always** run the specified test after every step.
2. **Never** proceed to the next step if the current test fails.
3. **If** a file becomes tangled during refactoring, follow Rule #7: **Stop Patching, Start Rewriting**.
4. **Maintain** backward compatibility for all existing Dashboard features.

---
*Plan generated by @Team-Leader. Ready for Phase 1 implementation.*
