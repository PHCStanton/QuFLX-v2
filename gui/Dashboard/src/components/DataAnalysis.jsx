import React, { useState } from 'react';
import Card from './Card';
import { 
  Menu, 
  Settings, 
  Upload, 
  Activity, 
  Search, 
  ChevronDown, 
  Play, 
  Pause, 
  RefreshCw,
  Monitor,
  Wifi,
  Bot,
  TrendingUp,
  Clock,
  FileText,
  Layers,
  X
} from 'lucide-react';

const DataAnalysis = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState('AUDNZD_otc');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1m');

  // Mock data for 92% Payout Assets
  const payoutAssets = [
    'AUDNZD_otc', 'EURUSD_otc', 'GBPUSD_otc', 'USDJPY_otc', 
    'USDCAD_otc', 'AUDUSD_otc', 'NZDUSD_otc', 'EURGBP_otc'
  ];

  return (
    <div className="flex h-screen bg-dashboard-bg text-text-primary overflow-hidden font-sans">
      {/* 1. Collapsible Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-card-bg border-r border-gray-700 transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {isSidebarOpen && <span className="font-bold text-xl text-accent-green">QuFLX</span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-700 rounded">
            <Menu size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-2 space-y-2">
          <SidebarItem icon={<Activity />} label="Dashboard" isOpen={isSidebarOpen} active />
          <SidebarItem icon={<TrendingUp />} label="Analysis" isOpen={isSidebarOpen} />
          <SidebarItem icon={<Bot />} label="Automations" isOpen={isSidebarOpen} />
          <SidebarItem icon={<Settings />} label="Settings" isOpen={isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="w-2 h-2 rounded-full bg-accent-green"></div>
            {isSidebarOpen && <span>System Online</span>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header / Connection Status (13) */}
        <header className="h-16 bg-card-bg border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <StatusBadge label="WS" status="connected" />
            <StatusBadge label="Chrome" status="connected" />
            <StatusBadge label="Stream" status="idle" />
          </div>
          
          <div className="flex items-center gap-4">
            {/* 2. Backend Operations */}
            <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
              <Monitor size={16} />
              <span>Start Chrome</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors">
              <Wifi size={16} />
              <span>Connect WS</span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 overflow-y-auto p-4 grid grid-cols-12 gap-4">
          
          {/* Left Panel - Controls & Assets */}
          <div className="col-span-3 flex flex-col gap-4">
            
            {/* 3. Data Source Controls */}
            <Card className="p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Data Source</h3>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton icon={<Upload size={16} />} label="Upload CSV" />
                <ActionButton icon={<Activity size={16} />} label="Live Feed" active />
                <ActionButton icon={<Search size={16} />} label="Get Assets" />
                <ActionButton icon={<RefreshCw size={16} />} label="Refresh" />
              </div>
            </Card>

            {/* 4. 92% Payout Assets */}
            <Card className="p-4 rounded-lg flex-1 flex flex-col min-h-[300px]">
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider flex justify-between items-center">
                92% Payout Assets
                <span className="text-xs bg-accent-green text-black px-1.5 py-0.5 rounded font-bold">{payoutAssets.length}</span>
              </h3>
              <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {payoutAssets.map((asset) => (
                  <div 
                    key={asset}
                    onClick={() => setSelectedAsset(asset)}
                    className={`p-2 rounded cursor-pointer flex justify-between items-center transition-colors ${
                      selectedAsset === asset 
                        ? 'bg-accent-green/20 text-accent-green border border-accent-green/50' 
                        : 'hover:bg-gray-700 text-text-secondary'
                    }`}
                  >
                    <span className="font-medium">{asset}</span>
                    <span className="text-xs opacity-70">92%</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* 10. Automation Controls */}
            <Card className="p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Automations</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                  <span className="text-sm">Auto-Select Favorites</span>
                  <ToggleSwitch />
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                  <span className="text-sm">Pending Orders</span>
                  <ToggleSwitch />
                </div>
              </div>
            </Card>
          </div>

          {/* Center Panel - Chart & Analysis */}
          <div className="col-span-9 flex flex-col gap-4">
            
            {/* Top Bar - Selectors (6, 7, 8, 9) */}
            <Card className="p-3 rounded-lg flex flex-wrap items-center gap-3">
              
              {/* Asset Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary">Asset</label>
                <div className="relative">
                  <select 
                    className="appearance-none bg-gray-800 border border-gray-600 text-white py-1.5 pl-3 pr-8 rounded text-sm focus:outline-none focus:border-accent-green min-w-[140px]"
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                  >
                    {payoutAssets.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Timeframe Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary">Timeframe</label>
                <div className="relative">
                  <select 
                    className="appearance-none bg-gray-800 border border-gray-600 text-white py-1.5 pl-3 pr-8 rounded text-sm focus:outline-none focus:border-accent-green min-w-[100px]"
                    value={selectedTimeframe}
                    onChange={(e) => setSelectedTimeframe(e.target.value)}
                  >
                    <option value="ticks">Ticks</option>
                    <option value="1m">1 Minute</option>
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                    <option value="1h">1 Hour</option>
                  </select>
                  <Clock size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* CSV Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary">Import</label>
                <div className="relative">
                  <select className="appearance-none bg-gray-800 border border-gray-600 text-white py-1.5 pl-3 pr-8 rounded text-sm focus:outline-none focus:border-accent-green min-w-[120px]">
                    <option>Select CSV...</option>
                    <option>Upload New</option>
                  </select>
                  <FileText size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Indicator Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-secondary">Indicators</label>
                <div className="relative">
                  <select className="appearance-none bg-gray-800 border border-gray-600 text-white py-1.5 pl-3 pr-8 rounded text-sm focus:outline-none focus:border-accent-green min-w-[140px]">
                    <option>Add Indicator...</option>
                    <option>RSI</option>
                    <option>MACD</option>
                    <option>Bollinger Bands</option>
                  </select>
                  <Layers size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex-1"></div>

              {/* 14. Ask AI */}
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
                <Bot size={18} />
                <span>Ask AI</span>
              </button>
            </Card>

            {/* 11. Active Indicators List */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <IndicatorBadge name="RSI" value="14" />
              <IndicatorBadge name="EMA" value="200" />
              <IndicatorBadge name="Bollinger" value="20, 2" />
            </div>

            {/* 5. Chart Display */}
            <Card className="flex-1 p-0 rounded-lg relative overflow-hidden flex flex-col">
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <span className="bg-black/50 backdrop-blur px-2 py-1 rounded text-xs text-gray-300">Live Feed</span>
              </div>
              
              {/* Chart Placeholder */}
              <div className="flex-1 flex items-center justify-center bg-gray-900/50 m-1 rounded border border-gray-800 border-dashed">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-green mx-auto mb-4"></div>
                  <p className="text-text-secondary text-sm">Loading Data...</p>
                  <p className="text-xs text-gray-600 mt-2">Waiting for stream connection</p>
                </div>
              </div>
            </Card>

            {/* 12. Analysis / Stats */}
            <Card className="h-40 p-4 rounded-lg grid grid-cols-3 gap-4">
              <StatCard label="Market Condition" value="Volatile" trend="up" />
              <StatCard label="Signal Strength" value="85%" trend="neutral" />
              <StatCard label="Predicted Direction" value="BULLISH" trend="up" color="text-accent-green" />
            </Card>

          </div>
        </main>

        {/* Footer */}
        <footer className="h-8 bg-card-bg border-t border-gray-700 flex items-center justify-center text-xs text-gray-500">
          Copyright © 2026 QuFLX. All rights Reserved
        </footer>
      </div>
    </div>
  );
};

// Helper Components

const SidebarItem = ({ icon, label, isOpen, active }) => (
  <div className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${active ? 'bg-accent-green/10 text-accent-green border-r-2 border-accent-green' : 'hover:bg-gray-700 text-gray-400'}`}>
    {React.cloneElement(icon, { size: 20 })}
    {isOpen && <span className="font-medium">{label}</span>}
  </div>
);

const StatusBadge = ({ label, status }) => {
  const colors = {
    connected: 'text-accent-green',
    idle: 'text-yellow-500',
    disconnected: 'text-accent-red'
  };
  
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded border border-gray-700">
      <span className="text-xs font-bold text-gray-400 uppercase">{label}</span>
      <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-accent-green' : status === 'idle' ? 'bg-yellow-500' : 'bg-accent-red'}`}></div>
    </div>
  );
};

