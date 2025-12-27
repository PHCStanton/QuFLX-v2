import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  } = useMarketStore();

  const health = useStreamHealth();
  const [candleSeries, setCandleSeries] = useState(null);
  const [mainChart, setMainChart] = useState(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [settingsIndicator, setSettingsIndicator] = useState(null);
  const [oscillatorHeight, setOscillatorHeight] = useState(120);
  const oscDragStateRef = useRef(null);

  const handleChartReady = useCallback(({ chart, series }) => {
    setCandleSeries(series);
    setMainChart(chart);
  }, []);

  const { isLoading } = useTickAggregation({
    marketData,
    selectedAssetKey,
    selectedTimeframe,
    candleSeries,
    historyCandles,
    historyStatus,
    selectedAsset
  });

  const oscillatorIndicators = useMemo(
    () => (Array.isArray(activeIndicators)
      ? activeIndicators.filter((ind) => ind.kind === 'oscillator')
      : []),
    [activeIndicators]
  );

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
    const maxHeight = 320;

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

    const indicators = oscillatorIndicators
      .map((ind) => ind.key)
      .filter((key) => typeof key === 'string');

    if (indicators.length === 0) {
      return;
    }

    loadIndicators({ asset: selectedAsset, timeframe: selectedTimeframe, indicators });
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
      params: { period: 14 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 14
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
      label: 'CCI',
      value: 'cci',
      key: 'cci',
      kind: 'oscillator',
      displayValue: '20',
      source: 'backend',
      params: { period: 20 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 5,
          max: 50,
          default: 20
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
      params: { period: 10 },
      paramConfig: [
        {
          name: 'period',
          label: 'Period',
          type: 'number',
          min: 2,
          max: 50,
          default: 10
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

  const captureChart = () => {
    const container = document.getElementById('quflx-chart-screenshot-root');
    if (!container) return null;
    const canvas = container.querySelector('canvas');
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  const handleOpenScreenshot = async () => {
    if (isCapturing) {
      return;
    }
    try {
      setIsCapturing(true);
      const dataUrl = captureChart();
      if (!dataUrl) {
        window.alert('Chart not available for screenshot.');
        return;
      }
      setScreenshotDataUrl(dataUrl);
      setIsScreenshotOpen(true);
    } catch {
      window.alert('Failed to capture screenshot.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAskAi = async () => {
    if (isAsking) return;

    const image = captureChart();
    const recentTicks = marketData[selectedAssetKey]?.slice(-20) || [];
    const context = {
      asset: selectedAsset,
      timeframe: selectedTimeframe,
      currentPrice: recentTicks[recentTicks.length - 1]?.price,
      activeIndicators: activeIndicators.map((i) => i.name),
      recentTicks
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

      <div className="flex-1 relative w-full min-h-0 flex flex-col">
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
          <div id="quflx-chart-screenshot-root" className="w-full h-full">
            <ChartContainer onChartReady={handleChartReady} />
          </div>
        </div>

        {oscillatorIndicators.length > 0 && (
          <>
            <div
              className="h-1 cursor-row-resize bg-gray-800/80 hover:bg-gray-700"
              onMouseDown={handleOscillatorDragStart}
            />
            <div className="mt-2 flex flex-col" style={{ height: oscillatorHeight }}>
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
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
                      className="h-24 bg-gray-900/60 border border-gray-800 rounded relative"
                    >
                      <OscillatorChart
                        mainChart={mainChart}
                        data={data}
                        type={type}
                        title={ind.name}
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
