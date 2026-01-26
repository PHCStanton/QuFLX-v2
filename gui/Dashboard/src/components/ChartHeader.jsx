import { useState } from 'react';
import Combobox from './Combobox';
import { X, Layers, Clock, FileText } from 'lucide-react';
import ChartActions from './ChartActions';
import NeoSyncButton from './NeoSyncButton';

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
          <div className="ml-1">
            <NeoSyncButton
              onClick={handleSyncClick}
              disabled={isSyncingTimeframe || selectedTimeframe === 'ticks'}
              active={syncClicked}
              size={38}
            />
          </div>
        )}



        <div className="w-32">
          <Combobox
            placeholder="CSV..."
            options={csvOptions}
            onChange={() => { }}
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

        {/* Placeholder for future Refresh Feature */}
        <button
          type="button"
          className="quflx-neo-icon-btn quflx-neo-icon-btn--sm relative opacity-50 cursor-not-allowed"
          disabled
          title="Refresh Feature (Coming Soon)"
        >
          <span className="text-xs font-bold text-gray-400">REF</span>
        </button>
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
