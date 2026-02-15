import { CollapsibleCard } from './Card';
import AssetPayoutPanel from './AssetPayoutPanel';

const LiveTradingPanel = () => {
  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      {/* 92% Payout Assets Section */}
      <div className="flex-none min-h-[40px] max-h-[40%] overflow-hidden">
        <AssetPayoutPanel
          showControls={false}
          defaultIsTopCollapsed={true}
          initialTopHeight={0}
        />
      </div>

      <CollapsibleCard
        className="p-3 rounded-lg flex-1 overflow-y-auto quflx-section-light"
        headerClassName="mb-2"
        headerLeft={<h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Live Trading</h3>}
      >
        <p className="text-sm text-gray-400">Live trading controls will appear here.</p>
      </CollapsibleCard>
    </div>
  );
};

export default LiveTradingPanel;

