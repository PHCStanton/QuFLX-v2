import { useState, useMemo, useRef } from 'react';
import Card from './Card';
import { Upload, Activity, Search, RefreshCw, List, MonitorPlay, History, HelpCircle } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import ToggleSwitch from './ToggleSwitch';
import TickerTape from './TickerTape';

const AssetPanel = () => {
  const { 
    payoutAssets, 
    selectedAsset, 
    setSelectedAsset,
    refreshAssets,
    autoRefresh,
    toggleAutoRefresh,
    panelMode,
    setPanelMode,
    quotesByAssetKey,
    tickerMaxAssets,
    backendStatus,
    collectHistory,
    setAssetFilterState
  } = useMarketStore();

  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [maxAssetsToStar, setMaxAssetsToStar] = useState(10); // NEW: Configurable limit
  const [specificAssets, setSpecificAssets] = useState(''); // NEW: Specific assets to target
  const [otcOnly, setOtcOnly] = useState(false);
  const [topHeight, setTopHeight] = useState(220);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(220);

  const handleResizeStart = (event) => {
    dragStartYRef.current = event.clientY;
    dragStartHeightRef.current = topHeight;

    const onMouseMove = (e) => {
      const delta = e.clientY - dragStartYRef.current;
      let next = dragStartHeightRef.current + delta;
      const minHeight = 140;
      const maxHeight = 400;
      if (next < minHeight) next = minHeight;
      if (next > maxHeight) next = maxHeight;
      setTopHeight(next);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const rawTickerAssets = (payoutAssets || []).slice(0, tickerMaxAssets);
  const tickerAssets = Array.from(new Set([selectedAsset, ...rawTickerAssets].filter(Boolean))).slice(0, tickerMaxAssets);

  const filteredPayoutAssets = useMemo(() => {
    const source = Array.isArray(payoutAssets) ? payoutAssets : [];
    const q = assetSearchQuery.trim().toLowerCase();
    if (!q) {
      return source;
    }
    return source.filter((asset) => {
      if (typeof asset !== 'string') {
        return false;
      }
      const value = asset.toLowerCase();
      return value.includes(q);
    });
  }, [payoutAssets, assetSearchQuery]);

  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      
      {/* Data Source Controls */}
      <div
        className="shrink-0 min-h-[140px]"
        style={{ height: topHeight }}
      >
        <Card className="p-3 rounded-lg h-full overflow-y-auto quflx-section-light">
          <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Data Source</h3>
        
        {!backendStatus.readyForAssets && (
          <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-300">
            <div className="flex items-center gap-2">
              <span className="animate-pulse">⚠️</span>
              <span>Backend not ready - checking status...</span>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2">
          <ActionButton icon={<Upload size={14} />} label="Upload CSV" />
          <ActionButton icon={<Activity size={14} />} label="Live Feed" active />
          <ActionButton 
            icon={<RefreshCw size={14} className={autoRefresh ? "animate-spin" : ""} />} 
            label="Get Assets" 
            onClick={() => {
              const options = {};
              if (maxAssetsToStar) {
                options.max_assets = maxAssetsToStar;
              }
              if (specificAssets.trim()) {
                options.target_assets = specificAssets
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean);
              }
              if (otcOnly) {
                options.filter_mode = 'otc';
              }

              setAssetFilterState({
                maxAssets: maxAssetsToStar,
                targetAssets: specificAssets,
                filterMode: otcOnly ? 'otc' : null
              });

              refreshAssets(options);
            }}
            disabled={!backendStatus.readyForAssets}
            title={backendStatus.readyForAssets ? "Refresh available assets with current settings" : "Backend not ready - check status"}
          />
          <ActionButton 
            icon={<History size={14} />} 
            label="Collect History" 
            onClick={() => collectHistory()}
            disabled={!backendStatus.readyForAssets}
            title={backendStatus.readyForAssets ? "Collect history data from favorites" : "Backend not ready - check status"}
          />
        </div>
        
        <div className="mt-2 flex items-center justify-between p-1.5 bg-gray-800 rounded border border-gray-700">
            <span className="text-[10px] uppercase font-bold text-gray-400">Auto Refresh (5m)</span>
            <ToggleSwitch 
              checked={autoRefresh} 
              onChange={toggleAutoRefresh} 
            />
        </div>

        <div className="mt-2 flex items-center justify-between p-1.5 bg-gray-800 rounded border border-gray-700">
          <span className="text-[10px] uppercase font-bold text-gray-400">OTC Only</span>
          <button
            type="button"
            onClick={() => setOtcOnly((prev) => !prev)}
            className={`w-9 h-5 flex items-center rounded-full border transition-colors ${
              otcOnly ? 'bg-accent-green border-accent-green' : 'bg-gray-700 border-gray-500'
            }`}
          >
            <span
              className={`w-4 h-4 bg-black rounded-full transform transition-transform ${
                otcOnly ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {/* NEW: Asset Limit Control */}
        <div className="mt-2 p-2 bg-gray-800 rounded border border-gray-700">
          <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Max Assets to Star</label>
          <input
            type="number"
            min="1"
            max="50"
            value={maxAssetsToStar}
            onChange={(e) => setMaxAssetsToStar(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-300 focus:border-accent-green focus:outline-none"
            title="Maximum number of assets to star (prevents demo account overload)"
          />
        </div>
        
        {/* NEW: Specific Assets Control */}
        <div className="mt-2 p-2 bg-gray-800 rounded border border-gray-700">
          <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Specific Assets (Optional)</label>
          <input
            type="text"
            value={specificAssets}
            onChange={(e) => setSpecificAssets(e.target.value)}
            placeholder="e.g., EURUSD, GBPUSD, AUDNZDOTC"
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-300 focus:border-accent-green focus:outline-none"
            title="Comma-separated list of specific assets to target (leave empty for all eligible)"
          />
        </div>
        </Card>
      </div>

      <div
        onMouseDown={handleResizeStart}
        className="h-2 cursor-row-resize bg-gray-800 hover:bg-accent-green/60 transition-colors rounded flex items-center justify-center"
      >
        <div className="flex gap-1">
          <span className="w-1 h-1 rounded-full bg-gray-500" />
          <span className="w-1 h-1 rounded-full bg-gray-500" />
          <span className="w-1 h-1 rounded-full bg-gray-500" />
        </div>
      </div>

      {/* Assets / Ticker Container */}
      <Card className="p-3 rounded-lg flex-1 flex flex-col min-h-0 quflx-section-light">
        <div className="flex justify-between items-center mb-2 shrink-0">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                {panelMode === 'list' ? '92% Payout Assets' : 'OTC Ticker'}
                {panelMode === 'list' && (
                    <span className="text-xs bg-accent-green text-black px-1.5 py-0.5 rounded font-bold">{payoutAssets.length}</span>
                )}
                <div className="relative group">
                  <HelpCircle className="w-3 h-3 text-gray-400 group-hover:text-gray-200 cursor-help" />
                  <div className="absolute left-0 mt-2 w-64 rounded bg-gray-900 border border-gray-700 p-2 text-[11px] text-gray-200 shadow-lg z-20 hidden group-hover:block">
                    <span className="font-semibold">Workflow:</span>{' '}
                    <span>
                      Set max assets and specific targets in the controls above, then click &quot;Get Assets&quot; to star them in Pocket Option. Select assets manually in the Pocket Option UI to trade.
                    </span>
                  </div>
                </div>
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
            <>
              <div className="mb-2">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/80 border border-gray-700 rounded text-xs text-gray-300">
                  <Search size={14} className="text-gray-400" />
                  <input
                    type="text"
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    placeholder="Search assets..."
                    className="flex-1 bg-transparent outline-none text-xs placeholder:text-gray-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {filteredPayoutAssets.length === 0 ? (
                  <div className="p-2 text-[11px] text-gray-500 text-center border border-dashed border-gray-700 rounded">
                    No assets match your search.
                  </div>
                ) : (
                  filteredPayoutAssets.map((asset) => (
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
                  ))
                )}
              </div>
            </>
        ) : (
            <div className="flex-1 min-h-0 bg-black/20 rounded overflow-hidden">
                <TickerTape assets={tickerAssets} quotesByAssetKey={quotesByAssetKey} />
            </div>
        )}
      </Card>
    </div>
  );
};

const ActionButton = ({ icon, label, active, onClick, disabled, title }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
      disabled 
        ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' 
        : active 
          ? 'bg-accent-green/10 border-accent-green text-accent-green' 
          : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'
    }`}
  >
    {icon}
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

export default AssetPanel;
