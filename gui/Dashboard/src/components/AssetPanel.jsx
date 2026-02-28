import AssetPayoutPanel from './AssetPayoutPanel';
import CollapsiblePanel from './CollapsiblePanel';

const AssetPanel = () => {
  return (
    <div className="col-span-3 h-full flex flex-col gap-3 overflow-y-auto custom-scrollbar p-2">
      <CollapsiblePanel 
        id="asset-payout-main"
        title="92% ASSET PAYOUT"
        className="bg-dashboard-bg"
        bodyClassName="p-0"
      >
        <AssetPayoutPanel />
      </CollapsiblePanel>
    </div>
  );
};

export default AssetPanel;
