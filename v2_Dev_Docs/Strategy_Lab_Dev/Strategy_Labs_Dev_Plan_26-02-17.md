# Strategy Lab — Full Rewrite & Enhancement Dev Plan
**Date:** 2026-02-17  
**Author:** Team Leader (Agent Assessment)  
**Status:** Approved for Implementation  
**Supersedes:** `Market_Warnings_Strategy_Lab_Dev_Plan.md` (partial — volatility fixes already applied to `regime_detector.py`)

---

## 📋 Executive Summary

A comprehensive code audit of `StrategyLabPanel.jsx` and its supporting backend/store code revealed **20 issues across 5 layers** — including critical bugs that prevent the Market Warnings feature from functioning, chart rendering race conditions, loading state conflicts, memory leaks, and Core Principle violations.

**Decision: CLEAN REWRITE** (Core Principle #7 triggered)

The current 350+ LOC monolith violates Separation of Concerns, has triple-nested loading state conflicts, race conditions in chart rendering, and silently swallows errors. Patching would require touching 15+ locations and risk introducing new regressions. A clean rewrite into focused, testable modules is faster, safer, and more maintainable.

---

## 🔍 Audit Findings Summary

### 🔴 Critical Bugs (5)
| # | Bug | Impact |
|---|-----|--------|
| 1 | **Market Warning messages NEVER displayed** — Backend sends `technicals.warning` + `technicals.message` but frontend ignores them | Users can't see WHY market is blocked — defeats the entire Market Warnings feature |
| 2 | **Loading state race condition** — 3 functions (`handleFileUpload`, `analyzeRegime`, `identifyEntries`) each independently toggle `loading` boolean | Spinner appears/disappears erratically; premature loading dismissal |
| 3 | **Chart markers set before data loads** — `useEffect` sets markers on empty series, then calls `fetchFullData` async | Entry arrows may not render on chart |
| 4 | **Chart memory leak** — No cleanup return in chart `useEffect` | DOM nodes + event listeners leak on unmount |
| 5 | **First CollapsibleCard has no children** — Self-closing tag renders empty collapsible body | Confusing UX — chevron toggles nothing |

### 🟡 API Contract Misalignments (3)
| # | Issue | Location |
|---|-------|----------|
| 1 | Hardcoded `http://localhost:8000` in `marketStore.js` vs `getApiBaseUrl()` in panel | `createStrategyLabSlice` → `setSelectedStrategyFileId` |
| 2 | Timestamp format mismatch — entries use ISO strings, candles use raw numeric | Markers may not align with candle times |
| 3 | Backend `/analyze` returns warning data in `technicals` that frontend never reads | `regime_detector.py` → `StrategyLabPanel.jsx` |

### 🟠 Core Principle Violations (5)
| Principle | Violation |
|-----------|-----------|
| #8 Zero Silent Failures | `aiAnalyze` and `fetchFullData` catch errors with only `console.error` |
| #9 Fail Fast | No validation of response shapes before accessing `stats.win_rate`, `stats.profit_loss` |
| #6 Separation of Concerns | Single 350+ LOC component handles upload, analysis, charting, AI, and display |
| #5 Backward Compatibility | `handleReset` never calls `/cleanup/{file_id}` — temp files accumulate |
| #7 Stop Patching | 20 issues across 5 layers → rewrite is mandatory |

### 🔵 Feature Gaps vs Original Dev Plan (7)
| Feature | Status |
|---------|--------|
| Indicator Overlays (EMA, BB, ATR) | ❌ Missing |
| Regime Background Zones | ❌ Missing |
| Market Warnings Display | ❌ Missing (backend ready, frontend ignores) |
| Backtest P&L Curve | ❌ Missing |
| Per-Regime Performance | ❌ Missing |
| Temp File Cleanup | ❌ Missing |
| Chart Resize Handling | ❌ Missing |

---

## 🏗️ Rewrite Architecture

### New File Structure
```
gui/Dashboard/src/
├── components/
│   └── StrategyLab/
│       ├── StrategyLabPanel.jsx          # Orchestrator (~80 LOC)
│       ├── StrategyLabUpload.jsx         # Upload zone + drag/drop (~60 LOC)
│       ├── StrategyLabFileInfo.jsx       # File info display (~30 LOC)
│       ├── StrategyLabWarnings.jsx       # Market warnings display (NEW ~50 LOC)
│       ├── StrategyLabRegime.jsx         # Regime card + stats (~80 LOC)
│       ├── StrategyLabChart.jsx          # Chart with proper lifecycle (~100 LOC)
│       ├── StrategyLabEntries.jsx        # Entry signals table (~70 LOC)
│       └── StrategyLabAiInsights.jsx     # AI analysis card (~50 LOC)
├── hooks/
│   └── useStrategyLab.js                # All API calls + state machine (~120 LOC)
```

### State Machine (replaces boolean `loading`)
```
                    ┌──────────┐
                    │   idle   │ ← initial / after reset
                    └────┬─────┘
                         │ upload file
                    ┌────▼─────┐
                    │ uploading│
                    └────┬─────┘
                         │ success
                    ┌────▼──────┐
                    │ analyzing │ ← regime detection
                    └────┬──────┘
                    ┌────┴────┐
              tradeable    not tradeable
                    │         │
              ┌─────▼───┐  ┌─▼────────┐
              │ entries  │  │ warnings │ ← NEW: show WHY blocked
              └────┬─────┘  └──────────┘
                   │ 
              ┌────▼────┐
              │ ai_analysis │
              └────┬────┘
                   │
              ┌────▼────┐
              │  done   │
              └─────────┘
              
        Any state → error (with phase info)
```

### Key Design Decisions

1. **Custom Hook `useStrategyLab`** — All API calls, state transitions, and error handling in one place. Components are pure display.

2. **Phase-based loading** — Each phase (`uploading`, `analyzing`, `entries`, `ai_analysis`) is tracked explicitly. UI shows contextual loading messages ("Detecting market regime...", "Identifying entry signals...").

3. **Warnings as first-class data** — When regime detector returns NEUTRAL with warning info, the hook extracts `technicals.warning`, `technicals.message`, and `technicals.atr_percent` / `technicals.bb_width` into a dedicated `warnings` state array.

4. **Chart lifecycle managed by dedicated component** — `StrategyLabChart.jsx` owns the chart instance, handles create/destroy/resize, and receives data + entries as props. No race conditions.

5. **Markers set AFTER data** — Chart component waits for both candle data AND entries before rendering markers. Uses a single `useEffect` with both dependencies.

6. **Cleanup on unmount AND reset** — Calls `/cleanup/{file_id}` when resetting or unmounting.

---

## 📐 Implementation Plan

### Phase 1: Custom Hook + State Machine (Foundation)
**Agent:** Frontend Specialist  
**Estimated:** 1.5 hours  
**File:** `gui/Dashboard/src/hooks/useStrategyLab.js`

**Responsibilities:**
- `phase` state machine: `idle → uploading → analyzing → (entries | warnings) → ai_analysis → done`
- `error` state with phase context: `{ message, phase }`
- `uploadFile(file)` — validates CSV, calls `/upload`, transitions to `analyzing`
- `analyzeRegime(fileId)` — calls `/analyze`, extracts warnings if NEUTRAL, transitions appropriately
- `identifyEntries(fileId)` — calls `/entries`, transitions to `ai_analysis`
- `runAiAnalysis(fileId, stats, regime)` — calls `/ai-analyze`, transitions to `done`
- `fetchChartData(fileId)` — calls `/data/{fileId}`, normalizes timestamps
- `reset()` — calls `/cleanup/{fileId}`, resets all state
- `promoteToMainChart()` — calls store's `setSelectedStrategyFileId` + `setSelectedAsset`
- All API calls use `getApiBaseUrl()` (no hardcoded URLs)
- All errors surfaced to user (no silent `console.error`)

**State shape:**
```js
{
  phase: 'idle' | 'uploading' | 'analyzing' | 'entries' | 'ai_analysis' | 'done' | 'error',
  fileInfo: { name, rows, dateRange, fileId } | null,
  regime: { regime, confluence_score, direction, is_tradeable, technicals } | null,
  warnings: [{ type, message, severity, technicals }],
  entries: [],
  stats: null,
  aiAnalysis: null,
  chartData: [],  // normalized candles
  error: { message, phase } | null,
}
```

### Phase 2: Component Rewrite (UI Layer)
**Agent:** Frontend Specialist + UI Designer  
**Estimated:** 2.5 hours

#### 2a. `StrategyLabPanel.jsx` — Orchestrator (~80 LOC)
- Imports and uses `useStrategyLab` hook
- Renders child components based on `phase`
- Passes data down as props (no child API calls)
- Handles layout (flex column with gap)

#### 2b. `StrategyLabUpload.jsx` — Upload Zone (~60 LOC)
- Drag/drop + file input
- Calls `hook.uploadFile(file)` on drop/select
- Shows error if present and phase is `uploading`
- Debounced drag events (prevent excessive re-renders)

#### 2c. `StrategyLabFileInfo.jsx` — File Info (~30 LOC)
- Displays filename, row count, date range
- Shows phase-contextual loading message:
  - `analyzing` → "Detecting market regime..."
  - `entries` → "Identifying entry signals..."
  - `ai_analysis` → "Running AI analysis..."

#### 2d. `StrategyLabWarnings.jsx` — Market Warnings (NEW ~50 LOC)
- Renders when `warnings.length > 0`
- Color-coded by severity (yellow/orange/red)
- Shows warning type icon + message + technical values
- Warning types: `low_volatility`, `tight_range`, `choppy`
- Actionable recommendation: "Wait for better conditions" / "Market too quiet for reliable signals"

#### 2e. `StrategyLabRegime.jsx` — Regime + Stats (~80 LOC)
- Regime badge (Tradeable/Neutral)
- Stats grid (Win Rate, P&L, Confidence, Date Range)
- Promote button (with proper asset extraction + fallback)
- Renders AI Insights inline (or as child)

#### 2f. `StrategyLabChart.jsx` — Chart Component (~100 LOC)
- Creates chart on mount, destroys on unmount (proper cleanup)
- ResizeObserver for responsive width
- Receives `chartData` and `entries` as props
- Sets candle data FIRST, then markers (no race condition)
- Timestamp normalization in one place
- Future-ready: accepts optional `indicators` prop for EMA/BB overlays

#### 2g. `StrategyLabEntries.jsx` — Entry Signals Table (~70 LOC)
- Sortable table with direction, price, confidence bar, expiry, reason
- Summary stats footer
- Empty state with helpful message

#### 2h. `StrategyLabAiInsights.jsx` — AI Analysis (~50 LOC)
- Risk level badge (Low/Medium/High)
- Assessment text
- Recommendation with icon
- Error state if AI call failed (not silent)

### Phase 3: Store Fixes
**Agent:** Frontend Specialist  
**Estimated:** 30 minutes  
**File:** `gui/Dashboard/src/store/marketStore.js`

1. Replace hardcoded `http://localhost:8000` with `getApiBaseUrl()` in `setSelectedStrategyFileId`
2. Ensure `addStrategyLabFile` updates existing entries (not just skip if exists)

### Phase 4: Backend Minor Fixes
**Agent:** Backend Specialist  
**Estimated:** 30 minutes  
**File:** `backend/services/gateway/routes/strategy.py`

1. Ensure `/analyze` always returns `is_tradeable` field (even for NEUTRAL — set to `false`)
2. Ensure `/analyze` returns `warnings` array when regime is NEUTRAL with blocking reasons
3. Ensure `/data/{file_id}` normalizes timestamps to Unix seconds consistently

### Phase 5: Testing & Verification
**Agent:** Tester  
**Estimated:** 1 hour

1. Upload valid CSV → verify full pipeline (upload → regime → entries → AI → chart)
2. Upload CSV with low-volatility data → verify warnings display
3. Upload CSV with choppy data → verify chop warning
4. Upload non-CSV → verify error message
5. Reset → verify cleanup API called + state cleared
6. Promote → verify main chart receives data
7. Resize window → verify chart resizes
8. Navigate away → verify no memory leaks (chart destroyed)

---

## 📊 Effort Summary

| Phase | Description | Estimated Time |
|-------|-------------|---------------|
| 1 | Custom Hook + State Machine | 1.5 hours |
| 2 | Component Rewrite (7 components) | 2.5 hours |
| 3 | Store Fixes | 0.5 hours |
| 4 | Backend Minor Fixes | 0.5 hours |
| 5 | Testing & Verification | 1.0 hours |
| **Total** | | **6.0 hours** |

---

## 🎯 Success Criteria

1. ✅ Market warnings are **visible** to users when regime detector blocks a signal
2. ✅ No loading state flickering — phase-based progression
3. ✅ Chart renders correctly with data AND markers aligned
4. ✅ No memory leaks on unmount or reset
5. ✅ All errors surfaced to user (zero silent failures)
6. ✅ Temp files cleaned up on reset/unmount
7. ✅ Each component < 100 LOC (Separation of Concerns)
8. ✅ No hardcoded URLs
9. ✅ Chart resizes with container
10. ✅ Promote button works reliably

---

## 🔮 Future Enhancements (Post-Rewrite)

These are **not** in scope for this rewrite but the architecture supports them:

| Enhancement | Difficulty | Value |
|-------------|-----------|-------|
| Indicator overlays (EMA, BB lines on chart) | Medium | High |
| Regime background zones (color-coded time ranges) | Medium | High |
| Backtest P&L curve (line chart below main) | Medium | Medium |
| Per-regime performance breakdown | Low | Medium |
| Load from existing history (no CSV upload needed) | Low | High |
| Multi-file comparison | High | Medium |
| Export results to PDF/CSV | Low | Low |

---

## 📁 Files Affected

### New Files (Create)
- `gui/Dashboard/src/hooks/useStrategyLab.js`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabPanel.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabUpload.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabFileInfo.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabWarnings.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabRegime.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabChart.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabEntries.jsx`
- `gui/Dashboard/src/components/StrategyLab/StrategyLabAiInsights.jsx`

### Modified Files
- `gui/Dashboard/src/store/marketStore.js` — Fix hardcoded URL
- `backend/services/gateway/routes/strategy.py` — Ensure consistent response shapes
- Any parent component that imports `StrategyLabPanel` — Update import path

### Deprecated Files (Remove after verification)
- `gui/Dashboard/src/components/StrategyLabPanel.jsx` — Replaced by `StrategyLab/` directory

---

## ⚠️ Risk Mitigation

1. **Keep old file until new one is verified** — Don't delete `StrategyLabPanel.jsx` until all tests pass
2. **Incremental deployment** — Build hook first, then components one at a time
3. **Backend changes are additive** — Only adding fields, not changing existing ones
4. **Store changes are backward-compatible** — `getApiBaseUrl()` returns same value as hardcoded URL in dev

---

*This plan was generated by the Team Leader agent after a full-stack audit involving Investigator, Architect, Frontend Specialist, Backend Specialist, Debugger, and Reviewer agents.*
