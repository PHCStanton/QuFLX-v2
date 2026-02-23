import { useMemo } from 'react';
import Card from './Card';
import TickerTape from './TickerTape';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Search, RefreshCw, HelpCircle, X, ChevronUp, ChevronDown, Plus, Minus, Check, Zap } from 'lucide-react';

const AssetListView = ({
  isCollapsed,
  onToggleCollapsed,
  panelMode,
  onTogglePanelMode,
  minPayout,
  payoutAssets,
  selectedAsset,
  selectedAssetLoading,
  onSelectAsset,
  onRemoveAsset,
  onAddToInclude,
  onAddToIgnore,
  onRemoveFromInclude,
  onRemoveFromIgnore,
  isAssetIncluded,
  isAssetIgnored,
  quotesByAssetKey,
  tickerAssets,
  assetSearchQuery,
  onSearchQueryChange,
  onUseForTrade
}) => {
  const filteredPayoutAssets = useMemo(() => {
    const source = Array.isArray(payoutAssets) ? payoutAssets : [];
    const q = String(assetSearchQuery || '').trim().toLowerCase();
    if (!q) {
      return source;
    }
    return source.filter((asset) => {
      if (typeof asset !== 'string') {
        return false;
      }
      return asset.toLowerCase().includes(q);
    });
  }, [payoutAssets, assetSearchQuery]);

  const count = Array.isArray(payoutAssets) ? payoutAssets.length : 0;

  return (
    <Card
      className={`p-3 rounded-lg flex flex-col min-h-0 quflx-section-light transition-all duration-300 ease-in-out ${isCollapsed ? 'h-10 flex-none overflow-hidden' : 'flex-1'
        }`}
    >
      <div
        className="flex justify-between items-center mb-2 shrink-0 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={onToggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapsed();
          }
        }}
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            {panelMode === 'list' ? `${minPayout}% Payout Assets` : 'OTC Ticker'}
            {panelMode === 'list' && (
              <span className="text-xs bg-accent-green text-black px-1.5 py-0.5 rounded font-bold">{count}</span>
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
        </div>

        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <div onClick={(e) => e.stopPropagation()}>
              <NeomorphicSwitch
                checked={panelMode === 'ticker'}
                onChange={onTogglePanelMode}
                leftLabel={`${minPayout}% Assets`}
                rightLabel="Ticker View"
              />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            className="p-1 hover:bg-section-bg/50 rounded text-text-secondary transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {panelMode === 'list' ? (
            <>
              <div className="mb-2">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-section-bg/50 border border-border-primary rounded text-xs text-text-primary">
                  <Search size={14} className="text-text-secondary" />
                  <input
                    type="text"
                    value={assetSearchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
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
                      onClick={() => !selectedAssetLoading && onSelectAsset(asset)}
                      className={`p-1.5 rounded flex justify-between items-center transition-colors ${selectedAsset === asset
                        ? 'bg-accent-green/20 text-accent-green border border-accent-green/50'
                        : 'hover:bg-section-bg/50 text-text-secondary'
                        } ${selectedAssetLoading ? 'cursor-wait opacity-80' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveAsset(asset);
                          }}
                          className="w-4 h-4 flex items-center justify-center rounded-full border border-border-primary text-text-secondary hover:bg-red-600/80 hover:border-red-500 hover:text-white text-[10px] flex-shrink-0"
                          title="Remove asset from this list"
                        >
                          <X size={10} />
                        </button>
                        <span className="font-medium text-sm">{asset}</span>
                        {onUseForTrade && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUseForTrade(asset);
                            }}
                            className="p-1 rounded bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/30 transition-all ml-1"
                            title="Use for Live Trade"
                          >
                            <Zap size={10} />
                          </button>
                        )}
                        {selectedAsset === asset && selectedAssetLoading && (
                          <RefreshCw size={12} className="animate-spin text-accent-green ml-1" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70">{minPayout}%</span>
                        <div className="flex items-center gap-1">
                          {isAssetIncluded(asset) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFromInclude(asset);
                              }}
                              className="w-5 h-5 flex items-center justify-center rounded bg-accent-green/20 text-accent-green border border-accent-green/50 hover:bg-accent-green/30 transition-colors"
                              title="Included - click to remove"
                            >
                              <Check size={12} />
                            </button>
                          ) : isAssetIgnored(asset) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFromIgnore(asset);
                              }}
                              className="w-5 h-5 flex items-center justify-center rounded bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 transition-colors"
                              title="Ignored - click to remove"
                            >
                              <Minus size={12} />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToInclude(asset);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded bg-section-bg/50 text-text-secondary border border-border-primary hover:bg-accent-green/20 hover:text-accent-green hover:border-accent-green/50 transition-colors"
                                title="Add to INCLUDE filter"
                              >
                                <Plus size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToIgnore(asset);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded bg-section-bg/50 text-text-secondary border border-border-primary hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-colors"
                                title="Add to IGNORE filter"
                              >
                                <Minus size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
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
  );
};

export default AssetListView;

