# Assets Monitor & Signal Alerts Dev Plan (26-02-16)

## Context
This plan consolidates the asset monitoring and signal alert workflow to reduce user confusion and instability observed in production sessions. The key issue is a mismatch between what the UI shows as “streaming” and what the dispatcher actually scans. The intended model is that the Monitor Pool is the whitelist, while the ticker is informational only. This plan standardizes that behavior, clarifies user feedback, and separates monitoring from signals history and notifications.

## Principles (Non‑negotiable)
- Adhere to CORE_PRINCIPLES.md
- Zero silent failures, explicit states, minimal mental load
- One source of truth per concept (Monitor Pool = Whitelist)
- Prefer clear UX over clever automation

## Objectives
- Stabilize asset monitoring so every chosen asset is reliably scanned
- Separate monitoring from signal notifications and history
- Provide transparent state, logs, and exportable signal history

## Current State Snapshot
- [x] Dispatcher heartbeat includes Active + Whitelist assets
- [x] Alert dispatcher logs saved under system_LOGS/alert_dispatch
- [x] Monitoring Pool click adds asset to monitoring whitelist
- [x] Alert notification sound updated
- [~] Whitelist logic still needs full UI/UX simplification

## Phase 1 — Stabilize Monitoring Workflow (Priority: P0)
**Goal:** Monitor Pool is the only whitelist, always consistent

- [~] Unify whitelist source to Monitor Pool only
- [~] Remove ticker list from whitelist computation
- [~] Ensure manual “Add to Monitor” is explicit and persistent
- [ ] Add “Remove from Monitor” action on each asset
- [ ] Add “Clear Monitor Pool” action with confirmation
- [ ] Add “Missing History” badge with suggested action
- [ ] Add “Not Streaming” badge if no ticks within threshold

**Success Criteria**
- Monitor Pool count == whitelist count
- Dispatcher Active ⊆ Monitor Pool
- No asset scans occur outside the Monitor Pool
## Phase 2 — Signals UX Separation (Priority: P1)
**Goal:** Signals are notifications, not monitor items

- [ ] Add Top Bar bell with unread count
- [ ] Add signal inbox dropdown (last 50)
- [ ] Add “Mark all read” action
- [ ] Add “View History” link to dedicated page
- [ ] Remove signals from Monitor Pool display

**Success Criteria**
- Monitor Pool shows only monitored assets
- Signals are visible even when Monitor Pool is collapsed

## Phase 3 — Signal History Page (Priority: P1)
**Goal:** Clear, exportable signal archive for analysis

- [ ] Create /signal-history route
- [ ] Filter by asset, timeframe, direction, regime, AI confidence
- [ ] Export CSV (all + filtered)
- [ ] Add comparison import hook for PO statements (manual file upload)

**Success Criteria**
- User can export signals and reconcile with PO statements
- Signal list remains performant (pagination or virtual list)
## Phase 4 — Observability & Diagnostics (Priority: P1)
**Goal:** Reduce confusion with explicit system evidence

- [ ] Add “Whitelist” live panel (what dispatcher sees now)
- [ ] Show heartbeat age + stale threshold using scanIntervalSeconds
- [ ] Add log link from Monitor Pool to alert-dispatch-logs
- [ ] Add “Last scan summary” panel (assets scanned, duration, errors)

**Success Criteria**
- Users can explain why an asset is not active in <30s
- Logs and heartbeat align with UI state

## Phase 5 — Backend Hardening (Priority: P2)
**Goal:** Reduce race conditions and long tail failures

- [ ] Wrap scan_available_assets I/O in asyncio.to_thread
- [ ] Add persistent aiohttp session for fetch_data
- [ ] Add explicit error payload on dispatcher start failure
- [ ] Add structured errors to Redis publish failures

**Success Criteria**
- No blocked event loop on large history folders
- Consistent error reporting in UI logs
## Implementation Notes
- Monitor Pool == Whitelist == dispatcher input (single list)
- Ticker list is informational only (streaming status)
- Signals should not mutate whitelist
- Any asset click in Monitor Pool should add to whitelist and select asset

## Verification Checklist
- [ ] Start dispatcher, whitelist count equals Monitor Pool count
- [ ] Add/remove asset updates whitelist and dispatcher within 5s
- [ ] Signal shows in bell + history page, not in Monitor Pool
- [ ] Export CSV matches on-screen filters
- [ ] Dev logs show heartbeat + whitelist at least once per scan interval

## Risks & Mitigations
- Risk: confusing duplicate lists → Mitigation: remove hidden lists
- Risk: missing history data → Mitigation: badge + action to collect
- Risk: noisy alerts → Mitigation: AI confidence and cooldown visibility

## Ownership & Sequencing
- Phase 1 before Phase 2
- Phase 2 before Phase 3
- Phase 4 can run in parallel after Phase 1
- Phase 5 is optional hardening after UX is stable

## Phase 1 — Concrete Checklist
**Scope:** Unify Monitor Pool = Whitelist, remove ambiguous behavior

### 1. Whitelist Source of Truth
- [ ] Remove ticker list from whitelist computation
  - File: gui/Dashboard/src/store/marketStore.js
  - Update: computeRequiredAssetKeys should only use Monitor Pool + selected asset
- [ ] Ensure update_active_ticker is called only from Monitor Pool changes
  - File: gui/Dashboard/src/store/marketStore.js
  - Update: applySubscriptions should be invoked when Monitor Pool changes

### 2. Monitor Pool Actions
- [ ] Add “Remove from Monitor” action on each asset row
  - File: gui/Dashboard/src/components/AnalysisPanel.jsx
  - UX: icon or inline action; remove from monitoringAssetKeys
- [ ] Add “Clear Monitor Pool” action with confirmation
  - File: gui/Dashboard/src/components/AnalysisPanel.jsx
  - UX: modal confirm, preserve selected asset

### 3. Explicit Status Badges
- [ ] Add Missing History badge per asset
  - Backend: use heartbeat payload assets_known vs assets_whitelisted
  - Frontend: flag asset as missing if not in assets_known
- [ ] Add Not Streaming badge
  - Frontend: compare last tick timestamp for asset
  - Use existing marketData timestamps in store

### 4. Monitoring Integrity Tests
- [ ] Add quick sanity checklist to QA spec
  - File: gui/Dashboard/tests/phase5.additional.qa.spec.js
  - Steps: add/remove assets, verify whitelist count, verify dispatcher active set

### 5. Logging & Error Feedback
- [ ] Log whitelist changes to alert-dispatch logs
  - Backend: log when ticker:active updates
  - Ensure log is visible in /alert-dispatch-logs

### Success Criteria
- [ ] Monitor Pool count == whitelist count
- [ ] Dispatcher Active ⊆ Monitor Pool
- [ ] No asset scans outside Monitor Pool
- [ ] Missing History and Not Streaming states are visible
