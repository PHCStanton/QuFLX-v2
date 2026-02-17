# Strategy Lab — Dedicated Chart Separation Plan
**Date:** 2026-02-17  
**Author:** Architecture Review (Full-Stack Audit)  
**Status:** Ready for Implementation  
**Relates to:** `Strategy_Labs_Dev_Plan_26-02-17.md` (Phase 2f — StrategyLabChart.jsx)  
**Priority:** High — Architectural foundation for all future Strategy Lab features

---

## 📋 Executive Summary

This plan details the **complete separation of the Strategy Lab chart from the live trading chart**. Currently, `ChartWorkspace.jsx` serves both live trading AND Strategy Lab (CSV mode) through `csvMode` branching logic. This creates coupling that violates Separation of Concerns and will become increasingly fragile as both features evolve independently.

**Goal:** Two independent chart systems that share reusable primitives but have completely separate orchestration, data loading, and feature sets.

---

## 🔍 Problem Statement

### Current Architecture (Shared Chart)

```
ChartWorkspace.jsx (350+ LOC)
├── Live Trading Logic
│   ├── Socket.IO streaming (useTickAggregation)
│   ├── History loading (loadHistory → backend CSV)
│   ├── Stream health monitoring (useStreamHealth)
│   ├── Real-time regime panel (RegimePanel)
│   ├── Price copy on double-click
│   └── Candle append to backend
│
├── Strategy Lab Logic (csvMode branches)
│   ├── effectiveHistoryCandles (virtualized from strategyLabData)
│   ├── effectiveHistoryStatus (faked as 'loaded')
│   ├── effectiveEnableStreaming (forced false)
│   └── Lab file entries for markers
│
└── Shared Logic
    ├── Indicator overlays (useOverlayIndicators)
    ├── Oscillator panel (OscillatorPanel)
    ├── Tooltip (ChartTooltip)
    ├── Screenshot capture
    ├── Ask AI integration
    └── Chart markers & price lines
```

### Problems with Current Approach

| # | Problem | Impact |
|---|---------|--------|
| 1 | **`csvMode` branches everywhere** — 5+ conditional paths in ChartWorkspace | Every new feature requires dual-mode testing |
| 2 | **Fake state injection** — `effectiveHistoryStatus` pretends Lab data is "loaded" history | Fragile; breaks if history loading logic changes |
| 3 | **Streaming disabled via flag** — `effectiveEnableStreaming = csvMode ? false : ...` | Dead code paths still execute partially |
| 4 | **Shared hooks carry dead weight** — `useTickAggregation` runs in Lab mode but does nothing useful | Wasted renders, potential for subtle bugs |
| 5 | **Feature development blocked** — Can't add Lab-specific features (replay, backtest overlay) without affecting live chart | Slows both live and lab development |
| 6 | **Bug contagion** — A bug fix in live mode can break Lab mode and vice versa | Higher regression risk |

---

## 🏗️ Target Architecture (Separated Charts)

### High-Level Component Tree

```
Dashboard.jsx
├── activeTab === 'dashboard' OR activeTab === 'strategy_lab'
│
├── [Live Trading Path]
│   └── ChartWorkspace.jsx (CLEANED — no csvMode logic)
│       ├── ChartContainer.jsx ←── SHARED
│       ├── ChartTooltip.jsx ←── SHARED
│       ├── ChartHeader.jsx (live variant)
│       ├── useTickAggregation.js (live-only)
│       ├── useOverlayIndicators.js ←── SHARED
│       ├── useChartWorkspaceIndicators.js (live-only)
│       ├── useStreamHealth.js (live-only)
│       ├── RegimePanel.jsx (live-only)
│       ├── OscillatorPanel.jsx ←── SHARED
│       └── OscillatorChart.jsx ←── SHARED
│
├── [Strategy Lab Path]
│   └── StrategyLabPanel.jsx (orchestrator)
│       └── StrategyLabChart.jsx (NEW — dedicated)
│           ├── ChartContainer.jsx ←── SHARED
│           ├── ChartTooltip.jsx ←── SHARED
│           ├── useOverlayIndicators.js ←── SHARED
│           ├── useLabDataLoader.js (lab-only, NEW)
│           ├── useLabMarkers.js (lab-only, NEW)
│           ├── OscillatorPanel.jsx ←── SHARED
│           ├── OscillatorChart.jsx ←── SHARED
│           └── [Future: BacktestOverlay, ReplayControls, etc.]
```

