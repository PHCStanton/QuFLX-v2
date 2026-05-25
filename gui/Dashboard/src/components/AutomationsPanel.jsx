import CollapsiblePanel from './CollapsiblePanel';
import ToggleSwitch from './ToggleSwitch';
import useMarketStore from '../store/marketStore';

const AutomationsPanel = () => {
  const { automations, toggleAutomation } = useMarketStore();

  return (
    <CollapsiblePanel 
      id="automations-panel"
      title="Automations"
      className="bg-dashboard-bg"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
          <span className="text-sm">Pending Orders</span>
          <ToggleSwitch 
            checked={automations.pendingOrders} 
            onChange={() => toggleAutomation('pendingOrders')} 
          />
        </div>
      </div>
    </CollapsiblePanel>
  );
};

export default AutomationsPanel;
