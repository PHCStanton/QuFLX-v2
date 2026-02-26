import { useEffect, useRef } from 'react';
import { createChart, LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { prepareChartData } from '../utils/chartData';

const OscillatorChart = ({
  mainChart,
  data,
  allSeries,
  type,
  title,
  params,
  indicatorValue,
  onError,
}) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesMapRef = useRef({}); // Store multiple series by key
  const syncSubscriptionRef = useRef(null);
  const priceLinesRef = useRef([]);
  const dataRef = useRef([]);
  const isDisposedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    isDisposedRef.current = false;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#111827' },
        textColor: '#9CA3AF'
      },
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    });

    const seriesMap = {};
    const isRSI = indicatorValue === 'rsi' || (title && title.toLowerCase().includes('rsi'));
    const isCCI = indicatorValue === 'cci' || (title && title.toLowerCase().includes('cci'));
    const isATR = indicatorValue === 'atr' || (title && title.toLowerCase().includes('atr'));
    const isWilliams = indicatorValue === 'williams_r';
    const isROC = indicatorValue === 'roc';

    // Helper to add series
    const addLine = (key, color, lineWidth = 1.5, lineStyle = LineStyle.Solid) => {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth,
        lineStyle,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });
      seriesMap[key] = s;
      return s;
    };

    const addHist = (key, color) => {
      const s = chart.addSeries(HistogramSeries, {
        color,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });
      seriesMap[key] = s;
      return s;
    };

    // --- Series Setup ---
    if (type === 'macd') {
      // MACD: Histogram, MACD Line, Signal Line
      addHist('hist', '#60a5fa'); // Light Blue Histogram
      addLine('macd', '#3b82f6', 2); // Blue MACD
      addLine('signal', '#ef4444', 2); // Red Signal
    } else if (type === 'stoch') {
      // Stochastic: %K, %D
      addLine('k', '#3b82f6', 2); // Blue %K
      addLine('d', '#ef4444', 2, LineStyle.Dashed); // Red %D
    } else if (type === 'adx') {
      // ADX: ADX, +DI, -DI
      addLine('adx', '#ffffff', 2); // White ADX
      addLine('plus', '#22c55e', 1); // Green +DI
      addLine('minus', '#ef4444', 1); // Red -DI
    } else {
      // Default Single Line (RSI, CCI, ATR, Williams, ROC, etc.)
      const color = isATR ? '#38bdf8' : isCCI ? '#facc15' : isWilliams ? '#a855f7' : '#22c55e';
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1.5,
        ...(isATR
          ? {
            priceFormat: {
              type: 'custom',
              minMove: 0.00001,
              formatter: (price) => (Number.isFinite(price) ? price.toFixed(5) : ''),
            },
          }
          : {}),
      });
      seriesMap['default'] = s;
    }

    // --- Levels Setup ---
    // Apply levels to the primary series (first one added usually defines scale)
    const primarySeries = Object.values(seriesMap)[0];
    const levels = [];

    if (primarySeries) {
      if (params && params.overbought !== undefined) {
        const obLine = primarySeries.createPriceLine({
          price: params.overbought,
          color: isRSI ? '#ef4444' : '#facc15',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: isRSI ? 'OB' : 'Level',
        });
        levels.push(obLine);
      }
      if (params && params.oversold !== undefined) {
        const osLine = primarySeries.createPriceLine({
          price: params.oversold,
          color: isRSI ? '#3b82f6' : '#facc15',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: isRSI ? 'OS' : 'Level',
        });
        levels.push(osLine);
      }
      // Zero line for MACD, ROC, CCI if needed
      if (type === 'macd' || isCCI || isROC) {
        const zeroLine = primarySeries.createPriceLine({
          price: 0,
          color: '#4b5563',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
        });
        levels.push(zeroLine);
      }
    }
    priceLinesRef.current = levels;

    chartRef.current = chart;
    seriesMapRef.current = seriesMap;

    // --- Resize Observer ---
    const resizeObserver = new ResizeObserver((entries) => {
      if (isDisposedRef.current || !chartRef.current) return;
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      try {
        chartRef.current.applyOptions({ width, height });
      } catch (err) {
        if (!isDisposedRef.current) {
          console.error('Oscillator resize failed', err);
          if (onError) onError(`Oscillator resize failed: ${String(err)}`);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      isDisposedRef.current = true;
      resizeObserver.disconnect();
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (err) {
          console.error('Oscillator chart dispose failed', err);
        }
      }
      chartRef.current = null;
      seriesMapRef.current = {};
      syncSubscriptionRef.current = null;
      priceLinesRef.current = [];
    };
  }, [type, params, indicatorValue, title, onError]);

  // --- Data Updates ---
  useEffect(() => {
    if (!chartRef.current || !seriesMapRef.current) return;
    const seriesMap = seriesMapRef.current;

    try {
      if (type === 'macd') {
        if (allSeries) {
          // Check for both possible key patterns
          const histData = allSeries['macd_histogram'] || [];
          const macdData = allSeries['macd'] || [];
          const signalData = allSeries['macd_signal'] || [];

          if (seriesMap['hist']) seriesMap['hist'].setData(prepareChartData(histData));
          if (seriesMap['macd']) seriesMap['macd'].setData(prepareChartData(macdData));
          if (seriesMap['signal']) seriesMap['signal'].setData(prepareChartData(signalData));

          // For syncing, use macd data as reference
          dataRef.current = macdData;
        }
      } else if (type === 'stoch') {
        if (allSeries) {
          const kData = allSeries['stoch_k'] || [];
          const dData = allSeries['stoch_d'] || [];

          if (seriesMap['k']) seriesMap['k'].setData(prepareChartData(kData));
          if (seriesMap['d']) seriesMap['d'].setData(prepareChartData(dData));

          dataRef.current = kData;
        }
      } else if (type === 'adx') {
        if (allSeries) {
          const adxData = allSeries['adx'] || [];
          const plusData = allSeries['plus_di'] || [];
          const minusData = allSeries['minus_di'] || [];

          if (seriesMap['adx']) seriesMap['adx'].setData(prepareChartData(adxData));
          if (seriesMap['plus']) seriesMap['plus'].setData(prepareChartData(plusData));
          if (seriesMap['minus']) seriesMap['minus'].setData(prepareChartData(minusData));

          dataRef.current = adxData;
        }
      } else {
        // Default Single Series
        if (seriesMap['default'] && Array.isArray(data)) {
          seriesMap['default'].setData(prepareChartData(data));
          dataRef.current = data;
        }
      }
    } catch (err) {
      console.error('Error updating oscillator data', err);
    }
  }, [data, allSeries, type]);

  // --- Sync Logic ---
  useEffect(() => {
    if (!mainChart || !chartRef.current || !mainChart.timeScale) {
      return;
    }

    const mainTimeScale = mainChart.timeScale();
    const sync = (range) => {
      if (isDisposedRef.current || !chartRef.current) return;
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') return;
      if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to) return;

      // Use dataRef to check bounds
      const points = dataRef.current;
      if (!Array.isArray(points) || points.length < 2) return;

      const toNumericTime = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') {
          const n = Number(time);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      const firstTime = toNumericTime(points[0]?.time);
      const lastTime = toNumericTime(points[points.length - 1]?.time);
      if (firstTime == null || lastTime == null) return;

      // Simple overlap check
      if (range.to < firstTime || range.from > lastTime) return;

      try {
        const oscTimeScale = chartRef.current.timeScale();
        oscTimeScale.setVisibleRange(range);
      } catch {
        // Silent catch for sync errors (common during init)
      }
    };

    mainTimeScale.subscribeVisibleTimeRangeChange(sync);

    const timeoutId = setTimeout(() => {
      if (isDisposedRef.current) return;
      const range = mainTimeScale.getVisibleRange();
      if (range) sync(range);
    }, 100);

    syncSubscriptionRef.current = { mainTimeScale, sync };

    return () => {
      if (syncSubscriptionRef.current) {
        mainTimeScale.unsubscribeVisibleTimeRangeChange(syncSubscriptionRef.current.sync);
      }
      clearTimeout(timeoutId);
    };
  }, [mainChart]); // Re-run if mainChart changes

  return <div ref={containerRef} className="w-full h-full" />;
};

export default OscillatorChart;
