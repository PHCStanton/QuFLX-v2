# Implementation Plan: DATA SOURCE Panel & Asset Management Fixes

**Date:** 2026-01-18  
**Reference Report:** `reports/report_2026-01/report_data_source_panel_25-01-18.md`  
**Status:** [x] Completed

---

## 🎯 Goal
Resolve critical backend bugs, synchronize frontend/backend state, eliminate dead UI elements, and refactor the `AssetPanel` component for long-term maintainability.

## 📋 Phase 1: Critical & Structural Fixes (Priority 0)
*Focus on restoring core functionality and state integrity.*

- [x] **1.1: Fix Backend Variable Name Bug**
  - **File:** `backend/services/gateway/routes/assets.py`
  - **Action:** Replace `process.returncode` with `process_result.returncode`.
  - **Verification:** Ran `python -m py_compile backend/services/gateway/routes/assets.py`.

- [x] **1.2: Align Store State Schema**
  - **File:** `gui/Dashboard/src/store/marketStore.js`
  - **Action:** Add `minPayout: 92` to the default `assetFilterState` object.
  - **Verification:** Verified store payload uses `minPayout` default.

- [x] **1.3: Clean Up Deprecated "Zombie" Code**
  - **File:** `gui/Dashboard/src/store/marketStore.js`
  - **Action:** Remove `syncAssetUi` function and all associated deprecated comments.
  - **Verification:** Ensure no other component imports or calls `syncAssetUi`.

- [x] **1.4: Remove "Asset Run" Button & Batch Automation**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx`, `gui/Dashboard/src/store/marketStore.js`
  - **Action:** Remove the Asset Run UI control and its store implementation.
  - **Verification:** Confirmed no remaining references to `runAssetBatch`.

## 📋 Phase 2: UI Integrity & Feedback (Priority 1)
*Improve user experience and adhere to CORE_PRINCIPLES #8 (Zero Silent Failures).*

- [x] **2.1: Address "Upload CSV" Dead Button**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx`
  - **Action:** Either implement a basic file picker or disable/remove the button until functionality is ready.
  - **Verification:** Button is disabled with explicit tooltip.

- [x] **2.2: Implement "Live Feed" Toggle**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx`
  - **Action:** Wire the panel indicator to real stream state (no hardcoded `true`).
  - **Verification:** Implemented Option A: Topbar Stream is the only start/pause control; panel shows read-only stream status.

- [x] **2.3: Integrate Toast Notifications**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx` (or a global Layout wrapper)
  - **Action:** Ensure `lastError` from the store triggers a user-visible notification (Toast/Banner).
  - **Verification:** Added global toast for `lastError`.

## 📋 Phase 3: Architectural Refactoring (Priority 2)
*Apply CORE_PRINCIPLES #6 (Separation of Concerns) to the monolithic AssetPanel.*

- [x] **3.1: Extract `DataSourceControls` Component**
  - **Action:** Move the top portion (ActionButtons, Auto Refresh toggle, OTC toggle) to a new file.
- [x] **3.2: Extract `AssetFilterGroup` Component**
  - **Action:** Move the input fields (Max Assets, Min Payout, Specific Assets) to a new file.
- [x] **3.3: Extract `AssetListView` Component**
  - **Action:** Move the asset search and scrollable list to a new file.
- [x] **3.4: Final Orchestration in `AssetPanel.jsx`**
  - **Action:** Update `AssetPanel.jsx` to be a lightweight container for these sub-components.

## 📋 Phase 4: Final Verification
- [x] **4.1: End-to-End Smoke Test**
  - Launch all services.
  - Perform asset refresh with different payout thresholds.
  - Verify state persistence across tab switches.
- [ ] **4.2: Lint & Build Check**
- [x] **4.2: Lint & Build Check**
  - Ran `npm run lint` and `npm run build` in `gui/Dashboard`.

---

## 📈 Completion Status Legend
- `[x]` Completed
- `[~]` In progress / Partial
- `[ ]` Not started

---
**Approval Signature:**  
👔 *Team_Leader*
