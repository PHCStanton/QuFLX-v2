import { create } from 'zustand';
import { io } from 'socket.io-client';
import { validateMarketData } from '../utils/validators';

const normalizeAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const createUiSlice = (set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  lastError: null,
  clearError: () => set({ lastError: null }),
  activeIndicators: [],
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
  // Deprecated: autoSyncAssetOnSelect and selectionWorkflowConfig are no longer used
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
    targetAssets: '',
    targetAssetsMode: 'ignore',
    filterMode: null
  },
  setAssetFilterState: (state) => set({ assetFilterState: state }),
  selectedAsset: 'AUDNZDOTC',
  selectedAssetKey: normalizeAsset('AUDNZDOTC'),
  setSelectedAsset: async (asset) => {
    if (!asset) return;
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey,
      marketData: {} // Clear old data immediately
    });

    // Manual Mode Workflow:
    // 1. Load History (This will now wait for the user to click in Pocket Option)
    try {
      await get().loadHistory(asset);
    } catch (err) {
      console.error('Failed to load history:', err);
    }

    // 2. Start live stream only after history is ready (or failed)
    get().syncSubscriptions(nextAssetKey);

    try {
      await get().awaitStreamingForSelectedAsset(5000, 200);
    } catch (err) {
      console.error('Streaming readiness check failed in manual select:', err);
    }
  },
  selectAssetWithSync: async (asset) => {
    // Redirect to standard manual selection
    return get().setSelectedAsset(asset);
  },
  runAssetBatch: async () => {
    const { payoutAssets, selectAssetWithSync } = get();
    const assets = Array.isArray(payoutAssets) ? payoutAssets : [];
    if (!assets.length) {
      set({ lastError: 'No 92% payout assets available for Asset Run' });
      return;
    }

    for (const asset of assets) {
      try {
        await selectAssetWithSync(asset);
      } catch (err) {
        console.error('Asset Run failed for', asset, err);
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
    }
  },
  selectedTimeframe: '1m',
  setSelectedTimeframe: async (timeframe) => {
    const prev = get().selectedTimeframe;
    set({ selectedTimeframe: timeframe, marketData: {} });

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
      }
    } catch (err) {
      console.error('Failed to select timeframe in backend:', err);
      set({
        selectedTimeframe: prev === undefined ? '1m' : prev,
        lastError: `Network error selecting timeframe: ${err.message}`
      });
    }
  },
  syncAssetUi: async () => {
    console.log('syncAssetUi is deprecated. Please use Manual Mode.');
  },
  syncTimeframeUi: async () => {
    const timeframe = get().selectedTimeframe;
    if (!timeframe) return;

    try {
      const response = await fetch('http://localhost:8000/api/v1/timeframe/sync-timeframe-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail || `Failed to sync timeframe UI for: ${timeframe}`;
        console.error('Sync timeframe UI failed:', detail);
        set({ lastError: detail });
      }
    } catch (err) {
      console.error('Sync timeframe UI request failed:', err);
      set({ lastError: `Network error syncing timeframe UI: ${err.message}` });
    }
  },
  indicatorSeries: {},
  indicatorStatus: {},
  loadIndicators: async ({ asset, timeframe, indicators, params }) => {
    if (!asset || !timeframe || !Array.isArray(indicators) || indicators.length === 0) {
      return;
    }

    const { historyStatus, historyCandles } = get();
    const historyState = historyStatus && historyStatus[asset];
    const candles = historyCandles && historyCandles[asset];
    const hasHistoryCandles = Array.isArray(candles) && candles.length > 0;

    if (historyState === 'not_found' || historyState === 'error' || historyState === 'empty') {
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
        indicators
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
      const series = data.series || {};

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
    const timeframeMin = timeframe.replace('m', '');
    const limit = 200;

    try {
      // Step 1: Quick check for existing CSV file
      console.log(`[LoadHistory] Checking for existing history: ${asset} @ ${timeframe}`);
      const checkRes = await fetch(
        `http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}?timeframe=${timeframeMin}&limit=${limit}`
      );

      if (checkRes.ok) {
        const hist = await checkRes.json();
        if (Array.isArray(hist.data) && hist.data.length > 0) {
          console.log(`[LoadHistory] ✓ Found existing history: ${hist.data.length} candles`);
          set((state) => ({
            historyCandles: { ...state.historyCandles, [asset]: hist.data },
            historyStatus: { ...state.historyStatus, [asset]: 'loaded' }
          }));
          return;
        }
      }

      // Step 2: No existing data - Bootstrap collection (AWAITS completion, no polling!)
      console.log(`[LoadHistory] No existing data. Starting bootstrap for ${asset}...`);
      console.log(`[LoadHistory] ⏳ MANUAL MODE: Click ${asset} in Pocket Option within 8 seconds`);

      const bootstrapRes = await fetch('http://localhost:8000/api/v1/history/bootstrap-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          asset, 
          timeframe: timeframeMin, 
          duration: 8 
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
        target_assets: (filterState.targetAssets || '')
          .split(/[,\s;]+/)
          .map((a) => a.trim())
          .filter(Boolean),
        target_assets_mode: filterState.targetAssetsMode,
        filter_mode: filterState.filterMode
      };
      
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
      
      const data = await res.json();
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
    } catch (err) {
      console.error('Failed to start history collection:', err);
      set({ lastError: `Collection Error: ${err.message}` });
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
      set({ wsStatus: 'error' });
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

const useMarketStore = create((set, get) => ({
  ...createUiSlice(set),
  ...createTickerSlice(),
  ...createMarketSlice(set, get),
  ...createConnectionSlice(set, get)
}));

export default useMarketStore;