const ActionButton = ({ icon, label, active }) => (
  <button className={`flex flex-col items-center justify-center p-3 rounded border transition-all ${active ? 'bg-accent-green/10 border-accent-green text-accent-green' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'}`}>
    {icon}
    <span className="text-xs mt-1 font-medium">{label}</span>
  </button>
);

const ToggleSwitch = () => (
  <div className="w-10 h-5 bg-gray-700 rounded-full relative cursor-pointer">
    <div className="w-3 h-3 bg-gray-400 rounded-full absolute top-1 left-1"></div>
  </div>
);

const IndicatorBadge = ({ name, value }) => (
  <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded border border-gray-700 text-xs whitespace-nowrap">
    <span className="text-accent-green font-bold">{name}</span>
    <span className="text-gray-400">{value}</span>
    <X size={12} className="cursor-pointer hover:text-red-400" />
  </div>
);

const StatCard = ({ label, value, trend, color }) => (
  <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50 flex flex-col justify-between">
    <span className="text-xs text-gray-400 uppercase">{label}</span>
    <div className="flex items-end justify-between">
      <span className={`text-xl font-bold ${color || 'text-white'}`}>{value}</span>
      {trend === 'up' && <TrendingUp size={16} className="text-accent-green" />}
    </div>
  </div>
);

export default DataAnalysis;
