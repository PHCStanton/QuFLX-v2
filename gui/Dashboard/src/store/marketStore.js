import { create } from 'zustand';
import { io } from 'socket.io-client';
import { validateMarketData } from '../utils/validators';
import { withQuFLXPersist, QFLX_PERSIST_KEYS } from './persistMiddleware';
import { getApiBaseUrl } from '../api/apiBase';
import { normalizeTimestamp } from '../utils/time';
import { normalizeSpecificAsset as normalizeAsset } from '../utils/assetUtils';
import { getHistoryKey, getLegacyHistoryKeys } from '../utils/historyKey';
import alertSignalSound from '../assets/Sounds/TopGun_Clip_Music_Voice.mp3';

const LAST_ANNOTATED_SCREENSHOT_STORAGE_KEY = 'quflx:lastAnnotatedScreenshotDataUrl';

const readStringFromStorage = (key) => {
  try {
    const value = localStorage.getItem(key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  } catch (err) {
    console.warn('Failed to read from localStorage:', err);
    return null;
  }
};

const writeStringToStorage = (key, value) => {
  try {
    if (typeof value === 'string' && value.trim()) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Failed to write to localStorage:', err);
  }
};

const initialLastAnnotatedScreenshotDataUrl = readStringFromStorage(LAST_ANNOTATED_SCREENSHOT_STORAGE_KEY);

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const parseTargetAssets = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  let parts = [];
  if (/[\n,;]+/.test(raw)) {
    parts = raw.split(/[\n,;]+/);
  } else if (raw.includes('/')) {
    parts = [raw];
  } else {
    parts = raw.split(/\s+/);
  }

  return uniq(parts.map((a) => normalizeAsset(String(a).trim())).filter(Boolean));
};

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createUiSlice = (set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  lastError: null,
  setError: (message) => set({ lastError: message }),
  clearError: () => set({ lastError: null }),
  lastAnnotatedScreenshotDataUrl: initialLastAnnotatedScreenshotDataUrl,
  setLastAnnotatedScreenshotDataUrl: (dataUrl) => {
    const next = typeof dataUrl === 'string' && dataUrl.trim() ? dataUrl : null;
    writeStringToStorage(LAST_ANNOTATED_SCREENSHOT_STORAGE_KEY, next);
    set({ lastAnnotatedScreenshotDataUrl: next });
  },
  aiMessages: [],
  appendAiMessage: (message) => {
    if (!message || typeof message !== 'object') return;
    set((state) => ({
      aiMessages: state.aiMessages.concat([
        {
          role: message.role,
          content: message.content,
          ts: message.ts || Date.now(),
          meta: message.meta || null,
        }
      ])
    }));
  },
  clearAiMessages: () => set({ aiMessages: [] }),
  aiDraftPrompt: '',
  setAiDraftPrompt: (value) => set({ aiDraftPrompt: typeof value === 'string' ? value : '' }),
  captureChartImage: null,
  setCaptureChartImage: (fn) => set({ captureChartImage: typeof fn === 'function' ? fn : null }),
  activeIndicators: [],
  // Fix 3: Structured warning for missing timeframe data (separate from generic lastError).
  // Set when the indicator API returns 404 (no CSV for the requested timeframe).
  // Shape: { asset: string, timeframe: string } | null
  indicatorWarning: null,
  setIndicatorWarning: (warning) => set({ indicatorWarning: warning }),
  clearIndicatorWarning: () => set({ indicatorWarning: null }),
  setActiveIndicators: (indicators) =>
    set({ activeIndicators: Array.isArray(indicators) ? indicators : [] }),
  addIndicator: (indicator) =>
    set((state) => {
      // Prevent adding a duplicate indicator of the same type (value).
      // The system maps each indicator type to a fixed backend series column,
      // so two instances of the same type would always show identical data.
      const alreadyExists = state.activeIndicators.some(
        (ind) => ind.value === indicator.value
      );
      if (alreadyExists) return state; // no-op — caller should show a toast if needed
      return { activeIndicators: [...state.activeIndicators, indicator] };
    }),
  updateIndicator: (id, patch) =>
    set((state) => ({
      activeIndicators: state.activeIndicators.map((indicator) =>
        indicator.id === id ? { ...indicator, ...patch } : indicator
      )
    })),
  removeIndicator: (id) =>
    set((state) => ({
      activeIndicators: state.activeIndicators.filter((indicator) => indicator.id !== id)
    })),
  automations: {
    autoSelectFavorites: false,
    pendingOrders: false
  },
  toggleAutomation: (key) =>
    set((state) => ({
      automations: {
        ...state.automations,
        [key]: !state.automations[key]
      }
    })),
});

const createTickerSlice = () => ({
  marketData: {},
  tickerMaxAssets: 15,
  subscribedAssetKeys: [],
  monitoringAssetKeys: [],
  quotesByAssetKey: {},
  baselineByAssetKey: {},
  alertFeed: [], // [{ asset, regime, direction, expiry, price, confluence, ai_confirmed, ai_confidence, timestamp }]
  currentRegime: null,
  lastTickTimestamp: null
});

