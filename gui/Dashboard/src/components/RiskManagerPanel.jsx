import Card from './Card';
import AssetPayoutPanel from './AssetPayoutPanel';

const RiskManagerPanel = () => {
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

      <Card className="p-3 rounded-lg flex-1 overflow-y-auto quflx-section-light">
        <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Risk Manager</h3>
        <p className="text-sm text-gray-400">Risk management tools will appear here. No charts will be displayed in this view.</p>
      </Card>
    </div>
  );
};

export default RiskManagerPanel;

