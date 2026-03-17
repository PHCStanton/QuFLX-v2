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
import RegimePanel from './RegimePanel';
import IndicatorSettingsModal from './IndicatorSettingsModal';
import ErrorBoundary from './ErrorBoundary';
import ChartTooltip from './ChartTooltip';
import useChartMarkers from '../hooks/useChartMarkers';
import useChartPriceLines from '../hooks/useChartPriceLines';
import ChartContextMenu from './ChartContextMenu';
import { ZonePrimitive } from '../utils/zonePrimitive';
import { HistogramSeries } from 'lightweight-charts';
import { timeframeOptions, csvOptions, indicatorOptions } from '../config/chartOptions';
import IndicatorTimeframeWarning from './IndicatorTimeframeWarning';

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
    loadHistory,
  } = useMarketStore();

  const health = useStreamHealth();
  const dataSourceMode = settings?.analysis?.dataSourceMode || 'history_and_streaming';
  const enableStreaming = dataSourceMode !== 'history_only';
  const showChartWatermark = settings?.analysis?.showChartWatermark !== false;
  const showChartTooltip = settings?.analysis?.showChartTooltip !== false;
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
    historyStatus,
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

  // REF button: bump this to force all indicator series to re-render unconditionally
  const [refreshKey, setRefreshKey] = useState(0);
  const handleForceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Suspend / resume a single indicator without removing it
  const handleIndicatorSuspend = useCallback((id) => {
    const ind = activeIndicators.find((i) => i.id === id);
    if (!ind) return;
    updateIndicator(id, { suspended: !ind.suspended });
  }, [activeIndicators, updateIndicator]);

  // ── Right-click context menu ────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, price: null });
  const closeContextMenu = useCallback(() => setContextMenu((m) => ({ ...m, visible: false })), []);

  // ── Zone primitive management ──────────────────────────────────────────────
  // Each zone: { id, upper, lower, color, type, primitive }
  const zonesRef = useRef([]);
  const [, forceZoneRender] = useState(0); // trigger re-render for clear-all

  // Attach/detach zone primitives whenever candleSeries changes
  useEffect(() => {
    if (!candleSeries) return;
    // Re-attach all existing zones when series becomes available
    zonesRef.current.forEach((z) => {
      try { candleSeries.attachPrimitive(z.primitive); } catch (_) { }
    });
    return () => {
      zonesRef.current.forEach((z) => {
        try { candleSeries.detachPrimitive(z.primitive); } catch (_) { }
      });
    };
  }, [candleSeries]);

  useEffect(() => {
    setCaptureChartImage(captureCompositeChart);
    return () => setCaptureChartImage(null);
  }, [setCaptureChartImage, captureCompositeChart]);

  // Initial History Load Fix
  useEffect(() => {
    if (!selectedAsset || !selectedTimeframe) return;

    const status = historyStatus[selectedAsset];
    // Only load if we haven't loaded/attempted yet
    if (!status) {
      loadHistory(selectedAsset).catch((err) => {
        console.error('Initial history load failed:', err);
      });
    }
  }, [selectedAsset, selectedTimeframe, historyStatus, loadHistory]);

  const [volumeSeries, setVolumeSeries] = useState(null);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);

    // Initialize Volume Series (Overlay at bottom)
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
    refreshKey,
    onError: setError
  });

  const { onNewCandle } = useChartWorkspaceIndicators({
    health,
    selectedAsset,
    selectedTimeframe,
    activeIndicators,
    loadIndicators,
    appendCandle,
    refreshKey,
  });

  useChartMarkers({
    mainChart,
    candleSeries,
    aiMessages,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError: setError,
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

  // Right-click handler — builds context menu items based on active indicators
  const handleChartContextMenu = useCallback((e) => {
    e.preventDefault();
    if (!candleSeries || !chartWrapperRef.current) return;

    const rect = chartWrapperRef.current.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const clickPrice = candleSeries.coordinateToPrice(relY);

    // Check if S/R indicator is active and not suspended
    const srIndicator = activeIndicators.find(
      (ind) => (ind.type === 'support_resistance' || ind.value === 'support_resistance') && !ind.suspended
    );
    const srActive = Boolean(srIndicator);

    // Get latest S/R values from series data
    const key = selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null;
    const seriesForKey = key && indicatorSeries ? indicatorSeries[key] : null;
    const lastResistance = seriesForKey?.['resistance_level']?.slice(-1)?.[0]?.value ?? null;
    const lastSupport = seriesForKey?.['support_level']?.slice(-1)?.[0]?.value ?? null;
    const resZoneUpper = seriesForKey?.['resistance_zone_upper']?.slice(-1)?.[0]?.value ?? lastResistance;
    const resZoneLower = seriesForKey?.['resistance_zone_lower']?.slice(-1)?.[0]?.value ?? lastResistance;
    const supZoneUpper = seriesForKey?.['support_zone_upper']?.slice(-1)?.[0]?.value ?? lastSupport;
    const supZoneLower = seriesForKey?.['support_zone_lower']?.slice(-1)?.[0]?.value ?? lastSupport;

    const copyValue = async (value) => {
      if (value === null) return;
      try {
        await navigator.clipboard.writeText(String(value.toFixed(5)));
        setCopyFeedback({ x: e.clientX - rect.left, y: relY, value: value.toFixed(5) });
        setTimeout(() => setCopyFeedback(null), 800);
      } catch (_) { }
    };

    const addZone = (type) => {
      if (!candleSeries) return;
      const isBuy = type === 'buy';
      const upper = isBuy ? supZoneUpper : resZoneUpper;
      const lower = isBuy ? supZoneLower : resZoneLower;
      if (upper === null || lower === null || upper === lower) return;

      const color = isBuy ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
      const id = `zone-${type}-${Date.now()}`;
      const primitive = new ZonePrimitive({ id, upper, lower, color, type });

      try {
        candleSeries.attachPrimitive(primitive);
        zonesRef.current = [...zonesRef.current, { id, upper, lower, color, type, primitive }];
        forceZoneRender((n) => n + 1);
      } catch (err) {
        console.error('Failed to attach zone primitive:', err);
      }
    };

    const clearAllZones = () => {
      if (!candleSeries) return;
      zonesRef.current.forEach((z) => {
        try { candleSeries.detachPrimitive(z.primitive); } catch (_) { }
      });
      zonesRef.current = [];
      forceZoneRender((n) => n + 1);
    };

    const noSrReason = 'S&R indicator not active';

    // ── Context menu item definitions ─────────────────────────────────────────
    // To add new global or indicator-specific tools later:
    //   push another object into `items` with { id, label, icon, group, disabled, onClick }
    const items = [
      // Global (always available)
      {
        id: 'copy_crosshair',
        label: `Copy Price at Crosshair${clickPrice ? ` — ${clickPrice.toFixed(5)}` : ''}`,
        icon: '🎯',
        group: 'global',
        disabled: clickPrice === null,
        onClick: () => copyValue(clickPrice),
      },
      { divider: true },
      // S/R specific
      {
        id: 'copy_resistance',
        label: `Copy Resistance${lastResistance ? ` — ${lastResistance.toFixed(5)}` : ''}`,
        icon: '🔴',
        group: 'sr',
        disabled: !srActive || lastResistance === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => copyValue(lastResistance),
      },
      {
        id: 'copy_support',
        label: `Copy Support${lastSupport ? ` — ${lastSupport.toFixed(5)}` : ''}`,
        icon: '🟢',
        group: 'sr',
        disabled: !srActive || lastSupport === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => copyValue(lastSupport),
      },
      { divider: true },
      {
        id: 'insert_buy_zone',
        label: 'Insert BUY Zone',
        icon: '🟩',
        group: 'sr',
        disabled: !srActive || supZoneUpper === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => addZone('buy'),
      },
      {
        id: 'insert_sell_zone',
        label: 'Insert SELL Zone',
        icon: '🟥',
        group: 'sr',
        disabled: !srActive || resZoneUpper === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => addZone('sell'),
      },
      { divider: true },
      {
        id: 'show_support_area',
        label: 'Show Support Area (Green)',
        icon: '🟢',
        group: 'sr',
        disabled: !srActive || lastSupport === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => {
          if (!candleSeries || lastSupport === null) return;
          const id = `area-below-${Date.now()}`;
          const primitive = new ZonePrimitive({
            id, upper: lastSupport, lower: lastSupport,
            color: 'rgba(34,197,94,0.07)', type: 'area_below', fill: 'below',
          });
          try {
            candleSeries.attachPrimitive(primitive);
            zonesRef.current = [...zonesRef.current, { id, primitive }];
            forceZoneRender((n) => n + 1);
          } catch (err) { console.error('area-below:', err); }
        },
      },
      {
        id: 'show_resistance_area',
        label: 'Show Resistance Area (Red)',
        icon: '🔴',
        group: 'sr',
        disabled: !srActive || lastResistance === null,
        disabledReason: !srActive ? noSrReason : undefined,
        onClick: () => {
          if (!candleSeries || lastResistance === null) return;
          const id = `area-above-${Date.now()}`;
          const primitive = new ZonePrimitive({
            id, upper: lastResistance, lower: lastResistance,
            color: 'rgba(239,68,68,0.07)', type: 'area_above', fill: 'above',
          });
          try {
            candleSeries.attachPrimitive(primitive);
            zonesRef.current = [...zonesRef.current, { id, primitive }];
            forceZoneRender((n) => n + 1);
          } catch (err) { console.error('area-above:', err); }
        },
      },
      { divider: true },
      {
        id: 'clear_zones',
        label: 'Clear All Zones',
        icon: '🗑',
        group: 'drawing',
        disabled: zonesRef.current.length === 0,
        disabledReason: zonesRef.current.length === 0 ? 'No zones drawn' : undefined,
        onClick: clearAllZones,
      },
    ];

    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, price: clickPrice, items });
  }, [candleSeries, chartWrapperRef, activeIndicators, selectedAsset, selectedTimeframe, indicatorSeries]);


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
      // CRITICAL FIX: `value` here is the badge label (e.g. "10,50,100"), NOT the
      // indicator type identifier. We must NEVER overwrite `ind.value` (which holds
      // the type key like "ema_cross" or "support_resistance") — it is used by
      // buildIndicatorRequest, useOverlayIndicators, and the tooltip to identify
      // the indicator type. Store the badge label in `displayValue` instead.
      updateIndicator(settingsIndicator.id, { displayValue: value, params });
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
        onIndicatorSuspend={handleIndicatorSuspend}
        onForceRefresh={handleForceRefresh}
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
          <RegimePanel />

          <div
            className="flex-1 min-h-[220px] relative cursor-crosshair"
            ref={chartWrapperRef}
            onContextMenu={handleChartContextMenu}
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
            {/* Tooltip Overlay — only rendered when showChartTooltip is enabled */}
            {showChartTooltip && (
              <ChartTooltip
                visible={tooltipData?.visible}
                left={tooltipData?.left}
                top={tooltipData?.top}
                ohlc={tooltipData?.ohlc}
                indicators={tooltipData?.indicators}
                containerWidth={chartWrapperRef.current?.clientWidth || 800}
                containerHeight={chartWrapperRef.current?.clientHeight || 500}
              />
            )}

            {/* Copy Feedback Toast */}
            {copyFeedback && (
              <div
                className="absolute z-50 px-2 py-1 bg-accent-green text-black text-xs font-bold rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full transition-opacity"
                style={{ left: copyFeedback.x, top: copyFeedback.y - 10 }}
              >
                Copied: {copyFeedback.value}
              </div>
            )}

            {/* Right-click context menu */}
            <ChartContextMenu
              visible={contextMenu.visible}
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items || []}
              onClose={closeContextMenu}
            />

            <div className="w-full h-full">
              <ErrorBoundary>
                <ChartContainer
                  onChartReady={handleChartReady}
                  onError={setError}
                  selectedAsset={selectedAsset}
                  showWatermark={showChartWatermark}
                />
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

      {/* Fix 3: Timeframe data warning popup — shown once per session per asset|timeframe */}
      <IndicatorTimeframeWarning />
    </Card>
  );
};

export default ChartWorkspace;
