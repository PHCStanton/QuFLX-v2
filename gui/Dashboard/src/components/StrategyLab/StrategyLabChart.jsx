/**
 * StrategyLabChart.jsx
 * Dedicated chart component for Strategy Lab visualization
 * Separated from live trading ChartWorkspace for independent development
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { HistogramSeries } from 'lightweight-charts';
import ChartContainer from '../ChartContainer';
import ChartTooltip from '../ChartTooltip';
import OscillatorPanel from '../OscillatorPanel';
import ErrorBoundary from '../ErrorBoundary';
import useOverlayIndicators from '../../hooks/useOverlayIndicators';
import useLabDataLoader from '../../hooks/useLabDataLoader';
import useLabMarkers from '../../hooks/useLabMarkers';
import useLabIndicators from '../../hooks/useLabIndicators';
import useMarketStore from '../../store/marketStore';

/**
 * Normalizes timestamp to epoch seconds
 */
const normalizeEpochSeconds = (ts) => {
  if (ts === null || ts === undefined) return null;
  const numeric = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 32503680000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
};

/**
 * StrategyLabChart - Orchestrates lab data visualization
 * 
 * @param {Object} props
 * @param {string} props.fileId - The uploaded file ID
 * @param {Array} props.entries - Trade entry signals from analysis
 * @param {Object|null} props.regime - Detected market regime
 * @param {Function} props.onError - Error callback
 */