const createStrategyLabSlice = (set, get) => ({
  strategyLabFiles: [], // [{ file_id, filename, rows, date_range, regime, stats, entries }]
  selectedStrategyFileId: null,
  strategyLabData: {}, // { fileId: [candles] }

  addStrategyLabFile: (file) => set(state => {
    const exists = state.strategyLabFiles.some(f => f.file_id === file.file_id);
    if (exists) return state;
    return { strategyLabFiles: [...state.strategyLabFiles, file] };
  }),

  setSelectedStrategyFileId: async (fileId) => {
    if (!fileId) {
      set({ selectedStrategyFileId: null });
      return;
    }

    set({ selectedStrategyFileId: fileId });

    // Fetch data if not cached
    if (!get().strategyLabData[fileId]) {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/v1/strategy/data/${fileId}`);
        const data = await res.json();
        if (data.ok) {
          const normalizedCandles = (data.candles || []).map(c => {
            const time = normalizeTimestamp(c.timestamp || c.time);
            return {
              ...c,
              time,
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close)
            };
          }).filter(c => c.time !== null && !isNaN(c.open))
            .sort((a, b) => a.time - b.time);

          // Deduplicate timestamps
          const uniqueCandles = [];
          const seenTimes = new Set();
          for (const c of normalizedCandles) {
            if (!seenTimes.has(c.time)) {
              seenTimes.add(c.time);
              uniqueCandles.push(c);
            }
          }

          set(state => ({
            strategyLabData: {
              ...state.strategyLabData,
              [fileId]: uniqueCandles
            }
          }));
        }
      } catch (err) {
        console.error("Failed to fetch lab data", err);
      }
    }
  }
});

const createMarketSlice = (set, get) => ({
  assetFilterState: {
    maxAssets: 5,
    minPayout: 92,
    includeAssets: '',
    ignoreAssets: '',
    filterMode: null
  },
  scanHeartbeat: null, // Last Asset Scan Confirmed data
  setAssetFilterState: (state) => set({ assetFilterState: state }),
  selectedAsset: 'AUDNZDOTC',
  selectedAssetKey: normalizeAsset('AUDNZDOTC'),
  selectedAssetLoading: false,
  publishMonitoringAssets: () => {
    const { socket, monitoringAssetKeys } = get();
    if (!socket || !socket.connected) return;
    const normalized = uniq((monitoringAssetKeys || []).map((k) => normalizeAsset(k)).filter(Boolean));
    socket.emit('update_active_ticker', normalized);
  },
  addMonitoredAsset: (asset) => {
    const assetKey = normalizeAsset(asset);
    if (!assetKey) return;
    const current = get().monitoringAssetKeys || [];
    const nextMonitoring = uniq([...current, assetKey]);
    set({ monitoringAssetKeys: nextMonitoring });
    const required = get().computeRequiredAssetKeys(get().selectedAssetKey);
    get().applySubscriptions(required);
    get().publishMonitoringAssets();
  },
  removeMonitoredAsset: (asset) => {
    const assetKey = normalizeAsset(asset);
    if (!assetKey) return;
    const current = get().monitoringAssetKeys || [];
    const nextMonitoring = current.filter((item) => item !== assetKey);
    set({ monitoringAssetKeys: nextMonitoring });
    const required = get().computeRequiredAssetKeys(get().selectedAssetKey);
    get().applySubscriptions(required);
    get().publishMonitoringAssets();
  },
  clearMonitoringAssets: (options = {}) => {
    const selectedAssetKey = get().selectedAssetKey;
    const preserveSelected = options && options.preserveSelected === true;
    const nextMonitoring = preserveSelected && selectedAssetKey ? [selectedAssetKey] : [];
    set({ monitoringAssetKeys: nextMonitoring });
    const required = get().computeRequiredAssetKeys(get().selectedAssetKey);
    get().applySubscriptions(required);
    get().publishMonitoringAssets();
  },
  setSelectedAsset: async (asset) => {
    if (!asset) return;
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey,
      selectedAssetLoading: true,
      marketData: {},       // Clear old tick data immediately
      indicatorSeries: {},  // Clear stale indicator data so old S/R lines don't linger
    });

    const { settings } = (await import('./settingsStore')).default.getState();
    const dataSourceMode = settings.analysis?.dataSourceMode || 'history_and_streaming';

    if (dataSourceMode !== 'streaming_only') {
      try {
        await get().loadHistory(asset);
      } catch (err) {
        console.error('Failed to load history:', err);
        set({ lastError: `Failed to load history: ${getErrorMessage(err)}` });
      }
    } else {
      const historyKey = getHistoryKey(nextAssetKey, get().selectedTimeframe);
      set((state) => ({
        historyCandles: { ...state.historyCandles, [historyKey]: [] },
        historyStatus: { ...state.historyStatus, [historyKey]: 'skipped' }
      }));
    }

    set({ selectedAssetLoading: false });

    if (dataSourceMode !== 'history_only') {
      get().syncSubscriptions(nextAssetKey);

      try {
        await get().awaitStreamingForSelectedAsset(5000, 200);
      } catch (err) {
        console.error('Streaming readiness check failed in manual select:', err);
        set({
          lastError: `Streaming did not become ready: ${getErrorMessage(err)}. Check backend status.`
        });
      }
    }
  },
  hasRecentTicksForSelectedAsset: (windowMs = 5000) => {
    const { selectedAssetKey, marketData } = get();
    if (!selectedAssetKey) return false;
    const ticks = marketData[selectedAssetKey] || [];
    if (!ticks.length) return false;
    const now = Date.now();
    const last = ticks[ticks.length - 1];
    if (!last) return false;
    const ts = typeof last.receivedAt === 'number' ? last.receivedAt : now;
    return now - ts <= windowMs;
  },
  awaitStreamingForSelectedAsset: async (timeoutMs = 3000, pollMs = 200) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (get().hasRecentTicksForSelectedAsset(timeoutMs)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return false;
  },
  starAsset: async (asset) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('star_asset', asset);
    } else {
      console.error('Cannot star asset: socket not connected');
      set({ lastError: 'Cannot star asset: not connected to backend.' });
    }
  },
  selectedTimeframe: '1m',
  setSelectedTimeframe: async (timeframe) => {
    const prev = get().selectedTimeframe;
    set({ selectedTimeframe: timeframe, marketData: {}, lastError: null });

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/timeframe/select-timeframe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });

      if (!response.ok) {
        console.error(`Failed to select timeframe: HTTP ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        set({
          selectedTimeframe: prev === undefined ? '1m' : prev,
          lastError: errorData.detail || `Failed to select timeframe: ${timeframe}`
        });
      } else {
        set({ lastError: null });
      }
    } catch (err) {
      console.error('Failed to select timeframe in backend:', err);
      set({
        selectedTimeframe: prev === undefined ? '1m' : prev,
        lastError: `Network error selecting timeframe: ${err.message}`
      });
    }
  },
  syncTimeframeUi: async () => {
    const timeframe = get().selectedTimeframe;
    if (!timeframe) return;

    if (timeframe === 'ticks') {
      set({ lastError: "UI sync for 'ticks' timeframe is not supported" });
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/timeframe/sync-timeframe-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });

      if (!response.ok) {
        const responseClone = response.clone();
        let detail = `Failed to sync timeframe UI for: ${timeframe}`;

        const extractDetail = (payload) => {
          if (!payload || typeof payload !== 'object') return null;
          const d = payload.detail;
          if (typeof d === 'string' && d.trim()) return d;
          if (d && typeof d === 'object') {
            if (typeof d.user_message === 'string' && d.user_message.trim()) return d.user_message;
            if (typeof d.detail === 'string' && d.detail.trim()) return d.detail;
            try {
              return JSON.stringify(d);
            } catch {
              return String(d);
            }
          }
          if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
          if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
          return null;
        };

        try {
          const errorData = await response.json();
          detail = extractDetail(errorData) || detail;
        } catch {
          try {
            const text = await responseClone.text();
            if (typeof text === 'string' && text.trim()) {
              detail = text.trim();
            }
          } catch {
            void 0;
          }
        }
        console.error('Sync timeframe UI failed:', detail);
        set({ lastError: detail });
      } else {
        set({ lastError: null });
      }
    } catch (err) {
      console.error('Sync timeframe UI request failed:', err);
      set({ lastError: `Network error syncing timeframe UI: ${err.message}` });
    }
  },
  indicatorSeries: {},
  indicatorStatus: {},
  setIndicatorSeries: (updater) => set((state) => ({
    indicatorSeries: typeof updater === 'function'
      ? updater(state.indicatorSeries)
      : updater
  })),
  loadIndicators: async ({ asset, timeframe, indicators, params, currentCandle }) => {
    if (!asset || !timeframe || !Array.isArray(indicators) || indicators.length === 0) {
      return;
    }

    const { historyStatus, historyCandles } = get();
    const historyKey = getHistoryKey(asset, timeframe);
    const historyState = historyStatus && historyStatus[historyKey];
    const candles = historyCandles && historyCandles[historyKey];
    const hasHistoryCandles = Array.isArray(candles) && candles.length > 0;

    if (historyState === 'not_found' || historyState === 'error' || historyState === 'empty') {
      // Don't show error yet if it's still loading or if we just selected the asset
      if (historyState === 'loading') return;

      set({
        lastError: `No historical data available for ${asset} @ ${timeframe}. Run history collection first.`
      });
      return;
    }

    if (!hasHistoryCandles && historyState !== 'loaded') {
      return;
    }

    const key = `${asset}|${timeframe}`;

    set((state) => ({
      indicatorStatus: {
        ...state.indicatorStatus,
        [key]: 'loading'
      }
    }));

    try {
      const payload = {
        asset,
        timeframe,
        indicators,
        current_candle: currentCandle
      };

      if (params && typeof params === 'object' && !Array.isArray(params)) {
        payload.params = params;
      }

      const res = await fetch(`${getApiBaseUrl()}/api/v1/indicators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // Fix 3: 404 means no CSV for this timeframe — show a targeted reminder popup
        // instead of a generic error banner. Other errors still use lastError.
        if (res.status === 404) {
          set((state) => ({
            indicatorStatus: { ...state.indicatorStatus, [key]: 'error' },
            indicatorWarning: { asset, timeframe },
          }));
        } else {
          set((state) => ({
            indicatorStatus: { ...state.indicatorStatus, [key]: 'error' },
            lastError: errorData.detail || `Failed to load indicators for ${asset}`,
          }));
        }
        return;
      }

      const data = await res.json();

      // The backend returns series in data.series if using **data unpacking, 
      // or in data.data.series if returned as a nested object.
      // Based on gateway/routes/indicators.py, it should be top-level.
      const series = data.series || (data.data && data.data.series) || {};

      set((state) => ({
        indicatorSeries: {
          ...state.indicatorSeries,
          [key]: series
        },
        indicatorStatus: {
          ...state.indicatorStatus,
          [key]: 'loaded'
        }
      }));
    } catch (err) {
      console.error('Failed to load indicators:', err);
      set((state) => ({
        indicatorStatus: {
          ...state.indicatorStatus,
          [key]: 'error'
        },
        lastError: `Network error loading indicators: ${err.message}`
      }));
    }
  },
  appendCandle: async ({ asset, timeframe, candle }) => {
    if (!asset || !candle) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/history/append-candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, timeframe, candle })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const detail = errorData.detail || 'Unknown error';
        console.error('Failed to append candle:', detail);
        set({ lastError: `Failed to append candle: ${detail}` });
      }
    } catch (err) {
      console.error('Network error appending candle:', err);
      set({ lastError: `Network error appending candle: ${getErrorMessage(err)}` });
    }
  },
  historyCandles: {},
  historyStatus: {},
  clearHistoryCache: (asset, timeframe = null) => {
    const assetKey = typeof asset === 'string' ? asset.trim() : '';
    if (!assetKey) return;

    const normalizedKey = normalizeAsset(assetKey);

    set((state) => ({
      historyCandles: Object.keys(state.historyCandles || {}).reduce((next, key) => {
        const shouldClear = timeframe
          ? key === getHistoryKey(normalizedKey, timeframe)
          : key === assetKey || key === normalizedKey || key.startsWith(`${normalizedKey}|`);
        if (shouldClear) {
          next[key] = [];
        }
        return next;
      }, { ...state.historyCandles }),
      historyStatus: Object.keys(state.historyStatus || {}).reduce((next, key) => {
        const shouldClear = timeframe
          ? key === getHistoryKey(normalizedKey, timeframe)
          : key === assetKey || key === normalizedKey || key.startsWith(`${normalizedKey}|`);
        if (shouldClear) {
          next[key] = undefined;
        }
        return next;
      }, getLegacyHistoryKeys(assetKey).reduce((next, key) => {
        next[key] = undefined;
        return next;
      }, { ...state.historyStatus })),
    }));
  },
  loadHistory: async (asset, numCandles = 100) => {
    if (!asset) return;

    const assetKey = normalizeAsset(asset);
    const timeframe = get().selectedTimeframe || '1m';
    const historyKey = getHistoryKey(assetKey, timeframe);
    const existingStatus = get().historyStatus[historyKey];
    const existingCandles = get().historyCandles[historyKey];
    
    if (existingStatus === 'loaded' && Array.isArray(existingCandles) && existingCandles.length > 0) {
      console.log(`[LoadHistory] Early return: Cache hit for ${historyKey}`);
      return;
    }

    set((state) => ({
      historyStatus: {
        ...state.historyStatus,
        [historyKey]: 'loading'
      }
    }));

    const tfRaw = String(timeframe).trim().toLowerCase();
    const tfNumberMatch = tfRaw.match(/^\d+$/);
    const minutesRaw = tfRaw.endsWith('m') ? tfRaw.slice(0, -1) : null;
    const hoursRaw = tfRaw.endsWith('h') ? tfRaw.slice(0, -1) : null;
    const secondsRaw = tfRaw.endsWith('s') ? tfRaw.slice(0, -1) : null;

    // Get dynamic wait time from settings
    const { settings } = (await import('./settingsStore')).default.getState();
    const dataSourceMode = settings.analysis?.dataSourceMode || 'history_and_streaming';

    if (tfRaw === 'ticks' || (secondsRaw && secondsRaw.match(/^\d+$/))) {
      const msg = `History is not available for ${timeframe}. Use Streaming Only or History + Streaming.`;
      set((state) => ({
        historyCandles: { ...state.historyCandles, [historyKey]: [] },
        historyStatus: { ...state.historyStatus, [historyKey]: 'skipped' },
        lastError: dataSourceMode === 'history_only' ? msg : state.lastError
      }));
      return;
    }

    let timeframeMinutes = 1;
    if (minutesRaw && minutesRaw.match(/^\d+$/)) {
      timeframeMinutes = Math.max(1, parseInt(minutesRaw, 10));
    } else if (hoursRaw && hoursRaw.match(/^\d+$/)) {
      timeframeMinutes = Math.max(1, parseInt(hoursRaw, 10) * 60);
    } else if (tfNumberMatch) {
      timeframeMinutes = Math.max(1, parseInt(tfRaw, 10));
    }

    const timeframeMin = String(timeframeMinutes);

    try {
      // Step 1: Quick check for existing CSV file
      console.log(`[LoadHistory] Checking for existing history: ${historyKey}`);
      const checkRes = await fetch(
        `${getApiBaseUrl()}/api/v1/history/${encodeURIComponent(assetKey)}?timeframe=${timeframeMin}&num_candles=${numCandles}&limit=${numCandles}`
      );

      if (checkRes.ok) {
        const hist = await checkRes.json();
        const candles = Array.isArray(hist.candles)
          ? hist.candles
          : (Array.isArray(hist.data) ? hist.data : []);

        if (candles.length > 0) {
          console.log(`[LoadHistory] ✓ Found existing history: ${candles.length} candles for ${historyKey}`);
          set((state) => ({
            historyCandles: { ...state.historyCandles, [historyKey]: candles },
            historyStatus: { ...state.historyStatus, [historyKey]: 'loaded' }
          }));
          return;
        }
      }

      // Step 2: No existing data - Bootstrap collection
      console.log(`[LoadHistory] No existing data. Starting bootstrap for ${historyKey}...`);
      await get().bootstrapHistoryForAsset(assetKey, { preserveExistingOnError: false, num_candles: numCandles, timeframe });

    } catch (err) {
      console.error('[LoadHistory] Failed to load history:', err);
      set((state) => ({
        historyCandles: { ...state.historyCandles, [historyKey]: [] },
        historyStatus: { ...state.historyStatus, [historyKey]: 'error' },
        lastError: err.message || 'Failed to load history data'
      }));
      throw err;
    }
  },
  bootstrapHistoryForAsset: async (asset, options = {}) => {
    const assetKey = normalizeAsset(asset);
    if (!assetKey) {
      throw new Error(`Invalid asset: ${asset}`);
    }

    const {
      preserveExistingOnError = false,
      num_candles = 100,
      timeframe: requestedTimeframe = get().selectedTimeframe || '1m',
    } = options;

    const timeframe = requestedTimeframe || '1m';
    const historyKey = getHistoryKey(assetKey, timeframe);
    const previousStatus = get().historyStatus[historyKey];
    const previousCandles = get().historyCandles[historyKey];
    const tfRaw = String(timeframe).trim().toLowerCase();
    const tfNumberMatch = tfRaw.match(/^\d+$/);
    const minutesRaw = tfRaw.endsWith('m') ? tfRaw.slice(0, -1) : null;
    const hoursRaw = tfRaw.endsWith('h') ? tfRaw.slice(0, -1) : null;
    const secondsRaw = tfRaw.endsWith('s') ? tfRaw.slice(0, -1) : null;

    const { settings } = (await import('./settingsStore')).default.getState();
    const waitTime = settings.automation.historyWaitTime || 1.5;

    if (tfRaw === 'ticks' || (secondsRaw && secondsRaw.match(/^\d+$/))) {
      throw new Error(`History is not available for ${timeframe}. Use Streaming Only or History + Streaming.`);
    }

    let timeframeMinutes = 1;
    if (minutesRaw && minutesRaw.match(/^\d+$/)) {
      timeframeMinutes = Math.max(1, parseInt(minutesRaw, 10));
    } else if (hoursRaw && hoursRaw.match(/^\d+$/)) {
      timeframeMinutes = Math.max(1, parseInt(hoursRaw, 10) * 60);
    } else if (tfNumberMatch) {
      timeframeMinutes = Math.max(1, parseInt(tfRaw, 10));
    }

    const maxAttempts = settings.automation.retryAttempts !== undefined ? Number(settings.automation.retryAttempts) : 3;
    const retryDelaySetting = settings.automation.retryDelay !== undefined ? Number(settings.automation.retryDelay) : 500;
    let attempts = 0;
    let lastErrorObj = null;
    let result = null;

    set((state) => ({
      historyStatus: {
        ...state.historyStatus,
        [historyKey]: 'loading'
      }
    }));

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const bootstrapRes = await fetch(`${getApiBaseUrl()}/api/v1/history/bootstrap-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset: assetKey,
            timeframe: String(timeframeMinutes),
            duration: waitTime,
            num_candles: num_candles
          })
        });

        result = await bootstrapRes.json().catch(() => ({
          ok: false,
          detail: `HTTP ${bootstrapRes.status}`,
        }));

        if (bootstrapRes.ok && result.ok) {
          break;
        }

        lastErrorObj = result;
        console.warn(`[LoadHistory] Bootstrap attempt ${attempts} failed:`, result);
      } catch (err) {
        lastErrorObj = { error_message: err.message };
        console.warn(`[LoadHistory] Bootstrap attempt ${attempts} failed with network error:`, err);
      }

      if (attempts < maxAttempts) {
        const backoff = retryDelaySetting > 0 ? retryDelaySetting : (Math.pow(2, attempts) * 1000);
        console.log(`[LoadHistory] Retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }

    if (!result || !result.ok) {
      const errorCode = lastErrorObj?.error_code || 'unknown_error';
      const userMessage = lastErrorObj?.user_message || lastErrorObj?.error_message || lastErrorObj?.detail || 'History collection failed after retries';

      console.error(`[LoadHistory] ✗ Bootstrap failed: ${errorCode}`, lastErrorObj);

      if (!preserveExistingOnError) {
        set((state) => ({
          historyCandles: { ...state.historyCandles, [historyKey]: [] },
          historyStatus: { ...state.historyStatus, [historyKey]: 'error' },
          lastError: userMessage
        }));
      } else {
        const fallbackStatus = previousStatus || (Array.isArray(previousCandles) && previousCandles.length > 0 ? 'loaded' : 'error');
        set((state) => ({
          historyStatus: { ...state.historyStatus, [historyKey]: fallbackStatus }
        }));
      }

      throw new Error(userMessage);
    }

    const candles = Array.isArray(result.candles) ? result.candles : [];
    console.log(`[LoadHistory] ✓ Bootstrap SUCCESS: Received ${candles.length} candles for ${assetKey}`);

    set((state) => ({
      historyCandles: { ...state.historyCandles, [historyKey]: candles },
      historyStatus: { ...state.historyStatus, [historyKey]: 'loaded' }
    }));

    return candles;
  },
  reloadHistoryFromPayload: async (asset) => {
    if (!asset) return;
    const assetKey = normalizeAsset(asset);
    const timeframe = get().selectedTimeframe || '1m';
    const historyKey = getHistoryKey(assetKey, timeframe);

    set((state) => ({
      selectedAsset: asset,
      selectedAssetKey: assetKey,
      selectedAssetLoading: true,
      marketData: {},       // Clear old tick data immediately
      indicatorSeries: {},  // Clear stale indicator data
      historyStatus: { ...state.historyStatus, [historyKey]: 'loading' }
    }));

    try {
      // Do NOT DELETE existing CSV first - force a fresh bootstrap attempt while
      // preserving the current chart/cache if the payload refresh fails.
      await get().bootstrapHistoryForAsset(assetKey, { preserveExistingOnError: true, num_candles: 100, timeframe });
    } catch (err) {
      set({ lastError: `Fresh payload reload failed; keeping existing history. ${getErrorMessage(err)}` });
    } finally {
      set({ selectedAssetLoading: false });
    }
  },
  payoutAssets: [],
  removePayoutAsset: (asset) => {
    if (!asset) return;
    set((state) => ({
      payoutAssets: (state.payoutAssets || []).filter((a) => a !== asset)
    }));
    get().syncSubscriptions();
  },
  panelMode: 'list',
  setPanelMode: (mode) => {
    set({ panelMode: mode });
    get().syncSubscriptions();
  },
  computeRequiredAssetKeys: (overrideSelectedAssetKey) => {
    const { selectedAssetKey, monitoringAssetKeys } = get();
    let nextAssetKey = selectedAssetKey;
    if (overrideSelectedAssetKey) {
      nextAssetKey = overrideSelectedAssetKey;
    }
    const required = [];
    if (nextAssetKey) {
      required.push(nextAssetKey);
    }
    const monitoring = Array.isArray(monitoringAssetKeys) ? monitoringAssetKeys : [];
    monitoring.forEach((assetKey) => {
      if (assetKey) {
        required.push(assetKey);
      }
    });
    return uniq(required.map((k) => normalizeAsset(k)).filter(Boolean));
  },
  applySubscriptions: (assetKeys) => {
    const { socket, subscribedAssetKeys } = get();
    if (!socket || !socket.connected) return;
    const normalized = uniq((assetKeys || []).map((k) => normalizeAsset(k)).filter(Boolean));
    const toJoin = normalized.filter((k) => !subscribedAssetKeys.includes(k));
    const toLeave = subscribedAssetKeys.filter((k) => !normalized.includes(k));

    toLeave.forEach((assetKey) => {
      socket.emit('unsubscribe_asset', assetKey);
    });

    toJoin.forEach((assetKey) => {
      socket.emit('subscribe_asset', assetKey);
    });

    set({ subscribedAssetKeys: normalized });
  },
  syncSubscriptions: (overrideSelectedAssetKey) => {
    const { socket } = get();
    if (!socket || !socket.connected) return;

    const required = get().computeRequiredAssetKeys(overrideSelectedAssetKey);
    get().applySubscriptions(required);
  },
  autoRefresh: false,
  refreshInterval: null,
  toggleAutoRefresh: () => {
    const { autoRefresh, startAutoRefresh, stopAutoRefresh } = get();
    if (autoRefresh) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  },
  startAutoRefresh: () => {
    set({ autoRefresh: true });
    const { refreshAssets } = get();
    refreshAssets(); // Uses store filter state
    
    // Lazy import or use the already available state if possible. 
    // Since we are in a zustand store, we can access other stores via getState().
    let intervalMins = 5;
    try {
        const settingsState = window.localStorage.getItem(QFLX_PERSIST_KEYS.settings);
        if (settingsState) {
            const parsed = JSON.parse(settingsState);
            intervalMins = parsed?.state?.settings?.automation?.autoRefreshInterval || 5;
        }
    } catch (e) {
        console.warn('Failed to parse settings for auto-refresh interval', e);
    }

    const intervalMs = Math.max(1, intervalMins) * 60 * 1000;
    const interval = setInterval(() => refreshAssets(), intervalMs);
    set({ refreshInterval: interval });
  },
  stopAutoRefresh: () => {
    const { refreshInterval } = get();
    if (refreshInterval) clearInterval(refreshInterval);
    set({ autoRefresh: false, refreshInterval: null });
  },
  refreshAssets: async (passedOptions = null) => {
    try {
      const filterState = get().assetFilterState;
      const filterOptions = passedOptions || {
        max_assets: filterState.maxAssets,
        include_assets: parseTargetAssets(filterState.includeAssets),
        ignore_assets: parseTargetAssets(filterState.ignoreAssets),
        filter_mode: filterState.filterMode
      };

      set({ alertsStatus: { ...get().alertsStatus, isRefreshing: true } });

      const payload = {
        min_pct: filterState.minPayout || 92,
        sweep_all: true,
        unstar_below: true,
        ...filterOptions
      };

      const res = await fetch(`${getApiBaseUrl()}/api/v1/assets/refresh-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail || data?.error || `Asset refresh failed (HTTP ${res.status})`;
        set({ lastError: detail });
        return;
      }

      if (data.assets) {
        set({ payoutAssets: data.assets });
        get().syncSubscriptions();

        // Log metadata for debugging
        if (data.metadata && import.meta.env && import.meta.env.MODE === 'development') {
          const metaKeys = Object.keys(data.metadata || {});
          const assetCount = Array.isArray(data.assets) ? data.assets.length : 0;
          console.log('Asset refresh metadata summary:', {
            assetCount,
            metaKeys
          });
        }
      }
    } catch (err) {
      console.error('Failed to refresh assets:', err);
      set({ lastError: `Failed to refresh assets: ${getErrorMessage(err)}` });
    }
  },
  autoRunAlertMonitor: false,
  toggleAutoRunAlertMonitor: () => set((state) => ({ autoRunAlertMonitor: !state.autoRunAlertMonitor })),
  alertsStatus: {
    running: false,
    pid: null,
    started_at: null,
    assets: [],
    loading: false
  },
  enableTickLogging: false,
  toggleTickLogging: () => set((state) => ({ enableTickLogging: !state.enableTickLogging })),
  startAlerts: async (assets = []) => {
    set((state) => ({ alertsStatus: { ...state.alertsStatus, loading: true } }));
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/alerts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets,
          use_redis: get().enableTickLogging
        })
      });
      const data = await res.json();
      if (res.ok) {
        set({ alertsStatus: { running: true, pid: data.pid, started_at: data.started_at, assets, loading: false } });
      } else {
        throw new Error(data.detail || 'Failed to start alerts');
      }
    } catch (err) {
      set({ lastError: `Alerts Error: ${err.message}`, alertsStatus: { ...get().alertsStatus, loading: false } });
    }
  },
  stopAlerts: async () => {
    set((state) => ({ alertsStatus: { ...state.alertsStatus, loading: true } }));
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/alerts/stop`, {
        method: 'POST'
      });
      if (res.ok) {
        set({ alertsStatus: { running: false, pid: null, started_at: null, assets: [], loading: false } });
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to stop alerts');
      }
    } catch (err) {
      set({ lastError: `Alerts Error: ${err.message}`, alertsStatus: { ...get().alertsStatus, loading: false } });
    }
  },
  checkAlertsStatus: async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/alerts/status`);
      const data = await res.json();
      if (res.ok) {
        set({
          alertsStatus: {
            running: data.running,
            pid: data.pid,
            started_at: data.started_at,
            assets: data.assets,
            loading: false
          }
        });
      }
    } catch (err) {
      console.error('Failed to check alerts status:', err);
    }
  }
});

