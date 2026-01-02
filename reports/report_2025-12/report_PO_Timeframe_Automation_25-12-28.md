# Pocket Option Timeframe Automation – Investigation Report (2025-12-28)

## 1. Scope and Context

This report documents the current implementation, observed issues, and recommended next steps for **Pocket Option timeframe automation** in the QuFLX v2 stack.

Focus areas:
- How timeframes are handled end-to-end (backend, frontend, Selenium capabilities).
- Why the new **“Sync UI”** feature currently returns `500 Internal Server Error`.
- How to stabilise and harden timeframe synchronisation while respecting `CORE_PRINCIPLES.md`.

The primary user-visible failure is:
- Clicking **Sync UI** in the Dashboard results in an HTTP 500 from `POST /api/v1/sync-timeframe-ui`, with error detail coming from the Selenium-based capability layer.
## 2. Current Architecture – Timeframes

### 2.1 Data & Aggregation Timeframe

- **Collector → Redis → Gateway → Dashboard**
  - Ticks are collected from Pocket Option and pushed via Redis to the API Gateway.
  - The Dashboard subscribes to a Socket.IO stream and displays aggregated candles.
- **Backend timeframe selection** – `POST /api/v1/select-timeframe`
  - File: `backend/services/gateway/main.py`
  - Responsibilities:
    - Validate requested timeframe against a whitelist:
      - `ticks`, `15s`, `1m`, `5m`, `15m`, `30m`, `1h`.
    - Map timeframe to `interval_seconds` for aggregation / interpretation.
    - Log the change and return a simple JSON confirmation.
  - This endpoint **does not drive the Pocket Option UI**; it only configures QuFLX’s internal view of the stream.

- **Frontend aggregation** – `useTickAggregation`
  - File: `gui/Dashboard/src/hooks/useTickAggregation.js`
  - Maintains a `timeframeMap` that maps the string timeframe (e.g. `15s`, `1m`, `5m`, `30m`) to a seconds interval used when building candles for `lightweight-charts`.
  - Has been updated to include `ticks`, `15s`, `30m`, etc., and to treat `ticks` specially.

### 2.2 UI Timeframe (Pocket Option chart)

- Selenium-based capabilities in `capabilities_v2` interact with the live Pocket Option UI:
  - **TimeframeMenu** – `capabilities_v2/timeframe_menu.py`
    - Exposes actions via `run(ctx, inputs)`:
      - `open_menu` – open the timeframe dropdown.
      - `is_open` – detect open state.
      - `select_timeframe` – select a timeframe option in the open dropdown.
    - Internally uses CSS/XPath selectors and DOM heuristics to find timeframe UI elements and click them.
  - **Runner** – `capabilities_v2/runner.py`
    - A CLI entry point that attaches to an existing Chrome (debug port 9222) and executes a capability (`timeframe_menu`, `history_collector`, etc.) with JSON inputs.

This separation already respects **Strict Separation of Concerns**:
- Gateway API: pure HTTP + Redis + JSON.
- Capabilities: all Selenium / UI automation complexity.
- Dashboard: UX and user controls.

The new **Sync UI** feature explicitly bridges these layers.
## 3. Implementation of the Sync UI Feature

### 3.1 Backend Endpoint – `/api/v1/sync-timeframe-ui`

- File: `backend/services/gateway/main.py`.
- Signature:
  - `@app.post("/api/v1/sync-timeframe-ui")`
  - Accepts JSON body: `{ "timeframe": "1m" | "5m" | ... }`.
- Responsibilities:
  1. **Validate timeframe** (same whitelist as `/api/v1/select-timeframe`).
  2. **Reject unsupported UI sync** (currently `ticks` is not supported for UI sync).
  3. **Map internal timeframe to Pocket Option label** used by the capability:
     - Via `label_map`, e.g. (current state):
       - `"15s" → "15 sec"`
       - `"1m" → "1m"`
       - `"5m" → "5m"`
       - `"15m" → "15m"`
       - `"30m" → "30m"`
       - `"1h" → "1h"`
  4. Call the capabilities runner:
     - `runner.py timeframe_menu --inputs {"action":"select_timeframe","label": label}`.
  5. Parse mixed stdout from the runner using `_parse_script_json`, which scans for the last JSON line.
  6. Convert capability result into HTTP:
     - On `ok: true` → `200` with `{status:"success", timeframe, label, data}`.
     - On `ok: false` or script errors → HTTP 4xx/5xx with a human-readable `detail` message.

