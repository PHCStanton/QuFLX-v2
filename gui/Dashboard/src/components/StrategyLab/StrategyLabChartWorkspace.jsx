/**
 * StrategyLabChartWorkspace.jsx
 * Full-width wrapper for Strategy Lab chart
 * Renders when a Strategy Lab file is selected, replacing the live chart
 * Includes indicator controls, screenshot, and AI analysis tools
 */
import { useCallback, useMemo, useState } from 'react';
import Card from '../Card';
import StrategyLabChart from './StrategyLabChart';
import useMarketStore from '../../store/marketStore';
import useSettingsStore from '../../store/settingsStore';
import useScreenshotCapture from '../../hooks/useScreenshotCapture';
import useAskAi from '../../hooks/useAskAi';
import { askAI } from '../../api/aiClient';
import { saveChartScreenshot } from '../../api/screenshotClient';
import AskAiModal from '../AskAiModal';
import ScreenshotModal from '../ScreenshotModal';
import IndicatorSettingsModal from '../IndicatorSettingsModal';
import { X, FileText, Layers, Camera, Brain } from 'lucide-react';
import { indicatorOptions } from '../../config/chartOptions';

/**
 * StrategyLabChartWorkspace - Full-width lab chart container
 * Displays Strategy Lab chart when a file is promoted to main view
 */
