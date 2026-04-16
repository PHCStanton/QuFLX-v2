# Alternative Assets Collection & Rendering — Implementation Plan
**File:** `v2_Dev_Docs/Asset_Normalization/Alternative_Assets_Collection_Rendering_Plan_26-04-05.md`  
**Date:** 2026-04-05  
**Author:** @Investigator → Plan compiled for @Coder / @Architect / @Tester  
**Scope:** QuFLX-v2 asset discovery, history collection, and chart rendering for Pocket Option asset classes beyond the current Forex/OTC focus  
**Status:** 📋 Ready for Implementation — Awaiting explicit approval to begin Phase 0

---

## Executive Summary

QuFLX-v2 already has the core mechanics needed to **select an asset, collect its history, persist candles, and render the chart**. What is still too narrow is the **asset catalog**: the UI and refresh pipeline are effectively tuned around the currently preferred Forex/OTC set.

This plan extends the asset lifecycle so the dashboard can collect, store, and render **all Pocket Option asset classes** in the same way it currently does for Forex/OTC assets:

- OTC
- Regular Forex / Currency pairs
- Cryptocurrencies
- Stocks
- Indices

The key design goal is to keep the chart pipeline **asset-class agnostic**: once an asset is normalized and has history, the chart should behave the same regardless of whether it is Forex, OTC, Crypto, Stock, or Index.

**No code changes are made until the user explicitly approves implementation.**

---

## Architecture Context

### Current Behavior That Already Works

- `marketStore.selectedAsset` drives chart selection.
- `marketStore.loadHistory(asset)` fetches existing candles or bootstraps history if missing.
- `backend/utils/data_store.py` already provides canonical candle file storage per `asset + timeframe`.
- `ChartWorkspace.jsx` renders from `selectedAsset`, `historyCandles`, and `historyStatus`.
- `ChartHeader.jsx` and `AssetPayoutPanel.jsx` already respond to the selected asset and refresh flows.

### What Is Still Too Narrow

- Asset discovery is still centered on the current payout/OTC selection flow.
- `refresh-assets` currently returns a flat selected-asset list and does not expose a stable category contract.
- The dashboard does not yet present a clear **category-aware** asset catalog for browsing Crypto / Stocks / Indices alongside OTC.
- The alert/dispatch and monitoring layers are still optimized for the existing monitored asset set, not a full multi-class catalog.

### Guiding Rule

The chart layer should not care whether an asset is Forex, OTC, Crypto, Stock, or Index. Once the asset is normalized and history exists, **rendering should be identical**.

---

## Current State Map

| Area | Current State | Gap / Concern |
|------|---------------|---------------|
| Asset refresh backend | `backend/services/gateway/routes/assets.py` executes a refresh script and returns a flat `assets` list | No category-aware asset catalog contract |
| Payout asset UI | `AssetPayoutPanel.jsx` shows the current asset pool and filter controls | No grouping by asset class |
| Asset list UI | `AssetListView.jsx` renders a selectable list with search | No category tabs / sections |
| Chart asset selection | `ChartHeader.jsx` selects the active asset and changes timeframe | Works, but depends on a narrow upstream list |
| History storage | `backend/utils/data_store.py` stores candles per normalized asset + timeframe | Already suitable for all asset classes |
| Bootstrap history | `backend/services/gateway/routes/history.py` bootstraps candles when missing | Already generic, but assumes the asset first enters the UI list |
| Alert / dispatcher | `backend/scripts/otc_alert_dispatch.py` scans local assets and tracks current monitoring set | Needs category-aware discovery and clearer asset catalog syncing |
| Trading asset source | `gui/Dashboard/src/store/tradingStore.js` fetches `trading/assets` and stores `assetsLoaded` | Likely needs richer asset metadata for non-OTC classes |
| Chart rendering | `ChartWorkspace.jsx`, `OscillatorPanel.jsx`, `ChartContainer.jsx` render based on selected asset and history | Already generic enough once asset selection is expanded |

---

## Implementation Phases

### Phase 0 — Define the Asset Catalog Contract
**Executor:** @Architect + @Coder  
**Effort:** 30–45 minutes  
**Risk:** Low  
**Goal:** Create a single, explicit asset metadata shape that can carry category, display label, canonical key, payout, and source.

