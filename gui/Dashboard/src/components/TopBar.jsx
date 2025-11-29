import React from 'react';
import { Monitor, Wifi } from 'lucide-react';
import useMarketStore from '../store/marketStore';

const TopBar = () => {
  const { wsStatus, chromeStatus, streamStatus } = useMarketStore();

  return (
    <header className="h-16 bg-card-bg border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <StatusBadge label="WS" status={wsStatus} />
        <StatusBadge label="Chrome" status={chromeStatus} />
        <StatusBadge label="Stream" status={streamStatus} />
      </div>
      
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
          <Monitor size={16} />
          <span>Start Chrome</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors">
          <Wifi size={16} />
          <span>Connect WS</span>
        </button>
      </div>
    </header>
  );
};

const StatusBadge = ({ label, status }) => {
  const getStatusColor = (s) => {
    switch(s) {
      case 'connected': return 'bg-accent-green';
      case 'streaming': return 'bg-accent-green animate-pulse';
      case 'error': return 'bg-accent-red';
      default: return 'bg-yellow-500';
    }
  };
  
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded border border-gray-700">
      <span className="text-xs font-bold text-gray-400 uppercase">{label}</span>
      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
    </div>
  );
};

export default TopBar;
