import { useState, useMemo, useRef } from 'react';
import Card from './Card';
import { Upload, Activity, Search, RefreshCw, History, HelpCircle, X, ChevronUp, ChevronDown } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import ToggleSwitch from './ToggleSwitch';
import TickerTape from './TickerTape';
import NeomorphicSwitch from './NeomorphicSwitch';

const AssetPanel = () => {
  const { 
    payoutAssets, 
    selectedAsset, 
    setSelectedAsset,
    selectedAssetLoading,
    removePayoutAsset,
    refreshAssets,
    autoRefresh,
    toggleAutoRefresh,
    panelMode,
    setPanelMode,
    quotesByAssetKey,
    tickerMaxAssets,
    backendStatus,
    collectHistory,
    setAssetFilterState,
    runAssetBatch,
  } = useMarketStore();

  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [maxAssetsToStar, setMaxAssetsToStar] = useState(5); // Default changed to 5 as requested
  const [minPayout, setMinPayout] = useState(92); // Default payout threshold
  const [specificAssets, setSpecificAssets] = useState(''); // NEW: Specific assets to target
  const [specificAssetMode, setSpecificAssetMode] = useState('ignore'); // 'include' or 'ignore'
  const [otcOnly, setOtcOnly] = useState(false);
  const [topHeight, setTopHeight] = useState(220);
  const [isTopCollapsed, setIsTopCollapsed] = useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
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
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0 justify-between">
      
      {/* Data Source Controls */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isTopCollapsed 
            ? 'h-10 min-h-0 shrink-0' 
            : isBottomCollapsed 
              ? 'flex-1 min-h-0' 
              : 'shrink-0 min-h-[140px]'
        }`}
        style={{ height: isTopCollapsed ? 40 : (isBottomCollapsed ? undefined : topHeight) }}
      >
        <Card className={`p-3 rounded-lg h-full quflx-section-light flex flex-col ${isTopCollapsed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Data Source</h3>
            <button 
              onClick={() => setIsTopCollapsed(!isTopCollapsed)}
              className="p-1 hover:bg-section-bg/50 rounded text-text-secondary transition-colors"
            >
              {isTopCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        
        {!isTopCollapsed && (
          <>
            {!backendStatus.readyForAssets && (
              <div className="mb-2 p-2 bg-yellow-500/10 dark:bg-yellow-900/20 border border-yellow-500/50 dark:border-yellow-700/50 rounded text-xs text-yellow-700 dark:text-yellow-300">
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
                  const options = {
                    min_pct: minPayout
                  };
                  if (maxAssetsToStar) {
                    options.max_assets = maxAssetsToStar;
                  }
                  if (specificAssets.trim()) {
                    options.target_assets = specificAssets
                      .split(/[,\s;]+/)
                      .map((a) => a.trim())
                      .filter(Boolean);
                    options.target_assets_mode = specificAssetMode;
                  }
                  if (otcOnly) {
                    options.filter_mode = 'otc';
                  }

                  setAssetFilterState({
                    maxAssets: maxAssetsToStar,
                    minPayout: minPayout,
                    targetAssets: specificAssets,
                    targetAssetsMode: specificAssetMode,
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

            <div className="mt-2">
              <ActionButton
                icon={<Activity size={14} />}
                label="Asset Run"
                onClick={runAssetBatch}
                disabled={!backendStatus.readyForAssets || !(payoutAssets && payoutAssets.length)}
                title={backendStatus.readyForAssets ? "Run automation over current 92% payout assets" : "Backend not ready - check status"}
              />
            </div>
            
            <div className="mt-2 flex items-center justify-between p-1.5 bg-section-bg/50 rounded border border-border-primary">
                <span className="text-[10px] uppercase font-bold text-text-secondary">Auto Refresh (5m)</span>
                <ToggleSwitch 
                  checked={autoRefresh} 
                  onChange={toggleAutoRefresh} 
                />
            </div>

            <div className="mt-2 flex items-center justify-between p-1.5 bg-section-bg/50 rounded border border-border-primary">
              <span className="text-[10px] uppercase font-bold text-text-secondary">OTC Only</span>
              <ToggleSwitch 
                checked={otcOnly} 
                onChange={() => setOtcOnly((prev) => !prev)} 
              />
            </div>
            
            {/* NEW: Asset Limit & Payout Controls */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="p-2 bg-section-bg/50 rounded border border-border-primary">
                <label className="block text-[10px] uppercase font-bold text-text-secondary mb-1">Max Assets</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={maxAssetsToStar}
                  onChange={(e) => setMaxAssetsToStar(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))}
                  className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
                  title="Maximum number of assets to star"
                />
              </div>
              <div className="p-2 bg-section-bg/50 rounded border border-border-primary">
                <label className="block text-[10px] uppercase font-bold text-text-secondary mb-1">Min Payout %</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={minPayout}
                  onChange={(e) => setMinPayout(Math.max(1, Math.min(100, parseInt(e.target.value) || 92)))}
                  className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
                  title="Minimum payout percentage to consider"
                />
              </div>
            </div>
            
            {/* NEW: Specific Assets Control */}
            <div className="mt-2 p-2 bg-section-bg/50 rounded border border-border-primary">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] uppercase font-bold text-text-secondary">Specific Assets (Optional)</label>
                <div className="flex bg-card-bg rounded p-0.5 border border-border-primary">
                  <button 
                    onClick={() => setSpecificAssetMode('include')}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${specificAssetMode === 'include' ? 'bg-accent-green text-white dark:text-black' : 'text-text-secondary hover:text-text-primary'}`}
                    title="Prioritize these assets and fill remaining slots"
                  >
                    INCLUDE
                  </button>
                  <button 
                    onClick={() => setSpecificAssetMode('ignore')}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${specificAssetMode === 'ignore' ? 'bg-accent-green text-white dark:text-black' : 'text-text-secondary hover:text-text-primary'}`}
                    title="Ignore these assets"
                  >
                    IGNORE
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={specificAssets}
                onChange={(e) => setSpecificAssets(e.target.value)}
                placeholder={specificAssetMode === 'include' ? "e.g., EURUSD, GBPUSD" : "Exclude e.g., AUDCADOTC"}
                className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
                title={specificAssetMode === 'include' ? "Prioritize these assets" : "Skip these assets entirely"}
              />
            </div>
          </>
        )}
        </Card>
      </div>

      {!isTopCollapsed && !isBottomCollapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="h-2 cursor-row-resize bg-section-bg/50 hover:bg-accent-green/60 transition-colors rounded flex items-center justify-center border-y border-border-primary shrink-0"
        >
          <div className="flex gap-1">
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
          </div>
        </div>
      )}

      {/* Assets / Ticker Container */}
      <Card className={`p-3 rounded-lg flex flex-col min-h-0 quflx-section-light transition-all duration-300 ease-in-out ${isBottomCollapsed ? 'h-10 flex-none overflow-hidden' : 'flex-1'}`}>
        <div className="flex justify-between items-center mb-2 shrink-0">
            <div className="flex items-center gap-2">
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
              <button 
                onClick={() => setIsBottomCollapsed(!isBottomCollapsed)}
                className="p-1 hover:bg-section-bg/50 rounded text-text-secondary transition-colors"
              >
                {isBottomCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* View Toggle */}
            {!isBottomCollapsed && (
              <NeomorphicSwitch 
                checked={panelMode === 'ticker'}
                onChange={() => setPanelMode(panelMode === 'list' ? 'ticker' : 'list')}
                leftLabel="92% Assets"
                rightLabel="Ticker View"
              />
            )}
        </div>

        {!isBottomCollapsed && (
          <>
            {panelMode === 'list' ? (
                <>
                  <div className="mb-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-section-bg/50 border border-border-primary rounded text-xs text-text-primary">
                      <Search size={14} className="text-text-secondary" />
                      <input
                        type="text"
                        value={assetSearchQuery}
                        onChange={(e) => setAssetSearchQuery(e.target.value)}
                        placeholder="Search assets..."
                        className="flex-1 bg-transparent outline-none text-xs placeholder:text-text-secondary"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                    {filteredPayoutAssets.length === 0 ? (
                      <div className="p-2 text-[11px] text-text-secondary text-center border border-dashed border-border-primary rounded">
                        No assets match your search.
                      </div>
                    ) : (
                      filteredPayoutAssets.map((asset) => (
                        <div 
                          key={asset}
                          onClick={() => !selectedAssetLoading && setSelectedAsset(asset)}
                          className={`p-1.5 rounded flex justify-between items-center transition-colors ${
                            selectedAsset === asset 
                              ? 'bg-accent-green/20 text-accent-green border border-accent-green/50' 
                              : 'hover:bg-section-bg/50 text-text-secondary'
                          } ${selectedAssetLoading ? 'cursor-wait opacity-80' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePayoutAsset(asset);
                              }}
                              className="w-4 h-4 flex items-center justify-center rounded-full border border-border-primary text-text-secondary hover:bg-red-600/80 hover:border-red-500 hover:text-white text-[10px] flex-shrink-0"
                              title="Remove asset from this list"
                            >
                              <X size={10} />
                            </button>
                            <span className="font-medium text-sm">{asset}</span>
                            {selectedAsset === asset && selectedAssetLoading && (
                              <RefreshCw size={12} className="animate-spin text-accent-green ml-1" />
                            )}
                          </div>
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
          </>
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
        ? 'bg-section-bg/20 border-border-primary text-text-secondary/50 cursor-not-allowed' 
        : active 
          ? 'bg-accent-green/20 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.2)]' 
          : 'bg-section-bg/80 border-border-primary hover:border-accent-green/50 hover:text-accent-green text-text-secondary'
    }`}
  >
    {icon}
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

export default AssetPanel;
