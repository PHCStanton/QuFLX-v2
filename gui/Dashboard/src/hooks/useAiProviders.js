import { useEffect, useState, useCallback, useRef } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

export default function useAiProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const refresh = useCallback(async () => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/providers`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('providers endpoint returned ' + res.status);
      const data = await res.json();
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (e) {
      if (e.name === 'AbortError') return;  // Intentionally cancelled — ignore silently
      console.error('useAiProviders: failed to load providers', e);
      setError('AI providers unavailable — check Gateway connection');
      setProviders([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refresh]);

  return { providers, loading, error, refresh };
}