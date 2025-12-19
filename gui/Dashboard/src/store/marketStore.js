import { create } from 'zustand';
import { io } from 'socket.io-client';
import { validateMarketData } from '../utils/validators';

const normalizeAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[_/\s]/g, '').toUpperCase();
};

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const createUiSlice = (set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  lastError: null,
  clearError: () => set({ lastError: null }),
  activeIndicators: [
    { id: 'rsi', name: 'RSI', value: '14' },
    { id: 'ema', name: 'EMA', value: '200' },
    { id: 'bb', name: 'Bollinger', value: '20, 2' }
  ],
  addIndicator: (indicator) =>
    set((state) => ({
      activeIndicators: [...state.activeIndicators, indicator]
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
    }))
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
  selectedAsset: 'AUDNZDOTC',
  selectedAssetKey: normalizeAsset('AUDNZDOTC'),
  setSelectedAsset: async (asset) => {
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey
    });

    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('select_asset', asset);
      get().syncSubscriptions(nextAssetKey);
    }

    try {
      await get().loadHistory(asset);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },
  selectedTimeframe: '1m',
  setSelectedTimeframe: async (timeframe) => {
    set({ selectedTimeframe: timeframe, marketData: {} });

    try {
      const response = await fetch('http://localhost:8000/api/v1/select-timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });

      if (!response.ok) {
        console.error(`Failed to select timeframe: HTTP ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        set({
          lastError: errorData.detail || `Failed to select timeframe: ${timeframe}`
        });
      }
    } catch (err) {
      console.error('Failed to select timeframe in backend:', err);
      set({ lastError: `Network error selecting timeframe: ${err.message}` });
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
    const limit = 200;

    try {
      const res = await fetch('http://localhost:8000/api/v1/bootstrap-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, timeframe, duration: 0 })
      });

      if (res.ok) {
        const data = await res.json();
        const candles = Array.isArray(data.candles) ? data.candles : [];
        set((state) => ({
          historyCandles: {
            ...state.historyCandles,
            [asset]: candles
          },
          historyStatus: {
            ...state.historyStatus,
            [asset]: 'loaded'
          }
        }));
        return;
      }

      const histRes = await fetch(
        `http://localhost:8000/api/v1/history/${encodeURIComponent(
          asset
        )}?timeframe=1&limit=${limit}`
      );
      if (histRes.ok) {
        const hist = await histRes.json();
        const candles = Array.isArray(hist.data) ? hist.data : [];
        set((state) => ({
          historyCandles: {
            ...state.historyCandles,
            [asset]: candles
          },
          historyStatus: {
            ...state.historyStatus,
            [asset]: candles.length ? 'loaded' : 'empty'
          }
        }));
        return;
      }

      set((state) => ({
        historyCandles: {
          ...state.historyCandles,
          [asset]: []
        },
        historyStatus: {
          ...state.historyStatus,
          [asset]: histRes.status === 404 ? 'not_found' : 'error'
        }
      }));
    } catch (err) {
      console.error('Failed to load history:', err);
      set((state) => ({
        historyCandles: {
          ...state.historyCandles,
          [asset]: []
        },
        historyStatus: {
          ...state.historyStatus,
          [asset]: 'error'
        }
      }));
    }
  },
  payoutAssets: [],
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
    refreshAssets();
    const interval = setInterval(refreshAssets, 5 * 60 * 1000);
    set({ refreshInterval: interval });
  },
  stopAutoRefresh: () => {
    const { refreshInterval } = get();
    if (refreshInterval) clearInterval(refreshInterval);
    set({ autoRefresh: false, refreshInterval: null });
  },
  refreshAssets: async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/refresh-assets', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.assets) {
        set({ payoutAssets: data.assets });
        get().syncSubscriptions();
      }
    } catch (err) {
      console.error('Failed to refresh assets:', err);
    }
  },
  collectHistory: async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/collect-history', {
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
  statusInterval: null,
  chromeStatus: 'disconnected',
  setChromeStatus: (status) => set({ chromeStatus: status }),
  streamStatus: 'idle',
  setStreamStatus: (status) => set({ streamStatus: status }),
  fetchStatus: async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/status');
      const data = await res.json();
      if (data) {
        set({
          chromeStatus: data.collector,
          streamStatus: data.stream
        });
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  },
  connectSocket: () => {
    const socket = io('http://localhost:8000', {
      transports: ['websocket'],
      autoConnect: true
    });

    const { fetchStatus } = get();
    fetchStatus();

    const interval = setInterval(fetchStatus, 30000);
    set({ statusInterval: interval });

    socket.on('connect', () => {
      console.log('Socket connected');
      set({ wsStatus: 'connected', socket });

      const { selectedAsset } = get();
      get().syncSubscriptions();
      if (selectedAsset) socket.emit('select_asset', selectedAsset);

      try {
        get().refreshAssets();
        get().loadHistory(selectedAsset);
      } catch (err) {
        console.error('Post-connect initialization failed:', err);
      }
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
        const newData = [...currentData, { price, timestamp }].slice(-100);

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

    socket.on('asset_selected', (data) => {
      console.log('Asset selected successfully:', data.asset);
    });

    socket.on('asset_selection_error', (data) => {
      console.error('Asset selection error:', data.error);
      set({ lastError: data.error });
    });
  },
  disconnectSocket: () => {
    const { socket, statusInterval } = get();
    if (socket) {
      socket.disconnect();
    }
    if (statusInterval) {
      clearInterval(statusInterval);
    }
    set({
      socket: null,
      wsStatus: 'disconnected',
      statusInterval: null,
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
