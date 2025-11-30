import React from 'react';
import Card from './Card';
import { Upload, Activity, Search, RefreshCw } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import ToggleSwitch from './ToggleSwitch';

const AssetPanel = () => {
  const { 
    payoutAssets, 
    selectedAsset, 
    setSelectedAsset,
    refreshAssets,
    autoRefresh,
    toggleAutoRefresh
  } = useMarketStore();

  return (
    <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
      
      {/* Data Source Controls */}
      <Card className="p-4 rounded-lg shrink-0">
        <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Data Source</h3>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton icon={<Upload size={16} />} label="Upload CSV" />
          <ActionButton icon={<Activity size={16} />} label="Live Feed" active />
          <ActionButton icon={<Search size={16} />} label="Get Assets" />
          <ActionButton 
            icon={<RefreshCw size={16} className={autoRefresh ? "animate-spin" : ""} />} 
            label="Refresh" 
            onClick={refreshAssets}
          />
        </div>
        <div className="mt-3 flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
            <span className="text-xs">Auto Refresh (5m)</span>
            <ToggleSwitch 
              checked={autoRefresh} 
              onChange={toggleAutoRefresh} 
            />
        </div>
      </Card>

      {/* 92% Payout Assets */}
      <Card className="p-4 rounded-lg flex-1 flex flex-col min-h-0">
        <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider flex justify-between items-center shrink-0">
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
    </div>
  );
};

const ActionButton = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-3 rounded border transition-all ${active ? 'bg-accent-green/10 border-accent-green text-accent-green' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'}`}
  >
    {icon}
    <span className="text-xs mt-1 font-medium">{label}</span>
  </button>
);

export default AssetPanel;