const createConnectionSlice = (set, get) => ({
  socket: null,
  wsStatus: 'disconnected',
  setWsStatus: (status) => set({ wsStatus: status }),
  chromeStatus: 'disconnected',
  setChromeStatus: (status) => set({ chromeStatus: status }),
  streamStatus: 'idle',
  setStreamStatus: (status) => set({ streamStatus: status }),
  ssidStatus: 'disconnected',
  setSsidStatus: (status) => set({ ssidStatus: status }),
  opsChromeBusy: false,
  opsStreamBusy: false,
  opsSsidBusy: false,
  startChrome: async () => {
    if (get().opsChromeBusy) return;
    set({ opsChromeBusy: true });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/chrome/start`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.user_message || data.detail || `Failed to start Chrome (HTTP ${res.status})`;
        set({ lastError: msg });
        return;
      }

      get().checkBackendStatus();
    } catch (err) {
      set({ lastError: `Network error starting Chrome: ${getErrorMessage(err)}` });
    } finally {
      set({ opsChromeBusy: false });
    }
  },
  startStream: async () => {
    if (get().opsStreamBusy) return;
    set({ opsStreamBusy: true });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/stream/start`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.user_message || data.detail || `Failed to start Stream (HTTP ${res.status})`;
        set({ lastError: msg });
        return;
      }

      get().checkBackendStatus();
    } catch (err) {
      set({ lastError: `Network error starting Stream: ${getErrorMessage(err)}` });
    } finally {
      set({ opsStreamBusy: false });
    }
  },
  pauseStream: async () => {
    if (get().opsStreamBusy) return;
    set({ opsStreamBusy: true });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/stream/pause`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.user_message || data.detail || `Failed to pause Stream (HTTP ${res.status})`;
        set({ lastError: msg });
        return;
      }

      get().checkBackendStatus();
    } catch (err) {
      set({ lastError: `Network error pausing Stream: ${getErrorMessage(err)}` });
    } finally {
      set({ opsStreamBusy: false });
    }
  },
  startSsidService: async () => {
    if (get().opsSsidBusy) return;
    set({ opsSsidBusy: true, ssidStatus: 'connecting' });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/ssid/start`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.user_message || data.detail || `Failed to start SSID service (HTTP ${res.status})`;
        set({ lastError: msg, ssidStatus: 'error' });
        return;
      }

      // Poll until service reports running (up to 3 seconds)
      let running = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await sleep(500);
        running = await get().checkSsidStatus();
        if (running) break;
      }

      if (!running) {
        set({
          ssidStatus: 'error',
          lastError: 'SSID service did not report running state after start. Check service logs and retry.'
        });
        return;
      }

      // ── Auto-connect using persisted .env SSIDs ──────────────────────────
      // Dynamically import tradingStore to avoid circular dependency.
      // connect('') passes an empty SSID — the ssid_service falls back to the
      // in-memory .env values (QFLX_SSID_DEMO / QFLX_SSID_REAL).
      try {
        const { default: useTradingStore } = await import('./tradingStore');
        const tradingStore = useTradingStore.getState();

        // Refresh SSID status badges first so we know what's available
        await tradingStore.fetchSsidStatus();
        const { hasDemoSsid, hasRealSsid, isDemoMode } = useTradingStore.getState();

        const hasSsidForCurrentMode = isDemoMode ? hasDemoSsid : hasRealSsid;

        if (hasSsidForCurrentMode) {
          console.log(`[startSsidService] Auto-connecting with saved ${isDemoMode ? 'Demo' : 'Real'} SSID from .env`);
          const ok = await tradingStore.connect('', isDemoMode);
          if (ok) {
            set({ ssidStatus: 'connected' });
          } else {
            // Try the other mode's SSID if available
            const otherMode = !isDemoMode;
            const hasOtherSsid = otherMode ? hasDemoSsid : hasRealSsid;
            if (hasOtherSsid) {
              console.log(`[startSsidService] Primary mode failed, trying ${otherMode ? 'Demo' : 'Real'} SSID`);
              const ok2 = await tradingStore.connect('', otherMode);
              if (ok2) set({ ssidStatus: 'connected' });
            }
          }
        } else if (hasDemoSsid || hasRealSsid) {
          // Current mode has no SSID but the other mode does — use what we have
          const fallbackDemo = hasDemoSsid;
          console.log(`[startSsidService] Auto-connecting with ${fallbackDemo ? 'Demo' : 'Real'} SSID (only option)`);
          const ok = await tradingStore.connect('', fallbackDemo);
          if (ok) set({ ssidStatus: 'connected' });
        } else {
          // No .env SSIDs saved — service is running, user needs to connect manually
          console.log('[startSsidService] Service running but no saved SSIDs in .env. User must connect manually.');
          set({ ssidStatus: 'connected' }); // service is up, just not authenticated
        }
      } catch (tradingErr) {
        console.warn('[startSsidService] Auto-connect attempt failed:', tradingErr.message);
        // Service is still running — don't mark as error
      }

      get().checkBackendStatus();
    } catch (err) {
      set({ lastError: `Network error starting SSID service: ${getErrorMessage(err)}`, ssidStatus: 'error' });
    } finally {
      set({ opsSsidBusy: false });
    }
  },
  stopSsidService: async () => {
    if (get().opsSsidBusy) return;
    set({ opsSsidBusy: true });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/ssid/stop`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.user_message || data.detail || `Failed to stop SSID service (HTTP ${res.status})`;
        set({ lastError: msg });
        return;
      }

      set({ ssidStatus: 'disconnected' });
      get().checkBackendStatus();
    } catch (err) {
      set({ lastError: `Network error stopping SSID service: ${getErrorMessage(err)}` });
    } finally {
      set({ opsSsidBusy: false });
    }
  },
  checkSsidStatus: async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/ops/ssid/status`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return false;
      }
      const running = Boolean(data.running);
      set({ ssidStatus: running ? 'connected' : 'disconnected' });
      return running;
    } catch (err) {
      console.warn('SSID status check failed:', getErrorMessage(err));
      return false;
    }
  },
  backendStatus: {
    redisConnected: false,
    socketIoReady: false,
    chromeDebuggingAvailable: false,
    readyForAssets: false,
    systemState: {},
    timestamp: null,
    error: null
  },
  setBackendStatus: (status) => set({ backendStatus: status }),
  checkBackendStatus: () => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('check_status');
    }
  },
  connectSocket: () => {
    const existingSocket = get().socket;
    if (existingSocket) {
      const managerState = existingSocket.io && typeof existingSocket.io === 'object'
        ? existingSocket.io._readyState
        : null;
      if (existingSocket.connected || existingSocket.active || managerState === 'opening') {
        return existingSocket;
      }
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
    }

    const socket = io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    set({ socket, wsStatus: 'connecting' });

    socket.on('connect', () => {
      console.log('Socket connected');
      set({ wsStatus: 'connected', socket });

      const { selectedAsset } = get();
      get().syncSubscriptions();
      get().publishMonitoringAssets(); // Sync dispatcher whitelist on connect
      get().checkBackendStatus();
      if (selectedAsset) socket.emit('select_asset', selectedAsset);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      set({ wsStatus: 'disconnected' });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      set({
        wsStatus: 'error',
        lastError: `Connection failed: ${getErrorMessage(err)}. Check if backend is running.`
      });
    });

    socket.on('market_data', (data) => {
      const validation = validateMarketData(data);
      if (!validation.valid) {
        console.warn('Invalid market data ignored:', validation.error, data);
        return;
      }

      const { asset: assetKey, price, timestamp } = validation;

      set((state) => {
        const currentData = state.marketData[assetKey] || [];
        const newData = [...currentData, { price, timestamp, receivedAt: Date.now() }].slice(-100);

        const baseline = state.quotesByAssetKey[assetKey]?.baseline || price;
        const changePct = ((price - baseline) / baseline) * 100;

        return {
          lastTickTimestamp: Date.now(),
          marketData: {
            ...state.marketData,
            [assetKey]: newData
          },
          baselineByAssetKey: {
            ...state.baselineByAssetKey,
            [assetKey]: baseline
          },
          quotesByAssetKey: {
            ...state.quotesByAssetKey,
            [assetKey]: {
              price,
              baseline,
              changePct,
              timestamp
            }
          }
        };
      });
    });

    socket.on('regime_update', (data) => {
      // data: { asset, regime, trend, strength, volatility, ... }
      if (data && data.asset === get().selectedAsset) {
        set({ currentRegime: data });
      }
    });

    socket.on('new_alert', (data) => {
      console.log('New In-App Alert:', data);
      set((state) => ({
        alertFeed: [data, ...state.alertFeed].slice(0, 50)
      }));
      // Play alert sound for new signal
      try {
        const audio = new Audio(alertSignalSound);
        audio.volume = 0.6;
        audio.play().catch(() => { });
      } catch (err) {
        console.warn('Alert sound failed to play', err);
      }
    });

    socket.on('scan_heartbeat', (data) => {
      console.log('Scan Heartbeat:', data);
      set({ scanHeartbeat: { ...data, receivedAt: Date.now() } });
    });

    socket.on('system_status', (data) => {
      if (data && data.service === 'collector') {
        set({ streamStatus: data.status === 'connected' ? 'streaming' : 'idle' });
      }
      if (data && data.service === 'ssid_service') {
        set({ ssidStatus: data.status === 'connected' ? 'connected' : 'disconnected' });
      }
    });

    socket.on('asset_starred', (data) => {
      console.log('Asset starred successfully:', data.asset, data.message);
    });

    socket.on('asset_star_error', (data) => {
      console.error('Asset star error:', data.error);
      set({ lastError: data.error });
    });

    socket.on('backend_status', (data) => {
      console.log('Backend status received:', data);
      const { setBackendStatus } = get();
      setBackendStatus({
        redisConnected: data.redis_connected || false,
        socketIoReady: data.socket_io_ready || false,
        chromeDebuggingAvailable: data.chrome_debugging_available || false,
        readyForAssets: data.ready_for_assets || false,
        systemState: data.system_state || {},
        timestamp: data.timestamp || null,
        error: data.error || null
      });
      set({
        chromeStatus: data.chrome_debugging_available ? 'connected' : 'disconnected',
        ssidStatus: data.ssid_service_available ? 'connected' : 'disconnected'
      });
    });

    return socket;
  },
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({
      socket: null,
      wsStatus: 'disconnected',
      subscribedAssetKeys: []
    });
  }
});

const useMarketStore = create(
  withQuFLXPersist(QFLX_PERSIST_KEYS.market, 1, {
    partialize: (state) => ({
      isSidebarOpen: state.isSidebarOpen,
      activeTab: state.activeTab,
      automations: state.automations,
      tickerMaxAssets: state.tickerMaxAssets,
      assetFilterState: state.assetFilterState,
      selectedAsset: state.selectedAsset,
      selectedAssetKey: state.selectedAssetKey,
      selectedTimeframe: state.selectedTimeframe,
      panelMode: state.panelMode,
      activeIndicators: state.activeIndicators,
      autoRunAlertMonitor: state.autoRunAlertMonitor,
      enableTickLogging: state.enableTickLogging,
      monitoringAssetKeys: state.monitoringAssetKeys,
      favorites: state.favorites
    })
  })((set, get) => ({
    ...createUiSlice(set),
    ...createTickerSlice(set),
    ...createStrategyLabSlice(set, get),
    ...createMarketSlice(set, get),
    ...createConnectionSlice(set, get)
  }))
);

export default useMarketStore;
