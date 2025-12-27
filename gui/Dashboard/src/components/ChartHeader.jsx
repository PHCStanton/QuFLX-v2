import Combobox from './Combobox';
import { X, Layers, Clock, FileText, Plus } from 'lucide-react';
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
  addObjectOptions,
  onAddObjectSelect,
  onOpenScreenshot,
  onAskAi,
  isAsking,
  isCapturing,
  onIndicatorClick
}) => {
  return (
    <div className="p-1.5 border-b border-gray-700 bg-gray-800/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
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

        <div className="w-36">
          <Combobox 
            placeholder="+ Object"
            options={addObjectOptions}
            onChange={onAddObjectSelect}
            icon={Plus}
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
    className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-[10px] whitespace-nowrap shadow-sm cursor-pointer hover:border-accent-green/70"
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
