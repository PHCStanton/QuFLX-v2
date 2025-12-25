import Card from './Card';

const RiskManagerPanel = () => {
  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      <Card className="p-3 rounded-lg h-full overflow-y-auto quflx-section-light">
        <h3 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Risk Manager</h3>
        <p className="text-sm text-gray-400">Risk management tools will appear here.</p>
      </Card>
    </div>
  );
};

export default RiskManagerPanel;

