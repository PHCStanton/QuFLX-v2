import { useState, useRef } from 'react';
import Combobox from './Combobox';
import { X, Layers, Clock, FileText, Eye, EyeOff, RefreshCw } from 'lucide-react';
import ChartActions from './ChartActions';
import NeoSyncButton from './NeoSyncButton';
import syncClickSound from '../assets/Sounds/Click_TF_Sync_Button1.mp3';
import useMarketStore from '../store/marketStore';

const ChartHeader = ({
  selectedAsset,
  setSelectedAsset,
  assetOptions,
  selectedTimeframe,
  handleTimeframeChange,
  timeframeOptions,
  indicatorOptions,
  addIndicator,
  activeIndicators,
  removeIndicator,
  onOpenScreenshot,
  onAskAi,
  isAsking,
  isCapturing,
  onIndicatorClick,
  onIndicatorSuspend,
  onForceRefresh,
  onSyncTimeframe,
  isSyncingTimeframe,
  isTimeframeSyncLinked
}) => {
  const { strategyLabFiles, selectedStrategyFileId, setSelectedStrategyFileId } = useMarketStore();
  const [syncClicked, setSyncClicked] = useState(false);

  const handleSyncClick = async () => {
    if (!onSyncTimeframe || isSyncingTimeframe) return;

    const audio = new Audio(syncClickSound);
    audio.play().catch(() => { });

    setSyncClicked(true);
    window.setTimeout(() => setSyncClicked(false), 1000);
    try {
      await onSyncTimeframe();
    } catch (err) {
      console.error('Sync TimeFrame failed:', err);
    }
  };

  const csvOptionsList = (strategyLabFiles || []).map(f => ({
    value: f.file_id,
    label: f.filename
  }));

  return (
    <div className="p-1.5 border-b border-border-primary bg-card-bg/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="w-36">
          <Combobox
            value={selectedAsset}
            onChange={(val) => {
              setSelectedStrategyFileId(null); // Clear CSV mode if asset changed
              setSelectedAsset(val);
            }}
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
              linked={isTimeframeSyncLinked}
              size={32}
            />
          </div>
        )}

        <div className="w-36">
          <Combobox
            placeholder="CSV Mode..."
            value={selectedStrategyFileId}
            options={csvOptionsList}
            onChange={setSelectedStrategyFileId}
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

        {/* Force-refresh all active indicators */}
        <button
          type="button"
          className="quflx-neo-icon-btn quflx-neo-icon-btn--sm relative hover:text-accent-green transition-colors"
          onClick={() => {
            new Audio(syncClickSound).play().catch(() => { });
            onForceRefresh?.();
          }}
          title="Refresh Indicators"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 px-2">
        <div className="flex-1 flex gap-2 overflow-x-auto items-center justify-end no-scrollbar">
          {activeIndicators.map((ind) => (
            <IndicatorBadge
              key={ind.id}
              name={ind.name}
              value={ind.value}
              suspended={!!ind.suspended}
              onClick={() => onIndicatorClick && onIndicatorClick(ind)}
              onRemove={() => removeIndicator(ind.id)}
              onSuspend={() => onIndicatorSuspend && onIndicatorSuspend(ind.id)}
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

const IndicatorBadge = ({ name, value, suspended, onClick, onRemove, onSuspend }) => {
  // Distinguish single-click (open settings) from double-click (suspend/resume)
  const clickTimer = useRef(null);

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onSuspend?.(); // double-click → suspend/resume
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onClick?.(); // single-click → open settings
      }, 280);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[10px] whitespace-nowrap shadow-sm cursor-pointer transition-all
        ${suspended
          ? 'bg-section-bg/40 border-border-primary/40 opacity-50'
          : 'bg-section-bg/80 border-border-primary hover:border-accent-green/70'
        }`}
      onClick={handleClick}
      title={suspended ? 'Hidden — double-click or click 👁 to restore' : 'Click to configure · Double-click to hide'}
    >
      <span className={`font-bold ${suspended ? 'text-gray-500' : 'text-accent-green'}`}>{name}</span>
      {!suspended && <span className="text-gray-400">{value}</span>}

      {/* Visibility icon — Eye = visible, EyeOff = hidden */}
      <button
        type="button"
        className={`p-0.5 bg-transparent border-none cursor-pointer transition-colors ${suspended ? 'text-yellow-400 hover:text-accent-green' : 'text-gray-500 hover:text-yellow-400'
          }`}
        onClick={(e) => { e.stopPropagation(); onSuspend?.(); }}
        title={suspended ? 'Show indicator' : 'Hide indicator'}
      >
        {suspended ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>

      <X
        size={11}
        className="cursor-pointer text-gray-500 hover:text-red-400"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      />
    </div>
  );
};

export default ChartHeader;
