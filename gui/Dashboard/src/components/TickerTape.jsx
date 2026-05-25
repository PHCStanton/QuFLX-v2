import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { normalizeSpecificAsset as normalizeAsset } from '../utils/assetUtils';

const formatPrice = (price) => {
  if (!Number.isFinite(price)) return '--';
  return price >= 100 ? price.toFixed(2) : price.toFixed(5);
};

const formatPct = (pct) => {
  if (!Number.isFinite(pct)) return '0.00%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

const buildItems = (assets, quotesByAssetKey) => {
  const list = (assets || []).filter(Boolean);
  const seen = new Set();
  return list.reduce((acc, label) => {
    const assetKey = normalizeAsset(label);
    if (!assetKey || seen.has(assetKey)) {
      return acc;
    }
    seen.add(assetKey);
    const quote = quotesByAssetKey?.[assetKey];
    const price = Number(quote?.price);
    const changePct = Number(quote?.changePct);
    acc.push({
      assetKey,
      label,
      price,
      changePct,
    });
    return acc;
  }, []);
};

const TickerTape = ({
  assets,
  quotesByAssetKey,
  selectedAsset,
  selectedAssetLoading,
  onReloadAndSelectAsset,
}) => {
  const items = buildItems(assets, quotesByAssetKey);

  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 text-xs">
        No ticker assets yet. Click “Get Assets”.
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded bg-black/20 border border-gray-800 flex flex-col">
      <div className="flex-1 overflow-y-auto pr-1 space-y-1">
        {items.map((it) => {
          const isSelected = selectedAsset === it.label;
          const isUp = Number.isFinite(it.changePct) ? it.changePct >= 0 : true;
          const color = isUp ? 'text-accent-green' : 'text-red-400';
          const Icon = isUp ? TrendingUp : TrendingDown;

          return (
            <div
              key={it.assetKey}
              onClick={() => !selectedAssetLoading && onReloadAndSelectAsset && onReloadAndSelectAsset(it.label)}
              className={`flex items-center justify-between px-3 py-1.5 rounded border transition-all ${
                isSelected
                  ? 'bg-accent-green/10 border-accent-green/40 shadow-[0_0_10px_rgba(34,197,94,0.05)]'
                  : 'border-gray-700 bg-gray-900/60 hover:bg-gray-800 hover:border-gray-600'
              } ${selectedAssetLoading ? 'cursor-wait' : 'cursor-pointer'} ${
                selectedAssetLoading && isSelected ? 'opacity-80' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold ${isSelected ? 'text-accent-green' : 'text-gray-200'}`}>
                  {it.label}
                </span>
                {isSelected && selectedAssetLoading && (
                  <RefreshCw size={10} className="animate-spin text-accent-green" />
                )}
              </div>
              <span className="text-[11px] font-mono text-gray-200">{formatPrice(it.price)}</span>
              <span className={`text-[11px] font-bold ${color} inline-flex items-center gap-1`}>
                <Icon size={14} />
                {formatPct(it.changePct)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TickerTape;
