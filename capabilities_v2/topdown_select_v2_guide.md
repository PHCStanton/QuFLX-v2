# Topdown Select v2 Guide

This guide documents the v2-capabilities used for PocketOption topdown timeframe selection and history collection.

The core pieces are:
- `topdown_select_test_2` – orchestrator for selecting a high-payout favorite and walking timeframes.
- `timeframe_select_sync` – robust timeframe selector with retries, chart-focus recovery, and parent-anchor (span-to-a) traversal logic.
- `collect_history` – orchestrator that visits favorites, syncs timeframe, and collects/saves history.
- `history_collector` – low-level candle collector and CSV writer using the WebSocket interceptor.
- Supporting controls: `favorites_bar`, `timeframe_menu`, `session_foundations`, and the generic `runner`.

---

## 1. Capability Overview

### 1.1 Files

- `capabilities_v2/topdown_select_test_2.py`
- `capabilities_v2/timeframe_select_sync.py`
- `capabilities_v2/collect_history_loop.py`
- `capabilities_v2/history_collector.py`
- `capabilities_v2/favorites_bar.py`
- `capabilities_v2/timeframe_menu.py`
- `capabilities_v2/session_foundations.py`
- `capabilities_v2/runner.py`

All capabilities use `capabilities_v2/base.py` for the shared `Ctx`, `CapResult`, and `Capability` protocol.

### 1.2 High-Level Flows

There are two main topdown-related flows:

1. **Timeframe automation test (no streaming)**
   - `topdown_select_test_2` selects a favorite with high payout and cycles through timeframes, acting as a smoke test for timeframe automation.

2. **Timeframe + history collection (with streaming)**
   - `collect_history` walks favorites, ensures a given timeframe is active (optionally using `timeframe_select_sync`), then uses `history_collector` to pull and save candle history.

---

## 2. Ctx, CapResult, and Capability Protocol (base.py)

All v2 capabilities share a consistent interface defined in `capabilities_v2/base.py`:

- `Ctx`
  - `driver`: Selenium WebDriver attached to Chrome with `--remote-debugging-port=9222`.
  - `artifacts_root`: Base path for saved JSON and screenshots.
  - `debug`: Enables screenshot/JSON artifact capture.
  - `dry_run`: Future flag for non-mutating runs.
  - `verbose`: Enables console logging.

- `CapResult`
  - `ok: bool`
  - `data: Dict[str, Any]`
  - `error: Optional[str]`
  - `artifacts: Tuple[str, ...]` (paths under `artifacts_root`).

- `Capability`
  - `id: str`
  - `kind: str` (e.g. `"control"`, `"orchestrator"`, `"data_processing"`).
  - `run(ctx: Ctx, inputs: Dict[str, Any]) -> CapResult`.

Helpers:
- `timestamp()` – simple `YYYYMMDD_HHMMSS` string.
- `take_screenshot_if(ctx, rel_path)` – saves a screenshot when `ctx.debug` is `True`.
- `save_json(ctx, rel_filename, data, subfolder=None)` – writes JSON under `artifacts_root`.

---

## 3. Session Foundations (session_foundations.py)

`SessionFoundations` verifies that the current PocketOption session is suitable for automation.

- `id`: `"session_foundations"`
- `kind`: `"control-read"`

Typical checks:
- Valid DOM for the main chart area.
- Favorites bar present.
- Timeframe control visible and interactable.

`topdown_select_test_2` calls this capability first and aborts if it returns `ok=False`.

---

## 4. Favorites Bar Control (favorites_bar.py)

`FavoritesBar` provides read and control operations on the PocketOption favorites bar.

- `id`: `"favorites_bar"`
- `kind`: `"control-read"`

Actions:
- `reset_to_left` – Scrolls the favorites bar back to the left using `HighPriorityControls`.
- `scroll_right` – Scrolls the favorites bar to reveal more assets.
- `get_visible_favorites` – Returns `visible` items and `assets` list.
  - Each `visible` item has `asset`, `data_id` (when available), and `payout` text.
