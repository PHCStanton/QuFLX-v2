import { create } from 'zustand';
import { io } from 'socket.io-client';
import { validateMarketData } from '../utils/validators';
import { withQuFLXPersist, QFLX_PERSIST_KEYS } from './persistMiddleware';

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

const normalizeAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

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
  setActiveIndicators: (indicators) =>
    set({ activeIndicators: Array.isArray(indicators) ? indicators : [] }),
  addIndicator: (indicator) =>
    set((state) => ({
      activeIndicators: [...state.activeIndicators, indicator]
    })),
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
  quotesByAssetKey: {},
  baselineByAssetKey: {},
  lastTickTimestamp: 0
});

const createMarketSlice = (set, get) => ({
  assetFilterState: {
    maxAssets: 5,
    minPayout: 92,
    includeAssets: '',
    ignoreAssets: '',
    filterMode: null
  },
  setAssetFilterState: (state) => set({ assetFilterState: state }),
  selectedAsset: 'AUDNZDOTC',
  selectedAssetKey: normalizeAsset('AUDNZDOTC'),
  selectedAssetLoading: false,
  setSelectedAsset: async (asset) => {
    if (!asset) return;
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey,
      selectedAssetLoading: true,
      marketData: {} // Clear old data immediately
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
      set((state) => ({
        historyCandles: { ...state.historyCandles, [asset]: [] },
        historyStatus: { ...state.historyStatus, [asset]: 'skipped' }
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
      const response = await fetch('http://localhost:8000/api/v1/timeframe/select-timeframe', {
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
      const response = await fetch('http://localhost:8000/api/v1/timeframe/sync-timeframe-ui', {
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
  loadIndicators: async ({ asset, timeframe, indicators, params, currentCandle }) => {
    if (!asset || !timeframe || !Array.isArray(indicators) || indicators.length === 0) {
      return;
    }

    const { historyStatus, historyCandles } = get();
    const historyState = historyStatus && historyStatus[asset];
    const candles = historyCandles && historyCandles[asset];
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

      const res = await fetch('http://localhost:8000/api/v1/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        set((state) => ({
          indicatorStatus: {
            ...state.indicatorStatus,
            [key]: 'error'
          },
          lastError: errorData.detail || `Failed to load indicators for ${asset}`
        }));
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
      const res = await fetch('http://localhost:8000/api/v1/history/append-candle', {
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
  loadHistory: async (asset) => {
    if (!asset) return;

    set((state) => ({
      historyStatus: {
        ...state.historyStatus,
        [asset]: 'loading'
      }
    }));

    const timeframe = get().selectedTimeframe || '1m';
    const tfRaw = String(timeframe).trim().toLowerCase();
    const tfNumberMatch = tfRaw.match(/^\d+$/);
    const minutesRaw = tfRaw.endsWith('m') ? tfRaw.slice(0, -1) : null;
    const hoursRaw = tfRaw.endsWith('h') ? tfRaw.slice(0, -1) : null;
    const secondsRaw = tfRaw.endsWith('s') ? tfRaw.slice(0, -1) : null;

    // Get dynamic wait time from settings
    const { settings } = (await import('./settingsStore')).default.getState();
    const waitTime = settings.automation.historyWaitTime || 1.5;
    const dataSourceMode = settings.analysis?.dataSourceMode || 'history_and_streaming';

    if (tfRaw === 'ticks' || (secondsRaw && secondsRaw.match(/^\d+$/))) {
      const msg = `History is not available for ${timeframe}. Use Streaming Only or History + Streaming.`;
      set((state) => ({
        historyCandles: { ...state.historyCandles, [asset]: [] },
        historyStatus: { ...state.historyStatus, [asset]: 'skipped' },
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
    const limit = 200;

    try {
      // Step 1: Quick check for existing CSV file
      console.log(`[LoadHistory] Checking for existing history: ${asset} @ ${timeframe}`);
      const checkRes = await fetch(
        `http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}?timeframe=${timeframeMin}&limit=${limit}`
      );

      if (checkRes.ok) {
        const hist = await checkRes.json();
        const existingCandles = Array.isArray(hist.candles)
          ? hist.candles
          : (Array.isArray(hist.data) ? hist.data : []);

        if (existingCandles.length > 0) {
          console.log(`[LoadHistory] ✓ Found existing history: ${existingCandles.length} candles`);
          set((state) => ({
            historyCandles: { ...state.historyCandles, [asset]: existingCandles },
            historyStatus: { ...state.historyStatus, [asset]: 'loaded' }
          }));
          return;
        }
      }

      // Step 2: No existing data - Bootstrap collection (AWAITS completion, no polling!)
      console.log(`[LoadHistory] No existing data. Starting bootstrap for ${asset}...`);
      console.log(`[LoadHistory] ⏳ Waiting for ${asset} data (Timeout: ${waitTime}s)`);

      const bootstrapRes = await fetch('http://localhost:8000/api/v1/history/bootstrap-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset,
          timeframe: timeframeMin,
          duration: waitTime
        })
      });

      const result = await bootstrapRes.json();

      // Step 3: Handle response (success or structured error)
      if (!result.ok) {
        // Structured error response from backend
        const errorCode = result.error_code || 'unknown_error';
        const userMessage = result.user_message || result.error_message || 'History collection failed';

        console.error(`[LoadHistory] ✗ Bootstrap failed: ${errorCode}`, result);

        set((state) => ({
          historyCandles: { ...state.historyCandles, [asset]: [] },
          historyStatus: { ...state.historyStatus, [asset]: 'error' },
          lastError: userMessage
        }));

        // Re-throw with user-friendly message for upstream handling
        throw new Error(userMessage);
      }

      // Success! Extract candles directly from in-memory response
      const candles = result.candles || [];
      console.log(`[LoadHistory] ✓ Bootstrap SUCCESS: Received ${candles.length} candles for ${asset}`);

      set((state) => ({
        historyCandles: { ...state.historyCandles, [asset]: candles },
        historyStatus: { ...state.historyStatus, [asset]: 'loaded' }
      }));

    } catch (err) {
      console.error('[LoadHistory] Failed to load history:', err);

      set((state) => ({
        historyCandles: { ...state.historyCandles, [asset]: [] },
        historyStatus: { ...state.historyStatus, [asset]: 'error' },
        lastError: err.message || 'Failed to load history data'
      }));

      // Re-throw for upstream error handling
      throw err;
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
    const { panelMode, payoutAssets, selectedAssetKey, tickerMaxAssets } = get();
    const nextAssetKey = overrideSelectedAssetKey ?? selectedAssetKey;

    if (panelMode !== 'ticker') {
      return uniq([nextAssetKey]);
    }

    const tickerKeys = (payoutAssets || [])
      .slice(0, tickerMaxAssets)
      .map((a) => normalizeAsset(a));

    return uniq([...tickerKeys, nextAssetKey]);
  },
  syncSubscriptions: (overrideSelectedAssetKey) => {
    const { socket, subscribedAssetKeys } = get();
    if (!socket || !socket.connected) return;

    const required = get().computeRequiredAssetKeys(overrideSelectedAssetKey);
    const toJoin = required.filter((k) => !subscribedAssetKeys.includes(k));
    const toLeave = subscribedAssetKeys.filter((k) => !required.includes(k));

    toLeave.forEach((assetKey) => {
      socket.emit('leave_room', `market_data:${assetKey}`);
    });

    toJoin.forEach((assetKey) => {
      socket.emit('subscribe_asset', assetKey);
      socket.emit('join_room', `market_data:${assetKey}`);
    });

    // Phase 3: Publish active ticker list to backend (for Allocator & Dispatcher sync)
    // The backend gateway will forward this to Redis "ticker:active"
    socket.emit('update_active_ticker', required);

    set({ subscribedAssetKeys: required });
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
    const interval = setInterval(() => refreshAssets(), 5 * 60 * 1000);
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

      const res = await fetch('http://localhost:8000/api/v1/assets/refresh-assets', {
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
  collectHistory: async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/history/collect-history', {
        method: 'POST'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to start collection');
      }

      const data = await res.json();
      console.log('History collection started:', data);

      if (get().autoRunAlertMonitor) {
        console.log('[CollectHistory] Auto-running Alert Monitor...');
        // Start alerts for all payout assets or selected asset
        const assets = get().payoutAssets || [];
        get().startAlerts(assets);
      }
    } catch (err) {
      console.error('Failed to start history collection:', err);
      set({ lastError: `Collection Error: ${err.message}` });
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
      const res = await fetch('http://localhost:8000/api/v1/alerts/start', {
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
      const res = await fetch('http://localhost:8000/api/v1/alerts/stop', {
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
      const res = await fetch('http://localhost:8000/api/v1/alerts/status');
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
  opsChromeBusy: false,
  opsStreamBusy: false,
  startChrome: async () => {
    if (get().opsChromeBusy) return;
    set({ opsChromeBusy: true });
    try {
      const res = await fetch('http://localhost:8000/api/v1/ops/chrome/start', {
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
      const res = await fetch('http://localhost:8000/api/v1/ops/stream/start', {
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
      const res = await fetch('http://localhost:8000/api/v1/ops/stream/pause', {
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
    const socket = io('http://localhost:8000', {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      set({ wsStatus: 'connected', socket });

      const { selectedAsset } = get();
      get().syncSubscriptions();
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

    socket.on('system_status', (data) => {
      if (data && data.service === 'collector') {
        set({ chromeStatus: data.status });
        set({ streamStatus: data.status === 'connected' ? 'streaming' : 'idle' });
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
        chromeStatus: data.chrome_debugging_available ? 'connected' : 'disconnected'
      });
    });
  },
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
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
      enableTickLogging: state.enableTickLogging
    })
  })((set, get) => ({
    ...createUiSlice(set),
    ...createTickerSlice(),
    ...createMarketSlice(set, get),
    ...createConnectionSlice(set, get)
  }))
);

export default useMarketStore;
