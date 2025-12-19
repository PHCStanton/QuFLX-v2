import { Bot } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';

const TopBar = () => {
  const { 
    wsStatus, 
    chromeStatus, 
  } = useMarketStore();

  const health = useStreamHealth();

  return (
    <header className="h-16 bg-card-bg border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <StatusBadge label="WS" status={wsStatus} />
        <StatusBadge label="Chrome" status={chromeStatus} />
        <StatusBadge label="Stream" status={health} />
      </div>
      
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
          <Bot size={18} />
          <span>Ask AI</span>
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
