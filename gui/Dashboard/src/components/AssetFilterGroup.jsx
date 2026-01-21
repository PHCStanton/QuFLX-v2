import { X } from 'lucide-react';

const AssetFilterGroup = ({
  maxAssetsToStar,
  onMaxAssetsChange,
  minPayout,
  onMinPayoutChange,
  includeAssets,
  onIncludeAssetsChange,
  includeAssetList,
  onRemoveIncludeAsset,
  ignoreAssets,
  onIgnoreAssetsChange,
  ignoreAssetList,
  onRemoveIgnoreAsset
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

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="p-2 bg-section-bg/50 rounded border border-border-primary min-h-[108px]">
          <label className="block text-[10px] uppercase font-bold text-text-secondary mb-1">Include Assets (Optional)</label>
          <input
            type="text"
            value={includeAssets}
            onChange={(e) => onIncludeAssetsChange(e.target.value)}
            placeholder="e.g., EURUSDOTC, GBPUSDOTC"
            className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
            title="Always include and prioritize these assets"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {includeAssetList.length === 0 ? (
              <span className="text-[10px] text-text-secondary opacity-70">No included assets</span>
            ) : (
              includeAssetList.map((asset) => (
                <div
                  key={asset}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green border border-accent-green/30 text-[10px]"
                >
                  <span className="font-semibold">{asset}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIncludeAsset(asset)}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-accent-green/20"
                    title="Remove from include"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-2 bg-section-bg/50 rounded border border-border-primary min-h-[108px]">
          <label className="block text-[10px] uppercase font-bold text-text-secondary mb-1">Ignore Assets (Optional)</label>
          <input
            type="text"
            value={ignoreAssets}
            onChange={(e) => onIgnoreAssetsChange(e.target.value)}
            placeholder="e.g., EURUSD, AUDCADOTC"
            className="w-full px-2 py-1 bg-card-bg border border-border-primary rounded text-xs text-text-primary focus:border-accent-green focus:outline-none"
            title="Always ignore these assets"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {ignoreAssetList.length === 0 ? (
              <span className="text-[10px] text-text-secondary opacity-70">No ignored assets</span>
            ) : (
              ignoreAssetList.map((asset) => (
                <div
                  key={asset}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[10px]"
                >
                  <span className="font-semibold">{asset}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIgnoreAsset(asset)}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-red-500/20"
                    title="Remove from ignore"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AssetFilterGroup;

