# Asset Selection Improvements Plan
**Date:** 2026-01-19  
**Status:** In Progress  
**Reference:** Investigation of SPECIFIC ASSET filter feature  
**Author:** @Team_Leader with @Investigator, @Coder, @Frontend-Specialist

---

## 1. Executive Summary

This plan addresses critical bugs discovered in the **Specific Asset Filter** feature and introduces a new **Quick-Add to Specific Assets** feature to improve the asset selection workflow.

### Issues Discovered
1. **CRITICAL:** Fuzzy click targeting causes wrong assets to be starred in Pocket Option
2. **CRITICAL:** Fuzzy target matching causes unintended asset matches
3. **HIGH:** `min_pct` input parameter is ignored (hardcoded to 92)
4. **MEDIUM:** No easy way to add assets to the Specific Assets filter from the list

### New Feature
- **Quick-Add Icons (Option A):** Add [+] and [—] buttons to each asset row for one-click Include/Ignore filtering

---

## 2. CORE_PRINCIPLES Alignment

| Principle | How This Plan Adheres |
|-----------|----------------------|
| #1 Functional Simplicity | Exact matching is simpler and more predictable than fuzzy matching |
| #3 Incremental Testing | Each fix has specific test criteria before proceeding |
| #5 Code Integrity | Bug fixes are backwards-compatible; no breaking changes |
| #6 Separation of Concerns | New UI components are extracted cleanly |
| #8 Defensive Error Handling | Fixes ensure correct asset is clicked, not silent wrong selection |
| #9 Fail Fast | Exact matching fails clearly when no match found |

---

## 3. Bug Analysis & Root Causes

### Bug #1: Fuzzy Click Targeting
**File:** `capabilities_v2/favorite_star_select.py`  
**Location:** `_click_star_by_label()` method, lines 461-463

**Current Code (Problematic):**
```javascript
if (rowLabel === targetLabel || normRowLabel === normTarget || 
    (normRowLabel.length > 3 && (normRowLabel.includes(normTarget) || normTarget.includes(normRowLabel)))) {
```

**Problem:** When clicking "EURUSDOTC", the function:
1. Finds "EURUSD" row first (non-OTC)
2. Checks: `"EURUSDOTC".includes("EURUSD")` → **TRUE**
3. Clicks wrong row (EURUSD instead of EURUSDOTC)
4. Records the intended label "EURUSDOTC" in `selected_now` regardless

**Impact:** User sees OTC label in QuFLX, but non-OTC asset is actually starred in Pocket Option.

---

### Bug #2: Fuzzy Target Matching
**File:** `capabilities_v2/favorite_star_select.py`  
**Location:** `_apply_selection_rules()` method, line 247

**Current Code (Problematic):**
```python
is_in_target = any(t in norm_label or norm_label in t for t in normalized_targets)
```

**Problem:** Bidirectional substring matching causes unintended matches:
- Target: "EURUSDOTC"
- Asset: "EURUSD"  
- Check: `"EURUSD" in "EURUSDOTC"` → **TRUE**

**Impact:** Non-target assets incorrectly match and may be affected by Include/Ignore logic.

---

### Bug #3: `min_pct` Input Ignored
**File:** `capabilities_v2/favorite_star_select.py`  
**Location:** Line 79

**Current Code (Problematic):**
```python
min_pct: int = 92  # Hardcoded, ignores input!
```

**Problem:** The `min_pct` value from the frontend is passed through the backend but never read from `inputs` dict.

**Impact:** User changes to "Min Payout %" slider have no effect.

---

## 4. Implementation Phases

### Phase 0: Pre-Implementation Setup
**Goal:** Establish baseline and backup current state

- [ ] **0.1: Create Git Branch**
  - `git checkout -b feature/asset-selection-improvements`
  - **Test:** Verify branch created with `git branch`

- [ ] **0.2: Backup Critical Files**
  - Copy current versions to `_backups/2026-01-19/`:
    - `capabilities_v2/favorite_star_select.py`
    - `gui/Dashboard/src/components/AssetListView.jsx`
    - `gui/Dashboard/src/components/AssetPanel.jsx`
  - **Test:** Verify backups exist and are readable

---