#### Tasks
- Define a canonical response shape for asset catalog entries.
- Include at minimum:
  - `id` / canonical key
  - `raw_id` / Pocket Option source id
  - `display_name`
  - `category` (`otc`, `forex`, `crypto`, `stocks`, `indices`)
  - `payout`
  - `is_active`
  - `source`
- Ensure the same shape can power both the chart selector and the trading/monitoring views.

#### Example Shape
```json
{
  "id": "EURUSDOTC",
  "raw_id": "EURUSD_otc",
  "display_name": "EUR/USD OTC",
  "category": "otc",
  "payout": 92,
  "is_active": true,
  "source": "pocket_option"
}
```

---

### Phase 1 — Backend Asset Discovery for All Classes
**Executor:** @Coder  
**Effort:** 1–2 hours  
**Risk:** Medium  
**Goal:** Extend the backend asset discovery/refresh flow so it can return OTC, Forex, Crypto, Stock, and Index assets in one catalog.

#### Tasks
- Expand `backend/services/gateway/routes/assets.py` so the refresh flow can emit category metadata rather than only a flat list.
- Preserve the current OTC behavior, but add category buckets for other Pocket Option asset classes.
- Keep normalization canonical via `backend/utils/asset_utils.py`.
- Ensure the result can still drive the current `AssetPayoutPanel` and `tradingStore.fetchAssets()` flow.

#### Implementation Notes
- The current `refresh_assets()` subprocess can remain if it still returns the required data.
- If the subprocess cannot reliably surface category metadata, replace it with a structured backend catalog endpoint.
- Keep the response backwards compatible during transition if possible.

#### Example Direction
```json
{
  "assets": [
    { "id": "EURUSDOTC", "category": "otc" },
    { "id": "BTCUSDOTC", "category": "crypto" },
    { "id": "AAPLOTC", "category": "stocks" },
    { "id": "US30OTC", "category": "indices" }
  ]
}
```

---

### Phase 2 — Generalize History Collection Across Asset Classes
**Executor:** @Coder  
**Effort:** 1–2 hours  
**Risk:** Medium  
**Goal:** Make history collection and bootstrap work identically for all supported asset classes.

#### Tasks
- Confirm `data_store.py` pathing remains valid for all canonical asset keys.
- Ensure `history.py` bootstrapping is not assuming OTC-only assets.
- Confirm `history_collector.py` and any collector utilities write candles using the same canonical asset key regardless of class.
- Validate that a newly selected Crypto / Stock / Index asset can bootstrap and save history exactly like an OTC asset.

#### Important Constraint
The chart should not need special-case logic for each asset class. If a candle CSV exists for the normalized asset key and timeframe, the chart should render it.

---

### Phase 3 — Frontend Category-Aware Asset Selection
**Executor:** @Coder  
**Effort:** 1–2 hours  
**Risk:** Medium  
**Goal:** Present the broader asset catalog in the UI without breaking the existing chart selection behavior.

#### Tasks
- Update the asset browsing UI to show categories or category tabs/sections.
- Keep the current search/filter experience, but extend it to include Crypto / Stocks / Indices.
- Ensure `ChartHeader.jsx` continues to use `selectedAsset` as the single source of truth.
- Make sure `setSelectedAsset()` and `loadHistory()` continue to work without changes to chart rendering logic.

#### Suggested UI Behavior
- Group assets by category.
- Keep OTC assets visible by default because they are still the primary workflow.
- Add a simple category filter or pill row so users can jump between classes quickly.

---

### Phase 4 — Rendering and Cache Behavior Validation
**Executor:** @Coder + @Tester  
**Effort:** 45–60 minutes  
**Risk:** Low  
**Goal:** Verify the chart path, candle cache, and indicator overlays work for all asset classes without any rendering-specific branching.

#### Tasks
- Confirm `historyCandles[asset]` caching works for multiple category assets.
- Confirm `useTickAggregation.js` still preserves cached candles on asset switches.
- Confirm `ChartWorkspace.jsx` and `ChartContainer.jsx` render cleanly for non-OTC assets.
- Confirm indicator overlays and oscillator panels still attach to the selected asset/timeframe key.

#### Expected Result
Switching between `EURUSDOTC`, `BTCUSDOTC`, `AAPLOTC`, and an index asset should feel identical from the chart’s perspective.

---

