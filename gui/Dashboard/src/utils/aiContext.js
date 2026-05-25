import { getHistoryKey } from './historyKey';

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

const INDICATOR_SNAPSHOT_MAP = [
  ['RSI', 'rsi_14'],
  ['CCI', 'cci'],
  ['MACD Histogram', 'macd_histogram'],
  ['DeMarker', 'demarker'],
  ['ADX', 'adx'],
  ['ATR', 'atr_14'],
  ['Schaff Trend Cycle', 'schaff_tc'],
  ['SuperTrend', 'supertrend'],
  ['EMA', 'ema_16'],
  ['Bollinger Bands', 'bb_middle'],
  ['Support & Resistance', 'support_level'],
  ['EMA Cross-Over', 'ema_21'],
  ['RSI 21', 'rsi_21'],
  ['MACD', 'macd'],
  ['MACD Signal', 'macd_signal'],
  ['BB Upper', 'bb_upper'],
  ['BB Lower', 'bb_lower'],
  ['BB Width', 'bb_width'],
  ['ATR 21', 'atr_21'],
  ['Plus DI', 'plus_di'],
  ['Minus DI', 'minus_di'],
  ['Stochastic %K', 'stoch_k'],
  ['Stochastic %D', 'stoch_d'],
  ['Williams %R', 'williams_r'],
  ['ROC 10', 'roc_10'],
  ['EMA 50', 'ema_50'],
  ['EMA 100', 'ema_100'],
  ['SuperTrend Direction', 'supertrend_direction'],
  ['Resistance Level', 'resistance_level'],
  ['Distance to Resistance %', 'dist_to_resistance'],
  ['Distance to Support %', 'dist_to_support'],
  ['Resistance Freshness', 'resistance_freshness'],
  ['Support Freshness', 'support_freshness'],
  ['S/R Flip', 'sr_flip'],
];

const getContextWindowSizes = (uiMode) => {
  const mode = String(uiMode || '').toLowerCase();
  if (mode === 'modal') {
    return {
      tickKeep: 5,
      candleKeep: 10,
      snapshotKeep: 5,
    };
  }

  return {
    tickKeep: 20,
    candleKeep: 100,
    snapshotKeep: 50,
  };
};
const buildIndicatorSnapshots = ({ seriesForKey, activeIndicators, snapshotKeep }) => {
  const indicatorSnapshots = {};

  if (!seriesForKey || typeof seriesForKey !== 'object') {
    return indicatorSnapshots;
  }

  INDICATOR_SNAPSHOT_MAP.forEach(([name, key]) => {
    const series = seriesForKey[key];
    if (!Array.isArray(series) || series.length === 0) return;
    indicatorSnapshots[name] = series.slice(-snapshotKeep);
  });

  if (Array.isArray(activeIndicators)) {
    activeIndicators.forEach((ind) => {
      if (!ind || !ind.key) return;
      const series = seriesForKey[ind.key];
      const name = ind.name || ind.key;
      if (!Array.isArray(series) || series.length === 0 || indicatorSnapshots[name]) return;
      indicatorSnapshots[name] = series.slice(-snapshotKeep);
    });
  }

  return indicatorSnapshots;
};

export const buildAiContext = ({
  autoIncludeContext,
  marketData,
  historyCandles,
  selectedAssetKey,
  indicatorSeries,
  activeIndicators,
  selectedAsset,
  selectedTimeframe,
  uiMode = 'insights',
}) => {
  const includeContext = autoIncludeContext !== false;
  const { tickKeep, candleKeep, snapshotKeep } = getContextWindowSizes(uiMode);

  if (!includeContext) {
    return {
      asset: selectedAsset,
      timeframe: selectedTimeframe,
    };
  }

  const recentTicks = (marketData && selectedAssetKey && marketData[selectedAssetKey])
    ? marketData[selectedAssetKey].slice(-tickKeep)
    : [];

  const historyKey = getHistoryKey(selectedAssetKey || selectedAsset, selectedTimeframe);
  const rawCandles = (historyCandles && historyKey && historyCandles[historyKey]) || [];
  const recentCandles = Array.isArray(rawCandles) ? rawCandles.slice(-candleKeep) : [];

  const indicatorKey = selectedAsset && selectedTimeframe ? `${selectedAsset}|${selectedTimeframe}` : null;
  const seriesForKey = indicatorKey && indicatorSeries ? indicatorSeries[indicatorKey] : null;
  const indicatorSnapshots = buildIndicatorSnapshots({ seriesForKey, activeIndicators, snapshotKeep });

  return {
    asset: selectedAsset,
    timeframe: selectedTimeframe,
    currentPrice: recentTicks[recentTicks.length - 1]?.price,
    activeIndicators: Array.isArray(activeIndicators) ? activeIndicators.map((i) => i.name) : [],
    recentTicks,
    recentCandles,
    indicatorSnapshots,
  };
};
