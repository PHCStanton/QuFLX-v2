import { useCallback, useEffect, useMemo, useRef } from 'react';


// Known indicator type identifiers — used to recover the type from ind.id
// when ind.type is missing (e.g. indicators persisted before the type field was added).
const KNOWN_INDICATOR_TYPES = [
  'ema_cross', 'support_resistance', 'bollinger_bands', 'supertrend', 'ema',
  'rsi', 'macd_histogram', 'adx', 'stoch', 'cci', 'demarker', 'atr',
  'stc', 'williams_r', 'roc',
];

/**
 * Resolve the canonical indicator type key for backend _map_params().
 * Priority: ind.type → extract from ind.id → ind.key (last resort).
 * ind.value is intentionally NOT used — it may hold a display badge label
 * (e.g. "10,50,100") after the user saves settings.
 */
const resolveIndicatorType = (ind) => {
  if (ind.type) return ind.type;
  // Try to extract type from id format: "ema_cross-1234567890"
  if (typeof ind.id === 'string') {
    const match = KNOWN_INDICATOR_TYPES.find((t) => ind.id.startsWith(t + '-'));
    if (match) return match;
  }
  // Last resort: use the key (e.g. "ema_21" → not ideal but better than badge label)
  return ind.key;
};

const buildIndicatorRequest = (activeIndicators) => {
  const indicators = [];
  const paramsByKey = {};

  const list = Array.isArray(activeIndicators) ? activeIndicators : [];
  list.forEach((ind) => {
    if (!ind || typeof ind.key !== 'string') return;
    indicators.push(ind.key);
    if (ind.params && typeof ind.params === 'object' && !Array.isArray(ind.params)) {
      // Use resolveIndicatorType() to get the canonical type key.
      // This handles both new indicators (ind.type set) and persisted indicators
      // from before the type field was added (recovered from ind.id format).
      const paramKey = resolveIndicatorType(ind);
      paramsByKey[paramKey] = ind.params;
    }
  });

  const params = Object.keys(paramsByKey).length > 0 ? paramsByKey : undefined;
  return { indicators, params };
};

const useChartWorkspaceIndicators = ({
  health,
  selectedAsset,
  selectedTimeframe,
  activeIndicators,
  loadIndicators,
  appendCandle,
  refreshKey,
}) => {
  // Exclude suspended indicators from all API requests
  const liveIndicators = useMemo(
    () => (Array.isArray(activeIndicators) ? activeIndicators.filter((ind) => !ind.suspended) : []),
    [activeIndicators]
  );
  const indicatorRequest = useMemo(
    () => buildIndicatorRequest(liveIndicators),
    [liveIndicators]
  );

  // BUG-1: Track the last candle timestamp so we only recalculate on candle CLOSE,
  // not on every intra-candle tick. Prevents O(n) recalculation ~every second.
  const lastCandleTimeRef = useRef(null);

  useEffect(() => {
    if (!selectedAsset || !selectedTimeframe) return;
    if (!indicatorRequest.indicators.length) return;

    const tfRaw = String(selectedTimeframe || '').trim().toLowerCase();
    const isHistoryTimeframe = tfRaw.endsWith('m') || tfRaw.endsWith('h') || tfRaw.match(/^\d+$/);
    if (!isHistoryTimeframe) return;

    // Reset ref so the first candle after asset/timeframe/refresh change always triggers a load
    lastCandleTimeRef.current = null;

    loadIndicators({
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      indicators: indicatorRequest.indicators,
      params: indicatorRequest.params,
    });
    // refreshKey intentionally included: REF button bumps it to force a reload
  }, [selectedAsset, selectedTimeframe, indicatorRequest, loadIndicators, refreshKey]);

  const onNewCandle = useCallback(
    async (candle) => {
      if (health !== 'streaming') {
        return;
      }

      const tfRaw = String(selectedTimeframe || '').trim().toLowerCase();
      const isHistoryTimeframe = tfRaw.endsWith('m') || tfRaw.endsWith('h') || tfRaw.match(/^\d+$/);

      if (candle) {
        if (isHistoryTimeframe) {
          await appendCandle({
            asset: selectedAsset,
            timeframe: selectedTimeframe,
            candle,
          });
        }
      }

      if (!isHistoryTimeframe) {
        return;
      }

      if (!indicatorRequest.indicators.length) {
        return;
      }

      // BUG-1 FIX: Only recalculate indicators when a NEW candle starts.
      // During a live candle, tick updates share the same timestamp — skip those.
      const candleTime = candle?.time ?? candle?.timestamp ?? null;
      if (candleTime !== null && candleTime === lastCandleTimeRef.current) {
        return; // Same candle still ticking — no recalculation needed
      }
      lastCandleTimeRef.current = candleTime;

      loadIndicators({
        asset: selectedAsset,
        timeframe: selectedTimeframe,
        indicators: indicatorRequest.indicators,
        params: indicatorRequest.params,
      });
    },
    [
      health,
      appendCandle,
      selectedAsset,
      selectedTimeframe,
      indicatorRequest,
      loadIndicators,
    ]
  );

  return { onNewCandle };
};

export default useChartWorkspaceIndicators;