- `click_favorite` – Clicks a favorite by label, using Selenium click and JS fallback.

`topdown_select_test_2` uses this to:
- Read visible favorites.
- Filter by payout >= threshold.
- Click the chosen favorite.

`collect_history` uses it to:
- Reset to left.
- Page through favorites.
- Click each asset in a loop.

---

## 5. Timeframe Menu Control (timeframe_menu.py)

`TimeframeMenu` encapsulates logic for opening the PocketOption timeframe dropdown and selecting labels.

- `id`: `"timeframe_menu"`
- `kind`: `"control"`

Actions:
- `open_menu` – Attempts to locate and click the timeframe dropdown using `HighPriorityControls` first, then CSS fallbacks.
- `is_open` – Returns whether a dropdown-like element is visible (using `.dropdown.open`, `[role='menu']`, `[role='listbox']`).
- `select_timeframe` – Ensures the menu is open, then searches for timeframe labels.

Selection strategy:
1. Search current DOM context for list items and option-like elements.
2. Normalize text using `_normalize_label` and match against aliases from `_label_aliases` (e.g. `"1m"`, `"1 min"`, `"M1"`).
3. Attempt a direct Selenium click on the label element or its closest `<a>` parent; if that fails, fall back to JS `click` on the same target hierarchy.
4. If that fails, run a JS scanning function that:
   - Gathers visible candidates via multiple selectors.
   - Matches alias-normalized text.
   - Calls `click()` on the matching element.

`TimeframeMenu` is the low-level primitive that understands DOM structure and aliases; higher-level capabilities wrap it for robustness.

---

## 6. Robust Timeframe Selection (timeframe_select_sync.py)

`TimeframeSelectSync` adds retry logic and chart-focus recovery around `TimeframeMenu.select_timeframe`.

- `id`: `"timeframe_select_sync"`
- `kind`: `"control"`

### 6.1 Inputs

- `labels: list[str] | optional`
  - Main way to specify timeframes (`["H1", "M15", "M5", "M1"]`).
- `label: str | optional`
  - Convenience single label (wrapped into a one-element list).
- Defaults: if both are omitted, labels default to `["H1", "M15", "M5", "M1"]`.

Control parameters:
- `attempts: int = 3`
  - Attempts per label (min 1).
- `delay_ms: int = 300`
  - Delay after a successful selection.
- `tf_wait_s: float = 0.0`
  - Additional wait after selection, useful when coordinating with streaming.
- `focus_on_chart: bool = True`
  - On failure and if attempts remain, clicks the chart area (`canvas, .chart, .trading-chart`) before retry.
- `save_diag: bool = True`
  - When `ctx.debug=True`, controls JSON diagnostics emission.

### 6.2 Behavior

For each label:
- Try `TimeframeMenu.run(..., action="select_timeframe")` up to `attempts` times.
- On success:
  - Mark label as `ok`.
  - Sleep `delay_ms/1000` and `tf_wait_s`.
  - Stop trying this label.
- On failure and if `focus_on_chart` and attempts remain:
  - Click chart element and pause before the next attempt.

### 6.3 Output Shape

`CapResult.data` includes:

- `inputs` – normalized inputs and control parameters.
- `per_label` – list of entries like:
  - `label`
  - `ok`
  - `attempts`: each attempt contains selection status, errors, and any focus recovery details.
- `labels_total`, `labels_ok`.

`CapResult.ok` is `True` only if all labels succeeded at least once.

Diagnostic artifacts (when `ctx.debug` and `save_diag`):
- JSON: `timeframe_select_sync/timeframe_select_sync_<timestamp>.json`.
- Screenshots: `screenshots/timeframe_sync_pre_*.png`, `screenshots/timeframe_sync_post_*.png`.

---

## 7. Topdown Test Orchestrator (topdown_select_test_2.py)

`TopdownSelectTest2` is a v2 orchestration capability designed to:
- Validate the session.
- Pick a high-payout favorite.
- Walk a set of timeframes.

