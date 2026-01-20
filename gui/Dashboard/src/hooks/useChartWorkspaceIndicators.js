import { useCallback, useEffect, useMemo } from 'react';

const buildIndicatorRequest = (activeIndicators) => {
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
}) => {
  const indicatorRequest = useMemo(
    () => buildIndicatorRequest(activeIndicators),
    [activeIndicators]
  );

  useEffect(() => {
    if (!selectedAsset || !selectedTimeframe) return;
    if (!indicatorRequest.indicators.length) return;

    const tfRaw = String(selectedTimeframe || '').trim().toLowerCase();
    const isHistoryTimeframe = tfRaw.endsWith('m') || tfRaw.endsWith('h') || tfRaw.match(/^\d+$/);
    if (!isHistoryTimeframe) return;

    loadIndicators({
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      indicators: indicatorRequest.indicators,
      params: indicatorRequest.params,
    });
  }, [selectedAsset, selectedTimeframe, indicatorRequest, loadIndicators]);

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
