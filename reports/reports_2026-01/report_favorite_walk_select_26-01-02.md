# Investigation Report: Favorites Walk & Select Automation
**Date:** 2026-01-02  
**Status:** Investigation Completed (no code changes applied)  
**Author:** @Investigator (delegated by @Team-Leader)

## 1. Summary
The `favorites_walk_select` orchestrator currently runs to completion and reports `ok: true` but does not select any favorites under realistic conditions. The root causes are primarily around:
- Input defaults and filtering logic that result in an empty target set in many scenarios
- Limited diagnostics and lack of visibility into what the Favorites bar scan actually sees
- Reliance on the existing favorites DOM structure and payouts without validating alignment with real PocketOption UI states

Selenium anchor-vs-span issues have already been addressed at the control layer (`HighPriorityControls.ensure_clickable_anchor`) and are correctly integrated into `FavoritesBar._click_favorite`. The remaining problems are more about orchestration, filtering, and observability than raw click mechanics.

## 2. Context & Observed Behaviour

### 2.1 Terminal Run (User-Provided)
Command:
```bash
python capabilities_v2/runner.py favorites_walk_select --verbose
```
Observed terminal output:
```text
✅ Attached to Chrome session: https://pocketoption.com/en/cabinet/demo-quick-high-low
RESET: Resetting favorites bar to far left...
WALK: Starting walk (min_pct=92, filter=[])...
{"ok": true, "data": {"mode": "assets", "min_pct": 92, "patterns": [], "selected": [], "skipped": [], "pages_visited": 1, "steps": 0, "errors": []}, "error": null, "artifacts": []}
```

Key points:
- The orchestrator successfully attaches to an existing Chrome session.
- Reset and walk start messages appear, indicating that `FavoritesBar` is being used.
- The final JSON result reports `ok: true` even though:
  - `selected` is empty
  - `skipped` is empty
  - `errors` is empty
  - Only a single page is reported as visited

### 2.2 Relevant Components

1. **Orchestrator:** `FavoritesWalkSelect`  
   - File: `capabilities_v2/favorites_walk_select.py`

2. **Control Layer:** `FavoritesBar`  
   - File: `capabilities_v2/favorites_bar.py`
   - Uses `HighPriorityControls` from `local_selenium_utils/selenium_ui_controls.py` for scrolling and clicking.

3. **Timeframe Automation Reference:**  
   - File: `capabilities_v2/timeframe_select_sync.py` and `capabilities_v2/timeframe_menu.py`  
   - Report: `reports/report_2025-12/implementation_report_topdown_select_25-12-31.md`  
   - These document and implement the anchor-vs-span fix and robust click pipeline for timeframe selection.

## 3. Detailed Findings

### 3.1 Orchestrator Logic: `FavoritesWalkSelect.run`

File: `capabilities_v2/favorites_walk_select.py`

Key behaviour:
- Reads inputs with defaults:
  - `min_pct` default: `92`
  - `assets` default: `[]` (empty list)
  - `all` default: `False`
- Builds a `summary` structure with:
  - `mode`: `"all"` if `select_all` else `"assets"`
  - Filters and counters for `selected`, `skipped`, `pages_visited`, `steps`, and `errors`.
- Flow:
  1. Instantiates `FavoritesBar()`.
  2. Calls `reset_to_left` via `FavoritesBar.run`.
  3. Loops up to `INTERNAL_MAX_PAGES = 50`:
     - Calls `get_visible_favorites` each page.
     - Filters visible items by payout (`min_pct`) and name (`assets_filter`) unless `select_all` is True.
     - Calls `click_favorite` for each target.
     - Optionally takes screenshots.
     - Calls `scroll_right` to advance.
- Success condition:
  ```python
  return CapResult(
      ok=len(summary["errors"]) == 0 or len(summary["selected"]) > 0,
      data=summary,
      error=None if not summary["errors"] else "; ".join(summary["errors"][:3]),
      artifacts=tuple(artifacts)
  )
  ```

**Implication:**
- As long as there are no recorded errors, the orchestrator returns `ok: true` **even when `selected` is empty**. This matches the terminal output and explains why a “no-op” run still appears successful.