- `id`: `"topdown_select_test_2"`
- `kind`: `"orchestrator"`

### 7.1 Inputs

- `labels: list[str] | optional`
  - Timeframes to test (default `H1 M15 M5 M1`).
- `min_pct: int = 92`
  - Minimum payout percentage for visible favorites.
- `delay_ms: int = 300`
  - Delay between timeframe selections.
- `stack: str = "1m"`
  - Legacy field kept for compatibility; not used by v2 capabilities.
- `save_screenshots: bool = False`
  - Enables screenshots via `take_screenshot_if`.
- `screenshots_subdir: str = "topdown_test_2"`
- `reopen_each: bool = True`
  - Reserved for future behavior; currently not changing logic.

Timeframe sync options (new):
- `use_tf_sync: bool = False`
  - If `True`, uses `TimeframeSelectSync` instead of calling `TimeframeMenu` directly.
- `tf_attempts: int = 3`
- `tf_wait_s: float = 0.0`
- `focus_on_chart: bool = True`
- `save_tf_diag: bool = True`

### 7.2 Flow

1. **Session Validation**
   - Runs `SessionFoundations`; aborts if `ok=False`.

2. **Favorite Selection**
   - Uses `FavoritesBar.get_visible_favorites`.
   - Filters favorites whose `payout` numeric value is >= `min_pct`.
   - Chooses the first eligible favorite as `target_asset`.
   - Clicks it via `FavoritesBar.click_favorite`.

3. **Timeframe Selection**

   - If `use_tf_sync=True`:
     - Calls `TimeframeSelectSync` with the labels and control parameters.
     - Stores its full result under `data["timeframe_select_sync"]`.
     - Flattens `per_label` into `topdown_result["attempts"]` for convenience.

   - If `use_tf_sync=False`:
     - Loops over labels and calls `TimeframeMenu.run(..., action="select_timeframe")`.
     - Records `{label, ok, error, data}` in `attempts`.
     - Applies `delay_ms` after successful selections.

4. **Result Summary**

`topdown_result` contains:
- `ok`: `True` if all labels succeeded.
- `error`: `None` or a generic message.
- `labels`: the labels sequence.
- `stack`: input `stack` string.
- `attempts_total` and `attempts_ok`.
- `attempts`: per-label attempt summary.

Screenshots and JSON are saved when `ctx.debug=True`.

### 7.3 CLI Harness

`TopdownSelectTest2` can be run as a script:

```bash
python capabilities_v2/topdown_select_test_2.py --labels H1 M15 M5 M1 --min-pct 92 --delay-ms 300
```

With timeframe sync:

```bash
python capabilities_v2/topdown_select_test_2.py \
  --labels H1 M15 M5 M1 \
  --min-pct 92 \
  --delay-ms 300 \
  --use-tf-sync \
  --tf-attempts 3 \
  --tf-wait-s 0.5
```

On Windows PowerShell, adjust quoting accordingly.

---

## 8. History Collection (history_collector.py)

`HistoryCollector` is a generic candle collector that reads WebSocket history and tick data via the backend WebSocket interceptor.

- `id`: `"history_collector"`
- `kind`: `"data_processing"`

### 8.1 Modes

Inputs:
- `action`: one of `"collect"`, `"collect_and_save"`, or default `"save"`.
- `asset`: required for all modes.
- `timeframe`: optional; used to interpret or aggregate candles.

Modes:
- `collect` – Attach to WebSocket, fetch history + ticks, return candles as data.
- `collect_and_save` – Same as `collect` but writes CSV under a timeframed folder.
- `save` – Accepts `candles` from caller and writes them to CSV.

The collector relies on `backend.services.collector.interceptor.WebSocketInterceptor` and uses a combination of:
- Initial history events (bulk candles).
- Live tick events aggregated into timeframe buckets.

CSV files are named with asset, timeframe, and timestamp and contain standard OHLC fields.

---

## 9. Collect History Orchestrator (collect_history_loop.py)

