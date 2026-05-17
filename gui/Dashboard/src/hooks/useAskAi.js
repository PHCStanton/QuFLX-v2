import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAiImage, buildAiContext } from '../utils/aiContext';

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const isTimeoutError = (err) => {
  if (!err) {
    return false;
  }

  if (err.code === 'timeout') {
    return true;
  }

  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout');
};

const isAbortError = (err) => err?.name === 'AbortError';

const useAskAi = ({
  askAI,
  askAIStream,
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
  const abortRef = useRef(null);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    abort();
  }, [abort]);

  const ask = useCallback(async ({ prompt, model, imageSourceOverride, forceImageDataUrl, onChunk } = {}) => {
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
      uiMode,
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
    const controller = new AbortController();
    abortRef.current = controller;

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
        if (typeof onChunk === 'function' && typeof askAIStream === 'function') {
          let streamedAnswer = '';
          let streamedMeta = null;

          for await (const chunk of askAIStream({
            prompt: trimmedPrompt,
            model,
            context: requestContext,
            image,
            signal: controller.signal,
          })) {
            if (chunk?.type === 'delta') {
              const delta = String(chunk.delta || '');
              if (!delta) continue;
              streamedAnswer += delta;
              onChunk(streamedAnswer, delta);
              continue;
            }

            if (chunk?.type === 'done') {
              streamedMeta = chunk.meta || null;
              if (typeof chunk.answer === 'string' && chunk.answer) {
                streamedAnswer = chunk.answer;
                onChunk(streamedAnswer, '');
              }
            }
          }

          return {
            answer: streamedAnswer,
            meta: streamedMeta,
          };
        }

        return askAI({
          prompt: trimmedPrompt,
          model,
          context: requestContext,
          image,
          signal: controller.signal,
        });
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
      if (isAbortError(err)) {
        return { aborted: true };
      }
      if (onError) onError(`Ask AI failed: ${getErrorMessage(err)}`);
      return null;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsAsking(false);
    }
  }, [
    isAsking,
    askAI,
    askAIStream,
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

  return { isAsking, ask, abort };
};

export default useAskAi;