- Error handling notes (Defensive & Explicit Error Handling):
  - Non-JSON or malformed stdout → `502 Invalid script output` with logging of raw output.
  - Non-zero exit code → `500 Script execution failed: <stderr>`.
  - Capability `ok: false` → `500` with `detail` derived from `error`. The special case `"open failed"` is expanded to a more informative message about the Pocket Option menu not opening.

### 3.2 Selenium Capability – `TimeframeMenu.select_timeframe`

- File: `capabilities_v2/timeframe_menu.py`.
- For `action == "select_timeframe"`:
  1. Ensure menu is open:
     - If `_is_open` is false, call `_open_menu(ctx)`.
     - `_open_menu` tries `HighPriorityControls` first, then fallback CSS selectors to locate the timeframe dropdown button and click it.
  2. Build an alias set from the requested label via `_label_aliases(label)`.
     - For `"1m"`, includes variants like `"1m"`, `"m1"`, `"1 min"`, `"1 minute"`.
     - Similar expansions for `5m`, `15m`, `1h`, `4h`, numeric minutes/hours/days.
  3. Try to select the timeframe in the **current context**:
     - `_try_select_in_current_context(ctx, aliases)`:
       - Collects candidate elements via CSS selectors, e.g.:
         - `.items__list .item`
         - `[role='option']`
         - `.tf-option`
         - `.timeframe-options button`
         - `a span`
         - `a`
       - For each candidate:
         - Reads `innerText/textContent`, normalises it, checks against aliases.
         - If match:
           - Attempts to resolve the clickable target as the closest `<a>` ancestor via XPath (`ancestor::a[1]`), otherwise the element itself.
           - Clicks via Selenium.
           - On exception, executes JS `closest('a')` fallback: `(p || t).click()`.
       - If no direct Selenium match, runs a JS snippet to:
         - Query the same selector set.
         - Filter by visibility.
         - Build a list of option texts.
         - Find the first visible node whose normalised text is in the aliases.
         - Click its closest `<a>` if available, else the node.
         - Return `{ ok: true, clicked_text, options }` or `{ ok: false, options }`.
  4. If still not found in the current context, try within iframes (`_try_select_in_all_contexts`).
  5. On failure, return `ok: false, error: "timeframe not found"` (or similar) and list candidate `options` in `data` for debugging.

### 3.3 Frontend – Dashboard Sync Flow

- Store: `gui/Dashboard/src/store/marketStore.js`.
  - `selectedTimeframe` maintained in Zustand.
  - `setSelectedTimeframe(timeframe)`:
    - Optimistically updates `selectedTimeframe` and clears `marketData`.
    - Calls `/api/v1/select-timeframe`.
    - On error or network failure, reverts timeframe and sets `lastError` (shown as red banner).
  - `syncTimeframeUi()`:
    - Reads current `selectedTimeframe` from the store.
    - Calls `/api/v1/sync-timeframe-ui`.
    - If the response is non-OK, extracts `detail` from JSON and stores it in `lastError`.

- Components:
  - `ChartHeader.jsx`:
    - Renders timeframe Combobox and a **Sync UI** button with a `RefreshCcw` icon.
    - Props: `onSyncTimeframe`, `isSyncingTimeframe`.
  - `ChartWorkspace.jsx`:
    - Hooks into the store and wires:
      - `handleTimeframeChange` → `setSelectedTimeframe`.
      - `handleSyncTimeframe` → `syncTimeframeUi` with a local `isSyncingTimeframe` flag.
    - Shows `lastError` as a banner at the top of the chart card.

This yields a clear, explicit user flow:
- User selects a timeframe for QuFLX aggregation.
- User explicitly requests to sync the Pocket Option UI via the **Sync UI** button.
## 4. Observed Failure Mode

### 4.1 Symptom

- From the Dashboard console / network logs:
  - `POST /api/v1/sync-timeframe-ui` → `500 (Internal Server Error)`.
  - Frontend logs show messages like:
    - `Sync timeframe UI failed: open failed` (prior to improved error messaging).
- After backend improvements, the 500 error still occurs, but the `detail` is now more descriptive (e.g. failure to open menu or to select timeframe).

### 4.2 What We Know

- The Pocket Option timeframe **dropdown expands** correctly.
  - User explicitly confirmed: the menu opens; the problem is clicking one of the **timeframe buttons inside the dropdown**.
- The Chrome DevTools AI analysis indicates:
  - The visible option is a `<span>` element.
  - Its parent `<a>` is the real clickable element.
