import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import ChartTooltip from './ChartTooltip'; // Import Tooltip
import useChartMarkers from '../hooks/useChartMarkers'; // Import Markers Hook
import useChartPriceLines from '../hooks/useChartPriceLines'; // Import Price Lines Hook
import { HistogramSeries } from 'lightweight-charts'; // Import Series Type
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
    aiMessages, // Need to access AI Messages for markers
  } = useMarketStore();

  const health = useStreamHealth();
  const dataSourceMode = settings?.analysis?.dataSourceMode || 'history_and_streaming';
  const enableStreaming = dataSourceMode !== 'history_only';
  const [candleSeries, setCandleSeries] = useState(null);
  const [mainChart, setMainChart] = useState(null);
  const chartWrapperRef = useRef(null); // Ref for tooltip positioning bounds

  // Tooltip State
  const [tooltipData, setTooltipData] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null); // { x, y, value }

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
    historyCandles,
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

  const [volumeSeries, setVolumeSeries] = useState(null);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);

    // Initialize Volume Series (Overlay at bottom)
    const volSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
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
  }, []);

  // Crosshair / Tooltip Logic
  // Crosshair / Tooltip Logic
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

      // Extract Indicator Values via Data Lookup (Unified for Overlay & Oscillator)
      const indicators = [];
      if (activeIndicators && indicatorSeries) {
        const key = selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null;
        const seriesForKey = key ? indicatorSeries[key] : null;

        if (seriesForKey && param.time) {
          activeIndicators.forEach(ind => {
            const type = ind.type || ind.value || '';
            const baseColor = ind.options?.color || ind.color || '#a78bfa';

            const pushVal = (label, dataKey, color) => {
              const dataArr = seriesForKey[dataKey] || seriesForKey[ind.key];
              if (!Array.isArray(dataArr)) return;

              // Find matching point by time (Assume exact match for now)
              const pt = dataArr.find(d => d.time === param.time);
              if (pt) {
                let val = pt.value;
                if (val === undefined && typeof pt.close === 'number') val = pt.close;
                if (typeof val === 'number') {
                  indicators.push({
                    label,
                    value: val.toFixed(2),
                    color
                  });
                }
              }
            };

            // Handle Complex Types
            if (type === 'bollinger_bands') {
              pushVal('BB Up', 'bb_upper', baseColor);
              pushVal('BB Low', 'bb_lower', baseColor);
              // pushVal('BB Mid', ind.key, baseColor); // Optional: add middle line if desired
            } else if (type === 'ema_cross') {
              const fast = ind.params?.fast || 21;
              const med = ind.params?.med || 50;
              const slow = ind.params?.slow || 100;
              pushVal(`EMA ${fast}`, 'ema_21', '#3b82f6');
              pushVal(`EMA ${med}`, 'ema_50', '#ffffff');
              pushVal(`EMA ${slow}`, 'ema_100', '#ef4444');
            } else if (type === 'supertrend') {
              // Supertrend logic often involves direction, but value is usually sufficient
              pushVal('SuperTrend', 'supertrend', baseColor);
            } else if (type === 'support_resistance') {
              pushVal('Res', 'resistance_level', '#ef4444');
              pushVal('Sup', 'support_level', '#22c55e');
            } else {
              // Default Single Value
              pushVal(ind.name || ind.label || ind.kind.toUpperCase(), ind.key, baseColor);
            }
          });
        }
      }

      setTooltipData({
        visible: true,
        left: param.point.x,
        top: param.point.y,
        ohlc,
        indicators
      });
    };

    mainChart.subscribeCrosshairMove(handleCrosshairMove);
    return () => mainChart.unsubscribeCrosshairMove(handleCrosshairMove);
  }, [mainChart, candleSeries, activeIndicators, indicatorSeries, selectedAsset, selectedTimeframe]);


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

  useChartMarkers({
    mainChart,
    candleSeries,
    aiMessages,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError: setError
  });

  useChartPriceLines({
    candleSeries,
    aiMessages,
    activeIndicators
  });

  const { isLoading } = useTickAggregation({
    marketData,
    selectedAssetKey,
    selectedTimeframe,
    candleSeries,
    volumeSeries, // Pass Volume Series
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

          <div
            className="flex-1 min-h-[220px] relative cursor-crosshair"
            ref={chartWrapperRef}
            onDoubleClick={async (e) => {
              if (!mainChart || !candleSeries || !chartWrapperRef.current) return;
              const rect = chartWrapperRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

              // Get price from coordinate
              const price = candleSeries.coordinateToPrice(y);
              if (price === null) return;

              const priceText = price.toFixed(5);

              try {
                await navigator.clipboard.writeText(priceText);
                setCopyFeedback({ x, y, value: priceText });
                setTimeout(() => setCopyFeedback(null), 800);
              } catch (err) {
                console.error('Failed to copy', err);
              }
            }}
          >
            {/* Tooltip Overlay */}
            <ChartTooltip
              visible={tooltipData?.visible}
              left={tooltipData?.left}
              top={tooltipData?.top}
              ohlc={tooltipData?.ohlc}
              indicators={tooltipData?.indicators}
              containerWidth={chartWrapperRef.current?.clientWidth || 800}
              containerHeight={chartWrapperRef.current?.clientHeight || 500}
            />

            {/* Copy Feedback Toast */}
            {copyFeedback && (
              <div
                className="absolute z-50 px-2 py-1 bg-accent-green text-black text-xs font-bold rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full transition-opacity"
                style={{ left: copyFeedback.x, top: copyFeedback.y - 10 }}
              >
                Copied: {copyFeedback.value}
              </div>
            )}

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
