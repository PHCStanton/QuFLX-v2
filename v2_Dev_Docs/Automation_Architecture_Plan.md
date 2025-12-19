# Automation Architecture Plan

## Objectives
- Rebuild Get Assets and Collect History as robust, testable capabilities.
- Eliminate cross-contamination with `v2_Dev_Docs/V1_reference` in runtime code.
- Align with CORE_PRINCIPLES: simplicity, sequential logic, incremental testing, strict separation.

## User Flows
- Get Assets
  - Open Assets dropdown
  - Scan rows via star icons
  - Star if payout ≥ threshold, optionally unstar below
  - Verify change in favorites bar, close dropdown
- Collect History
  - Operate on favorites bar only
  - Select asset by label
  - Open timeframe control
  - Cycle timeframes and wait for historical candles
  - Persist candles per asset/timeframe to CSV

## Modules
- `favorite_star_select.py`: star/unstar via dropdown; single source of truth
- `favorites_bar.py`: scan, reset/scroll, and click items on top bar
- `timeframe_menu.py`: chart timeframe control open/select, no asset dropdown
- `history_collector.py`: performance log watch, payload decode, CSV persist

## Interfaces
- Capability signature: `run(ctx, inputs) -> CapResult`
- Get Assets inputs: `{min_pct, sweep_all, unstar_below, dry_run, close_after}`
- Collect History inputs: `{min_pct, labels, delay_asset, delay_tf, dry_run}`
- Outputs: structured `data` with processed items, counts, errors, artifacts

## DOM Anchors
- Favorites Bar
  - Item: `.assets-favorites-item__line`
  - Label: `.assets-favorites-item__label`
  - Payout: `.payout__number`
  - Nav Left: `.assets-favorites__arrow--left`
  - Nav Right: `.assets-favorites__arrow--right`
- Assets Dropdown
  - Star off: `i.alist__icon.fa.fa-star-o.add`
  - Star on: `i.alist__icon.fa.fa-star.del`
  - List container: `.assets-block__list, .assets-table, .assets-list`
- Timeframe Control
  - Button: `a.items__link--chart-type` (preferred), fallbacks in chart toolbar
  - Dropdown indicators: `.dropdown.open, [role='menu'], [role='listbox']`
## Incremental Plan (Testable)

### Phase 0: Foundations
- Attach `Ctx.driver` to Chrome session; set `artifacts_root`.
- Probe favorites bar and timeframe control presence.
- Verify `driver.get_log('performance')` readable.

### Phase 1: Get Assets
- Implement robust row anchoring via ancestor XPath for star icons.
- Extract label and payout; star/unstar based on threshold.
- Verify via favorites bar presence or star class toggle.
- Close dropdown deterministically.
- Tests: dry-run detection, single star/unstar, sweep with min_pct.

### Phase 2: Favorites Bar
- Implement `reset_to_left()` and `scroll_right()` with verified selectors.
- Implement `get_visible_favorites()` reading label and payout.
- Implement `click_favorite()` preferring label element click.
- Tests: enumerate visible, click label, paginate right.

### Phase 3: Timeframe Menu
- Implement `open_menu()` using chart-type control; remove asset symbol selectors.
- Implement `_is_menu_open()` via dropdown indicators.
- Implement `select_timeframe(label)` with exact match.
- Tests: select `M1, M5, M15, H1` reliably; asset dropdown remains closed.

### Phase 4: History Collector
- Clear performance logs before timeframe change.
- Wait for `Network.webSocketFrameReceived`; decode base64 + Socket.IO frames.
- Detect `history` or `candles` arrays; persist CSV per `{asset}/{tf}.csv`.
- Validate rows, timestamp monotonicity, OHLC integrity.

### Phase 5: Backend Integration
- `POST /api/v1/get-assets` calls `favorite_star_select` directly.
- `POST /api/v1/collect-history` orchestrates favorites bar → timeframe → collector.
- Use background thread for collection; structured JSON responses.

### Phase 6: Observability & Guardrails
- Structured logs; friendly errors; screenshots when `ctx.debug=True`.
- Fail-fast on missing UI state; skip logic, no silent failures.

## Residue Removal Checklist
- Remove imports to `v2_Dev_Docs/V1_reference` in runtime code.
- Delete subprocess calls to legacy runners in gateway.
- Replace mixed timeframe selectors in backend with `timeframe_menu` capability.
- Ensure frontend buttons call the new endpoints only.

## Validation & Acceptance
- Get Assets toggles favorites correctly; dropdown closes; bar reflects changes.
- Collect History never opens asset dropdown; cycles timeframes; writes CSV.
- No reference imports; endpoints return structured results; artifacts present.

## Rollout & Risk Mitigation
- Deploy in stages: Get Assets → Favorites Bar → Timeframe Menu → History Collector.
- Add feature flags to disable collection on failures; comprehensive logs.

## Security & Compliance
- No secrets in code; avoid logging sensitive data.
- Validate inputs early; return structured errors; adhere to project rules.
## Data Paths & Formats
- CSV path: `data/data_output/history/{ASSET}/{TF}.csv`
- CSV columns: `timestamp, open, high, low, close, volume`
- Artifacts: screenshots under `artifacts_root` when debug enabled.

## Appendix: Selector Reference
- Favorites Bar
  - `.assets-favorites-item__line`
  - `.assets-favorites-item__label`
  - `.payout__number`
  - `.assets-favorites__arrow--left`
  - `.assets-favorites__arrow--right`
- Assets Dropdown
  - `i.alist__icon.fa.fa-star-o.add`
  - `i.alist__icon.fa.fa-star.del`
  - `.assets-block__list, .assets-table, .assets-list`
- Timeframe Control
  - `a.items__link--chart-type`
  - `.dropdown.open, [role='menu'], [role='listbox']`

## Ownership & Delegation
- @Architect: finalize module boundaries and API surface.
- @Engineer: input validation and error taxonomy.
- @Coder: implement modules per phases.
- @Debugger: test harness for DOM snapshot and performance logs.
- @Tester: scenario tests and CSV integrity validation.
- @Reviewer: style, concerns separation, residue removal verification.
