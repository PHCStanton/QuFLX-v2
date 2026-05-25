import { normalizeSpecificAsset as normalizeAsset } from './assetUtils';

export const normalizeHistoryTimeframe = (timeframe = '1m') => {
  const raw = String(timeframe || '1m').trim().toLowerCase();
  if (!raw) return '1m';
  if (raw === 'ticks') return 'ticks';

  if (/^\d+$/.test(raw)) {
    return `${Math.max(1, parseInt(raw, 10))}m`;
  }

  if (raw.endsWith('m')) {
    const minutes = parseInt(raw.slice(0, -1), 10);
    return Number.isFinite(minutes) && minutes > 0 ? `${minutes}m` : '1m';
  }

  if (raw.endsWith('h')) {
    const hours = parseInt(raw.slice(0, -1), 10);
    return Number.isFinite(hours) && hours > 0 ? `${hours * 60}m` : '1m';
  }

  if (raw.endsWith('s')) {
    const seconds = parseInt(raw.slice(0, -1), 10);
    return Number.isFinite(seconds) && seconds > 0 ? `${seconds}s` : raw;
  }

  return raw;
};

export const getHistoryKey = (asset, timeframe = '1m') => {
  const assetKey = normalizeAsset(asset);
  if (!assetKey) return '';
  return `${assetKey}|${normalizeHistoryTimeframe(timeframe)}`;
};

export const getLegacyHistoryKeys = (asset) => {
  const raw = typeof asset === 'string' ? asset.trim() : '';
  const normalized = normalizeAsset(raw);
  return Array.from(new Set([raw, normalized].filter(Boolean)));
};
