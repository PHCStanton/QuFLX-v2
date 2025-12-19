import Card from './Card';
import { Upload, Activity, Search, RefreshCw, List, MonitorPlay } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import ToggleSwitch from './ToggleSwitch';
import TickerTape from './TickerTape';

const AssetPanel = () => {
  const { 
    payoutAssets, 
    selectedAsset, 
    setSelectedAsset,
    refreshAssets,
    collectHistory,
    autoRefresh,
    toggleAutoRefresh,
    panelMode,
    setPanelMode,
    quotesByAssetKey,
    tickerMaxAssets
  } = useMarketStore();

  const rawTickerAssets = (payoutAssets || []).slice(0, tickerMaxAssets);
  const tickerAssets = Array.from(new Set([selectedAsset, ...rawTickerAssets].filter(Boolean))).slice(0, tickerMaxAssets);

  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      
      {/* Data Source Controls */}
      <Card className="p-3 rounded-lg shrink-0">
        <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Data Source</h3>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton icon={<Upload size={14} />} label="Upload CSV" />
          <ActionButton icon={<Activity size={14} />} label="Live Feed" active />
          <ActionButton 
            icon={<RefreshCw size={14} className={autoRefresh ? "animate-spin" : ""} />} 
            label="Get Assets" 
            onClick={refreshAssets}
          />
          <ActionButton 
            icon={<Search size={14} />} 
            label="Collect History" 
            onClick={collectHistory}
          />
        </div>
        <div className="mt-2 flex items-center justify-between p-1.5 bg-gray-800 rounded border border-gray-700">
            <span className="text-[10px] uppercase font-bold text-gray-400">Auto Refresh (5m)</span>
            <ToggleSwitch 
              checked={autoRefresh} 
              onChange={toggleAutoRefresh} 
            />
        </div>
      </Card>

      {/* Assets / Ticker Container */}
      <Card className="p-3 rounded-lg flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-2 shrink-0">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                {panelMode === 'list' ? '92% Payout Assets' : 'OTC Ticker'}
                {panelMode === 'list' && (
                    <span className="text-xs bg-accent-green text-black px-1.5 py-0.5 rounded font-bold">{payoutAssets.length}</span>
                )}
            </h3>
            
            {/* View Toggle */}
            <div className="flex bg-gray-800 rounded p-0.5 border border-gray-700">
                <button 
                    onClick={() => setPanelMode('list')}
                    className={`p-1 rounded ${panelMode === 'list' ? 'bg-gray-700 text-accent-green' : 'text-gray-500 hover:text-gray-300'}`}
                    title="List View"
                >
                    <List size={14} />
                </button>
                <button 
                    onClick={() => setPanelMode('ticker')}
                    className={`p-1 rounded ${panelMode === 'ticker' ? 'bg-gray-700 text-accent-green' : 'text-gray-500 hover:text-gray-300'}`}
                    title="Ticker Tape"
                >
                    <MonitorPlay size={14} />
                </button>
            </div>
        </div>

        {panelMode === 'list' ? (
            <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
              {payoutAssets.map((asset) => (
                <div 
                  key={asset}
                  onClick={() => setSelectedAsset(asset)}
                  className={`p-1.5 rounded cursor-pointer flex justify-between items-center transition-colors ${
                    selectedAsset === asset 
                      ? 'bg-accent-green/20 text-accent-green border border-accent-green/50' 
                      : 'hover:bg-gray-700 text-text-secondary'
                  }`}
                >
                  <span className="font-medium text-sm">{asset}</span>
                  <span className="text-[10px] opacity-70">92%</span>
                </div>
              ))}
            </div>
        ) : (
            <div className="flex-1 min-h-0 bg-black/20 rounded overflow-hidden">
                <TickerTape assets={tickerAssets} quotesByAssetKey={quotesByAssetKey} />
            </div>
        )}
      </Card>
    </div>
  );
};

const ActionButton = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${active ? 'bg-accent-green/10 border-accent-green text-accent-green' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'}`}
  >
    {icon}
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

export default AssetPanel;
