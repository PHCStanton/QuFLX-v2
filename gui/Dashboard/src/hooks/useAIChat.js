import { useCallback, useState } from 'react';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const useAIChat = ({
  askAI,
  captureImage,
  lastAnnotatedImage,
  imageSource,
  autoIncludeContext,
  marketData,
  selectedAssetKey,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
  onError
}) => {
  const [isAsking, setIsAsking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [isAnswerOpen, setIsAnswerOpen] = useState(false);

  const handleAskAi = useCallback(async () => {
    if (isAsking) return;

    const prompt = window.prompt('Ask AI about the current market context:');
    if (!prompt) return;

    let image = null;
    const src = String(imageSource || '').toLowerCase();
    if (src === 'annotated' && typeof lastAnnotatedImage === 'string' && lastAnnotatedImage.trim()) {
      image = lastAnnotatedImage;
    } else if (src === 'live' || src === 'annotated') {
      image = captureImage ? await captureImage() : null;
    }

    const recentTicks = (marketData && selectedAssetKey && marketData[selectedAssetKey])
      ? marketData[selectedAssetKey].slice(-20)
      : [];

    const indicatorKey = selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null;
    const seriesForKey = indicatorKey && indicatorSeries ? indicatorSeries[indicatorKey] : null;
    const indicatorSnapshots = {};

    if (seriesForKey && Array.isArray(activeIndicators)) {
      activeIndicators.forEach((ind) => {
        if (!ind || !ind.key) return;
        const series = seriesForKey[ind.key];
        if (!Array.isArray(series) || series.length === 0) return;
        const tail = series.slice(-50);
        const name = ind.name || ind.key;
        indicatorSnapshots[name] = tail;
      });
    }

    const includeContext = autoIncludeContext !== false;
    const context = includeContext
      ? {
        asset: selectedAsset,
        timeframe: selectedTimeframe,
        currentPrice: recentTicks[recentTicks.length - 1]?.price,
        activeIndicators: Array.isArray(activeIndicators) ? activeIndicators.map((i) => i.name) : [],
        recentTicks,
        indicatorSnapshots
      }
      : { asset: selectedAsset, timeframe: selectedTimeframe };

    try {
      setIsAsking(true);
      const response = await askAI({ prompt, context, image });
      if (response && response.answer) {
        setAnswer(String(response.answer));
        setIsAnswerOpen(true);
      } else {
        const msg = 'AI did not return an answer.';
        if (onError) onError(msg);
      }
    } catch (err) {
      if (onError) onError(`Ask AI failed: ${getErrorMessage(err)}`);
    } finally {
      setIsAsking(false);
    }
  }, [
    isAsking,
    captureImage,
    lastAnnotatedImage,
    imageSource,
    autoIncludeContext,
    marketData,
    selectedAssetKey,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    askAI,
    onError
  ]);

  const closeAnswer = useCallback(() => {
    setIsAnswerOpen(false);
  }, []);

  return { isAsking, handleAskAi, answer, isAnswerOpen, closeAnswer };
};

export default useAIChat;