### Shared vs. Dedicated Components

#### ✅ SHARED (Reuse As-Is)
These components are **data-agnostic** — they accept data via props and don't care where it comes from:

| Component | Location | Why Shared |
|-----------|----------|------------|
| `ChartContainer.jsx` | `components/` | Creates lightweight-charts instance, returns `{chart, series}` via callback. Pure chart wrapper. |
| `ChartTooltip.jsx` | `components/` | Renders OHLC + indicator values at crosshair position. Pure display. |
| `OscillatorPanel.jsx` | `components/` | Renders oscillator indicator sub-charts. Receives data via props. |
| `OscillatorChart.jsx` | `components/` | Individual oscillator chart (RSI, MACD, etc.). Pure rendering. |
| `useOverlayIndicators.js` | `hooks/` | Manages overlay series (BB, EMA, SuperTrend) on a chart instance. Accepts `mainChart` as param. |
| `chartOptions.js` | `config/` | Indicator definitions, timeframe options. Pure config. |
| `ErrorBoundary.jsx` | `components/` | React error boundary. Generic. |

#### 🔵 LIVE-ONLY (Stay in ChartWorkspace)
These components are **specific to real-time trading**:

| Component/Hook | Why Live-Only |
|----------------|---------------|
| `useTickAggregation.js` | Aggregates Socket.IO ticks into candles. Lab uses pre-formed candles. |
| `useStreamHealth.js` | Monitors Socket.IO connection health. Lab has no streaming. |
| `useChartWorkspaceIndicators.js` | Triggers indicator reload on new candle. Lab loads indicators once. |
| `RegimePanel.jsx` | Displays real-time regime from Socket.IO. Lab has static regime from analysis. |
| `ChartHeader.jsx` | Asset selector, timeframe selector, indicator picker. Lab has different controls. |
| `ChartWorkspaceOverlays.jsx` | Loading/health overlays for live data. Lab has its own loading states. |

#### 🟢 LAB-ONLY (New Components)
These components are **specific to Strategy Lab**:

| Component/Hook | Purpose |
|----------------|---------|
| `StrategyLabChart.jsx` | Chart orchestrator for lab data. Manages chart lifecycle, data loading, markers. |
| `useLabDataLoader.js` | Loads candle data from uploaded CSV via `/data/{fileId}`. Normalizes timestamps. |
| `useLabMarkers.js` | Renders entry/exit markers on chart from lab analysis results. |
| `StrategyLabChartHeader.jsx` | Lab-specific controls (file info, regime badge, promote button). |
| `BacktestOverlay.jsx` | (Future) P&L curve, drawdown zones. |
| `ReplayControls.jsx` | (Future) Step through candles one by one. |

---

## 📐 Detailed Implementation Plan

### Phase 1: Create `StrategyLabChart.jsx` (Foundation)
**Estimated:** 2 hours  
**Files:** New `gui/Dashboard/src/components/StrategyLab/StrategyLabChart.jsx`

This is the core new component. It replaces the chart rendering that currently happens inside `ChartWorkspace.jsx` when `csvMode === true`.

#### Component Specification

```jsx
// StrategyLabChart.jsx — Props Interface
{
  chartData: Array<{time, open, high, low, close, volume?}>,  // Normalized candles
  entries: Array<{time, direction, price, confidence, reason}>, // Trade signals
  indicators: Object,           // { rsi_14: [...], macd: [...], ... }
  indicatorStatus: string,      // 'idle' | 'loading' | 'loaded' | 'error'
  activeIndicators: Array,      // From store — which indicators are active
  regime: Object | null,        // { regime, direction, is_tradeable, ... }
  onError: Function,            // Error callback
}
```

#### Internal Structure

