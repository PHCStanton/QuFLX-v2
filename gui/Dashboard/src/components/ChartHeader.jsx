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
  isCapturing
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
            placeholder="+ Add"
            options={indicatorOptions}
            onChange={(val) => {
              const label = indicatorOptions.find((o) => o.value === val)?.label;
              addIndicator({ id: val + Date.now(), name: label, value: 'Default' });
            }}
            icon={Layers}
          />
        </div>

        <div className="w-36">
          <Combobox 
            placeholder="Add Object"
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

const IndicatorBadge = ({ name, value, onRemove }) => (
  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-[10px] whitespace-nowrap shadow-sm">
    <span className="text-accent-green font-bold">{name}</span>
    <span className="text-gray-400">{value}</span>
    <X size={10} className="cursor-pointer hover:text-red-400" onClick={onRemove} />
  </div>
);

export default ChartHeader;
