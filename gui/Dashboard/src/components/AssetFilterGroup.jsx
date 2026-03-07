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
      <div className="mt-4 grid grid-cols-2 gap-4 px-1">
        <div className="relative p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[inset_6px_6px_12px_#07070a,inset_-6px_-6px_12px_#1b1b24]">
          <label className="block text-[8px] uppercase font-black text-text-secondary mb-2 tracking-[0.2em]">Max Assets</label>
          <input
            type="number"
            min="1"
            max="50"
            value={maxAssetsToStar}
            onChange={(e) => onMaxAssetsChange(e.target.value)}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-xl text-xs text-text-primary focus:border-accent-green/50 focus:outline-none focus:shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-all"
            title="Maximum number of assets to star"
          />
        </div>
        <div className="relative p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[inset_6px_6px_12px_#07070a,inset_-6px_-6px_12px_#1b1b24]">
          <label className="block text-[8px] uppercase font-black text-text-secondary mb-2 tracking-[0.2em]">Min Payout %</label>
          <input
            type="number"
            min="1"
            max="100"
            value={minPayout}
            onChange={(e) => onMinPayoutChange(e.target.value)}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-xl text-xs text-text-primary focus:border-accent-green/50 focus:outline-none focus:shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-all"
            title="Minimum payout percentage to consider"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 px-1">
        <div className="relative p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[inset_6px_6px_12px_#07070a,inset_-6px_-6px_12px_#1b1b24] min-h-[140px]">
          <label className="block text-[8px] uppercase font-black text-text-secondary mb-2 tracking-[0.2em]">Include Assets (Optional)</label>
          <input
            type="text"
            value={includeAssets}
            onChange={(e) => onIncludeAssetsChange(e.target.value)}
            placeholder="e.g., EURUSDOTC, GBPUSDOTC"
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-xl text-xs text-text-primary focus:border-accent-green/50 focus:outline-none focus:shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-all"
            title="Always include and prioritize these assets"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {includeAssetList.length === 0 ? (
              <span className="text-[10px] text-text-secondary opacity-50 italic">No included assets</span>
            ) : (
              includeAssetList.map((asset) => (
                <div
                  key={asset}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green border border-accent-green/20 text-[9px] font-bold tracking-tight shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-all hover:scale-105"
                >
                  <span>{asset}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIncludeAsset(asset)}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-accent-green/20 text-accent-green/70 hover:text-accent-green"
                    title="Remove from include"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="relative p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[inset_6px_6px_12px_#07070a,inset_-6px_-6px_12px_#1b1b24] min-h-[140px]">
          <label className="block text-[8px] uppercase font-black text-text-secondary mb-2 tracking-[0.2em]">Ignore Assets (Optional)</label>
          <input
            type="text"
            value={ignoreAssets}
            onChange={(e) => onIgnoreAssetsChange(e.target.value)}
            placeholder="e.g., EURUSD, AUDCADOTC"
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-xl text-xs text-text-primary focus:border-accent-green/50 focus:outline-none focus:shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-all"
            title="Always ignore these assets"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {ignoreAssetList.length === 0 ? (
              <span className="text-[10px] text-text-secondary opacity-50 italic">No ignored assets</span>
            ) : (
              ignoreAssetList.map((asset) => (
                <div
                  key={asset}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-bold tracking-tight shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-all hover:scale-105"
                >
                  <span>{asset}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIgnoreAsset(asset)}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-400/70 hover:text-red-400"
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

