# Code Cleanup & Refactoring Checklist
**Date:** 2026-02-17  
**Author:** Architecture Review  
**Status:** Ready for Implementation  
**Prerequisites:** Strategy Lab Chart Separation Plan should be completed first

---

## 📋 Overview

This checklist tracks code that should be deprecated, refactored, or cleaned up after the chart fixes and Strategy Lab chart separation. Items are prioritized by impact and effort.

---

## ✅ COMPLETED (No Action Needed)

These were already fixed by the coding agent on 2026-02-17:

| # | File | Change | Status |
|---|------|--------|--------|
| 1 | `indicator_calculator.py` | Removed dead `ema_165` reference | ✅ Done |
| 2 | `ChartWorkspace.jsx` | Added initial history load useEffect | ✅ Done |
| 3 | `useTickAggregation.js` | Added 10-second loading timeout | ✅ Done |
| 4 | `marketStore.js` | Added `lastTickTimestamp: null` to initial state | ✅ Done |

---

## 🔴 HIGH PRIORITY (Do After Strategy Lab Chart Separation)

### 1. Remove `csvMode` Logic from ChartWorkspace.jsx
**File:** `gui/Dashboard/src/components/ChartWorkspace.jsx`  
**Effort:** 30 minutes  
**Risk if Skipped:** Dead code paths, developer confusion, potential bugs

**Lines to Remove:**
```jsx
// DELETE THESE (~30 lines total):
const csvMode = !!selectedStrategyFileId;

const labFile = useMemo(() =>
  csvMode ? strategyLabFiles.find(f => f.file_id === selectedStrategyFileId) : null,
  [csvMode, strategyLabFiles, selectedStrategyFileId]);

const effectiveHistoryCandles = useMemo(() => {
  if (!csvMode || !selectedStrategyFileId || !strategyLabData[selectedStrategyFileId]) {
    return historyCandles;
  }
  return { [selectedAsset]: strategyLabData[selectedStrategyFileId] };
}, [csvMode, selectedStrategyFileId, strategyLabData, historyCandles, selectedAsset]);

const effectiveHistoryStatus = useMemo(() => {
  if (!csvMode) return historyStatus;
  return { [selectedAsset]: 'loaded' };
}, [csvMode, historyStatus, selectedAsset]);

const effectiveEnableStreaming = csvMode ? false : (dataSourceMode !== 'history_only');
```

**Also Remove from Destructuring:**
```jsx
// Remove these from useMarketStore destructuring:
selectedStrategyFileId,
strategyLabFiles,
strategyLabData,
```

**Replace With:**
```jsx
const enableStreaming = dataSourceMode !== 'history_only';

// Use historyCandles and historyStatus directly (no effective* wrappers)
const { isLoading } = useTickAggregation({
  historyCandles,      // Direct
  historyStatus,       // Direct
  enableStreaming,     // Direct
  ...
});
```

**Verification:**
- [ ] Live chart loads history correctly
- [ ] Streaming updates work
- [ ] No console errors
- [ ] No references to `csvMode` remain in file

---

### 2. Remove Lab-Related Props from useChartMarkers
**File:** `gui/Dashboard/src/hooks/useChartMarkers.js`  
**Effort:** 15 minutes

**Current:**
```jsx
useChartMarkers({
  mainChart,
  candleSeries,
  aiMessages,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
  onError,
  labEntries: labFile?.entries || []  // ← REMOVE THIS
});
```

**After:**
```jsx
useChartMarkers({
  mainChart,
  candleSeries,
  aiMessages,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
  onError
  // labEntries removed — Lab chart has its own marker hook
});
```

---

## 🟡 MEDIUM PRIORITY (Technical Debt)

### 3. Consolidate Timestamp Normalization
**Files Affected:**
- `gui/Dashboard/src/hooks/useTickAggregation.js`
- `gui/Dashboard/src/store/marketStore.js`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabChart.jsx` (future)

**Effort:** 1 hour  
**Risk if Skipped:** Data misalignment bugs, duplicated logic

**Create Shared Utility:**
```jsx
// gui/Dashboard/src/utils/time.js

