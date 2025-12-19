import Combobox from './Combobox';
import { X, Layers, Clock, FileText } from 'lucide-react';

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
  removeIndicator
}) => {
  return (
    <div className="p-1.5 border-b border-gray-700 bg-gray-800/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
      <div className="w-36">
        <Combobox 
          label="Asset" 
          value={selectedAsset} 
          onChange={setSelectedAsset} 
          options={assetOptions} 
        />
      </div>

      <div className="w-28">
        <Combobox 
          label="Time" 
          value={selectedTimeframe} 
          onChange={handleTimeframeChange} 
          options={timeframeOptions}
          icon={Clock}
        />
      </div>

      <div className="w-32">
        <Combobox 
          label="Import" 
          placeholder="CSV..."
          options={csvOptions}
          onChange={() => {}}
          icon={FileText}
        />
      </div>

      <div className="w-32">
        <Combobox 
          label="Indicators" 
          placeholder="+ Add"
          options={indicatorOptions}
          onChange={(val) => {
            const label = indicatorOptions.find(o => o.value === val)?.label;
            addIndicator({ id: val + Date.now(), name: label, value: 'Default' });
          }}
          icon={Layers}
        />
      </div>

      {/* Active Indicators */}
      <div className="flex-1 flex gap-2 overflow-x-auto items-center justify-end no-scrollbar px-2">
         {activeIndicators.map((ind) => (
          <IndicatorBadge 
            key={ind.id} 
            name={ind.name} 
            value={ind.value} 
            onRemove={() => removeIndicator(ind.id)} 
          />
        ))}
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
