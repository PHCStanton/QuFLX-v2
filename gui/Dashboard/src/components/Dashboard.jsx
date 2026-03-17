import { useEffect, useRef, useState, useCallback } from 'react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ChartWorkspace from './ChartWorkspace';
import SettingsPanel from './SettingsPanel';
import ErrorBoundary from './ErrorBoundary';
import ContextPanelRouter from './ContextPanelRouter';
import GlobalControls from './GlobalControls';
import ErrorToast from './ErrorToast';
import StrategyLabChartWorkspace from './StrategyLab/StrategyLabChartWorkspace';

const Dashboard = () => {
  const { connectSocket, disconnectSocket, activeTab, selectedStrategyFileId } = useMarketStore();
  const { settings } = useSettingsStore();
  const dashboardBgDataUrl = settings?.global?.dashboardBgDataUrl || null;

  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const rightPanelStorageKey = 'quflx.ui.rightPanelWidthPx';
  const defaultRightPanelWidthPx = 420;
  const minRightPanelWidthPx = 210;
  const minChartWidthPx = 520;
  const resizeHandleWidthPx = 10;

  const getStoredRightPanelWidthPx = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(rightPanelStorageKey);
      const parsed = raw ? Number(raw) : NaN;
      if (!Number.isFinite(parsed)) return null;
      return Math.round(parsed);
    } catch {
      return null;
    }
  };

  const [rightPanelWidthPx, setRightPanelWidthPx] = useState(() => {
    const stored = getStoredRightPanelWidthPx();
    return typeof stored === 'number' ? stored : defaultRightPanelWidthPx;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(rightPanelStorageKey, String(rightPanelWidthPx));
    } catch (err) {
      void err;
    }
  }, [rightPanelWidthPx]);

  const getMaxRightPanelWidthPx = useCallback(() => {
    const container = containerRef.current;
    if (!container) return defaultRightPanelWidthPx;
    const width = container.getBoundingClientRect?.().width;
    if (!Number.isFinite(width) || width <= 0) return Math.max(minRightPanelWidthPx, defaultRightPanelWidthPx);
    const max = Math.round(width - minChartWidthPx - resizeHandleWidthPx);
    return Math.max(minRightPanelWidthPx, max);
  }, [containerRef]);

  const clampRightPanelWidthPx = useCallback((next, maxWidthOverride = null) => {
    const max = maxWidthOverride ?? getMaxRightPanelWidthPx();
    return Math.max(minRightPanelWidthPx, Math.min(max, Math.round(next)));
  }, [getMaxRightPanelWidthPx]);

  const handleResizeStart = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    isDraggingRef.current = true;
    setIsResizing(true);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = rightPanelWidthPx;

    // Immediate feedback
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Pre-calculate max width for the current resize session
    const maxWidth = getMaxRightPanelWidthPx();

    // Use a single move listener for the entire drag session
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const nextWidth = dragStartWidthRef.current - delta;

      // Update state directly for immediate visual feedback
      const clampedWidth = clampRightPanelWidthPx(nextWidth, maxWidth);
      setRightPanelWidthPx(clampedWidth);
    };

    const onUp = () => {
      isDraggingRef.current = false;
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
  };

  // Ensure body styles are cleaned up if the component unmounts during resize
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handleResizeReset = () => {
    setRightPanelWidthPx(defaultRightPanelWidthPx);
  };

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, [connectSocket, disconnectSocket]);

  return (
    <div
      className="flex h-screen bg-dashboard-bg text-text-primary overflow-hidden font-sans"
      style={dashboardBgDataUrl ? {
        '--quflx-dashboard-bg': `url("${dashboardBgDataUrl}")`,
      } : undefined}
    >
      {/* Drag Overlay to prevent iframe interference */}
      {isResizing && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none" />
      )}

      {/* 1. Collapsible Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top Header / Connection Status */}
        <TopBar />

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden p-2 gap-2">

          {activeTab === 'settings' ? (
            <ErrorBoundary>
              <SettingsPanel />
            </ErrorBoundary>
          ) : (
            <div ref={containerRef} className="flex-1 grid min-h-0" style={{ gridTemplateColumns: `minmax(0, 1fr) ${resizeHandleWidthPx}px ${clampRightPanelWidthPx(rightPanelWidthPx)}px` }}>
              <div className="flex flex-col h-full min-h-0 pr-2">
                <ErrorBoundary>
                  {selectedStrategyFileId ? (
                    <StrategyLabChartWorkspace />
                  ) : (
                    <ChartWorkspace />
                  )}
                </ErrorBoundary>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onDoubleClick={handleResizeReset}
                className={`h-full w-[10px] cursor-col-resize select-none flex items-center justify-center group relative transition-all duration-300 ${isResizing ? 'bg-accent-green/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'hover:bg-white/5'}`}
              >
                {/* Visual Handle Bar */}
                <div className={`h-16 w-[2px] rounded-full transition-all duration-500 relative overflow-hidden ${isResizing ? 'bg-accent-green scale-y-110 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-white/10 group-hover:bg-white/30 group-hover:scale-y-105'}`}>
                  {/* Subtle moving shine effect when active */}
                  {isResizing && (
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" />
                  )}
                </div>

                {/* Left/Right arrow hints on hover */}
                <div className={`absolute flex gap-4 transition-all duration-300 opacity-0 group-hover:opacity-40 ${isResizing ? 'scale-125' : 'scale-100'}`}>
                  <div className="w-1 h-1 rounded-full bg-accent-green" />
                  <div className="w-1 h-1 rounded-full bg-accent-green" />
                </div>
              </div>
              <div className="h-full min-h-0 pl-2 quflx-right-panel flex flex-col gap-2">
                <GlobalControls
                  backendReady={Boolean(useMarketStore.getState().backendStatus && useMarketStore.getState().backendStatus.readyForAssets)}
                  autoRefresh={useMarketStore.getState().autoRefresh}
                  onToggleAutoRefresh={useMarketStore.getState().toggleAutoRefresh}
                  otcOnly={useMarketStore.getState().assetFilterState?.filterMode === 'otc'}
                  onToggleOtcOnly={() => useMarketStore.getState().setAssetFilterState({
                    ...(useMarketStore.getState().assetFilterState || {}),
                    filterMode: useMarketStore.getState().assetFilterState?.filterMode === 'otc' ? null : 'otc'
                  })}
                  onGetAssets={() => {
                    const state = useMarketStore.getState();
                    const options = {
                      min_pct: state.assetFilterState?.minPayout || 92,
                      max_assets: state.assetFilterState?.maxAssets || 5,
                      include_assets: (state.assetFilterState?.includeAssets || '').split(',').map(a => a.trim()).filter(Boolean),
                      ignore_assets: (state.assetFilterState?.ignoreAssets || '').split(',').map(a => a.trim()).filter(Boolean),
                      filter_mode: state.assetFilterState?.filterMode
                    };
                    state.refreshAssets(options);
                  }}
                  isBusyRefreshing={useMarketStore.getState().autoRefresh}
                  alertsStatus={useMarketStore.getState().alertsStatus}
                  onStartAlerts={() => useMarketStore.getState().startAlerts(useMarketStore.getState().payoutAssets)}
                  onStopAlerts={useMarketStore.getState().stopAlerts}
                  enableTickLogging={useMarketStore.getState().enableTickLogging}
                  onToggleTickLogging={() => {
                    const { toggleTickLogging } = useMarketStore.getState();
                    const { settings, updateSection } = useSettingsStore.getState();
                    const newValue = !settings.alerts?.enableTickLogging;
                    updateSection('alerts', { enableTickLogging: newValue });
                    toggleTickLogging();
                  }}
                />
                <div className="flex-1 min-h-0">
                  <ContextPanelRouter />
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Footer */}
        <footer className="h-8 bg-card-bg border-t border-gray-700 flex items-center justify-center text-xs text-gray-500 shrink-0">
          Copyright © 2026 QuFLX. All rights Reserved
        </footer>
      </div>

      <ErrorToast />
    </div>
  );
};

export default Dashboard;