/**
 * Normalize timestamp to Unix seconds.
 * Handles both milliseconds and seconds timestamps.
 * @param {number|string} ts - Timestamp in ms or seconds
 * @returns {number|null} Unix timestamp in seconds, or null if invalid
 */
export const normalizeTimestamp = (ts) => {
  const numeric = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(numeric)) return null;
  // If > year 2286 in seconds, it's milliseconds
  const seconds = numeric > 10000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  return Number.isFinite(seconds) ? seconds : null;
};

/**
 * Normalize timestamp for lightweight-charts (requires integer seconds)
 * @param {number|string} ts - Timestamp
 * @returns {number} Unix timestamp in seconds
 */
export const toChartTime = (ts) => {
  const normalized = normalizeTimestamp(ts);
  return normalized || 0;
};
```

**Update useTickAggregation.js:**
```jsx
// Before:
const normalizeEpochSeconds = (value) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const seconds = numeric > 10000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  return Number.isFinite(seconds) ? seconds : null;
};

// After:
import { normalizeTimestamp } from '../utils/time';
// Replace all normalizeEpochSeconds calls with normalizeTimestamp
```

**Update marketStore.js:**
```jsx
// In setSelectedStrategyFileId:
import { normalizeTimestamp } from '../utils/time';

const normalizedCandles = (data.candles || []).map(c => ({
  ...c,
  time: normalizeTimestamp(c.timestamp || c.time),
  // ...
}));
```

**Verification:**
- [ ] Create `utils/time.js`
- [ ] Update `useTickAggregation.js` to use shared utility
- [ ] Update `marketStore.js` to use shared utility
- [ ] Test chart data loads correctly
- [ ] Test timestamps align with candles

---

### 4. Replace Hardcoded URLs with `getApiBaseUrl()`
**Files Affected:**
- `gui/Dashboard/src/store/marketStore.js` (multiple fetch calls)
- `gui/Dashboard/src/components/StrategyLabPanel.jsx`

**Effort:** 30 minutes  
**Risk if Skipped:** Production breakage, deployment issues

**Check if `getApiBaseUrl` exists:**
```jsx
// Look for existing utility in:
// gui/Dashboard/src/api/config.js or similar
```

**If not, create it:**
```jsx
// gui/Dashboard/src/api/config.js

export const getApiBaseUrl = () => {
  // Check for environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Default to localhost for development
  return 'http://localhost:8000';
};

export const apiFetch = (path, options = {}) => {
  return fetch(`${getApiBaseUrl()}${path}`, options);
};
```

**Update marketStore.js:**
```jsx
// Before:
const res = await fetch('http://localhost:8000/api/v1/history/...');