```jsx
const StrategyLabChart = ({ chartData, entries, indicators, ... }) => {
  // 1. Chart instance management
  const [mainChart, setMainChart] = useState(null);
  const [candleSeries, setCandleSeries] = useState(null);
  const [volumeSeries, setVolumeSeries] = useState(null);
  const chartWrapperRef = useRef(null);

  // 2. Chart ready callback (reuses ChartContainer)
  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);
    // Create volume series (same pattern as ChartWorkspace)
    const volSeries = chart.addSeries(HistogramSeries, { ... });
    setVolumeSeries(volSeries);
  }, []);

  // 3. Load candle data when chartData changes
  useEffect(() => {
    if (!candleSeries || !Array.isArray(chartData) || chartData.length === 0) return;
    
    const mapped = chartData
      .map(c => ({
        time: normalizeEpochSeconds(c.time || c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter(c => c.time && Number.isFinite(c.open))
      .sort((a, b) => a.time - b.time);

    candleSeries.setData(mapped);
    
    // Volume
    if (volumeSeries) {
      const volData = chartData
        .map(c => ({
          time: normalizeEpochSeconds(c.time || c.timestamp),
          value: Number(c.volume || c.tick_volume || 0),
          color: Number(c.close) >= Number(c.open) 
            ? 'rgba(38, 166, 153, 0.5)' 
            : 'rgba(239, 83, 80, 0.5)',
        }))
        .filter(v => v.time)
        .sort((a, b) => a.time - b.time);
      volumeSeries.setData(volData);
    }
  }, [chartData, candleSeries, volumeSeries]);

  // 4. Set markers AFTER data is loaded (no race condition)
  useEffect(() => {
    if (!candleSeries || !Array.isArray(entries) || entries.length === 0) return;
    // ... marker logic (from useLabMarkers hook)
  }, [candleSeries, entries, chartData]); // chartData dependency ensures data is loaded first

  // 5. Overlay indicators (reuses shared hook)
  useOverlayIndicators({
    mainChart,
    activeIndicators,
    indicatorSeries: indicators,
    selectedAsset: labAsset,
    selectedTimeframe: labTimeframe,
    onError,
  });

  // 6. Tooltip (reuses shared component)
  // 7. Oscillator panel (reuses shared component)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chart area */}
      <div ref={chartWrapperRef} className="flex-1 min-h-[220px] relative">
        <ChartTooltip ... />
        <ChartContainer onChartReady={handleChartReady} onError={onError} />
      </div>
      
      {/* Oscillator sub-charts */}
      <OscillatorPanel
        mainChart={mainChart}
        selectedAsset={labAsset}
        selectedTimeframe={labTimeframe}
        oscillatorIndicators={oscillatorIndicators}
        indicatorSeries={indicators}
        indicatorStatus={indicatorStatus}
        onError={onError}
      />
    </div>
  );
};
```

#### Key Differences from Live Chart

| Aspect | Live (ChartWorkspace) | Lab (StrategyLabChart) |
|--------|----------------------|----------------------|
| Data source | `loadHistory()` → backend CSV + Socket.IO ticks | Props from parent (uploaded CSV data) |
| Streaming | Yes (useTickAggregation) | No |
| Data loading | Async (loading states, timeouts) | Synchronous (data passed as props) |
| Markers | AI messages, price lines | Trade entry/exit signals |
| Regime display | Real-time RegimePanel | Static regime badge (from analysis) |
| Controls | Asset selector, timeframe, indicator picker | File info, promote button |
| Resize | Handled by ChartContainer | Handled by ChartContainer (same) |

---

### Phase 2: Create `useLabDataLoader.js` Hook
**Estimated:** 45 minutes  
**File:** New `gui/Dashboard/src/hooks/useLabDataLoader.js`

This hook replaces the `effectiveHistoryCandles` / `effectiveHistoryStatus` pattern.

```jsx
// useLabDataLoader.js
const useLabDataLoader = ({ fileId, strategyLabData, setSelectedStrategyFileId }) => {
  const [chartData, setChartData] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle'); // idle | loading | loaded | error
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileId) {
      setChartData([]);
      setLoadStatus('idle');
      return;
    }

    // Check cache first
    if (strategyLabData[fileId]) {
      setChartData(strategyLabData[fileId]);
      setLoadStatus('loaded');
      return;
    }

    // Fetch from backend
    setLoadStatus('loading');
    setSelectedStrategyFileId(fileId)
      .then(() => {
        // Data should now be in strategyLabData[fileId]
        // The store's setSelectedStrategyFileId fetches and caches it
        setLoadStatus('loaded');
      })
      .catch((err) => {
        setError(err.message);
        setLoadStatus('error');
      });
  }, [fileId, strategyLabData, setSelectedStrategyFileId]);

  // Update chartData when store data changes
  useEffect(() => {
    if (fileId && strategyLabData[fileId]) {
      setChartData(strategyLabData[fileId]);
      setLoadStatus('loaded');
    }
  }, [fileId, strategyLabData]);

  return { chartData, loadStatus, error };
};
```

