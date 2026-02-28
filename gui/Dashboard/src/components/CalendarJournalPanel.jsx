import CollapsiblePanel from './CollapsiblePanel';

const CalendarJournalPanel = () => {
  return (
    <div className="col-span-3 flex flex-col gap-2 h-full min-h-0 bg-dashboard-bg p-2 custom-scrollbar overflow-y-auto">
      <CollapsiblePanel
        id="calendar-journal-main"
        title="Calendar & Journal"
        className="flex-1 overflow-y-auto"
      >
        <p className="text-sm text-gray-400">Calendar and journal features will appear here.</p>
      </CollapsiblePanel>
    </div>
  );
};

export default CalendarJournalPanel;
