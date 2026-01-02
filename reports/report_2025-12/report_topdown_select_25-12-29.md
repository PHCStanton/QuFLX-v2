# Topdown Select v2 – Status and Recommendations (2025-12-29)

## 1. Purpose of This Report

This report summarizes the current state of the **Topdown Select** automation in v2, with a focus on timeframe selection behavior on PocketOption. It is intended for developers who will stabilize and extend the v2 capabilities.

Scope:
- v2 capabilities under `capabilities_v2` (especially timeframe-related modules)
- v1 reference sessions and utilities that previously worked reliably
- Current gaps and failure modes when clicking timeframe controls
## 2. Key v2 Components Reviewed

- **TopdownSelectTest2** – Orchestrator that:
  - validates the session via `SessionFoundations`
  - reads eligible favorites from `FavoritesBar` based on payout `%`
  - clicks the chosen favorite
  - walks timeframes either via `TimeframeMenu` or `TimeframeSelectSync`
- **TimeframeMenu** – Low-level control to:
  - open the timeframe/chart-type dropdown
  - determine if the menu is open
  - select a specific timeframe label via Selenium/JS strategies
- **TimeframeSelectSync** – Robust wrapper that:
  - attempts timeframe selection multiple times per label
  - optionally refocuses the chart canvas between attempts
  - records detailed per-attempt metadata and diagnostics JSON

Relevant v2 files:
- `capabilities_v2/topdown_select_test_2.py`
- `capabilities_v2/timeframe_menu.py`
- `capabilities_v2/timeframe_select_sync.py`
- `local_selenium_utils/selenium_ui_controls.py` (HighPriorityControls)
## 3. Key v1 References and Proven Patterns

The following v1 modules are known to have successfully driven timeframe-related UI:

- `v2_Dev_Docs/V1_reference/capabilites/topdown_select_session.py`
  - Uses `TopdownSelect` + `FavoriteSelect` to test timeframe walking on a chosen favorite.
  - Integrates with realtime data streaming but **timeframe selection itself** is handled through the Topdown capability logic that was stable in v1.
- `v2_Dev_Docs/V1_reference/capabilites/favorites_select_topdown_collect.py`
  - Walks the favorites bar, selects eligible favorites (>= min payout), and for each selected asset runs `TopdownSelect`.
  - Confirms that v1 TopdownSelect could reliably step through labels like `H1`, `M15`, `M5`, `M1`.
- `v2_Dev_Docs/V1_reference/capabilites/trade_clicker.py`
  - Provides a **robust click pipeline** for BUY/SELL buttons, including:
    - multiple locator strategies
    - scroll-into-view behavior
    - pointer/overlay awareness via `elementFromPoint` and bounding-rect checks
    - rich diagnostics (JSON + screenshots) and explicit error reporting

These v1 patterns demonstrate that robust interaction with PocketOption controls requires:
- layered strategies for finding elements
- explicit handling of visibility, scroll, overlays, and intercepts
- structured diagnostics when clicks fail
## 4. Current v2 Behavior – Timeframe Selection

### 4.1 Opening the timeframe dropdown (TimeframeMenu._open_menu)

- Attempts to locate the timeframe/chart-type button with:
  - `HighPriorityControls.find_chart_timeframe_dropdown_with_meta()` when available
  - fallback `drv.find_elements(By.CSS_SELECTOR, "a.items__link--chart-type")`
- Once a button is found, the code does a simple:
  - `btn.click()`
  - fallback `driver.execute_script("arguments[0].click();", btn)`
- After clicking, it checks `_is_open()` using:
  - `.dropdown.open`, `[role='menu']`, `[role='listbox']` selectors

Weaknesses:
- If `HighPriorityControls` cannot find a button (selectors out of date, layout changed), the fallback relies on one legacy selector.
- The click path does not explicitly handle:
  - ElementClickInterceptedException
  - ElementNotInteractableException
  - off-screen elements (no guaranteed scroll into view)
  - overlays or modals blocking pointer events
- Failure diagnostics are minimal: errors are surfaced as `"menu button not found"` or `"open failed"` without internal metadata.

### 4.2 Selecting options (TimeframeMenu._select_timeframe)

- Ensures the menu is open (or attempts to open it) before selecting.
- Builds a **label alias set** for `H1`, `M15`, etc., including variations like `"1 hour"`, `"15 min"`.
- Performs selection via:
  - Selenium: `.items__list .item`, `[role='option']`, `.tf-option`, `.timeframe-options button`, `a span`, `a`
  - JavaScript: scans multiple selectors and clicks the first visible node matching an alias.
- Searches both the main document and each iframe.

Strengths:
- Alias handling and search breadth are good; this is relatively robust for **finding** options.

Weaknesses:
- Relies heavily on the assumption that the dropdown opened successfully.
- No advanced checks (like pointer-hit testing) to ensure clicks actually land on the intended option.
- When options are not found, the result is `"timeframe not found"` with limited context.
### 4.3 Orchestrated selection and retries (TimeframeSelectSync / TopdownSelectTest2)

- `TimeframeSelectSync`:
  - Loops over each label (e.g. `H1`, `M15`, `M5`, `M1`).
  - For each label, makes N attempts (`attempts` input, default 3) calling `TimeframeMenu.run(..., {"action": "select_timeframe", "label": label})`.
  - On failure and if `focus_on_chart=True`, clicks `canvas/.chart/.trading-chart` and retries.
  - Records rich per-attempt metadata and, when `ctx.debug` and `save_diag=True`, saves JSON diagnostics under `timeframe_select_sync/` plus screenshots.