---

### Phase 3: Create `useLabMarkers.js` Hook
**Estimated:** 30 minutes  
**File:** New `gui/Dashboard/src/hooks/useLabMarkers.js`

Manages trade entry/exit markers on the lab chart.

```jsx
// useLabMarkers.js
const useLabMarkers = ({ candleSeries, entries, chartData }) => {
  useEffect(() => {
    if (!candleSeries || !Array.isArray(entries) || entries.length === 0) return;
    if (!Array.isArray(chartData) || chartData.length === 0) return; // Wait for data

    const markers = entries
      .map(entry => {
        const time = normalizeEpochSeconds(entry.time || entry.timestamp);
        if (!time) return null;

        const isBuy = (entry.direction || '').toLowerCase() === 'call' 
                    || (entry.direction || '').toLowerCase() === 'buy';

        return {
          time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#22c55e' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: `${entry.direction} (${Math.round((entry.confidence || 0) * 100)}%)`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    candleSeries.setMarkers(markers);

    return () => {
      // Cleanup markers on unmount
      if (candleSeries) {
        try { candleSeries.setMarkers([]); } catch { /* series may be disposed */ }
      }
    };
  }, [candleSeries, entries, chartData]);
};
```

---

### Phase 4: Remove `csvMode` Logic from `ChartWorkspace.jsx`
**Estimated:** 30 minutes  
**File:** Modify `gui/Dashboard/src/components/ChartWorkspace.jsx`

**Changes:**
1. Remove `selectedStrategyFileId`, `strategyLabFiles`, `strategyLabData` from store destructuring
2. Remove `csvMode` variable
3. Remove `effectiveHistoryCandles` memo (use `historyCandles` directly)
4. Remove `effectiveHistoryStatus` memo (use `historyStatus` directly)
5. Remove `effectiveEnableStreaming` (use `dataSourceMode !== 'history_only'` directly)
6. Remove `labFile` and `labEntries` from `useChartMarkers`
7. Simplify `useAskAi` props (remove effective* wrappers)

**Before (current):**
```jsx
const csvMode = !!selectedStrategyFileId;

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

**After (cleaned):**
```jsx
const enableStreaming = dataSourceMode !== 'history_only';

// Direct usage — no csvMode branching
const { isLoading } = useTickAggregation({
  historyCandles,      // Direct, not wrapped
  historyStatus,       // Direct, not wrapped
  enableStreaming,     // Direct, not wrapped
  ...
});
```

This removes ~30 lines of branching logic and makes ChartWorkspace purely a live trading component.

---

### Phase 5: Update Routing / Tab Switching
**Estimated:** 15 minutes  
**File:** Modify parent component that switches between live and lab views

The `ContextPanelRouter` or `Dashboard.jsx` needs to route to the correct chart:

```jsx
// In the main workspace area
{activeView === 'strategy_lab' ? (
  <ErrorBoundary>
    <StrategyLabPanel />  {/* Contains StrategyLabChart internally */}
  </ErrorBoundary>
) : (
  <ErrorBoundary>
    <ChartWorkspace />    {/* Pure live trading */}
  </ErrorBoundary>
)}
```

**Note:** The existing `StrategyLabPanel.jsx` already lives in the right panel (`ContextPanelRouter`). The chart component (`StrategyLabChart`) will be rendered INSIDE `StrategyLabPanel` — not as a replacement for the main chart area. This means:

- **Option A:** Lab chart renders inside the right panel (smaller, but self-contained)
- **Option B:** When Lab is active, it takes over the main chart area (full-width)
- **Option C:** Lab chart renders in a modal/overlay (most flexible)

**Recommended: Option B** — When a Strategy Lab file is selected, the main chart area switches to show the Lab chart. When deselected, it reverts to live chart. This gives the Lab chart full width for proper analysis.

```jsx
// Dashboard.jsx — Main workspace area
<div className="flex flex-col h-full min-h-0 pr-2">
  <ErrorBoundary>
    {selectedStrategyFileId ? (
      <StrategyLabChartWorkspace />  {/* Full-width lab chart */}
    ) : (
      <ChartWorkspace />             {/* Full-width live chart */}
    )}
  </ErrorBoundary>