### Phase 5 — Monitoring / Alerts / Trading Alignment
**Executor:** @Coder  
**Effort:** 1 hour  
**Risk:** Medium  
**Goal:** Make sure the broader asset catalog does not break monitoring, alerts, or trading selection.

#### Tasks
- Confirm `marketStore.refreshAssets()` still syncs monitoring subscriptions correctly.
- Verify `alert dispatcher` asset tracking remains stable when new categories are added.
- Confirm `tradingStore.fetchAssets()` can surface the broader set without breaking live trading selection.
- Keep current OTC behavior as the default path, not a special edge case.

---

### Phase 6 — Verification & Hardening
**Executor:** @Tester + @Reviewer  
**Effort:** 1 hour  
**Risk:** Low  
**Goal:** Prove that all supported asset classes can be collected and rendered without regressions.

#### Verification Checklist
- [ ] OTC asset loads history and renders chart.
- [ ] Forex asset loads history and renders chart.
- [ ] Crypto asset loads history and renders chart.
- [ ] Stock asset loads history and renders chart.
- [ ] Index asset loads history and renders chart.
- [ ] Asset switching preserves cache and avoids unnecessary re-bootstrap.
- [ ] Search/filter UI works across categories.
- [ ] Monitoring and alerts remain stable after category expansion.

---

## Files Touched Summary

| File | Purpose |
|------|---------|
| `backend/services/gateway/routes/assets.py` | Return category-aware asset catalog |
| `backend/services/gateway/routes/history.py` | Verify bootstrap works for all categories |
| `backend/utils/data_store.py` | Continue using canonical storage for all assets |
| `backend/scripts/otc_alert_dispatch.py` | Category-aware discovery / monitoring sync |
| `gui/Dashboard/src/store/marketStore.js` | Accept richer asset metadata and refresh results |
| `gui/Dashboard/src/store/tradingStore.js` | Surface broader asset list for live trading |
| `gui/Dashboard/src/components/AssetPayoutPanel.jsx` | Category-aware browsing and filters |
| `gui/Dashboard/src/components/AssetListView.jsx` | Search / selection across asset classes |
| `gui/Dashboard/src/components/ChartHeader.jsx` | Continue selecting and loading any supported asset |
| `gui/Dashboard/src/components/ChartWorkspace.jsx` | Render any asset with available candles |

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Asset catalog response changes break existing OTC flow | Medium | Medium | Keep backward-compatible fields during transition |
| Non-OTC assets lack history files initially | Medium | High | Bootstrap them on demand using the existing history flow |
| Frontend list becomes noisy with more assets | Low | Medium | Add category grouping and search |
| Monitoring/alerts assume OTC-only pool | Medium | Medium | Keep default OTC behavior, expand categories incrementally |
| Category metadata mismatches backend vs frontend | Medium | Low | Use one canonical asset schema and normalize keys consistently |
| Chart rendering regressions for new asset types | Low | Low | Verify with one asset from each category before rollout |

---

## CORE_PRINCIPLES Compliance Map

| Principle | Compliance Strategy |
|-----------|---------------------|
| Functional Simplicity | Keep the chart renderer generic and move category complexity to discovery/catalog layers. |
| Sequential Logic | First define the catalog, then expand collection, then update rendering and monitoring. |
| Incremental Testing | Verify one asset class at a time before broad rollout. |
| Zero Assumptions | Do not assume every class has history; bootstrap and validate explicitly. |
| Code Integrity | Preserve the current OTC workflow while expanding capability. |
| Separation of Concerns | Asset catalog, history storage, chart rendering, and monitoring remain separate responsibilities. |
| Stop Patching, Start Rewriting | If the asset catalog becomes too tangled, replace it with a clean catalog contract rather than layering more special cases. |
| Defensive Error Handling | Surface clear messages when a category has no data or the backend cannot resolve an asset. |
| Fail Fast | Validate category and canonical asset keys at the catalog boundary. |

---

## Final Notes

- The strongest leverage point is the **asset catalog**. Once that is category-aware, the existing chart/history pipeline can stay mostly unchanged.
- The chart system already supports “any asset with candles”; this plan makes sure **more assets can enter that pipeline**.
- The least risky rollout is to add one category at a time, verify it end-to-end, then expand to the next.

*Plan compiled by @Investigator. Ready for @Coder implementation after user approval.*