const StrategyLabChartWorkspace = () => {
  const { settings } = useSettingsStore();

  const {
    selectedStrategyFileId,
    strategyLabFiles,
    setSelectedStrategyFileId,
    setError,
    setLastAnnotatedScreenshotDataUrl,
    lastAnnotatedScreenshotDataUrl,
    activeIndicators,
    addIndicator,
    removeIndicator,
    updateIndicator,
    indicatorSeries,
    historyCandles,
    historyStatus,
    selectedAsset,
    selectedTimeframe,
  } = useMarketStore();

  // Modal state
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [askAiForceImageDataUrl, setAskAiForceImageDataUrl] = useState(null);
  const [settingsIndicator, setSettingsIndicator] = useState(null);

  // Find the selected lab file data
  const labFile = useMemo(() =>
    strategyLabFiles.find((f) => f.file_id === selectedStrategyFileId),
    [strategyLabFiles, selectedStrategyFileId]
  );

  // Screenshot capture
  const {
    isCapturing,
    isScreenshotOpen,
    screenshotDataUrl,
    setIsScreenshotOpen,
    captureCompositeChart,
    openScreenshot,
  } = useScreenshotCapture({ onError: setError });

  // Ask AI
  const { isAsking, ask } = useAskAi({
    askAI,
    captureImage: captureCompositeChart,
    lastAnnotatedImage: lastAnnotatedScreenshotDataUrl,
    imageSource: settings?.ai?.imageSource,
    autoIncludeContext: settings?.ai?.autoIncludeContext,
    responseVerbosity: 'concise',
    uiMode: 'modal',
    historyCandles,
    historyStatus,
    selectedAsset,
    selectedTimeframe,
    indicatorSeries,
    activeIndicators,
    onError: setError,
  });

  // Handle close - return to live chart
  const handleClose = useCallback(() => {
    setSelectedStrategyFileId(null);
  }, [setSelectedStrategyFileId]);

  // Handle errors from chart
  const handleChartError = useCallback((error) => {
    setError(error);
  }, [setError]);

  // Screenshot handlers
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

  const handleScreenshotSendToAi = useCallback(async ({ dataUrl }) => {
    setAskAiForceImageDataUrl(dataUrl);
    setIsAskAiOpen(true);
  }, []);

  // AI handlers
  const handleAskAiOpen = useCallback(() => {
    setAskAiForceImageDataUrl(null);
    setIsAskAiOpen(true);
  }, []);

  const handleAskAiClose = useCallback(() => {
    setIsAskAiOpen(false);
    setAskAiForceImageDataUrl(null);
  }, []);

  // Indicator settings handlers
  const handleIndicatorClick = useCallback((indicator) => {
    setSettingsIndicator(indicator);
  }, []);

  const handleCloseIndicatorSettings = useCallback(() => {
    setSettingsIndicator(null);
  }, []);

  const handleSaveIndicatorSettings = useCallback(({ value, params }) => {
    if (!settingsIndicator) return;
    updateIndicator(settingsIndicator.id, { value, params });
    setSettingsIndicator(null);
  }, [settingsIndicator, updateIndicator]);

  // No file selected - shouldn't render, but handle gracefully
  if (!selectedStrategyFileId) {
    return (
      <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-2xl quflx-section-light border border-gray-800 shadow-xl relative">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-text-secondary">No Strategy Lab file selected</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="col-span-9 flex flex-col flex-1 overflow-hidden rounded-2xl quflx-section-light border border-gray-800 shadow-xl relative">
      {/* Lab Chart Header - File info + tools */}
      <div className="px-3 py-2 border-b border-border-primary bg-card-bg/90 flex flex-wrap items-center gap-2 z-40 backdrop-blur-sm">
        {/* Left: File info */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-accent-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate max-w-[280px]">
              {labFile?.filename || selectedStrategyFileId}
            </p>
            {labFile?.stats && (
              <p className="text-[10px] text-text-secondary">
                Win: {Math.round((labFile.stats.win_rate || 0) * 100)}% •
                P&L: {labFile.stats.profit_loss > 0 ? '+' : ''}{(labFile.stats.profit_loss || 0).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Regime badge */}
        {labFile?.regime && (
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-accent-primary/10 text-accent-primary font-medium flex-shrink-0">
            {labFile.regime}
          </span>
        )}

        {/* Indicator selector */}
        <div className="flex items-center gap-1 ml-2">
          <Layers className="w-3.5 h-3.5 text-text-secondary" />
          <select
            className="text-xs bg-card-bg border border-border-primary rounded px-2 py-1 text-text-secondary hover:border-accent-primary/50 transition-colors cursor-pointer"
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const meta = indicatorOptions.find((o) => o.value === val);
              if (!meta) return;
              const id = `${val}-${Date.now()}`;
              const value =
                meta.displayValue ||
                (meta.params
                  ? Object.values(meta.params).filter((v) => v !== undefined && v !== null).join(',')
                  : 'Default');
              addIndicator({
                id,
                name: meta.label,
                value,
                type: val,
                key: meta.key,
                kind: meta.kind,
                source: meta.source || 'backend',
                params: meta.params || {},
                paramConfig: meta.paramConfig || [],
              });
              e.target.value = '';
            }}
          >
            <option value="">+ Indicator</option>
            {indicatorOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Active indicator badges */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {activeIndicators.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center gap-1 px-2 py-0.5 bg-section-bg/80 rounded border border-border-primary text-[10px] whitespace-nowrap cursor-pointer hover:border-accent-primary/50"
              onClick={() => handleIndicatorClick(ind)}
            >
              <span className="text-accent-primary font-bold">{ind.name}</span>
              <span className="text-gray-400">{ind.value}</span>
              <X
                size={9}
                className="cursor-pointer hover:text-red-400 ml-0.5"
                onClick={(e) => { e.stopPropagation(); removeIndicator(ind.id); }}
              />
            </div>
          ))}
        </div>

        {/* Right: Action buttons */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {/* Screenshot */}
          <button
            onClick={openScreenshot}
            disabled={isCapturing}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            title="Screenshot"
          >
            <Camera className="w-4 h-4 text-text-secondary hover:text-text-primary" />
          </button>

          {/* Ask AI */}
          <button
            onClick={handleAskAiOpen}
            disabled={isAsking}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            title="Ask AI"
          >
            <Brain className={`w-4 h-4 ${isAsking ? 'text-accent-primary animate-pulse' : 'text-text-secondary hover:text-text-primary'}`} />
          </button>

          {/* Close / Return to live chart */}
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            title="Return to Live Chart"
          >
            <X className="w-4 h-4 text-text-secondary hover:text-text-primary" />
          </button>
        </div>
      </div>

      {/* Ask AI Modal */}
      <AskAiModal
        isOpen={isAskAiOpen}
        onClose={handleAskAiClose}
        onAsk={ask}
        asset={labFile?.filename || selectedStrategyFileId}
        timeframe="Lab"
        forceImageDataUrl={askAiForceImageDataUrl}
      />

      {/* Screenshot Modal */}
      {isScreenshotOpen && (
        <div className="p-3 border-b border-gray-800 bg-gray-950/40">
          <ScreenshotModal
            variant="panel"
            isOpen={isScreenshotOpen}
            imageDataUrl={screenshotDataUrl}
            asset={labFile?.filename || selectedStrategyFileId}
            timeframe="Lab"
            onClose={handleCloseScreenshot}
            onSave={handleSaveScreenshot}
            onSendToAi={handleScreenshotSendToAi}
          />
        </div>
      )}

      {/* Indicator Settings Modal */}
      <IndicatorSettingsModal
        isOpen={!!settingsIndicator}
        indicator={settingsIndicator}
        onClose={handleCloseIndicatorSettings}
        onSave={handleSaveIndicatorSettings}
      />

      {/* Chart Content */}
      {!isScreenshotOpen && (
        <StrategyLabChart
          fileId={selectedStrategyFileId}
          entries={labFile?.entries || []}
          regime={labFile?.regime ? { regime: labFile.regime, is_tradeable: true } : null}
          onError={handleChartError}
        />
      )}
    </Card>
  );
};

export default StrategyLabChartWorkspace;
