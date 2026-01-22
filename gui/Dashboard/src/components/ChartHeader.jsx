import { useState } from 'react';
import Combobox from './Combobox';
import { X, Layers, Clock, FileText, RefreshCcw, Link2 } from 'lucide-react';
import ChartActions from './ChartActions';

const ChartHeader = ({
  selectedAsset,
  setSelectedAsset,
  assetOptions,
  selectedTimeframe,
  handleTimeframeChange,
  timeframeOptions,
  csvOptions,
  indicatorOptions,
  addIndicator,
  activeIndicators,
  removeIndicator,
  onOpenScreenshot,
  onAskAi,
  isAsking,
  isCapturing,
  onIndicatorClick,
  onSyncTimeframe,
  isSyncingTimeframe,
  isTimeframeSyncLinked
}) => {
  const [syncClicked, setSyncClicked] = useState(false);

  const handleSyncClick = async () => {
    if (!onSyncTimeframe || isSyncingTimeframe) return;
    setSyncClicked(true);
    window.setTimeout(() => setSyncClicked(false), 1000);
    try {
      await onSyncTimeframe();
    } catch (err) {
      console.error('Sync TimeFrame failed:', err);
    }
  };

  return (
    <div className="p-1.5 border-b border-border-primary bg-card-bg/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="w-36">
          <Combobox 
            value={selectedAsset} 
            onChange={setSelectedAsset} 
            options={assetOptions} 
          />
        </div>

        <div className="w-28">
          <Combobox 
            value={selectedTimeframe} 
            onChange={handleTimeframeChange} 
            options={timeframeOptions}
            icon={Clock}
          />
        </div>

        {onSyncTimeframe && (
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncingTimeframe || selectedTimeframe === 'ticks'}
            title={
              selectedTimeframe === 'ticks'
                ? "Sync disabled for 'ticks'"
                : isTimeframeSyncLinked
                  ? 'Sync TimeFrame with Platform (Linked)'
                  : 'Sync TimeFrame with Platform'
            }
            aria-label={
              selectedTimeframe === 'ticks'
                ? "Sync disabled for 'ticks'"
                : isTimeframeSyncLinked
                  ? 'Sync TimeFrame with Platform (Linked)'
                  : 'Sync TimeFrame with Platform'
            }
            className={`quflx-neo-icon-btn quflx-neo-icon-btn--sm relative disabled:opacity-60 disabled:cursor-not-allowed ${syncClicked ? 'quflx-neo-btn-clicked' : ''} ${isTimeframeSyncLinked ? 'ring-1 ring-accent-green/50 border-accent-green/50' : ''}`}
          >
            <RefreshCcw className="w-3.5 h-3.5 quflx-neo-btn__icon" />
            {isTimeframeSyncLinked ? (
              <span className="absolute -top-1 -right-1 bg-accent-green text-black rounded-full p-0.5 border border-black/40">
                <Link2 className="w-3 h-3" />
              </span>
            ) : null}
          </button>
        )}

        <div className="w-32">
          <Combobox 
            placeholder="CSV..."
            options={csvOptions}
            onChange={() => {}}
            icon={FileText}
          />
        </div>

        <div className="w-32">
          <Combobox 
            placeholder="+ Indicator"
            options={indicatorOptions}
            onChange={(val) => {
              const meta = indicatorOptions.find((o) => o.value === val);
              if (!meta) return;
              const id = `${val}-${Date.now()}`;
              const value =
                meta.displayValue ||
                (meta.params
                  ? Object.values(meta.params)
                      .filter((v) => v !== undefined && v !== null)
                      .join(',')
                  : 'Default');
              addIndicator({
                id,
                name: meta.label,
                value,
                type: val, // Unique indicator type (e.g., 'bollinger_bands', 'rsi')
                key: meta.key,
                kind: meta.kind,
                source: meta.source || 'backend',
                params: meta.params || {},
                paramConfig: meta.paramConfig || []
              });
            }}
            icon={Layers}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3 px-2">
        <div className="flex-1 flex gap-2 overflow-x-auto items-center justify-end no-scrollbar">
          {activeIndicators.map((ind) => (
            <IndicatorBadge 
              key={ind.id} 
              name={ind.name} 
              value={ind.value} 
              onClick={() => onIndicatorClick && onIndicatorClick(ind)}
              onRemove={() => removeIndicator(ind.id)} 
            />
          ))}
        </div>
        <ChartActions
          onOpenScreenshot={onOpenScreenshot}
          onAskAi={onAskAi}
          isAsking={isAsking}
          isCapturing={isCapturing}
        />
      </div>
    </div>
  );
};

const IndicatorBadge = ({ name, value, onClick, onRemove }) => (
  <div
    className="flex items-center gap-1.5 px-2 py-0.5 bg-section-bg/80 rounded border border-border-primary text-[10px] whitespace-nowrap shadow-sm cursor-pointer hover:border-accent-green/70"
    onClick={onClick}
  >
    <span className="text-accent-green font-bold">{name}</span>
    <span className="text-gray-400">{value}</span>
    <X
      size={10}
      className="cursor-pointer hover:text-red-400"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    />
  </div>
);

export default ChartHeader;
