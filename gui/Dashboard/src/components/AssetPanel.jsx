import AssetPayoutPanel from './AssetPayoutPanel';
import CollapsiblePanel from './CollapsiblePanel';

const AssetPanel = () => {
  return (
    <div className="col-span-3 h-full flex flex-col gap-3 overflow-y-auto custom-scrollbar p-2">
      <AssetPayoutPanel />
    </div>
  );
};

export default AssetPanel;
