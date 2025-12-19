import { useEffect } from 'react';
import useMarketStore from '../store/marketStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AssetPanel from './AssetPanel';
import ChartWorkspace from './ChartWorkspace';
import ErrorBoundary from './ErrorBoundary';

const Dashboard = () => {
  const { connectSocket, disconnectSocket } = useMarketStore();

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, [connectSocket, disconnectSocket]);

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
          
          {/* Top Row: Assets & Chart (Flexible Height) */}
          <div className="flex-1 grid grid-cols-12 gap-2 min-h-0">
            {/* Left Panel - Controls & Assets */}
            <AssetPanel />

            {/* Center Panel - Chart */}
            <div className="col-span-9 flex flex-col h-full min-h-0">
              <ErrorBoundary>
                <ChartWorkspace />
              </ErrorBoundary>
            </div>
          </div>

        </main>

        {/* Footer */}
        <footer className="h-8 bg-card-bg border-t border-gray-700 flex items-center justify-center text-xs text-gray-500 shrink-0">
          Copyright © 2026 QuFLX. All rights Reserved
        </footer>
      </div>
    </div>
  );
};

export default Dashboard;