`CollectHistoryLoop` orchestrates favorites traversal and history collection.

- `id`: `"collect_history"`
- `kind`: `"orchestrator"`

### 9.1 Inputs

- `duration: int = 10`
  - Per-asset collection window in seconds.
- `timeframe: str = "1m"`
  - Intended timeframe label (e.g. `"1m"`, `"5m"`).

Timeframe sync parameters (optional):
- `use_tf_sync: bool = False`
  - If `True`, uses `TimeframeSelectSync` to enforce the timeframe per asset.
- `tf_attempts: int = 3`
- `tf_delay_ms: int = 300`
- `tf_wait_s: float = 0.0`
- `focus_on_chart: bool = True`
- `save_tf_diag: bool = True`

### 9.2 Flow

1. Reset favorites bar to the left.
2. Loop until the end of favorites is reached:
   - Get visible favorites.
   - Filter out assets already processed.
   - For each new asset:
     - Click the favorite.
     - If `use_tf_sync`: call `TimeframeSelectSync` for `[timeframe]`.
     - Else: call `TimeframeMenu` directly.
     - On timeframe failure: record a `"timeframe_error"` result for that asset and continue.
     - On success: run `HistoryCollector.collect_and_save` with the given `duration` and `timeframe`.
     - Record success or collector error in `results`.
   - Scroll the favorites bar right; stop when no more scrolling is possible.

The final `CapResult.data` contains:
- `processed`: list of processed asset labels.
- `results`: per-asset status objects.

### 9.3 Using via Runner

The orchestrator is registered in `runner.py` as `"collect_history"`:

```bash
python -m capabilities_v2.runner collect_history --inputs "{\"duration\":10,\"timeframe\":\"1m\"}"
```

With robust timeframe sync:

```bash
python -m capabilities_v2.runner collect_history --inputs "{\"duration\":10,\"timeframe\":\"1m\",\"use_tf_sync\":true,\"tf_attempts\":3,\"tf_delay_ms\":300,\"tf_wait_s\":0.5,\"focus_on_chart\":true}"
```

---

## 10. Runner Integration (runner.py)

`capabilities_v2/runner.py` provides a generic CLI entry point.

- Attaches to an existing Chrome session via `qf.attach_chrome_session` if available.
- Falls back to a raw Selenium Chrome connection to `127.0.0.1:9222`.
- Uses `CAPABILITY_MAP` to instantiate capabilities by name and execute `run` with JSON `inputs`.

Relevant entries in `CAPABILITY_MAP`:

- `"timeframe_menu": TimeframeMenu`
- `"favorites_bar": FavoritesBar`
- `"history_collector": HistoryCollector`
- `"collect_history": CollectHistoryLoop`
- `"topdown_select_test_2": TopdownSelectTest2`
- `"timeframe_select_sync": TimeframeSelectSync`

Usage example:

```bash
python -m capabilities_v2.runner topdown_select_test_2 --inputs "{\"labels\":[\"H1\",\"M15\",\"M5\",\"M1\"],\"min_pct\":92,\"use_tf_sync\":true}"
```

---

## 11. Recommended Usage Patterns

1. **Smoke-test timeframe automation**
   - Use `topdown_select_test_2` (with `use_tf_sync` enabled) to verify that the current PocketOption session supports reliable timeframe selection across your label set.

2. **Collect data for a single timeframe**
   - Use `collect_history` with a specific `timeframe` (e.g. `"1m"`) and `use_tf_sync=true` to gather synchronized history per favorite.

3. **Combine with V1 strategies**
   - Use the CSV output from `history_collector` as input to your existing V1 analysis scripts while modernizing the collection path.

4. **Debugging**
   - Run with `ctx.debug=True` and `save_tf_diag=True` to capture JSON and screenshots for failing timeframe selections.
   - Inspect `timeframe_select_sync` JSON artifacts to understand DOM/selector issues.

This guide should serve as the starting point for any v2 work involving PocketOption timeframe automation and topdown-style data collection.
