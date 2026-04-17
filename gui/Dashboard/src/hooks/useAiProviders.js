import { useEffect, useState, useCallback } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

export default function useAiProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/providers`);
      if (!res.ok) throw new Error('providers endpoint returned ' + res.status);
      const data = await res.json();
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (e) {
      console.error('useAiProviders: failed to load providers', e);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    refresh(); 
  }, [refresh]);

  return { providers, loading, refresh };
}