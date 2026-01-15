import { useEffect, useMemo, useRef } from 'react';
import { LineSeries, LineStyle } from 'lightweight-charts';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const useOverlayIndicators = ({
  mainChart,
  activeIndicators,
  indicatorSeries,
  selectedAsset,
  selectedTimeframe,
  onError
}) => {
  const overlayIndicators = useMemo(
    () => (Array.isArray(activeIndicators) ? activeIndicators.filter((ind) => ind.kind === 'overlay') : []),
    [activeIndicators]
  );

  const overlaySeriesRef = useRef({});

  useEffect(() => {
    if (!mainChart) return;

    const activeIds = new Set(overlayIndicators.map((ind) => ind.id));
    Object.keys(overlaySeriesRef.current).forEach((id) => {
      if (activeIds.has(id)) return;
      const entry = overlaySeriesRef.current[id];
      try {
        if (entry?.series) mainChart.removeSeries(entry.series);
        if (entry?.upper) mainChart.removeSeries(entry.upper);
        if (entry?.lower) mainChart.removeSeries(entry.lower);
      } catch (err) {
        if (onError) onError(`Overlay cleanup failed: ${getErrorMessage(err)}`);
      }
      delete overlaySeriesRef.current[id];
    });

    overlayIndicators.forEach((ind) => {
      const key = `${selectedAsset}|${selectedTimeframe}`;
      const seriesForKey = indicatorSeries && indicatorSeries[key];
      if (!seriesForKey) return;

      if (!overlaySeriesRef.current[ind.id]) {
        let series;
        let upper;
        let lower;

        const type = ind.type || ind.value;

        if (type === 'bollinger_bands') {
          series = mainChart.addSeries(LineSeries, {
            color: '#a855f7',
            lineWidth: 2,
            title: 'BB Middle'
          });
          upper = mainChart.addSeries(LineSeries, {
            color: '#a855f7',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: 'BB Upper'
          });
          lower = mainChart.addSeries(LineSeries, {
            color: '#a855f7',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: 'BB Lower'
          });
        } else if (type === 'supertrend') {
          series = mainChart.addSeries(LineSeries, {
            color: '#ec4899',
            lineWidth: 2,
            title: 'SuperTrend'
          });
        } else if (type === 'ema') {
          series = mainChart.addSeries(LineSeries, {
            color: '#fbbf24',
            lineWidth: 2,
            title: `EMA ${ind.params?.period || 16}`
          });
        } else {
          series = mainChart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            title: ind.label
          });
        }

        overlaySeriesRef.current[ind.id] = {
          series,
          upper,
          lower,
          lastDataHash: '',
          lastParamsHash: JSON.stringify(ind.params)
        };
      }

      const seriesObj = overlaySeriesRef.current[ind.id];
      const data = seriesForKey[ind.key] || [];

      const currentParamsHash = JSON.stringify(ind.params);
      const type = ind.type || ind.value;

      if (seriesObj.lastParamsHash !== currentParamsHash) {
        try {
          if (type === 'ema') {
            seriesObj.series.applyOptions({ title: `EMA ${ind.params?.period || 16}` });
          } else if (type === 'bollinger_bands') {
            seriesObj.series.applyOptions({ title: 'BB Middle' });
            if (seriesObj.upper) seriesObj.upper.applyOptions({ title: 'BB Upper' });
            if (seriesObj.lower) seriesObj.lower.applyOptions({ title: 'BB Lower' });
          } else if (type === 'supertrend') {
            seriesObj.series.applyOptions({ title: 'SuperTrend' });
          }
        } catch (err) {
          if (onError) onError(`Overlay options update failed: ${getErrorMessage(err)}`);
        }
        seriesObj.lastParamsHash = currentParamsHash;
      }

      try {
        if (type === 'bollinger_bands') {
          const upperData = seriesForKey['bb_upper'] || [];
          const lowerData = seriesForKey['bb_lower'] || [];
          const dataHash = JSON.stringify([data.slice(-1), upperData.slice(-1), lowerData.slice(-1)]);
          if (seriesObj.lastDataHash !== dataHash) {
            seriesObj.series.setData(data);
            if (seriesObj.upper) seriesObj.upper.setData(upperData);
            if (seriesObj.lower) seriesObj.lower.setData(lowerData);
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        if (type === 'supertrend') {
          const dataHash = JSON.stringify(data.slice(-1));
          if (seriesObj.lastDataHash !== dataHash) {
            seriesObj.series.setData(data);
            const directionData = seriesForKey['supertrend_direction'] || [];
            if (directionData.length > 0) {
              const lastDir = directionData[directionData.length - 1]?.value;
              if (lastDir === 'up') {
                seriesObj.series.applyOptions({ color: '#22c55e' });
              } else if (lastDir === 'down') {
                seriesObj.series.applyOptions({ color: '#ef4444' });
              }
            }
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        const dataHash = JSON.stringify(data.slice(-1));
        if (seriesObj.lastDataHash !== dataHash) {
          seriesObj.series.setData(data);
          seriesObj.lastDataHash = dataHash;
        }
      } catch (err) {
        if (onError) onError(`Overlay update failed: ${getErrorMessage(err)}`);
      }
    });
  }, [
    mainChart,
    overlayIndicators,
    indicatorSeries,
    selectedAsset,
    selectedTimeframe,
    onError
  ]);

  return { overlaySeriesRef };
};

export default useOverlayIndicators;
