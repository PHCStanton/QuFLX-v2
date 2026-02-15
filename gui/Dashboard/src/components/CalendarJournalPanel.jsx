import { CollapsibleCard } from './Card';

const CalendarJournalPanel = () => {
  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0">
      <CollapsibleCard
        className="p-3 rounded-lg h-full overflow-y-auto quflx-section-light"
        headerClassName="mb-2"
        headerLeft={<h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Calendar & Journal</h3>}
      >
        <p className="text-sm text-gray-400">Calendar and journal features will appear here.</p>
      </CollapsibleCard>
    </div>
  );
};

export default CalendarJournalPanel;
