import { useEffect, useRef, useState } from 'react';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ChartWorkspace from './ChartWorkspace';
import SettingsPanel from './SettingsPanel';
import ErrorBoundary from './ErrorBoundary';
import ContextPanelRouter from './ContextPanelRouter';
import ErrorToast from './ErrorToast';

const Dashboard = () => {
  const { connectSocket, disconnectSocket, activeTab } = useMarketStore();
  const { settings, fetchSettings } = useSettingsStore();

  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
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

  const getMaxRightPanelWidthPx = () => {
    const container = containerRef.current;
    const width = container?.getBoundingClientRect?.().width;
    if (!Number.isFinite(width) || width <= 0) return Math.max(minRightPanelWidthPx, defaultRightPanelWidthPx);
    const max = Math.round(width - minChartWidthPx - resizeHandleWidthPx);
    return Math.max(minRightPanelWidthPx, max);
  };

  const clampRightPanelWidthPx = (next) => {
    const max = getMaxRightPanelWidthPx();
    const bounded = Math.max(minRightPanelWidthPx, Math.min(max, Math.round(next)));
    return bounded;
  };

  const handleResizeStart = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = clampRightPanelWidthPx(rightPanelWidthPx);

    const handleMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const nextWidth = dragStartWidthRef.current - delta;
      setRightPanelWidthPx(clampRightPanelWidthPx(nextWidth));
    };

    const handleUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleResizeReset = () => {
    setRightPanelWidthPx(defaultRightPanelWidthPx);
  };

  useEffect(() => {
    connectSocket();
    fetchSettings();
    return () => disconnectSocket();
  }, [connectSocket, disconnectSocket, fetchSettings]);

  // Apply theme to document root globally
  useEffect(() => {
    const root = window.document.documentElement;
    // Remove all theme classes first
    root.classList.remove('theme-light', 'theme-dark', 'theme-orange-dark', 'theme-ironman', 'theme-black-white', 'dark');

    let targetTheme = settings.global.theme;

    root.classList.add('dark');
    if (targetTheme === 'dark') {
      root.classList.add('theme-dark');
    }
    if (targetTheme === 'orange-dark') {
      root.classList.add('theme-orange-dark');
    }
    if (targetTheme === 'ironman') {
      root.classList.add('theme-ironman');
    }
    if (targetTheme === 'black-white') {
      root.classList.add('theme-black-white');
    }

    // Apply global font size
    root.style.setProperty('--app-font-size', `${settings.global.fontSize || 13}px`);
  }, [settings.global.theme, settings.global.fontSize]);

  return (
    <div className="flex h-screen bg-dashboard-bg text-text-primary overflow-hidden font-sans">
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
                  <ChartWorkspace />
                </ErrorBoundary>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onDoubleClick={handleResizeReset}
                className="h-full cursor-col-resize select-none flex items-stretch"
              >
                <div className="w-full bg-transparent hover:bg-white/5 transition-colors">
                  <div className="h-full w-[2px] mx-auto bg-white/10" />
                </div>
              </div>
              <div className="h-full min-h-0 pl-2 quflx-right-panel">
                <ContextPanelRouter />
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
