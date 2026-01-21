export const getAiImageSourceLabel = ({ imageSource, lastAnnotatedImage }) => {
  const src = String(imageSource || '').toLowerCase();
  const hasAnnotated = typeof lastAnnotatedImage === 'string' && lastAnnotatedImage.trim();

  if (src === 'none') return 'None';
  if (src === 'annotated') return hasAnnotated ? 'Annotated' : 'Annotated → Live fallback';
  return 'Live Snapshot';
};

export const resolveAiImage = async ({ imageSource, lastAnnotatedImage, captureImage }) => {
  const src = String(imageSource || '').toLowerCase();
  const hasAnnotated = typeof lastAnnotatedImage === 'string' && lastAnnotatedImage.trim();

  if (src === 'none') return null;
  if (src === 'annotated' && hasAnnotated) return lastAnnotatedImage;

  if ((src === 'live' || src === 'annotated') && typeof captureImage === 'function') {
    return captureImage();
  }

  return null;
};

export const buildAiContext = ({
  autoIncludeContext,
  marketData,
  selectedAssetKey,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
}) => {
  const includeContext = autoIncludeContext !== false;

  if (!includeContext) {
    return {
      asset: selectedAsset,
      timeframe: selectedTimeframe,
    };
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

  return {
    asset: selectedAsset,
    timeframe: selectedTimeframe,
    currentPrice: recentTicks[recentTicks.length - 1]?.price,
    activeIndicators: Array.isArray(activeIndicators) ? activeIndicators.map((i) => i.name) : [],
    recentTicks,
    indicatorSnapshots,
  };
};

