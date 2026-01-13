import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { LineSeries, LineStyle } from 'lightweight-charts';
import html2canvas from 'html2canvas';
import Card from './Card';
import useMarketStore from '../store/marketStore';
import ChartContainer from './ChartContainer';
import ChartHeader from './ChartHeader';
import useTickAggregation from '../hooks/useTickAggregation';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';
import OscillatorChart from './OscillatorChart';
import IndicatorSettingsModal from './IndicatorSettingsModal';

const ChartWorkspace = () => {
  const { 
    selectedAsset, setSelectedAsset,
    selectedAssetKey,
    selectedTimeframe, setSelectedTimeframe,
    payoutAssets,
    marketData,
    historyCandles,
    historyStatus,
    activeIndicators, removeIndicator, addIndicator,
    updateIndicator,
    indicatorSeries,
    indicatorStatus,
    loadIndicators,
    lastError, clearError,
    syncTimeframeUi,
  } = useMarketStore();

  const health = useStreamHealth();
  const [candleSeries, setCandleSeries] = useState(null);
  const [mainChart, setMainChart] = useState(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [settingsIndicator, setSettingsIndicator] = useState(null);
  const [oscillatorHeight, setOscillatorHeight] = useState(200);
  const [isDraggingOsc, setIsDraggingOsc] = useState(false);
  const oscDragStateRef = useRef(null);
  const [isSyncingTimeframe, setIsSyncingTimeframe] = useState(false);
  const lastMainCrosshairTimeRef = useRef(null);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);
  }, []);

  const handleCrosshairTimeFromOscillator = useCallback((time) => {
    if (!mainChart || !candleSeries || !time) {
      return;
    }

    const lastTime = lastMainCrosshairTimeRef.current;
    const numericLast = lastTime != null ? Number(lastTime) : null;
    const numericNext = Number(time);

    if (numericLast != null && !Number.isNaN(numericLast) && !Number.isNaN(numericNext) && numericLast === numericNext) {
      return;
    }

    lastMainCrosshairTimeRef.current = time;

    const defaultPrice = 0;
    try {
      mainChart.setCrosshairPosition(defaultPrice, time, candleSeries);
    } catch (err) {
      console.error('Failed to set main chart crosshair from oscillator', err);
    }
  }, [mainChart, candleSeries]);

  const oscillatorIndicators = useMemo(
    () => (Array.isArray(activeIndicators)
      ? activeIndicators.filter((ind) => ind.kind === 'oscillator')
      : []),
    [activeIndicators]
  );

  const overlayIndicators = useMemo(
    () => (Array.isArray(activeIndicators)
      ? activeIndicators.filter((ind) => ind.kind === 'overlay')
      : []),
    [activeIndicators]
  );

  const overlaySeriesRef = useRef({});

  useEffect(() => {
    if (!mainChart) return;

    // Clean up old series that are no longer active
    const activeIds = new Set(overlayIndicators.map(ind => ind.id));
    Object.keys(overlaySeriesRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        try {
          mainChart.removeSeries(overlaySeriesRef.current[id].series);
          // If it's Bollinger Bands, remove upper/lower too
          if (overlaySeriesRef.current[id].upper) mainChart.removeSeries(overlaySeriesRef.current[id].upper);
          if (overlaySeriesRef.current[id].lower) mainChart.removeSeries(overlaySeriesRef.current[id].lower);
        } catch (e) {
          console.warn('Failed to remove series:', e);
        }
        delete overlaySeriesRef.current[id];
      }
    });

    // Add or update series for active overlay indicators
    overlayIndicators.forEach(ind => {
      const key = `${selectedAsset}|${selectedTimeframe}`;
      const seriesForKey = indicatorSeries && indicatorSeries[key];
      if (!seriesForKey) return;

      if (!overlaySeriesRef.current[ind.id]) {
        let series;
        let upper;
        let lower;

        if (ind.value === 'bollinger_bands') {
          // Purple for Bollinger Bands
          series = mainChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, title: 'BB Middle' });
          upper = mainChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Upper' });
          lower = mainChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Lower' });
        } else if (ind.value === 'supertrend') {
          // Pink for SuperTrend
          series = mainChart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2, title: 'SuperTrend' });
        } else if (ind.value === 'ema') {
          // Amber for EMA
          series = mainChart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 2, title: `EMA ${ind.params?.period || 16}` });
        } else {
          // Default blue
          series = mainChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, title: ind.label });
        }

        overlaySeriesRef.current[ind.id] = { series, upper, lower, lastDataHash: '', lastParamsHash: JSON.stringify(ind.params) };
      }

      const seriesObj = overlaySeriesRef.current[ind.id];
      const data = seriesForKey[ind.key] || [];
      
      // Update title/options if parameters changed
      const currentParamsHash = JSON.stringify(ind.params);
      if (seriesObj.lastParamsHash !== currentParamsHash) {
        if (ind.value === 'ema') {
          seriesObj.series.applyOptions({ title: `EMA ${ind.params?.period || 16}` });
        } else if (ind.value === 'bollinger_bands') {
          seriesObj.series.applyOptions({ title: 'BB Middle' });
          if (seriesObj.upper) seriesObj.upper.applyOptions({ title: 'BB Upper' });
          if (seriesObj.lower) seriesObj.lower.applyOptions({ title: 'BB Lower' });
        } else if (ind.value === 'supertrend') {
          seriesObj.series.applyOptions({ title: 'SuperTrend' });
        }
        seriesObj.lastParamsHash = currentParamsHash;
      }

      // Special handling for multi-line indicators
      if (ind.value === 'bollinger_bands') {
        const upperData = seriesForKey['bb_upper'] || [];
        const lowerData = seriesForKey['bb_lower'] || [];
        
        const dataHash = JSON.stringify([data.slice(-1), upperData.slice(-1), lowerData.slice(-1)]);
        if (seriesObj.lastDataHash !== dataHash) {
          seriesObj.series.setData(data);
          if (seriesObj.upper) seriesObj.upper.setData(upperData);
          if (seriesObj.lower) seriesObj.lower.setData(lowerData);
          seriesObj.lastDataHash = dataHash;
        }
      } else if (ind.value === 'supertrend') {
        const dataHash = JSON.stringify(data.slice(-1));
        if (seriesObj.lastDataHash !== dataHash) {
          seriesObj.series.setData(data);
          
          // Color coding for SuperTrend if direction is available
          const directionData = seriesForKey['supertrend_direction'] || [];
          if (directionData.length > 0) {
            // Find direction for each point
            // For simplicity, we just use the last direction for the whole line if it changes
            // or we can set markers. But Lightweight Charts LineSeries is single color.
            // If we want multi-color, we'd need multiple series or markers.
            const lastDir = directionData[directionData.length - 1]?.value;
            if (lastDir === 'up') {
              seriesObj.series.applyOptions({ color: '#22c55e' }); // Green
            } else if (lastDir === 'down') {
              seriesObj.series.applyOptions({ color: '#ef4444' }); // Red
            }
          }
          
          seriesObj.lastDataHash = dataHash;
        }
      } else {
        const dataHash = JSON.stringify(data.slice(-1));
        if (seriesObj.lastDataHash !== dataHash) {
          seriesObj.series.setData(data);
          seriesObj.lastDataHash = dataHash;
        }
      }
    });
  }, [mainChart, overlayIndicators, indicatorSeries, selectedAsset, selectedTimeframe]);

  const { isLoading } = useTickAggregation({
    marketData,
    selectedAssetKey,
    selectedTimeframe,
    candleSeries,
    historyCandles,
    historyStatus,
    selectedAsset,
    onNewCandle: useCallback(() => {
      // Logic for new candle formed
      if (health !== 'streaming' || activeIndicators.length === 0) {
        return;
      }

      const indicators = [];
      const paramsByKey = {};

      activeIndicators.forEach((ind) => {
        if (!ind || typeof ind.key !== 'string') return;
        indicators.push(ind.key);
        if (ind.params && typeof ind.params === 'object' && !Array.isArray(ind.params)) {
          paramsByKey[ind.key] = ind.params;
        }
      });

      if (indicators.length === 0) return;

      loadIndicators({
        asset: selectedAsset,
        timeframe: selectedTimeframe,
        indicators,
        params: Object.keys(paramsByKey).length > 0 ? paramsByKey : undefined
      });
    }, [health, selectedAsset, selectedTimeframe, activeIndicators, loadIndicators])
  });

  // Effect to load indicators when asset, timeframe or activeIndicators change
  useEffect(() => {
    if (health !== 'streaming' || activeIndicators.length === 0) {
      return;
    }

    const indicators = [];
    const paramsByKey = {};

    activeIndicators.forEach((ind) => {
      if (!ind || typeof ind.key !== 'string') return;
      indicators.push(ind.key);
      if (ind.params && typeof ind.params === 'object' && !Array.isArray(ind.params)) {
        paramsByKey[ind.key] = ind.params;
      }
    });

    if (indicators.length === 0) return;

    loadIndicators({
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      indicators,
      params: Object.keys(paramsByKey).length > 0 ? paramsByKey : undefined
    });
  }, [selectedAsset, selectedTimeframe, activeIndicators, loadIndicators]); // Removed 'health' to avoid unnecessary reloads, but kept others for reactivity

  const handleIndicatorClick = (indicator) => {
    setSettingsIndicator(indicator);
  };

  const handleOscillatorDragStart = (event) => {
    if (!oscillatorIndicators.length) {
      return;
    }

    event.preventDefault();

    const startY = event.clientY;
    const startHeight = oscillatorHeight;
    const minHeight = 80;
    const maxHeight = 600;

    setIsDraggingOsc(true);

    const handleMouseMove = (e) => {
      const delta = e.clientY - startY;
      let next = startHeight - delta;
      if (next < minHeight) {
        next = minHeight;
      }
      if (next > maxHeight) {
        next = maxHeight;
      }
      setOscillatorHeight(next);
    };

    const handleMouseUp = () => {
      setIsDraggingOsc(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      oscDragStateRef.current = null;
    };

    oscDragStateRef.current = {
      handleMouseMove,
      handleMouseUp
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (!selectedAsset || !selectedTimeframe || oscillatorIndicators.length === 0) {
      return;
    }

    const indicators = [];
    const paramsByKey = {};

    oscillatorIndicators.forEach((ind) => {
      if (!ind || typeof ind.key !== 'string') {
        return;
      }

      indicators.push(ind.key);

      if (ind.params && typeof ind.params === 'object' && !Array.isArray(ind.params)) {
        paramsByKey[ind.key] = ind.params;
      }
    });

    if (indicators.length === 0) {
      return;
    }

    const hasParams = Object.keys(paramsByKey).length > 0;

    loadIndicators({
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      indicators,
      params: hasParams ? paramsByKey : undefined
    });
  }, [selectedAsset, selectedTimeframe, oscillatorIndicators, loadIndicators]);

  // Options for Comboboxes
  const assetList = Array.from(new Set([...(payoutAssets || []), selectedAsset].filter(Boolean)));
  const assetOptions = assetList.map(a => ({ label: a, value: a }));
  
  const timeframeOptions = [
    { label: 'Ticks', value: 'ticks' },
    { label: '15 Second', value: '15s' },
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '30 Minutes', value: '30m' },
    { label: '1 Hour', value: '1h' },
  ];

  const csvOptions = [
    { label: 'Upload New...', value: 'upload' },
    { label: 'AUDNZD_2023.csv', value: 'file1' },
  ];

  const indicatorOptions = [
    {
      label: 'RSI',
      value: 'rsi',
      key: 'rsi_14',
      kind: 'oscillator',
      displayValue: '14',
      source: 'backend',
      params: { period: 14, overbought: 75, oversold: 25 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 14
        },
        {
          name: 'overbought',
          label: 'Overbought',
          type: 'number',
          min: 50,
          max: 100,
          default: 75
        },
        {
          name: 'oversold',
          label: 'Oversold',
          type: 'number',
          min: 0,
          max: 50,
          default: 25
        }
      ]
    },
    {
      label: 'CCI',
      value: 'cci',
      key: 'cci',
      kind: 'oscillator',
      displayValue: '14',
      source: 'backend',
      params: { period: 14, overbought: 100, oversold: -100 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 14
        },
        {
          name: 'overbought',
          label: 'Overbought',
          type: 'number',
          min: 0,
          max: 300,
          default: 100
        },
        {
          name: 'oversold',
          label: 'Oversold',
          type: 'number',
          min: -300,
          max: 0,
          default: -100
        }
      ]
    },
    {
      label: 'MACD Histogram',
      value: 'macd_histogram',
      key: 'macd_histogram',
      kind: 'oscillator',
      displayValue: '12,26,9',
      source: 'backend',
      params: { fast: 12, slow: 26, signal: 9 },
      paramConfig: [
        {
          name: 'fast',
          label: 'Fast Period',
          type: 'number',
          min: 1,
          max: 100,
          default: 12
        },
        {
          name: 'slow',
          label: 'Slow Period',
          type: 'number',
          min: 1,
          max: 200,
          default: 26
        },
        {
          name: 'signal',
          label: 'Signal Period',
          type: 'number',
          min: 1,
          max: 50,
          default: 9
        }
      ]
    },
    {
      label: 'DeMarker',
      value: 'demarker',
      key: 'demarker',
      kind: 'oscillator',
      displayValue: '10',
      source: 'backend',
      params: { period: 10, overbought: 0.7, oversold: 0.3 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 10
        },
        {
          name: 'overbought',
          label: 'Overbought',
          type: 'number',
          min: 0.5,
          max: 1.0,
          step: 0.1,
          default: 0.7
        },
        {
          name: 'oversold',
          label: 'Oversold',
          type: 'number',
          min: 0.0,
          max: 0.5,
          step: 0.1,
          default: 0.3
        }
      ]
    },
    {
      label: 'ADX',
      value: 'adx',
      key: 'adx',
      kind: 'oscillator',
      displayValue: '14',
      source: 'backend',
      params: { period: 14, overbought: 30 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 14
        },
        {
          name: 'overbought',
          label: 'Strong Trend Level',
          type: 'number',
          min: 10,
          max: 90,
          default: 30
        }
      ]
    },
    {
      label: 'Schaff Trend Cycle',
      value: 'stc',
      key: 'schaff_tc',
      kind: 'oscillator',
      displayValue: '10,20,3',
      source: 'backend',
      params: { fast: 10, slow: 20, period: 3, overbought: 75, oversold: 25 },
      paramConfig: [
        {
          name: 'fast',
          label: 'Fast Period',
          type: 'number',
          min: 1,
          max: 100,
          default: 10
        },
        {
          name: 'slow',
          label: 'Slow Period',
          type: 'number',
          min: 1,
          max: 200,
          default: 20
        },
        {
          name: 'period',
          label: 'Cycle Period',
          type: 'number',
          min: 1,
          max: 50,
          default: 3
        },
        {
          name: 'overbought',
          label: 'Overbought',
          type: 'number',
          min: 50,
          max: 100,
          default: 75
        },
        {
          name: 'oversold',
          label: 'Oversold',
          type: 'number',
          min: 0,
          max: 50,
          default: 25
        }
      ]
    },
    {
      label: 'SuperTrend',
      value: 'supertrend',
      key: 'supertrend',
      kind: 'overlay',
      displayValue: '7,3.0',
      source: 'backend',
      params: { period: 7, multiplier: 3.0 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 1,
          max: 50,
          default: 7
        },
        {
          name: 'multiplier',
          label: 'Multiplier',
          type: 'number',
          min: 0.1,
          max: 10,
          step: 0.1,
          default: 3.0
        }
      ]
    },
    {
      label: 'EMA',
      value: 'ema',
      key: 'ema_16',
      kind: 'overlay',
      displayValue: '16',
      source: 'backend',
      params: { period: 16 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 1,
          max: 500,
          default: 16
        }
      ]
    },
    {
      label: 'Bollinger Bands',
      value: 'bollinger_bands',
      key: 'bb_middle',
      kind: 'overlay',
      displayValue: '20,2.0',
      source: 'backend',
      params: { period: 20, stdDev: 2.0 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 1,
          max: 100,
          default: 20
        },
        {
          name: 'stdDev',
          label: 'Std Dev',
          type: 'number',
          min: 0.1,
          max: 5.0,
          step: 0.1,
          default: 2.0
        }
      ]
    }
  ];

  const addObjectOptions = [
    { label: 'Horizontal Line', value: 'horizontal_line' },
    { label: 'Zone', value: 'zone' },
    { label: 'Label', value: 'label' }
  ];

  const handleTimeframeChange = (val) => {
    // Ideally pass this loading state management to the hook or store, 
    // but for now we keep the UI optimistic update logic here or in the handler
    setSelectedTimeframe(val).catch((err) => {
      console.error("Timeframe change failed:", err);
    });
  };

  const handleSyncTimeframe = async () => {
    if (isSyncingTimeframe) return;
    try {
      setIsSyncingTimeframe(true);
      await syncTimeframeUi();
    } catch (err) {
      console.error('Timeframe UI sync failed:', err);
    } finally {
      setIsSyncingTimeframe(false);
    }
  };

  const captureCompositeChart = async () => {
    const container = document.getElementById('quflx-chart-screenshot-root');
    if (!container) return null;

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#020617',
        useCORS: true,
        logging: false,
        scale: window.devicePixelRatio || 1
      });
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Composite chart capture failed:', err);
      return null;
    }
  };

  const handleOpenScreenshot = async () => {
    if (isCapturing) {
      return;
    }
    try {
      setIsCapturing(true);
      const dataUrl = await captureCompositeChart();
      if (!dataUrl) {
        window.alert('Chart not available for screenshot.');
        return;
      }
      setScreenshotDataUrl(dataUrl);
      setIsScreenshotOpen(true);
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
      window.alert('Failed to capture screenshot.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAskAi = async () => {
    if (isAsking) return;

    const image = await captureCompositeChart();
    const recentTicks = marketData[selectedAssetKey]?.slice(-20) || [];
    const indicatorKey = selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null;
    const seriesForKey = indicatorKey && indicatorSeries ? indicatorSeries[indicatorKey] : null;
    const indicatorSnapshots = {};

    if (seriesForKey && Array.isArray(activeIndicators)) {
      activeIndicators.forEach((ind) => {
        if (!ind || !ind.key) {
          return;
        }
        const series = seriesForKey[ind.key];
        if (!Array.isArray(series) || series.length === 0) {
          return;
        }
        const tail = series.slice(-50);
        const name = ind.name || ind.key;
        indicatorSnapshots[name] = tail;
      });
    }

    const context = {
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      currentPrice: recentTicks[recentTicks.length - 1]?.price,
      activeIndicators: activeIndicators.map((i) => i.name),
      recentTicks,
      indicatorSnapshots
    };

    const prompt = window.prompt('Ask AI about the current market context:');
    if (!prompt) return;
    try {
      setIsAsking(true);
      const response = await askAI({ prompt, context, image });
      if (response && response.answer) {
        window.alert(response.answer);
      } else {
        window.alert('AI did not return an answer.');
      }
    } catch (err) {
      console.error('Ask AI failed:', err);
      window.alert(`Ask AI failed: ${err.message}`);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-2xl quflx-section-light border border-gray-800 shadow-xl relative">
      
      {/* Error Message Display */}
      {lastError && (
        <div className="p-2 bg-red-900/50 border-b border-red-600 text-red-200 text-xs flex justify-between items-center z-50">
          <span>{lastError}</span>
          <button onClick={clearError} className="text-red-300 hover:text-red-100">✕</button>
        </div>
      )}
      
      <ChartHeader 
        selectedAsset={selectedAsset}
        setSelectedAsset={setSelectedAsset}
        assetOptions={assetOptions}
        selectedTimeframe={selectedTimeframe}
        handleTimeframeChange={handleTimeframeChange}
        timeframeOptions={timeframeOptions}
        csvOptions={csvOptions}
        indicatorOptions={indicatorOptions}
        addIndicator={addIndicator}
        activeIndicators={activeIndicators}
        removeIndicator={removeIndicator}
        addObjectOptions={addObjectOptions}
        onAddObjectSelect={() => {}}
        onOpenScreenshot={handleOpenScreenshot}
        onAskAi={handleAskAi}
        isAsking={isAsking}
        isCapturing={isCapturing}
        onIndicatorClick={handleIndicatorClick}
        onSyncTimeframe={handleSyncTimeframe}
        isSyncingTimeframe={isSyncingTimeframe}
      />

      <ScreenshotModal
        isOpen={isScreenshotOpen}
        imageDataUrl={screenshotDataUrl}
        asset={selectedAsset}
        timeframe={selectedTimeframe}
        onClose={() => setIsScreenshotOpen(false)}
        onSave={async ({ dataUrl, asset, timeframe }) => {
          await saveChartScreenshot({
            imageBase64: dataUrl,
            annotated: true,
            asset,
            timeframe
          });
        }}
      />

      <IndicatorSettingsModal
        isOpen={!!settingsIndicator}
        indicator={settingsIndicator}
        onClose={() => setSettingsIndicator(null)}
        onSave={({ value, params }) => {
          if (!settingsIndicator) {
            return;
          }
          updateIndicator(settingsIndicator.id, { value, params });
          setSettingsIndicator(null);
        }}
      />

      <div
        id="quflx-chart-screenshot-root"
        className="flex-1 relative w-full min-h-0 flex flex-col"
      >
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <span
            className={`backdrop-blur px-2 py-0.5 rounded text-[10px] uppercase font-bold border transition-all duration-500 ${
              health === 'streaming'
                ? 'bg-accent-green/30 text-accent-green border-accent-green shadow-[0_0_20px_rgba(34,197,94,0.8)] animate-pulse'
                : health === 'slow'
                ? 'bg-yellow-500/30 text-yellow-500 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
                : health === 'stale'
                ? 'bg-orange-500/30 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
                : 'bg-black/60 text-gray-400 border-gray-800 opacity-80'
            }`}
          >
            {health === 'streaming' ? 'Live Feed' : health === 'idle' ? 'Offline' : `${health} Feed`}
          </span>
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-gray-400 border-t-accent-green rounded-full animate-spin"></div>
              <span className="text-gray-300 text-sm">Loading data for {selectedAsset}...</span>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-[220px] relative">
          <div className="w-full h-full">
            <ChartContainer onChartReady={handleChartReady} />
          </div>
        </div>

        {oscillatorIndicators.length > 0 && (
          <>
            {/* Enhanced Resize Handle */}
            <div
              className={`h-2 cursor-row-resize flex items-center justify-center transition-colors duration-200 ${
                isDraggingOsc ? 'bg-accent-primary/40' : 'bg-gray-800/80 hover:bg-gray-700'
              } border-y border-gray-700/50`}
              onMouseDown={handleOscillatorDragStart}
            >
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
              </div>
            </div>
            <div className="mt-1 flex flex-col" style={{ height: oscillatorHeight }}>
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto p-1">
                {oscillatorIndicators.map((ind) => {
                  const key = `${selectedAsset}|${selectedTimeframe}`;
                  const seriesForKey = indicatorSeries && indicatorSeries[key];
                  const data =
                    seriesForKey && seriesForKey[ind.key] ? seriesForKey[ind.key] : [];
                  const statusKey = indicatorStatus && indicatorStatus[key];

                  const type =
                    ind.key === 'macd_histogram' || ind.value === 'MACD' ? 'histogram' : 'line';

                  return (
                    <div
                      key={ind.id}
                      className="h-48 bg-gray-900/60 border border-gray-800 rounded relative"
                    >
                      <OscillatorChart
                        mainChart={mainChart}
                        data={data}
                        type={type}
                        title={ind.name}
                        params={ind.params}
                        indicatorValue={ind.value}
                        onCrosshairTimeFromOscillator={handleCrosshairTimeFromOscillator}
                      />
                      {statusKey === 'loading' && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-[10px] text-gray-300">
                          Loading {ind.name}...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

export default ChartWorkspace;
