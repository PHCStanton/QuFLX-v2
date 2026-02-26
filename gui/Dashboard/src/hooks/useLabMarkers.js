/**
 * useLabMarkers Hook
 * Renders trade entry/exit markers on Strategy Lab chart
 * Handles timestamp normalization and marker lifecycle
 */
import { useEffect } from 'react';

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
 * Hook for managing trade entry/exit markers on Strategy Lab chart
 * @param {Object} params
 * @param {Object|null} params.candleSeries - Lightweight-charts candlestick series
 * @param {Array} params.entries - Trade entry signals from analysis
 * @param {Array} params.chartData - Loaded candle data (ensures data is loaded before markers)
 * @returns {void}
 */
const useLabMarkers = ({ candleSeries, entries, chartData }) => {
  useEffect(() => {
    // Guard: Wait for candle series to be ready
    if (!candleSeries) return;
    
    // Guard: Wait for chart data to be loaded
    if (!Array.isArray(chartData) || chartData.length === 0) {
      // Clear markers if no data
      try {
        candleSeries.setMarkers([]);
      } catch {
        // Series may be disposed, ignore
      }
      return;
    }
    
    // Guard: No entries to display
    if (!Array.isArray(entries) || entries.length === 0) {
      try {
        candleSeries.setMarkers([]);
      } catch {
        // Series may be disposed, ignore
      }
      return;
    }

    // Build markers from entries
    const markers = entries
      .map((entry) => {
        const time = normalizeEpochSeconds(entry.timestamp || entry.time);
        if (time === null) return null;

        // Determine direction: CALL/BUY = up, PUT/SELL = down
        const direction = (entry.direction || '').toLowerCase();
        const isBuy = direction === 'call' || direction === 'buy';
        const isSell = direction === 'put' || direction === 'sell';

        // Skip if direction is unclear
        if (!isBuy && !isSell) return null;

        // Build marker text
        const confidence = Math.round((entry.confidence || 0) * 100);
        const text = `${entry.direction}${confidence > 0 ? ` (${confidence}%)` : ''}`;

        return {
          time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#22c55e' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    // Apply markers to series
    try {
      candleSeries.setMarkers(markers);
    } catch (e) {
      console.error('useLabMarkers: Failed to set markers', e);
    }

    // Cleanup: Clear markers on unmount
    return () => {
      if (candleSeries) {
        try {
          candleSeries.setMarkers([]);
        } catch {
          // Series may be disposed, ignore
        }
      }
    };
  }, [candleSeries, entries, chartData]);
};

export default useLabMarkers;