const StrategyLabChart = ({ fileId, entries = [], regime, onError }) => {
  // Chart instance state
  const [mainChart, setMainChart] = useState(null);
  const [candleSeries, setCandleSeries] = useState(null);
  const [volumeSeries, setVolumeSeries] = useState(null);
  const chartWrapperRef = useRef(null);

  // Tooltip state
  const [tooltipData, setTooltipData] = useState(null);

  // Store access
  const {
    strategyLabData,
    activeIndicators,
    indicatorSeries: allIndicatorSeries,
    indicatorStatus,
    selectedAsset,
    selectedTimeframe,
    setIndicatorSeries,
  } = useMarketStore();

  // Lab uses its own indicator series key: `lab|{fileId}`
  const labSeriesKey = fileId ? `lab|${fileId}` : null;
  const indicatorSeries = labSeriesKey
    ? { [labSeriesKey]: allIndicatorSeries[labSeriesKey] || {} }
    : allIndicatorSeries;

  // Load chart data using dedicated hook
  const { chartData, loadStatus, error: loadError } = useLabDataLoader({
    fileId,
    strategyLabData,
  });

  // Propagate load errors to parent
  useEffect(() => {
    if (loadError && onError) {
      onError(loadError);
    }
  }, [loadError, onError]);

  // Chart ready callback
  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);

    // Initialize Volume Series (overlay at bottom)
    try {
      const volSeries = chart.addSeries(HistogramSeries, {
        color: 'rgba(38, 166, 153, 0.25)',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // Same scale as main chart (overlay)
      });

      // Configure scale margins to position volume at bottom 20%
      volSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.85,
          bottom: 0,
        },
      });

      setVolumeSeries(volSeries);
    } catch (err) {
      console.error('StrategyLabChart: Failed to create volume series', err);
    }
  }, []);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load candle data when chartData changes
  useEffect(() => {
    if (!candleSeries || !Array.isArray(chartData) || chartData.length === 0) return;

    // Map chartData to lightweight-charts format
    const mapped = chartData
      .map((c) => ({
        time: c.time || normalizeEpochSeconds(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter((c) => c.time && Number.isFinite(c.open))
      .sort((a, b) => a.time - b.time);

    // Check if still mounted and series not disposed
    if (!isMountedRef.current) return;

    try {
      // Check if candleSeries is still valid (not disposed)
      if (candleSeries && typeof candleSeries.setData === 'function') {
        candleSeries.setData(mapped);
      }
    } catch (err) {
      // Ignore "Object is disposed" errors - component is unmounting
      if (err.message?.includes('disposed')) {
        return;
      }
      console.error('StrategyLabChart: Failed to set candle data', err);
      if (onError && isMountedRef.current) onError('Failed to render chart data');
      return;
    }

    // Set volume data - only if still mounted
    if (!isMountedRef.current) return;
    
    if (volumeSeries) {
      const volData = chartData
        .map((c) => ({
          time: c.time || normalizeEpochSeconds(c.timestamp),
          value: Number(c.volume || 0),
          color: Number(c.close) >= Number(c.open)
            ? 'rgba(38, 166, 153, 0.5)'
            : 'rgba(239, 83, 80, 0.5)',
        }))
        .filter((v) => v.time)
        .sort((a, b) => a.time - b.time);

      try {
        if (volumeSeries && typeof volumeSeries.setData === 'function') {
          volumeSeries.setData(volData);
        }
      } catch (err) {
        // Ignore "Object is disposed" errors
        if (!err.message?.includes('disposed')) {
          console.error('StrategyLabChart: Failed to set volume data', err);
        }
      }
    }

    // Fit content after data load - only if still mounted
    if (!isMountedRef.current) return;
    
    if (mainChart) {
      try {
        if (mainChart.timeScale && typeof mainChart.timeScale === 'function') {
          mainChart.timeScale().fitContent();
        }
      } catch (err) {
        // Ignore fit errors during unmount
      }
    }
  }, [chartData, candleSeries, volumeSeries, mainChart, onError]);

  // Load indicators for lab data via dedicated endpoint
  useLabIndicators({
    fileId,
    activeIndicators,
    setIndicatorSeries,
    onError,
  });

  // Apply markers using dedicated hook
  useLabMarkers({
    candleSeries,
    entries,
    chartData,
  });

  // Apply overlay indicators using shared hook
  // Pass seriesKey directly so useOverlayIndicators uses the correct lab key
  useOverlayIndicators({
    mainChart,
    activeIndicators,
    indicatorSeries,
    selectedAsset,
    selectedTimeframe,
    seriesKey: labSeriesKey || undefined,
    onError,
  });

  // Oscillator indicators (kind === 'oscillator')
  const oscillatorIndicators = useMemo(
    () => (Array.isArray(activeIndicators)
      ? activeIndicators.filter((ind) => ind.kind === 'oscillator')
      : []),
    [activeIndicators]
  );

  // Crosshair / Tooltip logic
  useEffect(() => {
    if (!mainChart || !candleSeries) return;

    const handleCrosshairMove = (param) => {
      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        (chartWrapperRef.current && param.point.x > chartWrapperRef.current.clientWidth) ||
        (chartWrapperRef.current && param.point.y > chartWrapperRef.current.clientHeight)
      ) {
        setTooltipData(null);
        return;
      }

      const ohlc = param.seriesData.get(candleSeries);

      // Extract indicator values - use lab series key for lab chart
      const indicators = [];
      if (activeIndicators && indicatorSeries) {
        const key = labSeriesKey || (selectedAsset && selectedTimeframe
          ? `${selectedAsset}|${selectedTimeframe}`
          : null);
        const seriesForKey = key ? indicatorSeries[key] : null;

        if (seriesForKey && param.time) {
          activeIndicators.forEach((ind) => {
            const type = ind.type || ind.value || '';
            const baseColor = ind.options?.color || ind.color || '#a78bfa';

            const pushVal = (label, dataKey, color) => {
              const dataArr = seriesForKey[dataKey] || seriesForKey[ind.key];
              if (!Array.isArray(dataArr)) return;

              const pt = dataArr.find((d) => d.time === param.time);
              if (pt) {
                let val = pt.value;
                if (val === undefined && typeof pt.close === 'number') val = pt.close;
                if (typeof val === 'number') {
                  indicators.push({
                    label,
                    value: val.toFixed(2),
                    color,
                  });
                }
              }
            };

            // Handle complex indicator types
            if (type === 'bollinger_bands') {
              pushVal('BB Up', 'bb_upper', baseColor);
              pushVal('BB Low', 'bb_lower', baseColor);
            } else if (type === 'ema_cross') {
              pushVal('EMA 21', 'ema_21', '#3b82f6');
              pushVal('EMA 50', 'ema_50', '#ffffff');
              pushVal('EMA 100', 'ema_100', '#ef4444');
            } else if (type === 'macd_histogram') {
              pushVal('MACD', 'macd', '#3b82f6');
              pushVal('Signal', 'macd_signal', '#ef4444');
              pushVal('Hist', 'macd_histogram', '#ffffff');
            } else if (type === 'adx') {
              pushVal('ADX', 'adx', '#ffffff');
              pushVal('+DI', 'plus_di', '#22c55e');
              pushVal('-DI', 'minus_di', '#ef4444');
            } else if (type === 'stoch') {
              pushVal('%K', 'stoch_k', '#3b82f6');
              pushVal('%D', 'stoch_d', '#ef4444');
            } else if (type === 'supertrend') {
              pushVal('SuperTrend', 'supertrend', baseColor);
            } else if (type === 'support_resistance') {
              pushVal('Res', 'resistance_level', '#ef4444');
              pushVal('Sup', 'support_level', '#22c55e');
            } else {
              pushVal(ind.name || ind.label || ind.kind?.toUpperCase(), ind.key, baseColor);
            }
          });
        }
      }

      setTooltipData({
        visible: true,
        left: param.point.x,
        top: param.point.y,
        ohlc,
        indicators,
      });
    };

    mainChart.subscribeCrosshairMove(handleCrosshairMove);
    return () => mainChart.unsubscribeCrosshairMove(handleCrosshairMove);
  }, [mainChart, candleSeries, activeIndicators, indicatorSeries, selectedAsset, selectedTimeframe]);

  // Loading state
  if (loadStatus === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px] bg-gray-900/50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Loading chart data...</p>
        </div>
      </div>
    );
  }

  // No data state
  if (loadStatus === 'idle' || !fileId) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px] bg-gray-900/50 rounded-lg border border-border-primary">
        <div className="text-center">
          <p className="text-sm text-text-secondary">No Strategy Lab file selected</p>
          <p className="text-xs text-text-secondary mt-1">Upload a CSV file to visualize</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadStatus === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px] bg-red-900/20 rounded-lg border border-red-500/30">
        <div className="text-center">
          <p className="text-sm text-red-400">Failed to load chart data</p>
          <p className="text-xs text-red-300 mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Regime badge */}
      {regime && (
        <div className="px-3 py-2 bg-card-bg border-b border-border-primary flex items-center gap-3">
          <span className="text-xs text-text-secondary">Regime:</span>
          <span className="text-sm font-medium text-accent-primary">
            {regime.regime || regime.regime_name || 'Unknown'}
          </span>
          {regime.is_tradeable !== undefined && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              regime.is_tradeable
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {regime.is_tradeable ? 'Tradeable' : 'Neutral'}
            </span>
          )}
        </div>
      )}

      {/* Chart area */}
      <div
        className="flex-1 min-h-[220px] relative cursor-crosshair"
        ref={chartWrapperRef}
      >
        {/* Tooltip */}
        <ChartTooltip
          visible={tooltipData?.visible}
          left={tooltipData?.left}
          top={tooltipData?.top}
          ohlc={tooltipData?.ohlc}
          indicators={tooltipData?.indicators}
          containerWidth={chartWrapperRef.current?.clientWidth || 800}
          containerHeight={chartWrapperRef.current?.clientHeight || 500}
        />

        <div className="w-full h-full">
          <ErrorBoundary>
            <ChartContainer onChartReady={handleChartReady} onError={onError} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Oscillator sub-charts */}
      <OscillatorPanel
        mainChart={mainChart}
        selectedAsset={selectedAsset}
        selectedTimeframe={selectedTimeframe}
        seriesKey={labSeriesKey || undefined}
        oscillatorIndicators={oscillatorIndicators}
        indicatorSeries={indicatorSeries}
        indicatorStatus={indicatorStatus}
        onError={onError}
      />
    </div>
  );
};

export default StrategyLabChart;