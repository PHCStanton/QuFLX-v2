import CollapsiblePanel from './CollapsiblePanel';
import AssetPayoutPanel from './AssetPayoutPanel';

const RiskManagerPanel = () => {
  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0 bg-dashboard-bg p-2 custom-scrollbar overflow-y-auto">
      {/* 92% Payout Assets Section */}
      <CollapsiblePanel
        id="risk-manager-assets"
        title="92% Payout Assets"
        defaultOpen={false}
        expandable={true}
        className="bg-section-bg"
      >
        <div className="overflow-hidden rounded-lg">
          <AssetPayoutPanel
            showControls={false}
          />
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="risk-manager-main"
        title="Risk Manager"
        expandable={true}
        className="bg-section-bg"
      >
        <p className="text-sm text-gray-400">Risk management tools will appear here. No charts will be displayed in this view.</p>
      </CollapsiblePanel>
    </div>
  );
};

export default RiskManagerPanel;