// After:
import { getApiBaseUrl } from '../api/config';
const res = await fetch(`${getApiBaseUrl()}/api/v1/history/...`);
```

**Files to Update:**
- [ ] `marketStore.js` — `loadHistory` function
- [ ] `marketStore.js` — `loadIndicators` function
- [ ] `marketStore.js` — `setSelectedTimeframe` function
- [ ] `marketStore.js` — `syncTimeframeUi` function
- [ ] `marketStore.js` — `refreshAssets` function
- [ ] `marketStore.js` — `collectHistory` function
- [ ] `marketStore.js` — `startAlerts` / `stopAlerts` / `checkAlertsStatus`
- [ ] `marketStore.js` — `startChrome` / `startStream` / `pauseStream`
- [ ] `StrategyLabPanel.jsx` — all fetch calls

---

### 5. Fix `createTickerSlice` Signature for Consistency
**File:** `gui/Dashboard/src/store/marketStore.js`  
**Effort:** 5 minutes

**Current:**
```jsx
const createTickerSlice = () => ({
  marketData: {},
  // ...
});
```

**Should Be:**
```jsx
const createTickerSlice = (set) => ({
  marketData: {},
  // ...
});
```

**Note:** Even if `set` isn't used, the signature should match other slices for consistency. This is a minor style fix.

---

## 🟢 LOW PRIORITY (Nice to Have)

### 6. Add Retry Logic to `loadHistory`
**File:** `gui/Dashboard/src/store/marketStore.js`  
**Effort:** 30 minutes

**Current:** Single attempt, fails permanently on network error.

**Suggested:**
```jsx
loadHistory: async (asset, retryCount = 0) => {
  // ... existing code ...
  
  try {
    // ... existing fetch logic ...
  } catch (err) {
    // Retry up to 2 times for transient errors
    if (retryCount < 2 && err.message?.includes('Network')) {
      console.warn(`[LoadHistory] Retrying (${retryCount + 1}/2) for ${asset}...`);
      await new Promise(r => setTimeout(r, 1000)); // Wait 1s
      return get().loadHistory(asset, retryCount + 1);
    }
    
    // ... existing error handling ...
  }
}
```

---

### 7. Add Asset Validation on Startup
**File:** `gui/Dashboard/src/components/Dashboard.jsx`  
**Effort:** 15 minutes

**Purpose:** Reset to valid asset if persisted asset is no longer available.

```jsx
// In Dashboard.jsx, add to existing useEffect or create new:
useEffect(() => {
  const { selectedAsset, payoutAssets, setSelectedAsset } = useMarketStore.getState();
  
  // If we have assets loaded and persisted asset isn't in list, reset
  if (payoutAssets.length > 0 && selectedAsset && !payoutAssets.includes(selectedAsset)) {
    console.warn(`Persisted asset ${selectedAsset} not in payout list, resetting...`);
    setSelectedAsset(payoutAssets[0]);
  }
}, [payoutAssets]); // Run when payout assets are loaded
```

---

### 8. Add Request Cancellation for Indicator Loading
**File:** `gui/Dashboard/src/hooks/useChartWorkspaceIndicators.js`  
**Effort:** 45 minutes

**Issue:** Rapid asset switches could cause race conditions.

**Suggested:**
```jsx
useEffect(() => {
  let cancelled = false;
  
  const load = async () => {
    // ... existing logic ...
    if (cancelled) return; // Check before state updates
    // ... setState calls ...
  };
  
  load();
  
  return () => {
    cancelled = true;
  };
}, [dependencies]);
```

---

## 📊 Summary Table

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 1 | Remove `csvMode` logic from ChartWorkspace | 🔴 High | 30 min | ⏳ Pending |
| 2 | Remove `labEntries` from useChartMarkers | 🔴 High | 15 min | ⏳ Pending |
| 3 | Consolidate timestamp normalization | 🟡 Medium | 1 hr | ⏳ Pending |
| 4 | Replace hardcoded URLs | 🟡 Medium | 30 min | ⏳ Pending |
| 5 | Fix createTickerSlice signature | 🟡 Medium | 5 min | ⏳ Pending |
| 6 | Add retry to loadHistory | 🟢 Low | 30 min | ⏳ Pending |
| 7 | Add asset validation on startup | 🟢 Low | 15 min | ⏳ Pending |
| 8 | Add request cancellation | 🟢 Low | 45 min | ⏳ Pending |

**Total Estimated Effort:** ~3.5 hours

---

## ⚠️ Implementation Order

```
Phase 1 (After Strategy Lab Chart Separation):
├── Task 1: Remove csvMode logic
└── Task 2: Remove labEntries from useChartMarkers

Phase 2 (Technical Debt Cleanup):
├── Task 3: Consolidate timestamp normalization
├── Task 4: Replace hardcoded URLs
└── Task 5: Fix createTickerSlice signature

Phase 3 (Optional Enhancements):
├── Task 6: Add retry to loadHistory
├── Task 7: Add asset validation
└── Task 8: Add request cancellation
```

---

## 🧪 Verification Checklist

After completing all tasks:

```
□ Live chart loads history correctly
□ Streaming updates work in real-time
□ Asset switching works smoothly
□ Indicators load and display correctly
□ No hardcoded localhost URLs remain
□ No csvMode references in ChartWorkspace
□ No console errors
□ No TypeScript/ESLint warnings
□ All tests pass (if any exist)
```

---

*Last updated: 2026-02-17*