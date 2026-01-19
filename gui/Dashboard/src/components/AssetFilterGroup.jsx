const AssetFilterGroup = ({
  maxAssetsToStar,
  onMaxAssetsChange,
  minPayout,
  onMinPayoutChange,
  specificAssets,
  onSpecificAssetsChange,
  specificAssetMode,
  onSpecificAssetModeChange
}) => {
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="p-2 bg-section-bg/50 rounded border border-border-primary">
          <label className="block text-[10px] uppercase font-bold text-text-secondary mb-1">Max Assets</label>
          <input
            type="number"
            min="1"
            max="50"
            value={maxAssetsToStar}
            onChange={(e) => onMaxAssetsChange(e.target.value)}
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
            onChange={(e) => onMinPayoutChange(e.target.value)}
            className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
            title="Minimum payout percentage to consider"
          />
        </div>
      </div>

      <div className="mt-2 p-2 bg-section-bg/50 rounded border border-border-primary">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[10px] uppercase font-bold text-text-secondary">Specific Assets (Optional)</label>
          <div className="flex bg-card-bg rounded p-0.5 border border-border-primary">
            <button
              type="button"
              onClick={() => onSpecificAssetModeChange('include')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                specificAssetMode === 'include'
                  ? 'bg-accent-green text-white dark:text-black'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Prioritize these assets and fill remaining slots"
            >
              INCLUDE
            </button>
            <button
              type="button"
              onClick={() => onSpecificAssetModeChange('ignore')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                specificAssetMode === 'ignore'
                  ? 'bg-accent-green text-white dark:text-black'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Ignore these assets"
            >
              IGNORE
            </button>
          </div>
        </div>
        <input
          type="text"
          value={specificAssets}
          onChange={(e) => onSpecificAssetsChange(e.target.value)}
          placeholder={specificAssetMode === 'include' ? 'e.g., EURUSD, GBPUSD' : 'Exclude e.g., AUDCADOTC'}
          className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
          title={specificAssetMode === 'include' ? 'Prioritize these assets' : 'Skip these assets entirely'}
        />
      </div>
    </>
  );
};

export default AssetFilterGroup;