- `TopdownSelectTest2` optionally delegates timeframe selection to `TimeframeSelectSync` (`use_tf_sync=True`), which is the recommended path for robust testing.

This layer provides **retry and focus recovery**, but cannot compensate for fundamental failures in `TimeframeMenu._open_menu` or broken selectors.
## 5. Observed / Likely Failure Modes

Based on the current code and prior Selenium trace snippets, the most probable reasons Selenium fails to click timeframe buttons are:

1. **Button not found by selectors**
   - `HighPriorityControls.find_chart_timeframe_dropdown_with_meta()` returns `button_found=False` because the timeframe/chart button CSS/XPath patterns are out of sync with the current PocketOption DOM.
   - The fallback selector `a.items__link--chart-type` no longer matches any element.

2. **Button found but not interactable**
   - The element is present but:
     - covered by an overlay (modals, tooltips, notification banners)
     - off-screen or partially clipped
     - has zero width/height due to collapsed panels or responsive layout
   - `btn.click()` raises a Selenium exception (intercepted/not interactable), which is caught generically and reported as `"open failed"`.

3. **Dropdown opened in a different context**
   - In some layouts, the dropdown content might appear in a nested iframe or shadow DOM region not covered by the current selectors.
   - `_is_open` may mis-detect state, causing `TimeframeMenu` to think the menu is closed or open when the opposite is true.

4. **Zoom/viewport side effects**
   - The project uses hybrid zoom handling (`ZoomManager`) and works with scaled viewports.
   - If the button hitbox is small or near the viewport edge, pointer precision may be sensitive to zoom, leading to mis-clicks or pointer intercepts.

All of these failure modes are consistent with errors like the Selenium ChromeDriver messages referenced in the terminal output (e.g., documentation URLs for click-related errors).
## 6. Recommended Next Actions (Developer-Facing)

### 6.1 Harden timeframe dropdown opening

Owner: **@Coder** + **@Debugger**

- Refactor `TimeframeMenu._open_menu` to delegate the full open behavior to
  `HighPriorityControls.click_chart_timeframe_dropdown_with_meta()` when available, instead of directly calling `btn.click()`.
- Preserve and return the detailed metadata from `click_chart_timeframe_dropdown_with_meta()` inside the `CapResult.data` payload, including:
  - `button_found`, `button_displayed`, `button_enabled`
  - `selector_used`, `selector_detail`, `attempts`
  - `dropdown_opened`, `click_method`, `click_error`
- Keep the legacy `a.items__link--chart-type` fallback only as a last resort, and surface which path was used in diagnostics.

### 6.2 Align selectors with live DOM

Owner: **@Investigator** (read-only) followed by **@Coder**

- Using a live PocketOption session, capture the actual DOM around the timeframe control:
  - tag name, id, class list, aria-label, title, ancestor structure.
- Update the strategy list in `HighPriorityControls.find_chart_timeframe_dropdown_with_meta()` to reflect current real-world selectors.
- Add at least one **high-confidence selector** that uniquely identifies the timeframe control in the current UI.

### 6.3 Enhance option selection diagnostics

Owner: **@Coder** + **@Tester**

- In `TimeframeMenu._try_select_in_current_context`, extend the returned metadata to include:
  - which selector set was used (Selenium vs JS)
  - the first N visible option texts per attempt
  - whether the option click raised any exception (and the error message).
- When selection fails for a label, ensure the failure is propagated through `TimeframeSelectSync` into its diagnostics JSON, so labels with systemic issues are easy to spot.

### 6.4 Standardize on TimeframeSelectSync for orchestration

Owner: **@Engineer** / **@Architect**

- Treat `TimeframeSelectSync` as the canonical path for robust timeframe changes in v2.
- For new capabilities that require stepping timeframes, use `TimeframeSelectSync` rather than calling `TimeframeMenu` directly, to benefit from retries and chart-focus recovery.

### 6.5 Regression test harness

Owner: **@Tester**

- Implement a repeatable test harness that:
  - attaches to a known-good Chrome session via `qf.attach_chrome_session`;
  - runs `TopdownSelectTest2` with `--labels H1 M15 M5 M1 --use-tf-sync --tf-attempts 3 --debug`;
  - asserts that all labels report `ok=True` in `timeframe_select_sync` diagnostics.
- Add a second mode that deliberately changes zoom or toggles UI panels to verify robustness under slightly different layouts.
## 7. Short-Term Action Checklist

1. Run `TopdownSelectTest2` with `--use-tf-sync --debug --verbose` and inspect:
   - `timeframe_select_sync/*.json` diagnostics
   - pre/post screenshots for timeframe open/select operations.
2. Update timeframe dropdown selectors in `HighPriorityControls` based on current DOM.
3. Refactor `TimeframeMenu._open_menu` to rely on `click_chart_timeframe_dropdown_with_meta()` and carry through its metadata.
4. Enhance `TimeframeMenu` selection diagnostics (options, selector path, click errors).
5. Re-run the test harness and confirm **all labels** are reliably selected on multiple assets.

Once the above are complete, the v2 Topdown Select stack should match or exceed the reliability of the working v1 sessions while staying consistent with the v2 capability architecture.
