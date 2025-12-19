import { useState, useEffect } from 'react';
import useMarketStore from '../store/marketStore';

export const useStreamHealth = () => {
  const { streamStatus, lastTickTimestamp } = useMarketStore();
  const [health, setHealth] = useState('idle');

  useEffect(() => {
    const checkHealth = () => {
      if (streamStatus !== 'streaming') {
        setHealth(streamStatus || 'idle');
        return;
      }
      
      const diff = Date.now() - lastTickTimestamp;
      if (diff < 5000) {
        setHealth('streaming'); // healthy/active
      } else if (diff < 30000) {
        setHealth('slow');
      } else {
        setHealth('stale');
      }
    };

    const interval = setInterval(checkHealth, 1000);
    checkHealth(); // Initial check
    return () => clearInterval(interval);
  }, [streamStatus, lastTickTimestamp]);

  return health;
};
