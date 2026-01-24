import { useState, useCallback, useEffect, useMemo } from 'react';
import Card from './Card';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import ChartContainer from './ChartContainer';
import ChartHeader from './ChartHeader';
import ChartWorkspaceOverlays from './ChartWorkspaceOverlays';
import useTickAggregation from '../hooks/useTickAggregation';
import useOverlayIndicators from '../hooks/useOverlayIndicators';
import useScreenshotCapture from '../hooks/useScreenshotCapture';
import useAskAi from '../hooks/useAskAi';
import useChartWorkspaceIndicators from '../hooks/useChartWorkspaceIndicators';
import useChartWorkspaceHeaderControls from '../hooks/useChartWorkspaceHeaderControls';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';
import AskAiModal from './AskAiModal';
import OscillatorPanel from './OscillatorPanel';
import IndicatorSettingsModal from './IndicatorSettingsModal';
import ErrorBoundary from './ErrorBoundary';
import { timeframeOptions, csvOptions, indicatorOptions } from '../config/chartOptions';

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
    lastAnnotatedScreenshotDataUrl,
    setLastAnnotatedScreenshotDataUrl,
    setCaptureChartImage,
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

  const { isAsking, ask } = useAskAi({
    askAI,
    captureImage: captureCompositeChart,
    lastAnnotatedImage: lastAnnotatedScreenshotDataUrl,
    imageSource: settings?.ai?.imageSource,
    autoIncludeContext: settings?.ai?.autoIncludeContext,
    responseVerbosity: 'concise',
    uiMode: 'modal',
    marketData,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError: setError
  });
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [askAiForceImageDataUrl, setAskAiForceImageDataUrl] = useState(null);
  const [settingsIndicator, setSettingsIndicator] = useState(null);

  useEffect(() => {
    setCaptureChartImage(captureCompositeChart);
    return () => setCaptureChartImage(null);
  }, [setCaptureChartImage, captureCompositeChart]);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);
  }, []);

  const { assetOptions, handleTimeframeChange, isSyncingTimeframe, handleSyncTimeframe } =
    useChartWorkspaceHeaderControls({
      payoutAssets,
      selectedAsset,
      setSelectedTimeframe,
      syncTimeframeUi,
      linkTimeframeSync: settings?.automation?.linkTimeframeSync,
      setError,
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

  const { onNewCandle } = useChartWorkspaceIndicators({
    health,
    selectedAsset,
    selectedTimeframe,
    activeIndicators,
    loadIndicators,
    appendCandle,
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
    onNewCandle,
    enableStreaming
  });

  const handleIndicatorClick = useCallback((indicator) => {
    setSettingsIndicator(indicator);
  }, []);

  const handleCloseScreenshot = useCallback(() => {
    setIsScreenshotOpen(false);
  }, [setIsScreenshotOpen]);

  const handleSaveScreenshot = useCallback(async ({ dataUrl, asset, timeframe }) => {
    setLastAnnotatedScreenshotDataUrl(dataUrl);
    await saveChartScreenshot({
      imageBase64: dataUrl,
      annotated: true,
      asset,
      timeframe,
    });
  }, [setLastAnnotatedScreenshotDataUrl]);

  const handleAskAiOpen = useCallback(() => {
    setAskAiForceImageDataUrl(null);
    setIsAskAiOpen(true);
  }, []);

  const handleAskAiClose = useCallback(() => {
    setIsAskAiOpen(false);
    setAskAiForceImageDataUrl(null);
  }, []);

  const handleScreenshotSendToAi = useCallback(async ({ dataUrl }) => {
    setAskAiForceImageDataUrl(dataUrl);
    setIsAskAiOpen(true);
  }, []);

  const handleCloseIndicatorSettings = useCallback(() => {
    setSettingsIndicator(null);
  }, []);

  const handleSaveIndicatorSettings = useCallback(
    ({ value, params }) => {
      if (!settingsIndicator) {
        return;
      }
      updateIndicator(settingsIndicator.id, { value, params });
      setSettingsIndicator(null);
    },
    [settingsIndicator, updateIndicator]
  );

  return (
    <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-2xl quflx-section-light border border-gray-800 shadow-xl relative">
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
        onOpenScreenshot={openScreenshot}
        onAskAi={handleAskAiOpen}
        isAsking={isAsking}
        isCapturing={isCapturing}
        onIndicatorClick={handleIndicatorClick}
        onSyncTimeframe={handleSyncTimeframe}
        isSyncingTimeframe={isSyncingTimeframe}
      isTimeframeSyncLinked={Boolean(settings?.automation?.linkTimeframeSync)}
      />

      <AskAiModal
        isOpen={isAskAiOpen}
        onClose={handleAskAiClose}
        onAsk={ask}
        asset={selectedAsset}
        timeframe={selectedTimeframe}
        forceImageDataUrl={askAiForceImageDataUrl}
      />

      {isScreenshotOpen ? (
        <div className="p-3 border-b border-gray-800 bg-gray-950/40">
          <ScreenshotModal
            variant="panel"
            isOpen={isScreenshotOpen}
            imageDataUrl={screenshotDataUrl}
            asset={selectedAsset}
            timeframe={selectedTimeframe}
            onClose={handleCloseScreenshot}
            onSave={handleSaveScreenshot}
            onSendToAi={handleScreenshotSendToAi}
          />
        </div>
      ) : null}

      <IndicatorSettingsModal
        isOpen={!!settingsIndicator}
        indicator={settingsIndicator}
        onClose={handleCloseIndicatorSettings}
        onSave={handleSaveIndicatorSettings}
      />

      {!isScreenshotOpen ? (
        <div
          id="quflx-chart-screenshot-root"
          className="flex-1 relative w-full min-h-0 flex flex-col"
        >
          <ChartWorkspaceOverlays health={health} isLoading={isLoading} selectedAsset={selectedAsset} />
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
      ) : null}
    </Card>
  );
};

export default ChartWorkspace;
