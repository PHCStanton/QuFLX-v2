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
  responseVerbosity,
  uiMode,
  customInstructions,
  marketData,
  historyCandles,
  selectedAssetKey,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
  onError,
}) => {
  const [isAsking, setIsAsking] = useState(false);

  const ask = useCallback(async ({ prompt, model, imageSourceOverride, forceImageDataUrl } = {}) => {
    const isTimeoutError = (err) => {
      const msg = getErrorMessage(err).toLowerCase();
      return msg.includes('code=timeout') || msg.includes('timed out') || msg.includes('timeout');
    };

    const shrinkContext = ({ context, level }) => {
      if (!context || typeof context !== 'object') return context;
      const next = { ...context };

      if (Array.isArray(next.recentTicks)) {
        const keep = level === 'aggressive' ? 8 : 15;
        next.recentTicks = next.recentTicks.slice(-keep);
      }

      if (next.indicatorSnapshots && typeof next.indicatorSnapshots === 'object') {
        const snapped = {};
        const keep = level === 'aggressive' ? 12 : 25;
        Object.entries(next.indicatorSnapshots).forEach(([k, v]) => {
          if (!Array.isArray(v)) return;
          snapped[k] = v.slice(-keep);
        });
        next.indicatorSnapshots = snapped;
      }

      return next;
    };

    if (isAsking) return null;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      if (onError) onError('Ask AI requires a non-empty prompt.');
      return null;
    }

    let context = buildAiContext({
      autoIncludeContext,
      marketData,
      historyCandles,
      selectedAssetKey,
      indicatorSeries,
      activeIndicators,
      selectedAsset,
      selectedTimeframe,
    });

    if (responseVerbosity) {
      context.responseVerbosity = String(responseVerbosity);
    }
    if (uiMode) {
      context.uiMode = String(uiMode);
    }
    if (customInstructions) {
      context.customInstructions = String(customInstructions);
    }

    const trimmedPrompt = prompt.trim();
    const complexPrompt = trimmedPrompt.length >= 450;

    if (complexPrompt) {
      context = shrinkContext({ context, level: 'normal' });
    }

    const src = imageSourceOverride || imageSource;
    let usedImageSource = String(src || 'live');

    try {
      setIsAsking(true);
      const resolveImage = async (source) => {
        if (forceImageDataUrl) {
          return forceImageDataUrl;
        }
        return resolveAiImage({
          imageSource: source,
          lastAnnotatedImage,
          captureImage,
        });
      };

      const runRequest = async ({ requestContext, requestImageSource }) => {
        const image = await resolveImage(requestImageSource);
        return askAI({ prompt: trimmedPrompt, model, context: requestContext, image });
      };

      let response;
      try {
        response = await runRequest({ requestContext: context, requestImageSource: src });
      } catch (err) {
        if (isTimeoutError(err)) {
          const retryContext = shrinkContext({ context, level: 'aggressive' });
          response = await runRequest({ requestContext: retryContext, requestImageSource: 'none' });
          context = retryContext;
          usedImageSource = 'none';
        } else {
          throw err;
        }
      }

      if (!response || !response.answer) {
        const msg = 'AI did not return an answer.';
        if (onError) onError(msg);
        return null;
      }

      return {
        answer: String(response.answer),
        meta: response.meta || null,
        usedImageSource,
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
    responseVerbosity,
    uiMode,
    customInstructions,
    marketData,
    historyCandles,
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
