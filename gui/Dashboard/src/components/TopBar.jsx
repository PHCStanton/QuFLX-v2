import { useEffect, useState } from 'react';
import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';
import StatusIndicator from './StatusIndicator';
import ProfileMenu from './ProfileMenu';

const TopBar = () => {
  const { 
    wsStatus, 
    chromeStatus 
  } = useMarketStore();

  const health = useStreamHealth();
  const [theme, setTheme] = useState('default');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'orange-dark') {
      root.classList.add('theme-orange-dark');
    } else {
      root.classList.remove('theme-orange-dark');
    }
  }, [theme]);

  return (
    <header className="h-16 quflx-topbar bg-card-bg border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <StatusIndicator />
        <StatusBadge label="WS" status={wsStatus} />
        <StatusBadge label="Chrome" status={chromeStatus} />
        <StatusBadge label="Stream" status={health} />
      </div>
      
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="text-text-secondary">Theme</span>
          <div className="bg-gray-800 border border-gray-700 rounded-full p-1 flex">
            <button
              type="button"
              onClick={() => setTheme('default')}
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                theme === 'default'
                  ? 'bg-accent-green/20 text-accent-green'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Default
            </button>
            <button
              type="button"
              onClick={() => setTheme('orange-dark')}
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                theme === 'orange-dark'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Órange Dark
            </button>
          </div>
        </div>

        <ProfileMenu />
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
