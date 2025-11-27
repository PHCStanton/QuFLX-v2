import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createChart } from 'lightweight-charts';
import { createLogger } from '../../utils/logger';
import { getIndicatorDefinition } from '../../constants/indicatorDefinitions';
import { createChartConfig, createCandlestickSeries, createLineSeries, createHistogramSeries, syncTimeScale, cleanupChart, validateContainerDimensions, debounce } from '../../utils/chartUtils';

const log = createLogger('MultiPaneChart');

// Helper function to determine if indicator is an oscillator (separate pane)
const isOscillatorIndicator = (indicatorType) => {
  const definition = getIndicatorDefinition(indicatorType);
  if (!definition) return false;
  return definition.category === 'Momentum' || 
         (definition.renderType === 'histogram' && indicatorType !== 'volume');
};

// Helper function to determine if indicator should render on main chart (overlay)
const isOverlayIndicator = (indicatorType) => {
  const definition = getIndicatorDefinition(indicatorType);
  if (!definition) return false;
  
  // Oscillators render in separate panes, not as overlays
  if (isOscillatorIndicator(indicatorType)) return false;
  
  // Everything else that has line or band renderType is an overlay
  return definition.renderType === 'line' || definition.renderType === 'band';
};

const MultiPaneChart = forwardRef(({
  data = [],
  mode = 'candles', // 'candles' or 'ticks'
  indicators = {},
  backendIndicators = null,
  width = '100%',
  height = 600,
  theme = 'dark',
  className = '',
}, ref) => {
  const mainChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const macdChartRef = useRef(null);
  
  const mainContainerRef = useRef(null);
  const rsiContainerRef = useRef(null);
  const macdContainerRef = useRef(null);
  
  const mainSeriesRef = useRef(null);
  const overlaySeriesRef = useRef({});
  const rsiSeriesRef = useRef(null);
  const macdSeriesRef = useRef({});
  // Generic oscillator pane refs
  const oscillatorContainersRef = useRef({});
  const oscillatorChartsRef = useRef({});
  const oscillatorSeriesRef = useRef({});
  const oscillatorTimeSyncCallbacksRef = useRef({});
  
  // Track previous data length for performance optimization
  const prevDataLengthRef = useRef(0);

  // Memoize expensive computations (moved before usage to fix hoisting bug)
  const memoizedHasRSI = React.useMemo(() => {
    if (!backendIndicators?.series) return false;
    // Check for any RSI instance (e.g., 'RSI-14')
    return Object.entries(backendIndicators.series).some(([instanceName, data]) => {
      const type = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      return type.toLowerCase() === 'rsi' && Array.isArray(data) && data.length > 0;
    });
  }, [backendIndicators]);

  const memoizedHasMACD = React.useMemo(() => {
    if (!backendIndicators?.series) return false;
    // Check for any MACD instance
    return Object.entries(backendIndicators.series).some(([instanceName, data]) => {
      const type = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      return type.toLowerCase() === 'macd' && data?.macd && data.macd.length > 0;
    });
  }, [backendIndicators]);

  // Calculate heights based on which oscillators are active
  // Detect additional oscillator instances beyond RSI/MACD
  const memoizedOscillators = React.useMemo(() => {
    if (!backendIndicators?.series) return [];
    return Object.entries(backendIndicators.series).reduce((acc, [instanceName, data]) => {
      const type = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      const lowerType = String(type).toLowerCase();
      if (lowerType === 'rsi' || lowerType === 'macd') return acc;
      if (!isOscillatorIndicator(lowerType)) return acc;
      const hasData = (Array.isArray(data) && data.length > 0) ||
        (data && typeof data === 'object' && Object.values(data).some(arr => Array.isArray(arr) && arr.length > 0));
      if (hasData) acc.push({ instanceName, type: lowerType });
      return acc;
    }, []);
  }, [backendIndicators]);

  const totalOscillatorCount = (memoizedHasRSI ? 1 : 0) + (memoizedHasMACD ? 1 : 0) + memoizedOscillators.length;

  const minMainHeight = Math.max(160, Math.floor(height * 0.35));
  const oscillatorHeight = totalOscillatorCount > 0
    ? Math.max(120, Math.floor((height - minMainHeight) / totalOscillatorCount))
    : 0;
  const mainHeight = Math.max(minMainHeight, height - totalOscillatorCount * oscillatorHeight);

  const chartConfig = React.useMemo(() => createChartConfig(theme), [theme]);

  // Process data (mode-aware: candles vs ticks)
  const processedData = React.useMemo(() => {
    // DEBUG: Log incoming data
    console.log('[MultiPaneChart] Processing data:', {
      mode,
      dataLength: data?.length || 0,
      isArray: Array.isArray(data),
      sampleData: data?.[0]
    });
    
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[MultiPaneChart] No data to process - empty or invalid array');
      return [];
    }
    
    // TICK MODE: Data is {time, value} format
    if (mode === 'ticks') {
      const processed = data
        .filter(item => item && typeof item.time === 'number' && 
                typeof item.value === 'number' && !isNaN(item.value))
        .map(item => ({
          time: item.time > 10000000000 ? Math.floor(item.time / 1000) : item.time,
          value: item.value,
        }))
        .sort((a, b) => a.time - b.time)
        .filter((point, i, arr) => i === 0 || point.time > arr[i - 1].time);
      
      if (processed.length > 0) {
        log.debug(`[MultiPaneChart] Processed ${processed.length} ticks. First: ${JSON.stringify(processed[0])}, Last: ${JSON.stringify(processed[processed.length - 1])}`);
      }
      return processed;
    }
    
    // CANDLE MODE: Data is {timestamp, open, high, low, close} format
    const processed = data
      .filter(item => item && typeof item.timestamp === 'number' && 
              typeof item.close === 'number' && !isNaN(item.close))
      .map(item => ({
        time: item.timestamp > 10000000000 ? Math.floor(item.timestamp / 1000) : item.timestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }))
      .sort((a, b) => a.time - b.time)
      .filter((point, i, arr) => i === 0 || point.time > arr[i - 1].time);
    
    // Debug logging
    if (processed.length > 0) {
      log.debug(`[MultiPaneChart] Processed ${processed.length} candles. First: ${JSON.stringify(processed[0])}, Last: ${JSON.stringify(processed[processed.length - 1])}`);
    } else if (data.length > 0) {
      log.warn(`[MultiPaneChart] Had ${data.length} raw data points but 0 after processing. Sample: ${JSON.stringify(data[0])}`);
    }
    
    return processed;
  }, [data, mode]);

  // Initialize main chart
  useEffect(() => {
    if (!mainContainerRef.current) return;

    const initializeChart = () => {
      try {
        const containerWidth = mainContainerRef.current.clientWidth;
        const containerHeight = mainHeight;

        if (containerWidth <= 0 || containerHeight <= 0) {
          log.warn(`[MultiPaneChart] Container has invalid dimensions: ${containerWidth}x${containerHeight}`);
          return;
        }

        log.debug(`[MultiPaneChart] Initializing main chart with dimensions: ${containerWidth}x${containerHeight}`);

        mainChartRef.current = createChart(mainContainerRef.current, {
          ...chartConfig,
          width: containerWidth,
          height: containerHeight,
        });

        // Use line series for tick mode, candlestick for candle mode
        if (mode === 'ticks') {
          mainSeriesRef.current = createLineSeries(mainChartRef.current, '#4ecdc4', 2, 'Price');
          log.debug('[MultiPaneChart] Main chart initialized successfully (tick mode - line series)');
        } else {
          mainSeriesRef.current = createCandlestickSeries(mainChartRef.current);
          log.debug('[MultiPaneChart] Main chart initialized successfully (candle mode - candlestick series)');
        }
      } catch (error) {
        log.error('[MultiPaneChart] Failed to initialize main chart:', error);
      }
    };

    const cleanup = () => {
      if (mainChartRef.current) {
        mainChartRef.current.remove();
        mainChartRef.current = null;
      }
      mainSeriesRef.current = null;
      overlaySeriesRef.current = {};
      prevDataLengthRef.current = 0;
    };

    initializeChart();
    return cleanup;
  }, [chartConfig, mainHeight, mode]);

  useEffect(() => {
    const el = mainContainerRef.current
    if (!el) return
    const resizeCharts = debounce(() => {
      try {
        const w = el.clientWidth || 0
        const h = mainHeight
        if (mainChartRef.current && w > 0 && h > 0) {
          mainChartRef.current.resize(w, h)
        }
        const rsiEl = rsiContainerRef.current
        const macdEl = macdContainerRef.current
        if (rsiChartRef.current && rsiEl) {
          rsiChartRef.current.resize(rsiEl.clientWidth || w, Math.max(20, (oscillatorHeight - 24)))
        }
        if (macdChartRef.current && macdEl) {
          macdChartRef.current.resize(macdEl.clientWidth || w, Math.max(20, (oscillatorHeight - 24)))
        }
      } catch {}
    }, 100)
    const ro = new ResizeObserver(() => resizeCharts())
    ro.observe(el)
    window.addEventListener('resize', resizeCharts)
    return () => {
      try { ro.disconnect() } catch {}
      window.removeEventListener('resize', resizeCharts)
    }
  }, [mainHeight, oscillatorHeight])

  // Initialize RSI chart
  useEffect(() => {
    if (!rsiContainerRef.current || !memoizedHasRSI) return;

    let timeRangeCallback = null;

    const initializeRSI = () => {
      try {
        const containerWidth = rsiContainerRef.current.clientWidth;
        const containerHeight = oscillatorHeight;

        if (containerWidth <= 0 || containerHeight <= 0) {
          log.warn(`[MultiPaneChart] RSI container has invalid dimensions: ${containerWidth}x${containerHeight}`);
          return;
        }

        log.debug(`[MultiPaneChart] Initializing RSI chart with dimensions: ${containerWidth}x${containerHeight}`);

        rsiChartRef.current = createChart(rsiContainerRef.current, {
          ...chartConfig,
          width: containerWidth,
          height: containerHeight,
        });

        rsiSeriesRef.current = createLineSeries(rsiChartRef.current, '#ff6b6b', 2, 'RSI(14)');

        // Add overbought/oversold reference lines
        createLineSeries(rsiChartRef.current, 'rgba(239, 68, 68, 0.3)', 1);
        createLineSeries(rsiChartRef.current, 'rgba(16, 185, 129, 0.3)', 1);

        // Sync time scales
        if (mainChartRef.current) {
          timeRangeCallback = (timeRange) => {
            if (timeRange && rsiChartRef.current && rsiSeriesRef.current) {
              try {
                rsiChartRef.current.timeScale().setVisibleRange({
                  from: timeRange.from,
                  to: timeRange.to,
                });
              } catch (e) {
                // Ignore errors when chart doesn't have data yet
              }
            }
          };
          mainChartRef.current.timeScale().subscribeVisibleTimeRangeChange(timeRangeCallback);
        }
      } catch (error) {
        log.error('[MultiPaneChart] Failed to initialize RSI chart:', error);
      }
    };

    const cleanup = () => {
      if (timeRangeCallback && mainChartRef.current) {
        try {
          mainChartRef.current.timeScale().unsubscribeVisibleTimeRangeChange(timeRangeCallback);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      rsiSeriesRef.current = null;
    };

    initializeRSI();
    return cleanup;
  }, [memoizedHasRSI, oscillatorHeight, chartConfig]);

  // Initialize MACD chart
  useEffect(() => {
    if (!macdContainerRef.current || !memoizedHasMACD) return;

    let timeRangeCallback = null;

    const initializeMACD = () => {
      try {
        const containerWidth = macdContainerRef.current.clientWidth;
        const containerHeight = oscillatorHeight;

        if (containerWidth <= 0 || containerHeight <= 0) {
          log.warn(`[MultiPaneChart] MACD container has invalid dimensions: ${containerWidth}x${containerHeight}`);
          return;
        }

        log.debug(`[MultiPaneChart] Initializing MACD chart with dimensions: ${containerWidth}x${containerHeight}`);

        macdChartRef.current = createChart(macdContainerRef.current, {
          ...chartConfig,
          width: containerWidth,
          height: containerHeight,
        });

        macdSeriesRef.current.macd = createLineSeries(macdChartRef.current, '#4ecdc4', 2, 'MACD');
        macdSeriesRef.current.signal = createLineSeries(macdChartRef.current, '#ff9f43', 2, 'Signal');
        macdSeriesRef.current.histogram = createHistogramSeries(macdChartRef.current, '#667eea');

        // Sync time scales
        if (mainChartRef.current) {
          timeRangeCallback = (timeRange) => {
            if (timeRange && macdChartRef.current && macdSeriesRef.current.macd) {
              try {
                macdChartRef.current.timeScale().setVisibleRange({
                  from: timeRange.from,
                  to: timeRange.to,
                });
              } catch (e) {
                // Ignore errors when chart doesn't have data yet
              }
            }
          };
          mainChartRef.current.timeScale().subscribeVisibleTimeRangeChange(timeRangeCallback);
        }
      } catch (error) {
        log.error('[MultiPaneChart] Failed to initialize MACD chart:', error);
      }
    };

    const cleanup = () => {
      if (timeRangeCallback && mainChartRef.current) {
        try {
          mainChartRef.current.timeScale().unsubscribeVisibleTimeRangeChange(timeRangeCallback);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
      }
      macdSeriesRef.current = {};
    };

    initializeMACD();
    return cleanup;
  }, [memoizedHasMACD, oscillatorHeight, chartConfig]);

  // Update main chart data - OPTIMIZED: Use setData() for initial load, update() for incremental changes
  useEffect(() => {
    if (!mainSeriesRef.current) {
      log.debug('[MultiPaneChart] Skipping data update: series not ready');
      return;
    }

    try {
      if (processedData.length === 0) {
        mainSeriesRef.current.setData([]);
        prevDataLengthRef.current = 0;
        return;
      }

      const prevLength = prevDataLengthRef.current;

      // Initial load or complete data replacement (e.g., switching assets)
      if (prevLength === 0 || processedData.length < prevLength) {
        mainSeriesRef.current.setData(processedData);
        if (mainChartRef.current) {
          mainChartRef.current.timeScale().fitContent();
        }
        log.debug(`[MultiPaneChart] Initial load: ${processedData.length} data points`);
        prevDataLengthRef.current = processedData.length;
        return;
      }

      // Incremental update - use update() for performance (TradingView best practice)
      if (processedData.length > prevLength) {
        // New candle(s) added - update only the new ones
        for (let i = prevLength; i < processedData.length; i++) {
          mainSeriesRef.current.update(processedData[i]);
        }
        // Fit content when adding many new candles (e.g., after hot reload)
        if (processedData.length - prevLength > 10 && mainChartRef.current) {
          mainChartRef.current.timeScale().fitContent();
        }
        log.debug(`[MultiPaneChart] Added ${processedData.length - prevLength} new candle(s) via update()`);
      } else if (processedData.length === prevLength && processedData.length > 0) {
        // Same length - likely updating the last forming candle
        const lastCandle = processedData[processedData.length - 1];
        mainSeriesRef.current.update(lastCandle);
        log.debug(`[MultiPaneChart] Updated last candle via update()`);
      }

      prevDataLengthRef.current = processedData.length;
    } catch (error) {
      log.error('[MultiPaneChart] Failed to update main chart data:', error);
      throw error; // Let ErrorBoundary handle it
    }
  }, [processedData]);

  // Dynamic overlay indicator rendering (SMA, EMA, WMA, Bollinger, SuperTrend, etc.)
  useEffect(() => {
    if (!mainChartRef.current || !backendIndicators?.series) return;

    const series = backendIndicators.series;

    // Clear existing overlays
    Object.keys(overlaySeriesRef.current).forEach(key => {
      if (overlaySeriesRef.current[key]) {
        mainChartRef.current.removeSeries(overlaySeriesRef.current[key]);
        delete overlaySeriesRef.current[key];
      }
    });

    // Dynamically render all overlay indicators
    Object.entries(series).forEach(([instanceName, data]) => {
      // Extract indicator type from metadata (backend now sends instance names as keys)
      const indicatorType = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      const definition = getIndicatorDefinition(indicatorType);

      // Skip if not overlay type or no definition
      if (!definition || !isOverlayIndicator(indicatorType)) return;

      const params = backendIndicators.indicators?.[instanceName] || {};

      // Handle band-type indicators (Bollinger Bands)
      if (definition.renderType === 'band' && typeof data === 'object' && !Array.isArray(data)) {
        const { upper, middle, lower } = data;

        // Use band-specific colors if explicitly defined, otherwise use distinct defaults
        const bandColors = definition.bandColors || {
          upper: '#ef5350',   // Red for upper band
          middle: '#ffc107',  // Yellow for middle band
          lower: '#4caf50',   // Green for lower band
        };

        if (upper?.length > 0) {
          overlaySeriesRef.current[`${instanceName}_upper`] = mainChartRef.current.addLineSeries({
            color: bandColors.upper,
            lineWidth: 1,
            title: `${instanceName} Upper`,
            priceLineVisible: false,
          });
          overlaySeriesRef.current[`${instanceName}_upper`].setData(upper);
        }

        if (middle?.length > 0) {
          overlaySeriesRef.current[`${instanceName}_middle`] = mainChartRef.current.addLineSeries({
            color: bandColors.middle,
            lineWidth: 1,
            lineStyle: 2,
            title: `${instanceName} Middle`,
            priceLineVisible: false,
          });
          overlaySeriesRef.current[`${instanceName}_middle`].setData(middle);
        }

        if (lower?.length > 0) {
          overlaySeriesRef.current[`${instanceName}_lower`] = mainChartRef.current.addLineSeries({
            color: bandColors.lower,
            lineWidth: 1,
            title: `${instanceName} Lower`,
            priceLineVisible: false,
          });
          overlaySeriesRef.current[`${instanceName}_lower`].setData(lower);
        }
      }
      // Handle line-type indicators (SMA, EMA, WMA, SuperTrend, etc.)
      else if (definition.renderType === 'line' && Array.isArray(data) && data.length > 0) {
        overlaySeriesRef.current[instanceName] = mainChartRef.current.addLineSeries({
          color: definition.color || '#8b5cf6',
          lineWidth: 2,
          title: instanceName,
          priceLineVisible: false,
        });
        overlaySeriesRef.current[instanceName].setData(data);
      }
    });

    log.debug('[MultiPaneChart] Dynamic overlay indicators rendered on main chart');
  }, [backendIndicators]);

  // Initialize and render generic oscillator charts
  useEffect(() => {
    if (!memoizedOscillators || memoizedOscillators.length === 0) {
      // cleanup any existing charts if oscillators were removed
      Object.keys(oscillatorChartsRef.current).forEach((name) => {
        try {
          const chart = oscillatorChartsRef.current[name];
          const cb = oscillatorTimeSyncCallbacksRef.current[name];
          if (cb && mainChartRef.current) {
            try { mainChartRef.current.timeScale().unsubscribeVisibleTimeRangeChange(cb); } catch {}
          }
          if (chart) chart.remove();
        } catch {}
        delete oscillatorChartsRef.current[name];
        delete oscillatorSeriesRef.current[name];
        delete oscillatorTimeSyncCallbacksRef.current[name];
      });
      return;
    }

    memoizedOscillators.forEach(({ instanceName, type }) => {
      const container = oscillatorContainersRef.current[instanceName];
      if (!container || oscillatorChartsRef.current[instanceName]) return;

      try {
        const width = container.clientWidth || (mainContainerRef.current?.clientWidth ?? 0);
        const chartHeight = oscillatorHeight;
        if (width <= 0 || chartHeight <= 0) return;

        const chart = createChart(container, {
          width,
          height: chartHeight,
          layout: chartConfig.layout,
          rightPriceScale: chartConfig.rightPriceScale,
          grid: chartConfig.grid,
          timeScale: chartConfig.timeScale,
        });
        oscillatorChartsRef.current[instanceName] = chart;

        const definition = getIndicatorDefinition(type);
        const color = definition?.color || '#22d3ee';
        const data = backendIndicators?.series?.[instanceName];

        const addLine = (title, seriesColor) => chart.addLineSeries({
          color: seriesColor || color,
          lineWidth: 2,
          title,
          priceLineVisible: false,
        });

        if (Array.isArray(data)) {
          const line = addLine(instanceName, color);
          oscillatorSeriesRef.current[instanceName] = { primary: line };
          line.setData(data);
        } else if (data && typeof data === 'object') {
          if (data.k && data.d) {
            const kSeries = addLine(`${instanceName} %K`, color);
            const dSeries = addLine(`${instanceName} %D`, '#f59e0b');
            oscillatorSeriesRef.current[instanceName] = { k: kSeries, d: dSeries };
            kSeries.setData(data.k);
            dSeries.setData(data.d);
          } else {
            oscillatorSeriesRef.current[instanceName] = {};
            Object.entries(data).forEach(([key, arr], idx) => {
              const seriesColor = idx === 0 ? color : ['#f59e0b', '#4ade80', '#a78bfa', '#f97316'][idx % 4];
              const s = addLine(`${instanceName} ${key}`, seriesColor);
              oscillatorSeriesRef.current[instanceName][key] = s;
              if (Array.isArray(arr)) s.setData(arr);
            });
          }
        }

        // Sync with main chart time scale
        if (mainChartRef.current) {
          const cb = (range) => {
            try { chart.timeScale().setVisibleRange({ from: range.from, to: range.to }); } catch {}
          };
          mainChartRef.current.timeScale().subscribeVisibleTimeRangeChange(cb);
          oscillatorTimeSyncCallbacksRef.current[instanceName] = cb;
        }
      } catch (e) {
        log.error(`[MultiPaneChart] Failed to init oscillator pane ${instanceName}`, e);
      }
    });

    // Cleanup charts for removed oscillators
    Object.keys(oscillatorChartsRef.current).forEach((name) => {
      if (!memoizedOscillators.find(o => o.instanceName === name)) {
        try {
          const chart = oscillatorChartsRef.current[name];
          const cb = oscillatorTimeSyncCallbacksRef.current[name];
          if (cb && mainChartRef.current) {
            try { mainChartRef.current.timeScale().unsubscribeVisibleTimeRangeChange(cb); } catch {}
          }
          if (chart) chart.remove();
        } catch {}
        delete oscillatorChartsRef.current[name];
        delete oscillatorSeriesRef.current[name];
        delete oscillatorTimeSyncCallbacksRef.current[name];
        delete oscillatorContainersRef.current[name];
      }
    });
  }, [memoizedOscillators, chartConfig, oscillatorHeight, backendIndicators]);

  // Update generic oscillator data on backend updates
  useEffect(() => {
    if (!backendIndicators?.series) return;
    memoizedOscillators.forEach(({ instanceName }) => {
      const series = oscillatorSeriesRef.current[instanceName];
      const data = backendIndicators.series[instanceName];
      if (!series || !data) return;

      if (Array.isArray(data) && series.primary) {
        series.primary.setData(data);
      } else if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, arr]) => {
          if (series[key] && Array.isArray(arr)) {
            series[key].setData(arr);
          }
        });
      }
    });
  }, [backendIndicators, memoizedOscillators]);

  // Render oscillator data (RSI and MACD) when ready
  useEffect(() => {
    // Find RSI instance data (e.g., 'RSI-14')
    const rsiInstance = backendIndicators?.series && Object.entries(backendIndicators.series).find(([instanceName, data]) => {
      const type = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      return type.toLowerCase() === 'rsi';
    });
    const rsiData = rsiInstance?.[1];

    if (memoizedHasRSI && rsiData && rsiData.length > 0 && rsiSeriesRef.current) {
      rsiSeriesRef.current.setData(rsiData);
      log.debug(`[MultiPaneChart] RSI rendered in separate pane: ${rsiData.length} points`);
    }

    // Find MACD instance data
    const macdInstance = backendIndicators?.series && Object.entries(backendIndicators.series).find(([instanceName, data]) => {
      const type = backendIndicators.indicators?.[instanceName]?.type || instanceName;
      return type.toLowerCase() === 'macd';
    });
    const macdData = macdInstance?.[1];

    if (memoizedHasMACD && macdData?.macd && macdSeriesRef.current.macd) {
      macdSeriesRef.current.macd.setData(macdData.macd);
      if (macdData.signal) {
        macdSeriesRef.current.signal.setData(macdData.signal);
      }
      if (macdData.histogram) {
        const histogramData = macdData.histogram.map(item => ({
          time: item.time,
          value: item.value,
          color: item.value >= 0 ? '#10b981' : '#ef4444'
        }));
        macdSeriesRef.current.histogram.setData(histogramData);
      }
      log.debug('[MultiPaneChart] MACD rendered in separate pane');
    }
  }, [backendIndicators, memoizedHasRSI, memoizedHasMACD]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    updateData: (newData) => {
      if (!mainSeriesRef.current) return;
      // Process and update
      const processed = newData
        .filter(item => item && typeof item.timestamp === 'number')
        .map(item => ({
          time: item.timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }))
        .sort((a, b) => a.time - b.time)
        .filter((point, i, arr) => i === 0 || point.time > arr[i - 1].time);
      
      mainSeriesRef.current.setData(processed);
    },
    addDataPoint: (dataPoint) => {
      if (!mainSeriesRef.current) return;
      mainSeriesRef.current.update({
        time: dataPoint.timestamp,
        open: dataPoint.open,
        high: dataPoint.high,
        low: dataPoint.low,
        close: dataPoint.close,
      });
    },
  }), []);

  if (processedData.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-slate-400">No data available</div>
      </div>
    );
  }

  return (
    <div className={`multi-pane-chart ${className}`} style={{ height }}>
      <div ref={mainContainerRef} style={{ height: mainHeight, width: '100%' }} />

      {memoizedHasRSI && (
        <div className="rsi-pane" style={{ marginTop: '4px' }}>
          <div className="text-xs text-slate-400 px-2 py-1">RSI</div>
          <div ref={rsiContainerRef} style={{ height: oscillatorHeight - 24, width: '100%' }} />
        </div>
      )}

      {memoizedHasMACD && (
        <div className="macd-pane" style={{ marginTop: '4px' }}>
          <div className="text-xs text-slate-400 px-2 py-1">MACD</div>
          <div ref={macdContainerRef} style={{ height: oscillatorHeight - 24, width: '100%' }} />
        </div>
      )}

      {memoizedOscillators.map(({ instanceName, type }) => {
        const def = getIndicatorDefinition(type);
        const label = def?.name || instanceName;
        return (
          <div className="oscillator-pane" key={`osc-${instanceName}`} style={{ marginTop: '4px' }}>
            <div className="text-xs text-slate-400 px-2 py-1">{label}</div>
            <div ref={(el) => { oscillatorContainersRef.current[instanceName] = el; }} style={{ height: Math.max(20, oscillatorHeight - 24), width: '100%' }} />
          </div>
        );
      })}
    </div>
  );
});

MultiPaneChart.displayName = 'MultiPaneChart';

export default MultiPaneChart;