</div>
```

---

### Phase 6: Testing & Verification
**Estimated:** 1 hour

#### Live Chart Tests (Regression)
| # | Test | Expected |
|---|------|----------|
| 1 | Select asset → chart loads history | ✅ Candles appear |
| 2 | Streaming ticks update chart | ✅ Candle updates in real-time |
| 3 | Switch asset → chart clears and reloads | ✅ Clean transition |
| 4 | Indicators load and display | ✅ Overlays + oscillators render |
| 5 | RegimePanel shows real-time regime | ✅ Updates via Socket.IO |
| 6 | Screenshot + Ask AI work | ✅ Capture and send |

#### Strategy Lab Chart Tests (New)
| # | Test | Expected |
|---|------|----------|
| 1 | Upload CSV → chart renders candles | ✅ All candles visible |
| 2 | Entry markers appear on chart | ✅ Arrows at correct positions |
| 3 | Indicators load on lab data | ✅ Overlays + oscillators render |
| 4 | Deselect lab file → live chart returns | ✅ Clean switch |
| 5 | Resize window → lab chart resizes | ✅ Responsive |
| 6 | Navigate away → no memory leaks | ✅ Chart destroyed |

#### Integration Tests
| # | Test | Expected |
|---|------|----------|
| 1 | Live chart active → select lab file → lab chart appears | ✅ Smooth transition |
| 2 | Lab chart active → deselect file → live chart returns with data | ✅ No data loss |
| 3 | Lab chart active → live streaming continues in background | ✅ No interruption |

---

## 📁 File Inventory

### New Files to Create
```
gui/Dashboard/src/components/StrategyLab/
├── StrategyLabChart.jsx              # Lab chart orchestrator (~120 LOC)
├── StrategyLabChartHeader.jsx        # Lab chart controls (~40 LOC)
└── StrategyLabChartWorkspace.jsx     # Full-width wrapper (~60 LOC)

gui/Dashboard/src/hooks/
├── useLabDataLoader.js               # Lab data loading hook (~50 LOC)
└── useLabMarkers.js                  # Lab trade markers hook (~40 LOC)
```

### Files to Modify
```
gui/Dashboard/src/components/
├── ChartWorkspace.jsx                # REMOVE csvMode logic (~30 lines removed)
└── Dashboard.jsx                     # ADD conditional chart rendering (~5 lines)

gui/Dashboard/src/store/
└── marketStore.js                    # No changes needed (store already has lab slice)
```

### Files NOT Modified (Shared — Reused As-Is)
```
gui/Dashboard/src/components/
├── ChartContainer.jsx                # ← Shared chart wrapper
├── ChartTooltip.jsx                  # ← Shared tooltip
├── OscillatorPanel.jsx               # ← Shared oscillator panel
├── OscillatorChart.jsx               # ← Shared oscillator chart
└── ErrorBoundary.jsx                 # ← Shared error boundary

gui/Dashboard/src/hooks/
├── useOverlayIndicators.js           # ← Shared indicator overlays
└── (other hooks stay untouched)

