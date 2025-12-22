import { useEffect, useState } from 'react';
import useMarketStore from '../store/marketStore';
import { CheckCircle, XCircle, AlertCircle, Loader2, Wifi, WifiOff } from 'lucide-react';

const StatusIndicator = () => {
  const { socket, backendStatus, checkBackendStatus } = useMarketStore();
  const [lastCheck, setLastCheck] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!socket) return;

    checkBackendStatus();
    setLastCheck(new Date());

    const interval = setInterval(() => {
      checkBackendStatus();
      setLastCheck(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, [socket, checkBackendStatus]);

  const getStatusColor = () => {
    if (backendStatus.error) return 'text-red-500';
    if (backendStatus.readyForAssets) return 'text-green-500';
    if (backendStatus.redisConnected || backendStatus.chromeDebuggingAvailable) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (isChecking) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (backendStatus.error) return <XCircle className="w-4 h-4" />;
    if (backendStatus.readyForAssets) return <CheckCircle className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (backendStatus.error) return 'Backend Error';
    if (backendStatus.readyForAssets) return 'Ready';
    if (!backendStatus.redisConnected && !backendStatus.chromeDebuggingAvailable) return 'Disconnected';
    if (!backendStatus.redisConnected) return 'No Redis';
    if (!backendStatus.chromeDebuggingAvailable) return 'No Chrome';
    return 'Connecting...';
  };

  const formatLastCheck = () => {
    if (!lastCheck) return 'Never';
    const seconds = Math.floor((new Date().getTime() - lastCheck.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <div className="flex items-center space-x-2 bg-gray-800 rounded-lg px-3 py-2">
      <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      <div className="hidden md:flex items-center space-x-2 text-xs text-gray-400">
        <div className="flex items-center space-x-1">
          {backendStatus.redisConnected ? 
            <Wifi className="w-3 h-3 text-green-400" /> : 
            <WifiOff className="w-3 h-3 text-red-400" />
          }
          <span>Redis</span>
        </div>
        
        <div className="flex items-center space-x-1">
          {backendStatus.chromeDebuggingAvailable ? 
            <CheckCircle className="w-3 h-3 text-green-400" /> : 
            <XCircle className="w-3 h-3 text-red-400" />
          }
          <span>Chrome</span>
        </div>
        
        <span className="text-gray-500">•</span>
        <span>Checked: {formatLastCheck()}</span>
      </div>
      
      <button
        onClick={() => {
          setIsChecking(true);
          checkBackendStatus();
          setLastCheck(new Date());
          setTimeout(() => setIsChecking(false), 1000);
        }}
        className="ml-2 p-1 rounded hover:bg-gray-700 transition-colors"
        title="Check status now"
      >
        <svg className="w-3 h-3 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
};

export default StatusIndicator;