- We have already:
  - Extended selectors to include `a span` and `a` inside the timeframe menu.
  - Added logic to click the closest `<a>` ancestor rather than the `<span>` node itself, in both Selenium and JS paths.
  - Ensured label aliases handle various minute/hour suffix forms.
- Gateway and capability scripts **compile successfully** (`python -m py_compile`).
- Frontend lint passes (`npm run lint` for Dashboard).

### 4.3 Likely Failure Causes

Given the architecture and current code, remaining 500 failures are most likely due to one or both of:

1. **Label mismatch between QuFLX and Pocket Option UI.**
   - Example: QuFLX internal timeframe is `"1m"`, but Pocket Option button text is actually `"M1"` or `"1 min"`.
   - `label_map` currently maps `"1m" → "1m"`, which may not match any actual button label.
   - `_label_aliases` covers a number of patterns, but without concrete DOM text we cannot guarantee a match.

2. **Selector mismatch or menu context mismatch.**
   - Pocket Option may have changed the DOM structure or class names for timeframe options.
   - Options might live in a container we are not querying or inside a different iframe.
   - The current selectors might collect elements that do **not** correspond to timeframe options (causing alias mismatch) or miss the actual buttons entirely.

Because the environment here cannot directly see the live Pocket Option DOM or Chrome DevTools MCP output, the failure is deterministic but unobservable from this side: we can reason about the code paths, but we cannot confirm the exact label text or HTML structure used by the live site.

Under `CORE_PRINCIPLES.md`, this puts us in a **Zero Assumptions** situation: we should not continue guessing selectors or labels without inspecting the actual DOM.
## 5. Assessment Against CORE_PRINCIPLES

1. **Functional Simplicity First**
   - The design separates concerns cleanly (gateway vs capabilities vs UI), which is good.
   - However, repeated small selector tweaks in `TimeframeMenu` are approaching the "infinite patching" anti-pattern.
   - Without direct DOM data, further guess-based patches would increase complexity without guaranteed benefit.

2. **Sequential Logic**
   - The steps are logically ordered: validate timeframe → map label → call capability → parse JSON → return structured HTTP.
   - The failure happens at the capability/UI layer after the menu is opened.

3. **Incremental Testing After Every Change**
   - Local tests performed:
     - Python module compilation for gateway and capabilities.
     - Frontend lint for Dashboard.
   - Full end-to-end testing depends on the live Pocket Option UI and Chrome debug session; this requires the developer’s environment.

4. **Zero Assumptions**
   - The current sticking point is a lack of direct knowledge of the live DOM and button text.
   - Continuing to adjust selectors or labels without inspecting the DOM would violate this principle.

5. **Code Integrity & Backward Compatibility**
   - `/api/v1/select-timeframe` remains stable and backwards compatible.
   - Sync UI is additive, not breaking existing flows.

6. **Strict Separation of Concerns**
   - Timeframe sync flow respects boundaries:
     - Gateway HTTP vs Selenium capabilities vs frontend UX.
   - This is a strong point of the current design.

7. **Stop Patching, Start Rewriting (Rule 7)**
   - Multiple incremental patches have already been applied to:
     - `TimeframeMenu` selectors and click logic.
     - Gateway sync endpoint error handling.
   - Without DOM truth from Pocket Option, additional selector/label tweaks would be speculative.
   - In line with Rule 7, further blind patching should be avoided; instead:
     - Gather accurate DOM and label data via Chrome DevTools / Chrome_Tools_dev MCP.
     - Then, if needed, perform a **clean restructuring** of the timeframe-selection logic with those facts in hand.

8. **Defensive & Explicit Error Handling**
   - Gateway now returns clear error messages derived from capability output.
   - Dashboard surfaces these via `lastError` as a visible banner.

9. **Fail Fast, Fail Loud, Fail Predictably**
   - Timeframe inputs are validated early at the gateway.
   - Capability errors propagate as structured HTTP errors rather than silent failures.

Overall: the main gap is **missing runtime context** (DOM + text), not structural design. The current architecture is sound, but we must stop ad-hoc selector tweaking and instead base the next iteration on empirical DOM inspection.
## 6. Recommended Next Steps

### 6.1 Use Chrome_Tools_dev / DevTools to Gather Ground Truth (High Priority)

1. **Capture error details from `/api/v1/sync-timeframe-ui`**
   - In the Dashboard browser tab:
     - Open DevTools → Network.
     - Click **Sync UI**.
     - Inspect the `POST /api/v1/sync-timeframe-ui` response body.
   - Record the exact JSON (especially the `detail` string) for recent failures.