gui/Dashboard/src/config/
└── chartOptions.js                   # ← Shared indicator definitions
```

---

## 📊 Effort Summary

| Phase | Description | Estimated Time | Complexity |
|-------|-------------|---------------|------------|
| 1 | Create `StrategyLabChart.jsx` | 2.0 hours | Medium |
| 2 | Create `useLabDataLoader.js` | 0.75 hours | Low |
| 3 | Create `useLabMarkers.js` | 0.5 hours | Low |
| 4 | Clean `ChartWorkspace.jsx` (remove csvMode) | 0.5 hours | Low |
| 5 | Update routing in `Dashboard.jsx` | 0.25 hours | Low |
| 6 | Testing & verification | 1.0 hours | Medium |
| **Total** | | **5.0 hours** | |

---

## 🎯 Success Criteria

1. ✅ Live chart works exactly as before (zero regression)
2. ✅ Strategy Lab chart renders uploaded CSV data correctly
3. ✅ Trade entry markers appear at correct positions
4. ✅ Indicators work on both live and lab charts
5. ✅ Switching between live and lab is seamless
6. ✅ No `csvMode` branching remains in `ChartWorkspace.jsx`
7. ✅ Each component has a single, clear responsibility
8. ✅ No memory leaks on chart switch or unmount
9. ✅ Lab chart can be developed independently without affecting live chart

---

## 🔮 Future Enhancements (Enabled by Separation)

These features become **trivially easy** to add once the Lab chart is independent:

| Feature | Difficulty | Description |
|---------|-----------|-------------|
| **Replay Mode** | Medium | Step through candles one by one with play/pause controls |
| **Backtest P&L Overlay** | Medium | Line chart showing cumulative P&L below main chart |
| **Regime Background Zones** | Low | Color-coded time ranges showing detected regimes |
| **Multi-Strategy Comparison** | Medium | Overlay multiple strategy results on same chart |
| **Custom Time Range Selection** | Low | Drag to select backtest period |
| **Trade Statistics Overlay** | Low | Win/loss ratio, avg profit per trade displayed on chart |
| **Export Chart as Image** | Low | Screenshot with markers and annotations |
| **Different Indicator Configs** | Low | Lab can have different indicator settings than live |

---

## ⚠️ Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking live chart during separation | Keep `csvMode` logic until lab chart is verified, then remove |
| Shared components not truly reusable | Verify each shared component accepts data via props only (no store access) |
| Store state conflicts | Lab and live use different state slices (already separated) |
| Performance (two chart instances) | Only one chart renders at a time (conditional rendering) |

---

## 🔗 Dependencies & Prerequisites

1. **Existing Strategy Lab dev plan** (`Strategy_Labs_Dev_Plan_26-02-17.md`) — This plan extends Phase 2f
2. **Chart fixes already applied** — Initial history load fix in ChartWorkspace.jsx (completed 2026-02-17)
3. **lightweight-charts v5** — Already installed, both charts use same library
4. **Backend Strategy routes** — Already exist (`/upload`, `/analyze`, `/entries`, `/data/{fileId}`)

---

## 📝 Implementation Order (Recommended)

```
Step 1: Create StrategyLabChart.jsx + useLabDataLoader.js + useLabMarkers.js
        (New files only — no existing code modified)
        
Step 2: Create StrategyLabChartWorkspace.jsx wrapper
        (New file — integrates lab chart with lab panel)

Step 3: Update Dashboard.jsx to conditionally render lab vs live chart
        (Minimal change — 5 lines)

Step 4: Verify lab chart works end-to-end
        (Upload CSV → chart renders → markers appear → indicators load)

Step 5: Remove csvMode logic from ChartWorkspace.jsx
        (Only after Step 4 is verified — safe removal)

Step 6: Final regression testing
        (Both live and lab charts work independently)
```

**Critical Rule:** Steps 1-4 are **additive only** (no existing code modified). Step 5 is the **only destructive change** and happens last, after verification.

---

## 🧪 Quick Validation Checklist (For Any Developer)

After implementation, run through this checklist:

```
□ Start backend (uvicorn gateway)
□ Start frontend (npm run dev)
□ Open Dashboard → Live chart loads with history data
□ Select different asset → Chart clears and reloads
□ Streaming ticks update the chart in real-time
□ Add indicators → Overlays and oscillators appear
□ Upload CSV in Strategy Lab panel
□ Lab chart appears in main area (replaces live chart)
□ Candles from CSV render correctly
□ Entry markers appear at correct positions
□ Add indicators to lab chart → They render
□ Deselect lab file → Live chart returns with data intact
□ No console errors throughout
□ No memory leak warnings in DevTools
```

---

*This plan was created after a full-stack audit of the chart rendering pipeline, including ChartWorkspace.jsx, ChartContainer.jsx, useTickAggregation.js, useOverlayIndicators.js, OscillatorPanel.jsx, OscillatorChart.jsx, chartOptions.js, marketStore.js, and all backend routes (gateway, indicators, history, strategy).*

*Last updated: 2026-02-17*
