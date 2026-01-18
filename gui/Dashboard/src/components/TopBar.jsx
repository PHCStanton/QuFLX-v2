import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';
import StatusIndicator from './StatusIndicator';
import ProfileMenu from './ProfileMenu';

const TopBar = () => {
  const { 
    wsStatus, 
    chromeStatus,
    opsChromeBusy,
    opsStreamBusy,
    startChrome,
    startStream,
    pauseStream
  } = useMarketStore();

  const health = useStreamHealth();

  return (
    <header className="h-16 quflx-topbar bg-card-bg border-b border-border-primary flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <StatusIndicator />
        <StatusBadge label="WS" status={wsStatus} />
        <StatusBadge
          label="Chrome"
          status={chromeStatus}
          onClick={startChrome}
          disabled={opsChromeBusy}
          busyLabel="Starting..."
        />
        <StatusBadge
          label="Stream"
          status={health}
          onClick={health === 'streaming' ? pauseStream : startStream}
          disabled={opsStreamBusy}
          busyLabel={health === 'streaming' ? 'Pausing...' : 'Starting...'}
        />
      </div>
      
      <div className="flex items-center gap-4">
        <ProfileMenu />
      </div>
    </header>
  );
};

const StatusBadge = ({ label, status, onClick, disabled, busyLabel }) => {
  const getStatusColor = (s) => {
    switch(s) {
      case 'connected': return 'bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.6)]';
      case 'streaming': return 'bg-accent-green animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]';
      case 'error': return 'bg-accent-red shadow-[0_0_8px_rgba(239,68,68,0.6)]';
      default: return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';
    }
  };
  
  const labelText = disabled && busyLabel ? busyLabel : label;

  const className = `flex items-center gap-2 px-3 py-1 bg-section-bg/30 backdrop-blur-sm rounded border border-border-primary shadow-inner ${
    onClick ? 'hover:bg-section-bg/50 focus:outline-none focus:ring-2 focus:ring-accent-blue/60' : ''
  } ${disabled ? 'opacity-70 cursor-not-allowed' : onClick ? 'cursor-pointer' : ''}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} disabled={disabled}>
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{labelText}</span>
        <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
      </button>
    );
  }

  return (
    <div className={className}>
      <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{labelText}</span>
      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
    </div>
  );
};

export default TopBar;
