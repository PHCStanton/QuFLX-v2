import Card from './Card';
import ToggleSwitch from './ToggleSwitch';
import useMarketStore from '../store/marketStore';

const AutomationsPanel = () => {
  const { automations, toggleAutomation } = useMarketStore();

  return (
    <Card className="p-4 rounded-lg h-full">
      <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Automations</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
          <span className="text-sm">Auto-Select Favorites</span>
          <ToggleSwitch 
            checked={automations.autoSelectFavorites} 
            onChange={() => toggleAutomation('autoSelectFavorites')} 
          />
        </div>
        <div className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
          <span className="text-sm">Pending Orders</span>
          <ToggleSwitch 
            checked={automations.pendingOrders} 
            onChange={() => toggleAutomation('pendingOrders')} 
          />
        </div>
      </div>
    </Card>
  );
};

export default AutomationsPanel;