### 3.2 Control Layer: `FavoritesBar`

File: `capabilities_v2/favorites_bar.py`

#### 3.2.1 Reset & Scroll Integration with HighPriorityControls

- `_reset_to_left` and `_scroll_right` both:
  - Capture diagnostic screenshots under `screenshots/`.
  - Instantiate `HighPriorityControls` if available.
  - Call:
    - `hpc.scroll_favorites_reset_left()` for reset.
    - `hpc.scroll_favorites_right_scoped()` for right paging.
- Both methods return `CapResult` with `scrolled` boolean and `meta` diagnostics when exceptions occur.

**Assessment:**
- These methods are already wired into the shared High Priority pipeline, which encapsulates resilient scrolling behavior.
- If `HighPriorityControls` fails to import or construct, `ok` remains False and appropriate `error` information is returned via `meta`.

#### 3.2.2 Scanning Visible Favorites

```python
nodes = drv.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
...
lbl = n.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
...
payout_el = n.find_element(By.CSS_SELECTOR, ".payout__number")
```

- For each visible `.assets-favorites-item__line`:
  - Ensures the node is displayed.
  - Extracts label text from `.assets-favorites-item__label`.
  - Attempts to derive a `data-id` from an ancestor div with class containing `assets-favorites-item`.
  - Attempts to find a payout element via `.payout__number`.
- Returns:
  ```python
  {"visible": items, "assets": [it.get("asset") for it in items if it.get("asset")]}
  ```

**Potential fragility:**
- Strong assumptions about PocketOption’s DOM classes (`.assets-favorites-item__line`, `.assets-favorites-item__label`, `.payout__number`).
- No diagnostic logging of the raw texts or counts of visible items.
- If the payout or label classes change, `visible` may be non-empty but with `payout` or `asset` empty/None, causing the orchestrator’s filters to exclude everything without recording this as an error.

#### 3.2.3 Clicking a Favorite

```python
lbl = n.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
...
if txt == label:
    if hpc:
        target = hpc.ensure_clickable_anchor(lbl)
    else:
        target = n.find_element(By.XPATH, "ancestor::div[contains(@class,'assets-favorites-item')][1]")
...
if hpc:
    ok_click = hpc._click_element_safely(target)
```

- The click path explicitly uses `HighPriorityControls.ensure_clickable_anchor` when available.
- `ensure_clickable_anchor` in `selenium_ui_controls.py`:
  - If element tag is `span`, it climbs to the closest `<a>` ancestor.
  - This directly addresses the anchor-vs-span issue highlighted in the timeframe report.
- Fallback behavior (when hpc is not available):
  - Uses the ancestor `div` or the `.assets-favorites-item__line` itself and attempts a direct click, followed by a JS click fallback.

**Conclusion:**
- The anchor-vs-span problem **is already solved** for favorites clicking when `HighPriorityControls` is available.
- Mechanical clicking is unlikely to be the primary reason for zero selection in the observed run.

### 3.3 Timeframe Automation Reference: Pattern Parallels

File: `capabilities_v2/timeframe_menu.py` and `capabilities_v2/timeframe_select_sync.py`  
Report: `reports/report_2025-12/implementation_report_topdown_select_25-12-31.md`

Key parallels:
- `TimeframeMenu._open_menu` and `_try_select_in_current_context` rely on:
  - `HighPriorityControls.click_chart_timeframe_dropdown_with_meta()` for robust menu opening.
  - Explicit anchor traversal when clicking timeframe menu items.
- Detailed metadata is collected and persisted (e.g., via `save_json`) for post-run diagnostics.

In contrast:
- `FavoritesBar` **does** integrate with `HighPriorityControls` for scrolling and clicking but:
  - Does **not** expose or save detailed diagnostic JSON for favorites scanning/results.
  - Does **not** explicitly verify post-click effects (e.g., active chart asset sync or highlighting).
- `FavoritesWalkSelect` relies purely on local `summary` counts and error messages without persisting structured diagnostics.

### 3.4 Likely Root Causes for No Selection

Based on code review and the provided terminal output, the most probable causes for `selected: []` with `ok: true` are:

1. **Filtering conditions too strict / defaults misaligned with UI reality**
   - `min_pct` default of `92` may exceed actual payouts currently visible in the favorites bar.
   - `assets_filter` defaults to `[]`, combined with `mode = "assets"` and `select_all = False` means:
     - The “name filter” loop only succeeds if at least one pattern is provided.
     - With an empty pattern list, `match` remains False and all candidates are discarded.
   - Result: `targets` is empty even when favorites exist and are visible.

2. **Lack of diagnostics on `visible_items` and `targets`**
   - The orchestrator does not log:
     - How many favorites were scanned per page.
     - Synthesized `(asset, payout)` pairs.
     - Which candidates failed the payout threshold vs. the name filter.
   - In the observed run, it is impossible to tell whether the absence of selections is due to:
     - DOM mismatch (selectors not finding elements)
     - Low payouts (< 92)
     - Name filters eliminating all candidates
     - Or some combination of the above.

3. **Success criterion hides “no-op” behaviour**
   - `ok` is computed with `len(summary["errors"]) == 0 or len(summary["selected"]) > 0`.
   - This means “no errors + no selections” is treated as success, rather than a degraded or misconfigured run.

4. **Paging may terminate immediately**
   - The while loop advances pages only if `scroll_right` yields `scrolled = True`.
   - If `HighPriorityControls.scroll_favorites_right_scoped()` returns False on the initial page (e.g., due to a DOM change, already at right-most end, or detection failure), the loop will terminate after the first iteration.
   - Combined with strict filters, this yields the observed `pages_visited: 1, steps: 0`.

### 3.5 CORE_PRINCIPLES Alignment / Violations

Referencing `c:\QuFLX\v2\.agents\CORE_PRINCIPLES.md`:

- **Functional Simplicity First**
  - The orchestrator’s logic is simple and reasonably cohesive.
  - However, the success condition and lack of diagnostics make it harder to reason about behavior, undermining its practical simplicity.

- **Sequential Logic**
  - Steps are sequential (reset → scan → filter → click → page), consistent with the principle.

- **Incremental Testing**
  - Current design makes it difficult to perform fine-grained, automated tests because it does not expose enough structured output about what it saw and what it decided.

- **Zero Assumptions**
  - Assumptions about class names (`.assets-favorites-item__line`, `.payout__number`) and payout display format are not validated.
  - No explicit guardrails exist to detect when these assumptions fail; the code silently produces empty `targets`.

- **Code Integrity & Backward Compatibility**
  - No direct violations detected, but the success criterion may hide regressions.

- **Strict Separation of Concerns**
  - Generally respected: `FavoritesBar` handles DOM, `FavoritesWalkSelect` handles orchestration.

- **Defensive & Explicit Error Handling**
  - Errors at the control layer are converted into readable messages, but orchestrator-level semantics treat “no selections” as success, which is arguably a soft violation.

- **Fail Fast, Fail Loud, Fail Predictably**
  - Current behavior is more “fail silently with ok=true” when filters yield no targets.

## 4. Recommended Action Plan

The following action plan is designed to keep changes localized, respect separation of concerns, and follow the previously successful pattern used in timeframe automation.

### 4.1 Improve Observability and Diagnostics

**Owner:** @Coder, @Tester, @Investigator

1. **Augment `FavoritesBar._get_visible_favorites` with richer metadata**
   - Add optional debug output controlled by `ctx.debug`:
     - Number of favorites found per scan.
     - Sample of `(asset, payout)` pairs.
   - Optionally add a `save_json` dump (similar to timeframe diagnostics) into `data/data_output/favorites_walk/` when `ctx.debug` is True.

2. **Extend `FavoritesWalkSelect` summary**
   - Augment `summary` with:
     - `pages`: list of page-level stats (counts of visible, eligible, selected per page).
     - `filter_stats`: counts of:
       - candidates below `min_pct`
       - candidates filtered by `assets_filter`
       - candidates successfully clicked.

3. **Review `HighPriorityControls.scroll_favorites_right_scoped()` behaviour**
   - Ensure its return value accurately reflects whether a real scroll happened.
   - Consider adding metadata (similar to `timeframe_select_sync`) to make paging decisions auditable.

