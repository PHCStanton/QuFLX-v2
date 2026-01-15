import { useState, useCallback, useEffect, useMemo } from 'react';
import Card from './Card';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import ChartContainer from './ChartContainer';
import ChartHeader from './ChartHeader';
import useTickAggregation from '../hooks/useTickAggregation';
import useOverlayIndicators from '../hooks/useOverlayIndicators';
import useScreenshotCapture from '../hooks/useScreenshotCapture';
import useAIChat from '../hooks/useAIChat';
import useCrosshairSync from '../hooks/useCrosshairSync';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';
import OscillatorPanel from './OscillatorPanel';
import IndicatorSettingsModal from './IndicatorSettingsModal';
import ErrorBoundary from './ErrorBoundary';

const ChartWorkspace = () => {
  const { settings } = useSettingsStore();
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
    appendCandle,
    lastError, clearError,
    setError,
    syncTimeframeUi,
  } = useMarketStore();

  const health = useStreamHealth();
  const dataSourceMode = settings?.analysis?.dataSourceMode || 'history_and_streaming';
  const enableStreaming = dataSourceMode !== 'history_only';
  const [candleSeries, setCandleSeries] = useState(null);
  const [mainChart, setMainChart] = useState(null);
  const {
    isCapturing,
    isScreenshotOpen,
    screenshotDataUrl,
    setIsScreenshotOpen,
    captureCompositeChart,
    openScreenshot
  } = useScreenshotCapture({ onError: setError });

  const { isAsking, handleAskAi } = useAIChat({
    askAI,
    captureImage: captureCompositeChart,
    marketData,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError: setError
  });
  const [settingsIndicator, setSettingsIndicator] = useState(null);
  const [isSyncingTimeframe, setIsSyncingTimeframe] = useState(false);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);
  }, []);

  const { handleCrosshairTimeFromOscillator } = useCrosshairSync({
    mainChart,
    candleSeries,
    onError: setError
  });

  const oscillatorIndicators = useMemo(
    () => (Array.isArray(activeIndicators)
      ? activeIndicators.filter((ind) => ind.kind === 'oscillator')
      : []),
    [activeIndicators]
  );

  useOverlayIndicators({
    mainChart,
    activeIndicators,
    indicatorSeries,
    selectedAsset,
    selectedTimeframe,
    onError: setError
  });

  const { isLoading } = useTickAggregation({
    marketData,
    selectedAssetKey,
    selectedTimeframe,
    candleSeries,
    historyCandles,
    historyStatus,
    selectedAsset,
    onError: setError,
    onNewCandle: useCallback(async (candle) => {
      // Logic for new candle formed
      if (health !== 'streaming') {
        return;
      }

      // 1. Persist the closed candle to history CSV
      if (candle) {
        await appendCandle({
          asset: selectedAsset,
          timeframe: selectedTimeframe,
          candle
        });
      }

      // 2. Refresh indicators if any are active
      if (activeIndicators.length === 0) return;

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
    }, [health, selectedAsset, selectedTimeframe, activeIndicators, loadIndicators, appendCandle])
    ,
    enableStreaming
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
  }, [health, selectedAsset, selectedTimeframe, activeIndicators, loadIndicators]);

  const handleIndicatorClick = (indicator) => {
    setSettingsIndicator(indicator);
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
      if (setError) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Timeframe change failed: ${msg}`);
      }
    });
  };

  const handleSyncTimeframe = async () => {
    if (isSyncingTimeframe) return;
    try {
      setIsSyncingTimeframe(true);
      await syncTimeframeUi();
    } catch (err) {
      console.error('Timeframe UI sync failed:', err);
      if (setError) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Timeframe UI sync failed: ${msg}`);
      }
    } finally {
      setIsSyncingTimeframe(false);
    }
  };

  const handleOpenScreenshot = openScreenshot;

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
            <ErrorBoundary>
              <ChartContainer onChartReady={handleChartReady} onError={setError} />
            </ErrorBoundary>
          </div>
        </div>

        <OscillatorPanel
          mainChart={mainChart}
          selectedAsset={selectedAsset}
          selectedTimeframe={selectedTimeframe}
          oscillatorIndicators={oscillatorIndicators}
          indicatorSeries={indicatorSeries}
          indicatorStatus={indicatorStatus}
          onCrosshairTimeFromOscillator={handleCrosshairTimeFromOscillator}
          onError={setError}
        />
      </div>
    </Card>
  );
};

export default ChartWorkspace;