### Phase 1: Fix `min_pct` Input Reading (Priority 0 - CRITICAL)
**Goal:** Ensure Min Payout setting is respected  
**Estimated Time:** 5 minutes

- [ ] **1.1: Read `min_pct` from inputs**
  - **File:** `capabilities_v2/favorite_star_select.py`
  - **Line:** 79
  - **BEFORE:**
    ```python
    min_pct: int = 92
    ```
  - **AFTER:**
    ```python
    min_pct: int = int(inputs.get("min_pct", 92))
    ```
  - **Test:** 
    - Set Min Payout to 80% in Dashboard
    - Click "Get Assets"
    - Verify backend logs show `min_pct=80`

---

### Phase 2: Fix Fuzzy Target Matching (Priority 0 - CRITICAL)
**Goal:** Ensure only exact asset matches are recognized as targets  
**Estimated Time:** 15 minutes

- [ ] **2.1: Replace fuzzy matching with exact matching**
  - **File:** `capabilities_v2/favorite_star_select.py`
  - **Location:** `_apply_selection_rules()` method, line 247
  - **BEFORE:**
    ```python
    is_in_target = any(t in norm_label or norm_label in t for t in normalized_targets)
    ```
  - **AFTER:**
    ```python
    is_in_target = norm_label in normalized_targets
    ```
  - **Test:**
    - Set specific assets: "EURUSDOTC"
    - OTC ONLY: ON
    - Mode: INCLUDE
    - Click "Get Assets"
    - Verify "EURUSD" (non-OTC) is NOT matched as a target
    - Verify "EURUSDOTC" IS matched as a target

- [ ] **2.2: Add debug logging for target matching**
  - **File:** `capabilities_v2/favorite_star_select.py`
  - **Action:** Add logging when target matching occurs
    ```python
    if target_assets:
        is_in_target = norm_label in normalized_targets
        if is_in_target:
            logger.info(f"EXACT MATCH: '{norm_label}' found in targets")
        # Remove or comment out old fuzzy matching debug logs
    ```
  - **Test:** Verify logs show "EXACT MATCH" only for exact matches

---

### Phase 3: Fix Fuzzy Click Targeting (Priority 0 - CRITICAL)
**Goal:** Ensure the correct row is clicked when starring assets  
**Estimated Time:** 30 minutes

- [ ] **3.1: Replace fuzzy click matching with exact-first strategy**
  - **File:** `capabilities_v2/favorite_star_select.py`
  - **Location:** `_click_star_by_label()` JavaScript code, lines 430-500
  - **Strategy:** 
    1. First pass: look for exact match only
    2. If no exact match found, then try fuzzy match (fallback for platform display variations)
  - **BEFORE (simplified):**
    ```javascript
    if (rowLabel === targetLabel || normRowLabel === normTarget || 
        (normRowLabel.length > 3 && (normRowLabel.includes(normTarget) || normTarget.includes(normRowLabel)))) {
        // Click immediately
    }
    ```
  - **AFTER:**
    ```javascript
    // Two-pass approach: exact match first, then fuzzy fallback
    let bestMatch = null;
    let bestMatchType = null;
    
    for (const row of rows) {
        // ... extract rowLabel and normRowLabel ...
        
        // Check for exact match (highest priority)
        if (rowLabel === targetLabel || normRowLabel === normTarget) {
            bestMatch = row;
            bestMatchType = 'exact';
            break; // Found exact, stop searching
        }
        
        // Store fuzzy match candidate (only if no exact found yet)
        if (!bestMatch && normRowLabel.length > 3) {
            if (normRowLabel.includes(normTarget) || normTarget.includes(normRowLabel)) {
                bestMatch = row;
                bestMatchType = 'fuzzy';
                // Don't break - keep looking for exact match
            }
        }
    }
    
    if (bestMatch) {
        debug.match_type = bestMatchType;
        // ... click bestMatch ...
    }
    ```
  - **Test:**
    - Specify "EURUSDOTC" in specific assets
    - Click "Get Assets" 
    - Watch Pocket Option dropdown
    - Verify "EURUSD OTC" row is starred (not "EURUSD")

