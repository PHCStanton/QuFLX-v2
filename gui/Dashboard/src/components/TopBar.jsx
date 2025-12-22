import { useState } from 'react';
import { Bot, Camera } from 'lucide-react';
import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';
import { askAI } from '../api/aiClient';
import { saveChartScreenshot } from '../api/screenshotClient';
import ScreenshotModal from './ScreenshotModal';
import StatusIndicator from './StatusIndicator';

const TopBar = () => {
  const { 
    wsStatus, 
    chromeStatus, 
    selectedAsset,
    selectedTimeframe,
    activeIndicators,
    marketData,
    selectedAssetKey
  } = useMarketStore();

  const health = useStreamHealth();
  const [isAsking, setIsAsking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);

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

  return (
    <header className="h-16 bg-card-bg border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <StatusIndicator />
        <StatusBadge label="WS" status={wsStatus} />
        <StatusBadge label="Chrome" status={chromeStatus} />
        <StatusBadge label="Stream" status={health} />
      </div>
      
      <div className="flex items-center gap-4">
        <button
          onClick={handleOpenScreenshot}
          disabled={isCapturing}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Capture chart screenshot"
        >
          <Camera size={18} />
        </button>
        <button
          onClick={async () => {
            if (isAsking) return;
            
            // 1. Capture screenshot automatically (Vision)
            const image = captureChart();
            
            // 2. Prepare Context (Data)
            const recentTicks = marketData[selectedAssetKey]?.slice(-20) || [];
            const context = {
                asset: selectedAsset,
                timeframe: selectedTimeframe,
                currentPrice: recentTicks[recentTicks.length - 1]?.price,
                activeIndicators: activeIndicators.map(i => i.name),
                recentTicks
            };

            const prompt = window.prompt('Ask AI about the current market context:');
            if (!prompt) return;
            try {
              setIsAsking(true);
              const response = await askAI({ prompt, context, image });
              // For now, simply show the answer in an alert. A richer UI panel can be added later.
              if (response && response.answer) {
                window.alert(response.answer);
              } else {
                window.alert('AI did not return an answer.');
              }
            } catch (err) {
              // Minimal error surfacing; future work can route this into lastError/UI banner.
              console.error('Ask AI failed:', err);
              window.alert(`Ask AI failed: ${err.message}`);
            } finally {
              setIsAsking(false);
            }
          }}
          disabled={isAsking}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Bot size={18} />
          <span>{isAsking ? 'Asking…' : 'Ask AI'}</span>
        </button>
      </div>
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
            timeframe,
          });
        }}
      />
    </header>
  );
};

const StatusBadge = ({ label, status }) => {
  const getStatusColor = (s) => {
    switch(s) {
      case 'connected': return 'bg-accent-green';
      case 'streaming': return 'bg-accent-green animate-pulse';
      case 'error': return 'bg-accent-red';
      default: return 'bg-yellow-500';
    }
  };
  
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded border border-gray-700">
      <span className="text-xs font-bold text-gray-400 uppercase">{label}</span>
      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
    </div>
  );
};

export default TopBar;
