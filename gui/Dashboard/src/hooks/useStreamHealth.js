import { useState, useEffect } from 'react';
import useMarketStore from '../store/marketStore';

export const useStreamHealth = () => {
  const { lastTickTimestamp } = useMarketStore();
  const [health, setHealth] = useState('idle');

  useEffect(() => {
    const checkHealth = () => {
      if (!lastTickTimestamp || !Number.isFinite(lastTickTimestamp)) {
        setHealth('idle');
        return;
      }

      const diff = Date.now() - lastTickTimestamp;
      if (diff < 5000) {
        setHealth('streaming');
      } else if (diff < 30000) {
        setHealth('slow');
      } else {
        setHealth('stale');
      }
    };

    const interval = setInterval(checkHealth, 1000);
    checkHealth();
    return () => clearInterval(interval);
  }, [lastTickTimestamp]);

  return health;
};
