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
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';
import AiAnswerModal from './AiAnswerModal';
import OscillatorPanel from './OscillatorPanel';
import IndicatorSettingsModal from './IndicatorSettingsModal';
import ErrorBoundary from './ErrorBoundary';
import { timeframeOptions, csvOptions, indicatorOptions, addObjectOptions } from '../config/chartOptions';

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

  const { isAsking, handleAskAi, answer, isAnswerOpen, closeAnswer } = useAIChat({
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

      <AiAnswerModal
        isOpen={isAnswerOpen}
        answer={answer}
        onClose={closeAnswer}
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
          onError={setError}
        />
      </div>
    </Card>
  );
};

export default ChartWorkspace;
