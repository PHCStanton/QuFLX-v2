/**
 * useLabIndicators.js
 * Loads technical indicators for Strategy Lab CSV data.
 * Uses /api/v1/strategy/indicators endpoint (file_id based, not live asset).
 * Stores results in indicatorSeries under key `lab|{fileId}`.
 */
import { useEffect, useMemo } from 'react';
import { getApiBaseUrl } from '../api/apiBase';

/**
 * @param {Object} params
 * @param {string} params.fileId - The uploaded file ID
 * @param {Array} params.activeIndicators - Active indicator configs
 * @param {Function} params.setIndicatorSeries - Setter for indicatorSeries in store
 * @param {Function} params.onError - Error callback
 */
const useLabIndicators = ({
  fileId,
  activeIndicators,
  setIndicatorSeries,
  onError,
}) => {
  // Build indicator request from active indicators
  const indicatorRequest = useMemo(() => {
    const indicators = [];
    const paramsByKey = {};

    const list = Array.isArray(activeIndicators) ? activeIndicators : [];
    list.forEach((ind) => {
      if (!ind || typeof ind.key !== 'string') return;
      indicators.push(ind.key);
      if (ind.params && typeof ind.params === 'object' && !Array.isArray(ind.params)) {
        paramsByKey[ind.key] = ind.params;
      }
    });

    return {
      indicators,
      params: Object.keys(paramsByKey).length > 0 ? paramsByKey : {},
    };
  }, [activeIndicators]);

  useEffect(() => {
    if (!fileId) return;
    if (!indicatorRequest.indicators.length) return;

    let cancelled = false;

    const loadLabIndicators = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/v1/strategy/indicators`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: fileId,
            indicators: indicatorRequest.indicators,
            params: indicatorRequest.params,
            timeframe: '1m',
          }),
        });

        if (cancelled) return;

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const msg = errorData.detail || `Failed to load lab indicators (HTTP ${res.status})`;
          console.error('[useLabIndicators]', msg);
          if (onError) onError(msg);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        const series = data.series || (data.data && data.data.series) || {};
        const key = `lab|${fileId}`;

        // Update indicatorSeries in store for this lab key
        if (setIndicatorSeries) {
          setIndicatorSeries((prev) => ({
            ...prev,
            [key]: series,
          }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[useLabIndicators] Network error:', err);
        if (onError) onError(`Network error loading lab indicators: ${err.message}`);
      }
    };

    loadLabIndicators();

    return () => {
      cancelled = true;
    };
  }, [fileId, indicatorRequest, setIndicatorSeries, onError]);
};

export default useLabIndicators;