2. **Inspect Pocket Option timeframe button DOM**
   - In the Pocket Option trading tab (Chrome session attached to port 9222):
     - Open DevTools → Elements (or use Chrome_Tools_dev to query the DOM).
     - Open the timeframe dropdown manually or via script.
     - Inspect one timeframe option (e.g. the `1m` / `M1` equivalent).
     - Capture the **outerHTML** of the clickable element (typically the `<a>` wrapping the `<span>`).

3. **List actual visible timeframe labels**
   - Using Chrome_Tools_dev or DevTools Console, run a small script to return texts of all timeframe options.
   - Example (DevTools Console snippet):

   ```js
   (() => {
     const selectors = [
       '.items__list .item',
       '.items__list a',
       '.items__list button',
       '[role="option"]',
       '.tf-option',
       '.timeframe-options button',
       'a span',
       'a'
     ];
     const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
     const visible = el => {
       try {
         const r = el.getBoundingClientRect();
         const cs = getComputedStyle(el);
         return r.width > 5 && r.height > 5 &&
                cs.visibility !== 'hidden' &&
                cs.display !== 'none' &&
                cs.opacity !== '0';
       } catch {
         return false;
       }
     };
     return nodes
       .filter(visible)
       .map(el => (el.innerText || el.textContent || '').trim())
       .filter(Boolean);
   })();
   ```

   - Save the resulting array (e.g. `["M1","M5","M15","H1", ...]`).

### 6.2 Align Label Mapping with Pocket Option Text

4. **Update `label_map` in `/api/v1/sync-timeframe-ui`**
   - File: `backend/services/gateway/main.py`.
   - For each QuFLX timeframe (e.g. `"1m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`), set the label to match the exact button text discovered above.
     - Example (hypothetical, to be replaced with real labels):
       - `"1m" → "M1"`
       - `"5m" → "M5"`
       - `"15m" → "M15"`
       - `"30m" → "M30"`
       - `"1h" → "H1"`
   - Re-run `python -m py_compile backend/services/gateway/main.py`.

5. **Extend `_label_aliases` if needed**
   - File: `capabilities_v2/timeframe_menu.py`.
   - If Pocket Option uses `M1`, `M5`, etc., ensure those forms are explicitly added to the alias set for minute-based timeframes.
   - Keep the logic simple and focused; avoid overfitting.

### 6.3 Stabilise Selector Strategy (If Needed)

6. **Refine selectors based on actual DOM**
   - Once the outerHTML and container structure are known, adjust selectors in `_try_select_in_current_context` to:
     - Prefer the specific container/classes used by Pocket Option for timeframe options.
     - Reduce reliance on very broad selectors like plain `a` where possible.
   - Maintain a small, ordered selector list: specific → generic.

7. **Add lightweight diagnostics**
   - When selection fails:
     - Include the list of candidate option texts in the capability `data`.
     - Ensure the gateway logs that `data` when returning an error.
   - This will make future issues easier to diagnose without guessing.

### 6.4 Consider a Focused Refactor (If Problems Persist)

In line with **Rule 7 – Stop Patching, Start Rewriting**, if after grounding selectors and labels in real DOM data the system remains fragile, consider:

8. **Extract a `PocketOptionTimeframeAdapter` abstraction**
   - Encapsulate:
     - Known timeframes and their PO labels.
     - DOM selectors and click strategy.
     - A small self-test routine that can verify all known timeframes can be selected and report which ones fail.
   - Keep this adapter as the single point of truth for timeframe automation.

9. **Add a small end-to-end test harness**
   - Script that:
     - Attaches to Chrome.
     - Iterates over all supported timeframes.
     - Calls the adapter / capability to select them.
     - Logs a concise pass/fail summary.
   - This can be run manually after Pocket Option UI updates.

## 7. Summary

- The current architecture cleanly separates concerns and already surfaces errors clearly to the user.
- The remaining 500 errors on **Sync UI** are almost certainly due to **label and/or selector mismatch** between QuFLX assumptions and the live Pocket Option DOM.
- Further blind tweaking would violate **Zero Assumptions** and **Rule 7**.
- The next step must be to use Chrome_Tools_dev / DevTools to capture real DOM and text for timeframe buttons, then:
  - Align label mapping in the gateway.
  - Tighten alias generation and selectors in `TimeframeMenu`.
  - Optionally introduce a focused adapter and E2E harness for long-term robustness.

Once these steps are completed, the **Sync UI** feature should reliably keep the Pocket Option chart timeframe aligned with the QuFLX-selected timeframe, enabling safe strategy switching and preventing hidden contract mismatches.