### 4.2 Align Defaults and Configuration with Real Market Conditions

**Owner:** @Architect, @Engineer, @Coder

1. **Re-evaluate `min_pct` default**
   - Use observed payouts in current PocketOption sessions to set a realistic default (e.g., `85` or `80`) that still aligns with strategy constraints.

2. **Clarify `mode` semantics and `assets_filter` usage**
   - Option A: When `assets_filter` is empty and `select_all` is False, interpret this as “no name filter” instead of “filter out everything”.
   - Option B: Treat empty `assets_filter` as a configuration error and return a clear message instead of silently doing nothing.

3. **Expose key settings via CLI flags**
   - Extend `runner.py` to accept explicit flags (e.g., `--min-pct`, `--asset`, `--all`) that map directly to `FavoritesWalkSelect` inputs, reducing reliance on JSON and hidden defaults.

### 4.3 Make Success Criteria Reflect Actual Outcomes

**Owner:** @Engineer, @Coder, @Reviewer

1. **Redefine `ok` semantics in `FavoritesWalkSelect`**
   - Proposed rule:
     - `ok = len(summary["selected"]) > 0`
     - If there are no selections and no errors, return `ok: false` with a descriptive `error` such as `"no eligible favorites found"` or `"filters eliminated all candidates"`.

2. **Differentiate between configuration vs. runtime errors**
   - For example:
     - Configuration error: `assets_filter` empty while `mode == 'assets'` → `error: "no asset patterns configured"`.
     - Runtime error: DOM selectors fail or `FavoritesBar` returns `ok=False`.

This change aligns better with **Fail Fast, Fail Loud, Fail Predictably** by making “no-op” runs visible at the call site.

### 4.4 Validate DOM Assumptions Against Live PocketOption UI

**Owner:** @Investigator, @Tester, @Backend-Specialist

1. **Confirm that favorites DOM still matches selectors**
   - Verify that `.assets-favorites-item__line`, `.assets-favorites-item__label`, and `.payout__number` are still present and visible in current PocketOption builds.

2. **Update selectors where necessary**
   - If DOM drift is detected, update `FavoritesBar` selectors to match the current structure while keeping logic minimal and focused.

3. **Add a minimal DOM self-check capability**
   - Optional: implement a read-only “health check” that reports whether required selectors are present and visible, similar to timeframe diagnostics.

### 4.5 Testing Strategy

**Owner:** @Tester, @Debugger

1. **Unit-style tests (where feasible)**
   - For pure logic in `FavoritesWalkSelect` (filtering, summary construction), write tests that:
     - Inject synthetic `visible_items` via a stubbed `FavoritesBar` result.
     - Validate behavior for various combinations of `min_pct`, `assets_filter`, and `select_all`.

2. **Integration tests using a stable demo session**
   - Use the existing demo URL and a controlled account to:
     - Confirm that at least one favorite is selected under a known configuration.
     - Capture JSON diagnostics and screenshots for regression baselines.

3. **Regression harness**
   - Add a script or harness similar to `topdown_select_test_2` that runs `favorites_walk_select` in different modes (by payout, by name, select-all) and records outcomes to `data/data_output/`.

## 5. Risk Forecast (If Ignored)

If the above recommendations are not implemented, the following risks remain:

- **Silent operational failures:**
  - Automation runs may continue returning `ok: true` while performing no meaningful actions, leading to misplaced confidence in automated setups.

- **Difficult debugging and triage:**
  - Without richer diagnostics, future investigators will repeat manual inspection steps to infer why no selections occurred.

- **Increased brittleness to UI changes:**
  - DOM drift in the favorites bar (new classnames, layout changes) will lead to invisible breakage since there are no explicit checks or alarms.

- **Strategic misalignment:**
  - Automation will not reliably enforce the intended payout thresholds or asset selection rules, undermining higher-level strategies that depend on this capability.

By implementing the action plan above, the Favorites Walk & Select automation can be brought to the same robustness and observability level as the timeframe selection stack, fully aligned with `CORE_PRINCIPLES.md` and ready for incremental testing and future extensions.
