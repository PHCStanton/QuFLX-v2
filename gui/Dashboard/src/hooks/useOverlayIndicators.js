import { useEffect, useMemo, useRef } from 'react';
import { LineSeries, LineStyle } from 'lightweight-charts';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const normalizeTime = (time) => {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') {
    const n = Number(time);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const normalizeDirection = (value) => {
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (v === 'up' || v === 'long' || v === 'bull' || v === 'buy') return 'up';
    if (v === 'down' || v === 'short' || v === 'bear' || v === 'sell') return 'down';
    return null;
  }
  if (typeof value === 'number') {
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 'up' : 'down';
  }
  return null;
};

const sortByTimeAsc = (data) => {
  if (!Array.isArray(data) || data.length === 0) return data;
  return [...data].sort((a, b) => {
    const ta = normalizeTime(a?.time);
    const tb = normalizeTime(b?.time);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });
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
        if (entry?.upSeries) mainChart.removeSeries(entry.upSeries);
        if (entry?.downSeries) mainChart.removeSeries(entry.downSeries);
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
        let upSeries;
        let downSeries;
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
          upSeries = mainChart.addSeries(LineSeries, {
            color: '#22c55e',
            lineWidth: 2,
            title: 'SuperTrend Up'
          });
          downSeries = mainChart.addSeries(LineSeries, {
            color: '#ef4444',
            lineWidth: 2,
            title: 'SuperTrend Down'
          });
        } else if (type === 'ema') {
          series = mainChart.addSeries(LineSeries, {
            color: '#fbbf24',
            lineWidth: 2,
            title: `EMA ${ind.params?.period || 16}`
          });
        } else if (type === 'support_resistance') {
          upper = mainChart.addSeries(LineSeries, {
            color: '#ef4444', // Red for resistance
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'Resistance'
          });
          lower = mainChart.addSeries(LineSeries, {
            color: '#22c55e', // Green for support
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'Support'
          });
        } else if (type === 'ema_cross') {
          // 21 (Blue)
          series = mainChart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            title: `EMA ${ind.params?.fast || 21}`
          });
          // 50 (White)
          upper = mainChart.addSeries(LineSeries, {
            color: '#ffffff',
            lineWidth: 2,
            title: `EMA ${ind.params?.med || 50}`
          });
          // 100 (Red)
          lower = mainChart.addSeries(LineSeries, {
            color: '#ef4444',
            lineWidth: 2,
            title: `EMA ${ind.params?.slow || 100}`
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
          upSeries,
          downSeries,
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
            if (seriesObj.series && !seriesObj.upSeries && !seriesObj.downSeries) {
              seriesObj.series.applyOptions({ title: 'SuperTrend' });
            }
            if (seriesObj.upSeries) seriesObj.upSeries.applyOptions({ title: 'SuperTrend Up' });
            if (seriesObj.downSeries) seriesObj.downSeries.applyOptions({ title: 'SuperTrend Down' });
          } else if (type === 'support_resistance') {
            if (seriesObj.upper) seriesObj.upper.applyOptions({ title: 'Resistance' });
            if (seriesObj.lower) seriesObj.lower.applyOptions({ title: 'Support' });
          } else if (type === 'ema_cross') {
            if (seriesObj.series) seriesObj.series.applyOptions({ title: `EMA ${ind.params?.fast || 21}` });
            if (seriesObj.upper) seriesObj.upper.applyOptions({ title: `EMA ${ind.params?.med || 50}` });
            if (seriesObj.lower) seriesObj.lower.applyOptions({ title: `EMA ${ind.params?.slow || 100}` });
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
            seriesObj.series.setData(sortByTimeAsc(data));
            if (seriesObj.upper) seriesObj.upper.setData(sortByTimeAsc(upperData));
            if (seriesObj.lower) seriesObj.lower.setData(sortByTimeAsc(lowerData));
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        if (type === 'supertrend') {
          if (seriesObj.series && !seriesObj.upSeries && !seriesObj.downSeries) {
            try {
              mainChart.removeSeries(seriesObj.series);
            } catch (err) {
              if (onError) onError(`Overlay cleanup failed: ${getErrorMessage(err)}`);
            }
            seriesObj.series = null;
            seriesObj.upSeries = mainChart.addSeries(LineSeries, {
              color: '#22c55e',
              lineWidth: 2,
              title: 'SuperTrend Up'
            });
            seriesObj.downSeries = mainChart.addSeries(LineSeries, {
              color: '#ef4444',
              lineWidth: 2,
              title: 'SuperTrend Down'
            });
          }

          const dataHash = JSON.stringify(data.slice(-1));
          if (seriesObj.lastDataHash !== dataHash) {
            const directionData =
              seriesForKey['supertrend_direction'] ||
              seriesForKey['supertrend_dir'] ||
              seriesForKey['supertrend_trend'] ||
              [];

            const directionByTime = new Map();
            if (Array.isArray(directionData)) {
              directionData.forEach((pt) => {
                const t = normalizeTime(pt?.time);
                const d = normalizeDirection(pt?.value);
                if (t != null && d) directionByTime.set(t, d);
              });
            }

            const upData = [];
            const downData = [];

            if (Array.isArray(data)) {
              data.forEach((pt) => {
                const t = pt?.time;
                const tn = normalizeTime(t);
                if (tn == null) return;
                const v = pt?.value;
                const dir = directionByTime.get(tn);

                if (dir === 'up') {
                  upData.push({ time: t, value: v });
                  downData.push({ time: t });
                  return;
                }

                if (dir === 'down') {
                  upData.push({ time: t });
                  downData.push({ time: t, value: v });
                  return;
                }

                upData.push({ time: t, value: v });
                downData.push({ time: t });
              });
            }

            if (seriesObj.upSeries) seriesObj.upSeries.setData(sortByTimeAsc(upData));
            if (seriesObj.downSeries) seriesObj.downSeries.setData(sortByTimeAsc(downData));
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        if (type === 'support_resistance') {
          const resistanceData = seriesForKey['resistance_level'] || [];
          const supportData = seriesForKey['support_level'] || [];
          const dataHash = JSON.stringify([resistanceData.slice(-1), supportData.slice(-1)]);

          if (seriesObj.lastDataHash !== dataHash) {
            if (seriesObj.upper) seriesObj.upper.setData(sortByTimeAsc(resistanceData));
            if (seriesObj.lower) seriesObj.lower.setData(sortByTimeAsc(supportData));
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        if (type === 'ema_cross') {
          const ema21 = seriesForKey['ema_21'] || [];
          const ema50 = seriesForKey['ema_50'] || [];
          const ema100 = seriesForKey['ema_100'] || [];
          const dataHash = JSON.stringify([ema21.slice(-1), ema50.slice(-1), ema100.slice(-1)]);

          if (seriesObj.lastDataHash !== dataHash) {
            if (seriesObj.series) seriesObj.series.setData(sortByTimeAsc(ema21));
            if (seriesObj.upper) seriesObj.upper.setData(sortByTimeAsc(ema50));
            if (seriesObj.lower) seriesObj.lower.setData(sortByTimeAsc(ema100));
            seriesObj.lastDataHash = dataHash;
          }
          return;
        }

        const dataHash = JSON.stringify(data.slice(-1));
        if (seriesObj.lastDataHash !== dataHash) {
          seriesObj.series.setData(sortByTimeAsc(data));
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
