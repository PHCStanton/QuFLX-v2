import { useEffect } from 'react';
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

  useEffect(() => {
    connectSocket();
    fetchSettings();
    return () => disconnectSocket();
  }, [connectSocket, disconnectSocket, fetchSettings]);

  // Apply theme to document root globally
  useEffect(() => {
    const root = window.document.documentElement;
    // Remove all theme classes first
    root.classList.remove('theme-light', 'theme-dark', 'theme-orange-dark', 'dark');
    
    let targetTheme = settings.global.theme;
    
    root.classList.add('dark');
    if (targetTheme === 'dark') {
      root.classList.add('theme-dark');
    }
    if (targetTheme === 'orange-dark') {
      root.classList.add('theme-orange-dark');
    }
  }, [settings.global.theme]);

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
            <div className="flex-1 grid grid-cols-12 gap-2 min-h-0">
              <div className="col-span-9 flex flex-col h-full min-h-0">
                <ErrorBoundary>
                  <ChartWorkspace />
                </ErrorBoundary>
              </div>
              <div className="col-span-3 h-full min-h-0 quflx-right-panel">
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
