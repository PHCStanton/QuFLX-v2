import { useState, useCallback } from 'react';
import Card from './Card';
import useMarketStore from '../store/marketStore';
import ChartContainer from './ChartContainer';
import ChartHeader from './ChartHeader';
import useTickAggregation from '../hooks/useTickAggregation';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';

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
    lastError, clearError,
  } = useMarketStore();

  const health = useStreamHealth();
  const [candleSeries, setCandleSeries] = useState(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);

  const handleChartReady = useCallback(({ series }) => {
    setCandleSeries(series);
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

  // Options for Comboboxes
  const assetList = Array.from(new Set([...(payoutAssets || []), selectedAsset].filter(Boolean)));
  const assetOptions = assetList.map(a => ({ label: a, value: a }));
  
  const timeframeOptions = [
    { label: 'Ticks', value: 'ticks' },
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '1 Hour', value: '1h' },
  ];

  const csvOptions = [
    { label: 'Upload New...', value: 'upload' },
    { label: 'AUDNZD_2023.csv', value: 'file1' },
  ];

  const indicatorOptions = [
    { label: 'RSI', value: 'rsi' },
    { label: 'MACD', value: 'macd' },
    { label: 'Bollinger Bands', value: 'bb' },
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
    <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-2xl bg-gray-900 border border-gray-800 shadow-xl relative">
      
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

      {/* Chart Display Area */}
      <div className="flex-1 relative w-full min-h-0">
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
        
        <div id="quflx-chart-screenshot-root" className="w-full h-full">
          <ChartContainer onChartReady={handleChartReady} />
        </div>
      </div>
    </Card>
  );
};

export default ChartWorkspace;
