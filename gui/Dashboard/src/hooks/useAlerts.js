import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to manage Alert Dispatcher status and controls.
 */
const useAlerts = () => {
    const [status, setStatus] = useState({
        running: false,
        pid: null,
        started_at: null,
        assets: [],
        log_path: null,
        loading: true,
        error: null
    });

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('http://localhost:8000/api/v1/alerts/status');
            const data = await res.json();
            if (data.ok) {
                setStatus({
                    running: data.running,
                    pid: data.pid,
                    started_at: data.started_at,
                    assets: data.assets,
                    log_path: data.log_path,
                    loading: false,
                    error: null
                });
            } else {
                setStatus(prev => ({ ...prev, loading: false, error: data.detail }));
            }
        } catch {
            setStatus(prev => ({ ...prev, loading: false, error: 'Failed to fetch status' }));
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const startAlerts = async (assets = [], useRedis = true) => {
        setStatus(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch('http://localhost:8000/api/v1/alerts/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assets, use_redis: useRedis })
            });
            const data = await res.json();
            await fetchStatus();
            return data.ok;
        } catch {
            setStatus(prev => ({ ...prev, loading: false, error: 'Failed to start' }));
            return false;
        }
    };

    const stopAlerts = async () => {
        setStatus(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch('http://localhost:8000/api/v1/alerts/stop', {
                method: 'POST'
            });
            const data = await res.json();
            await fetchStatus();
            return data.ok;
        } catch {
            setStatus(prev => ({ ...prev, loading: false, error: 'Failed to stop' }));
            return false;
        }
    };

    return {
        ...status,
        refresh: fetchStatus,
        startAlerts,
        stopAlerts
    };
};

export default useAlerts;
