import { useCallback, useState } from 'react';
import { resolveAiImage, buildAiContext } from '../utils/aiContext';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const useAskAi = ({
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
  onError,
}) => {
  const [isAsking, setIsAsking] = useState(false);

  const ask = useCallback(async ({ prompt, imageSourceOverride, forceImageDataUrl } = {}) => {
    if (isAsking) return null;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      if (onError) onError('Ask AI requires a non-empty prompt.');
      return null;
    }

    const context = buildAiContext({
      autoIncludeContext,
      marketData,
      selectedAssetKey,
      indicatorSeries,
      activeIndicators,
      selectedAsset,
      selectedTimeframe,
    });

    const src = imageSourceOverride || imageSource;

    try {
      setIsAsking(true);
      const image = forceImageDataUrl
        ? forceImageDataUrl
        : await resolveAiImage({
          imageSource: src,
          lastAnnotatedImage,
          captureImage,
        });

      const response = await askAI({ prompt: prompt.trim(), context, image });
      if (!response || !response.answer) {
        const msg = 'AI did not return an answer.';
        if (onError) onError(msg);
        return null;
      }

      return {
        answer: String(response.answer),
        meta: response.meta || null,
        usedImageSource: String(src || 'live'),
        asset: selectedAsset,
        timeframe: selectedTimeframe,
      };
    } catch (err) {
      if (onError) onError(`Ask AI failed: ${getErrorMessage(err)}`);
      return null;
    } finally {
      setIsAsking(false);
    }
  }, [
    isAsking,
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
    onError,
  ]);

  return { isAsking, ask };
};

export default useAskAi;

