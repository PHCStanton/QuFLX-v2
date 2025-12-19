import { create } from 'zustand';
import { io } from 'socket.io-client';

const normalizeAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[_/\s]/g, '').toUpperCase();
};

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const useMarketStore = create((set, get) => ({
  // UI State
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Error State
  lastError: null,
  clearError: () => set({ lastError: null }),

  // Market Data State
  selectedAsset: 'AUDNZDOTC',
  selectedAssetKey: normalizeAsset('AUDNZDOTC'),
  setSelectedAsset: async (asset) => {
    const nextAssetKey = normalizeAsset(asset);

    set({
      selectedAsset: asset,
      selectedAssetKey: nextAssetKey,
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
    // Clear market data when timeframe changes to reset chart
    set({ selectedTimeframe: timeframe, marketData: {} });
    
    // Call backend to select timeframe in Pocket Option
    try {
      const response = await fetch('http://localhost:8000/api/v1/select-timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });
      
      if (!response.ok) {
        console.error(`Failed to select timeframe: HTTP ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        set({ lastError: errorData.detail || `Failed to select timeframe: ${timeframe}` });
      }
    } catch (err) {
      console.error("Failed to select timeframe in backend:", err);
      set({ lastError: `Network error selecting timeframe: ${err.message}` });
    }
  },

  marketData: {},
  tickerMaxAssets: 15,
  subscribedAssetKeys: [],
  quotesByAssetKey: {},
  baselineByAssetKey: {},

  historyCandles: {},
  historyStatus: {},
  loadHistory: async (asset) => {
    if (!asset) return;

    set((state) => ({
      historyStatus: {
        ...state.historyStatus,
        [asset]: 'loading',
      },
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
            [asset]: candles,
          },
          historyStatus: {
            ...state.historyStatus,
            [asset]: 'loaded',
          },
        }));
        return;
      }

      const histRes = await fetch(`http://localhost:8000/api/v1/history/${encodeURIComponent(asset)}?timeframe=1&limit=${limit}`);
      if (histRes.ok) {
        const hist = await histRes.json();
        const candles = Array.isArray(hist.data) ? hist.data : [];
        set((state) => ({
          historyCandles: {
            ...state.historyCandles,
            [asset]: candles,
          },
          historyStatus: {
            ...state.historyStatus,
            [asset]: candles.length ? 'loaded' : 'empty',
          },
        }));
        return;
      }

      set((state) => ({
        historyCandles: {
          ...state.historyCandles,
          [asset]: [],
        },
        historyStatus: {
          ...state.historyStatus,
          [asset]: histRes.status === 404 ? 'not_found' : 'error',
        },
      }));
    } catch (err) {
      console.error('Failed to load history:', err);
      set((state) => ({
        historyCandles: {
          ...state.historyCandles,
          [asset]: [],
        },
        historyStatus: {
          ...state.historyStatus,
          [asset]: 'error',
        },
      }));
    }
  },
  
  // 92% Payout Assets
  payoutAssets: [],
  panelMode: 'list',
  setPanelMode: (mode) => {
    set({ panelMode: mode });
    get().syncSubscriptions();
  },

  computeRequiredAssetKeys: (overrideSelectedAssetKey) => {
    const { panelMode, payoutAssets, selectedAssetKey, tickerMaxAssets } = get();
    const nextSelectedKey = overrideSelectedAssetKey ?? selectedAssetKey;

    if (panelMode !== 'ticker') {
      return uniq([nextSelectedKey]);
    }

    const tickerKeys = (payoutAssets || [])
      .slice(0, tickerMaxAssets)
      .map((a) => normalizeAsset(a));

    return uniq([...tickerKeys, nextSelectedKey]);
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
  
  // Asset Refresh Logic
  autoRefresh: false,
  toggleAutoRefresh: () => {
    const { autoRefresh, startAutoRefresh, stopAutoRefresh } = get();
    if (autoRefresh) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  },
  
  refreshInterval: null,
  startAutoRefresh: () => {
    set({ autoRefresh: true });
    const { refreshAssets } = get();
    refreshAssets(); // Initial refresh
    const interval = setInterval(refreshAssets, 5 * 60 * 1000); // 5 minutes
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
      console.error("Failed to refresh assets:", err);
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
      console.error("Failed to start history collection:", err);
      set({ lastError: `Collection Error: ${err.message}` });
    }
  },

  // Connection State
  socket: null,
  wsStatus: 'disconnected', // 'connected', 'disconnected', 'error'
  setWsStatus: (status) => set({ wsStatus: status }),
  
  statusInterval: null,

  fetchStatus: async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/status');
      const data = await res.json();
      // data: { collector: "connected" | "disconnected", stream: "idle" | "streaming" }
      if (data) {
        set({ 
          chromeStatus: data.collector,
          streamStatus: data.stream
        });
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  },

  connectSocket: () => {
    const socket = io('http://localhost:8000', {
      transports: ['websocket'],
      autoConnect: true,
    });

    // Initial status fetch
    const { fetchStatus } = get();
    fetchStatus();
    
    // Start polling status every 30s as fallback
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
      const assetKey = data?.asset;
      if (!assetKey) return;

      const { subscribedAssetKeys } = get();
      if (subscribedAssetKeys.length > 0 && !subscribedAssetKeys.includes(assetKey)) return;

      const rawPrice = data?.price ?? data?.close ?? data?.open;
      const price = Number(rawPrice);
      if (!Number.isFinite(price)) return;

      const timestamp = data?.timestamp ?? data?.time;

      set((state) => {
        const prevBaseline = state.baselineByAssetKey?.[assetKey];
        const baseline = Number.isFinite(prevBaseline) ? prevBaseline : price;
        const changePct = baseline !== 0 ? ((price - baseline) / baseline) * 100 : 0;

        return {
          marketData: {
            ...state.marketData,
            [assetKey]: data,
          },
          baselineByAssetKey: {
            ...state.baselineByAssetKey,
            [assetKey]: baseline,
          },
          quotesByAssetKey: {
            ...state.quotesByAssetKey,
            [assetKey]: {
              price,
              baseline,
              changePct,
              timestamp,
            },
          },
        };
      });
    });

    socket.on('system_status', (data) => {
      // data: { service: "collector", status: "connected" | "disconnected" }
      if (data && data.service === 'collector') {
        set({ chromeStatus: data.status });
        // If collector is connected, we assume stream is also active (or at least ready)
        // We can refine this later if we have separate stream status
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
    set({ socket: null, wsStatus: 'disconnected', statusInterval: null, subscribedAssetKeys: [] });
  },

  chromeStatus: 'disconnected',
  setChromeStatus: (status) => set({ chromeStatus: status }),
  
  streamStatus: 'idle', // 'idle', 'streaming', 'error'
  setStreamStatus: (status) => set({ streamStatus: status }),

  // Chart State
  activeIndicators: [
    { id: 'rsi', name: 'RSI', value: '14' },
    { id: 'ema', name: 'EMA', value: '200' },
    { id: 'bb', name: 'Bollinger', value: '20, 2' }
  ],
  addIndicator: (indicator) => set((state) => ({ 
    activeIndicators: [...state.activeIndicators, indicator] 
  })),
  removeIndicator: (id) => set((state) => ({ 
    activeIndicators: state.activeIndicators.filter(i => i.id !== id) 
  })),

  // Automation State
  automations: {
    autoSelectFavorites: false,
    pendingOrders: false
  },
  toggleAutomation: (key) => set((state) => ({
    automations: {
      ...state.automations,
      [key]: !state.automations[key]
    }
  }))
}));

export default useMarketStore;