- [ ] **3.2: Add match type to debug output**
  - **Action:** Include `match_type: 'exact' | 'fuzzy'` in debug result
  - **Test:** Check backend logs for match type information

---

### Phase 4: New Feature - Quick-Add Icons (Priority 1 - Enhancement)
**Goal:** Add [+] and [—] icons to each asset row for one-click filtering  
**Estimated Time:** 1 hour

#### 4.1: Update AssetPanel State Management

- [ ] **4.1.1: Add helper functions to manage specific assets list**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx`
  - **Action:** Add functions to add/remove assets from specificAssets
    ```javascript
    const addToSpecificAssets = (asset, mode) => {
      const currentAssets = specificAssets
        .split(/[,\s;]+/)
        .map(a => a.trim())
        .filter(Boolean);
      
      if (!currentAssets.includes(asset)) {
        const newList = [...currentAssets, asset].join(', ');
        setSpecificAssets(newList);
        setSpecificAssetMode(mode);
      }
    };
    
    const removeFromSpecificAssets = (asset) => {
      const currentAssets = specificAssets
        .split(/[,\s;]+/)
        .map(a => a.trim())
        .filter(a => a && a !== asset);
      setSpecificAssets(currentAssets.join(', '));
    };
    
    const isAssetInFilter = (asset) => {
      const currentAssets = specificAssets
        .split(/[,\s;]+/)
        .map(a => a.trim())
        .filter(Boolean);
      return currentAssets.includes(asset);
    };
    ```
  - **Test:** Console log verification of state updates

#### 4.2: Update AssetListView Component

- [ ] **4.2.1: Add new props to AssetListView**
  - **File:** `gui/Dashboard/src/components/AssetListView.jsx`
  - **Action:** Add props for quick-add functionality
    ```javascript
    const AssetListView = ({
      // ... existing props ...
      onAddToInclude,      // NEW: (asset) => void
      onAddToIgnore,       // NEW: (asset) => void
      onRemoveFromFilter,  // NEW: (asset) => void
      isAssetInFilter,     // NEW: (asset) => boolean
      specificAssetMode,   // NEW: 'include' | 'ignore'
    }) => {
    ```

- [ ] **4.2.2: Add quick-add icons to asset row**
  - **File:** `gui/Dashboard/src/components/AssetListView.jsx`
  - **Action:** Add [+] and [—] buttons next to each asset
    ```jsx
    import { Plus, Minus, Check } from 'lucide-react';
    
    // Inside the asset row mapping:
    <div className="flex items-center gap-1">
      {isAssetInFilter(asset) ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromFilter(asset);
          }}
          className="w-5 h-5 flex items-center justify-center rounded 
                     bg-accent-green/20 text-accent-green border border-accent-green/50
                     hover:bg-accent-green/30 transition-colors"
          title={`In ${specificAssetMode.toUpperCase()} filter - click to remove`}
        >
          <Check size={12} />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToInclude(asset);
            }}
            className="w-5 h-5 flex items-center justify-center rounded 
                       bg-section-bg/50 text-text-secondary border border-border-primary
                       hover:bg-accent-green/20 hover:text-accent-green hover:border-accent-green/50 
                       transition-colors"
            title="Add to INCLUDE filter"
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToIgnore(asset);
            }}
            className="w-5 h-5 flex items-center justify-center rounded 
                       bg-section-bg/50 text-text-secondary border border-border-primary
                       hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 
                       transition-colors"
            title="Add to IGNORE filter"
          >
            <Minus size={12} />
          </button>
        </>
      )}
    </div>
    ```
  - **Test:** Visual verification of icons rendering

- [ ] **4.2.3: Wire props in AssetPanel**
  - **File:** `gui/Dashboard/src/components/AssetPanel.jsx`
  - **Action:** Pass the new props to AssetListView
    ```jsx
    <AssetListView
      // ... existing props ...
      onAddToInclude={(asset) => addToSpecificAssets(asset, 'include')}
      onAddToIgnore={(asset) => addToSpecificAssets(asset, 'ignore')}
      onRemoveFromFilter={removeFromSpecificAssets}
      isAssetInFilter={isAssetInFilter}
      specificAssetMode={specificAssetMode}
    />
    ```
  - **Test:** 
    - Click [+] on an asset → asset appears in Specific Assets field
    - Mode switches to INCLUDE
    - Asset row shows checkmark
    - Click checkmark → asset removed from filter

---

### Phase 5: Integration Testing
**Goal:** Verify end-to-end flow works correctly  
**Estimated Time:** 30 minutes

- [ ] **5.1: OTC Filter + Specific Assets Test**
  - **Setup:**
    - OTC ONLY: ON
    - Specific Assets: "EURUSDOTC, AUDNZDOTC"
    - Mode: INCLUDE
  - **Test:**
    1. Click "Get Assets"
    2. Verify ONLY OTC assets matching the exact names are starred
    3. Verify NO non-OTC assets are starred
    4. Verify QuFLX list shows OTC names correctly

- [ ] **5.2: Ignore Mode Test**
  - **Setup:**
    - OTC ONLY: ON
    - Specific Assets: "EURUSDOTC"
    - Mode: IGNORE
  - **Test:**
    1. Click "Get Assets"
    2. Verify EURUSDOTC is NOT in the starred list
    3. Verify other OTC assets with 92%+ payout ARE starred

- [ ] **5.3: Quick-Add Workflow Test**
  - **Test:**
    1. Clear Specific Assets field
    2. Click [+] on GBPUSDOTC → verify it appears in Specific Assets
    3. Click [—] on AUDJPYOTC → verify it appears and mode switches to IGNORE
    4. Click checkmark to remove → verify it's removed from field
    5. Click "Get Assets" → verify filter applies correctly

- [ ] **5.4: Min Payout Test**
  - **Setup:**
    - Set Min Payout: 80%
    - OTC ONLY: ON
  - **Test:**
    1. Click "Get Assets"
    2. Verify assets with payout >= 80% are starred (not just 92%)

---

### Phase 6: Documentation & Cleanup
**Goal:** Update docs and merge to main  
**Estimated Time:** 15 minutes

- [ ] **6.1: Update related documentation**
  - Files to review/update:
    - `v2_Dev_Docs/Automation_Architecture_Plan.md`
    - `v2_Dev_Docs/DATA_SOURCE_Panel_Fix_Plan_26-01-18.md`

- [ ] **6.2: Git Commit & PR**
  - Commit message: `fix(assets): exact matching for specific assets + quick-add feature`
  - Create PR with link to this plan

---

## 5. Files Modified Summary

| File | Changes |
|------|---------|
| `capabilities_v2/favorite_star_select.py` | Fix `min_pct` reading, exact target matching, exact click targeting |
| `gui/Dashboard/src/components/AssetPanel.jsx` | Add helper functions for specific assets management |
| `gui/Dashboard/src/components/AssetListView.jsx` | Add quick-add icons [+] [—] to each asset row |

---

## 6. Rollback Plan

If critical issues are discovered post-merge:

1. **Immediate:** Revert merge commit
2. **Restore:** Copy backup files from Phase 0.2
3. **Investigate:** Review logs and error reports
4. **Fix:** Address issues in feature branch
5. **Re-test:** Complete Phase 5 again before re-merge

---

## 7. Success Criteria

### Bug Fixes
- [ ] Specific asset filter uses exact matching only
- [ ] Click targeting uses exact-first strategy
- [ ] Min Payout setting is respected
- [ ] OTC filter works correctly with specific assets

### New Feature
- [ ] [+] button adds asset to INCLUDE filter
- [ ] [—] button adds asset to IGNORE filter  
- [ ] Checkmark shows when asset is in filter
- [ ] Click checkmark removes asset from filter
- [ ] Filter changes are reflected in Specific Assets field

### CORE_PRINCIPLES Compliance
- [ ] No silent failures (Principle #8)
- [ ] Fail fast with clear errors (Principle #9)
- [ ] Clean separation of UI and logic (Principle #6)
- [ ] All tests pass before proceeding (Principle #3)

---

## 8. Status Legend

- `[x]` Completed and tested
- `[~]` In progress
- `[ ]` Not started

---

**Plan Compiled by:** @Team_Leader  
**Date:** 2026-01-19  
**Approval Required Before Implementation:** User confirmation to proceed
