/**
 * useLabDataLoader Hook
 * Loads candle data from uploaded CSV for Strategy Lab chart
 * Replaces the effectiveHistoryCandles pattern from ChartWorkspace
 */
import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

/**
 * Normalizes timestamp to epoch seconds
 * @param {number|string} ts - Timestamp (ms, seconds, or ISO string)
 * @returns {number|null} Epoch seconds or null if invalid
 */
const normalizeEpochSeconds = (ts) => {
  if (ts === null || ts === undefined) return null;
  const numeric = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(numeric)) return null;
  // If > year 3000 in seconds, it's milliseconds
  return numeric > 32503680000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
};

/**
 * Hook for loading Strategy Lab candle data
 * @param {Object} params
 * @param {string|null} params.fileId - The uploaded file ID
 * @param {Object} params.strategyLabData - Store's cached lab data
 * @param {Function} params.setSelectedStrategyFileId - Store action to fetch data
 * @returns {Object} { chartData, loadStatus, error }
 */
const useLabDataLoader = ({ fileId, strategyLabData, setSelectedStrategyFileId }) => {
  const [chartData, setChartData] = useState([]);
  const [loadStatus, setLoadStatus] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [error, setError] = useState(null);

  // Fetch data when fileId changes
  useEffect(() => {
    if (!fileId) {
      setChartData([]);
      setLoadStatus('idle');
      setError(null);
      return;
    }

    // Check cache first
    if (strategyLabData && strategyLabData[fileId]) {
      setChartData(strategyLabData[fileId]);
      setLoadStatus('loaded');
      setError(null);
      return;
    }

    // Fetch from backend
    const fetchData = async () => {
      setLoadStatus('loading');
      setError(null);

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/v1/strategy/data/${fileId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status}`);
        }

        const data = await response.json();

        if (!data.ok || !Array.isArray(data.candles)) {
          throw new Error(data.detail || 'Invalid data format');
        }

        // Normalize candle data
        const normalized = data.candles
          .map((c) => ({
            time: normalizeEpochSeconds(c.timestamp || c.time),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume || c.tick_volume || 0),
          }))
          .filter((c) => c.time !== null && Number.isFinite(c.open))
          .sort((a, b) => a.time - b.time);

        setChartData(normalized);
        setLoadStatus('loaded');
      } catch (err) {
        console.error('useLabDataLoader error:', err);
        setError(err.message || 'Failed to load chart data');
        setLoadStatus('error');
      }
    };

    fetchData();
  }, [fileId, strategyLabData]);

  // Update chartData when store cache updates
  useEffect(() => {
    if (fileId && strategyLabData && strategyLabData[fileId]) {
      setChartData(strategyLabData[fileId]);
      setLoadStatus('loaded');
    }
  }, [fileId, strategyLabData]);

  return { chartData, loadStatus, error };
};

export default useLabDataLoader;