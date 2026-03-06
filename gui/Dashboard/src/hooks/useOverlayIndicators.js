import { useEffect, useMemo, useRef } from 'react';
import { LineSeries, LineStyle } from 'lightweight-charts';
import { prepareChartData } from '../utils/chartData';

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
  return prepareChartData(data);
};

const useOverlayIndicators = ({
  mainChart,
  activeIndicators,
  indicatorSeries,
  selectedAsset,
  selectedTimeframe,
  seriesKey: seriesKeyProp,
  refreshKey,
  onError
}) => {
  const overlayIndicators = useMemo(
    () => (Array.isArray(activeIndicators) ? activeIndicators.filter((ind) => ind.kind === 'overlay') : []),
    [activeIndicators]
  );

  const overlaySeriesRef = useRef({});

  // REF button: when refreshKey changes, bust all cached hashes so every
  // series unconditionally calls setData() on the next render pass.
  useEffect(() => {
    if (!refreshKey) return; // skip initial mount (refreshKey starts at 0)
    Object.values(overlaySeriesRef.current).forEach((entry) => {
      if (entry && typeof entry === 'object') entry.lastDataHash = '';
    });
  }, [refreshKey]);

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
        // Phase 4: Zone band cleanup
        if (entry?.resZoneUpper) mainChart.removeSeries(entry.resZoneUpper);
        if (entry?.resZoneLower) mainChart.removeSeries(entry.resZoneLower);
        if (entry?.supZoneUpper) mainChart.removeSeries(entry.supZoneUpper);
        if (entry?.supZoneLower) mainChart.removeSeries(entry.supZoneLower);
      } catch (err) {
        if (onError) onError(`Overlay cleanup failed: ${getErrorMessage(err)}`);
      }
      delete overlaySeriesRef.current[id];
    });

    overlayIndicators.forEach((ind) => {
      const key = seriesKeyProp || (selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null);
      const seriesForKey = key && indicatorSeries ? indicatorSeries[key] : null;
      if (!seriesForKey) return;

      // --- Create chart series on first encounter ---
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
          // Main S/R lines
          upper = mainChart.addSeries(LineSeries, {
            color: '#ef4444',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'Resistance'
          });
          lower = mainChart.addSeries(LineSeries, {
            color: '#22c55e',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'Support'
          });
          // Phase 4: Zone bound lines (faint, to show supply/demand zone thickness)
          const resZoneUpper = mainChart.addSeries(LineSeries, {
            color: 'rgba(239,68,68,0.25)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: ''
          });
          const resZoneLower = mainChart.addSeries(LineSeries, {
            color: 'rgba(239,68,68,0.25)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: ''
          });
          const supZoneUpper = mainChart.addSeries(LineSeries, {
            color: 'rgba(34,197,94,0.25)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: ''
          });
          const supZoneLower = mainChart.addSeries(LineSeries, {
            color: 'rgba(34,197,94,0.25)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: ''
          });
          // Store zone series in the ref entry (assigned below)
          overlaySeriesRef.current[ind.id] = {
            series: undefined, upSeries: undefined, downSeries: undefined,
            upper, lower,
            resZoneUpper, resZoneLower, supZoneUpper, supZoneLower,
            lastDataHash: '',
            lastParamsHash: JSON.stringify(ind.params)
          };
          // Skip the generic assignment below
          return;
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

      // --- Suspended: clear all series data and hold until resumed ---
      if (ind.suspended) {
        try {
          if (seriesObj.series) seriesObj.series.setData([]);
          if (seriesObj.upSeries) seriesObj.upSeries.setData([]);
          if (seriesObj.downSeries) seriesObj.downSeries.setData([]);
          if (seriesObj.upper) seriesObj.upper.setData([]);
          if (seriesObj.lower) seriesObj.lower.setData([]);
          if (seriesObj.resZoneUpper) seriesObj.resZoneUpper.setData([]);
          if (seriesObj.resZoneLower) seriesObj.resZoneLower.setData([]);
          if (seriesObj.supZoneUpper) seriesObj.supZoneUpper.setData([]);
          if (seriesObj.supZoneLower) seriesObj.supZoneLower.setData([]);
          seriesObj.lastDataHash = ''; // ensure restore on resume
        } catch (err) {
          if (onError) onError(`Overlay suspend clear failed: ${getErrorMessage(err)}`);
        }
        return; // skip data update
      }

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
          const resZoneUpperData = seriesForKey['resistance_zone_upper'] || [];
          const resZoneLowerData = seriesForKey['resistance_zone_lower'] || [];
          const supZoneUpperData = seriesForKey['support_zone_upper'] || [];
          const supZoneLowerData = seriesForKey['support_zone_lower'] || [];
          const resFreshnessData = seriesForKey['resistance_freshness'] || [];
          const supFreshnessData = seriesForKey['support_freshness'] || [];
          const srFlipData = seriesForKey['sr_flip'] || [];

          const showZones = ind.params?.showZones !== false;
          const showFreshness = ind.params?.showFreshness !== false;
          const showFlip = ind.params?.showFlip !== false;

          // Include zone + freshness tail in hash so any backend change triggers re-render
          const dataHash = JSON.stringify([
            resistanceData.slice(-1), supportData.slice(-1),
            resZoneUpperData.slice(-1), resZoneLowerData.slice(-1),
            supZoneUpperData.slice(-1), supZoneLowerData.slice(-1),
            resFreshnessData.slice(-1), supFreshnessData.slice(-1),
            srFlipData.slice(-1),
            showZones, showFreshness, showFlip
          ]);

          if (seriesObj.lastDataHash !== dataHash) {
            // --- S/R Flip colour: orange if last bar broke a level ---
            const srFlipActive = showFlip &&
              Boolean(srFlipData?.slice(-1)?.[0]?.value);

            // --- Main S/R lines ---
            // When showFreshness is OFF, render as single solid coloured line.
            // When showFreshness is ON, split into per-segment styled lines via
            // lightweight-charts' per-point color/lineStyle is not supported, so we
            // apply the CURRENT (last-bar) freshness to the whole line — this is by design:
            // the line style reflects the freshness of the ACTIVE level right now.
            const freshnessToStyle = (f) => (
              f === 'stale' ? LineStyle.Dashed :
                f === 'tested' ? LineStyle.LargeDashed :
                  LineStyle.Solid
            );
            const freshnessToWidth = (f) => (f === 'stale' ? 1 : 2);

            const resFreshness = resFreshnessData?.slice(-1)?.[0]?.value ?? 'fresh';
            const supFreshness = supFreshnessData?.slice(-1)?.[0]?.value ?? 'fresh';

            if (seriesObj.upper) {
              seriesObj.upper.applyOptions({
                color: srFlipActive ? '#f97316' : '#ef4444',
                lineStyle: showFreshness ? freshnessToStyle(resFreshness) : LineStyle.Solid,
                lineWidth: showFreshness ? freshnessToWidth(resFreshness) : 2,
              });
              seriesObj.upper.setData(sortByTimeAsc(resistanceData));
            }
            if (seriesObj.lower) {
              seriesObj.lower.applyOptions({
                color: '#22c55e',
                lineStyle: showFreshness ? freshnessToStyle(supFreshness) : LineStyle.Solid,
                lineWidth: showFreshness ? freshnessToWidth(supFreshness) : 2,
              });
              seriesObj.lower.setData(sortByTimeAsc(supportData));
            }

            // --- Zone bands (Phase 4): only set data when showZones is enabled ---
            if (seriesObj.resZoneUpper) {
              seriesObj.resZoneUpper.setData(showZones && resZoneUpperData.length > 0 ? sortByTimeAsc(resZoneUpperData) : []);
            }
            if (seriesObj.resZoneLower) {
              seriesObj.resZoneLower.setData(showZones && resZoneLowerData.length > 0 ? sortByTimeAsc(resZoneLowerData) : []);
            }
            if (seriesObj.supZoneUpper) {
              seriesObj.supZoneUpper.setData(showZones && supZoneUpperData.length > 0 ? sortByTimeAsc(supZoneUpperData) : []);
            }
            if (seriesObj.supZoneLower) {
              seriesObj.supZoneLower.setData(showZones && supZoneLowerData.length > 0 ? sortByTimeAsc(supZoneLowerData) : []);
            }

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
    seriesKeyProp,
    refreshKey,
    onError
  ]);

  return { overlaySeriesRef };
};

export default useOverlayIndicators;
