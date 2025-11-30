import { create } from 'zustand';
import { io } from 'socket.io-client';

const useMarketStore = create((set, get) => ({
  // UI State
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Market Data State
  selectedAsset: 'AUDNZDOTC',
  setSelectedAsset: async (asset) => {
    set({ selectedAsset: asset });
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('subscribe_asset', asset);
    }
    
    // Call backend to select asset in Pocket Option
    try {
      await fetch('http://localhost:8000/api/v1/select-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset })
      });
    } catch (err) {
      console.error("Failed to select asset in backend:", err);
    }
  },
  
  selectedTimeframe: '1m',
  setSelectedTimeframe: async (timeframe) => {
    set({ selectedTimeframe: timeframe });
    
    // Call backend to select timeframe in Pocket Option
    try {
      await fetch('http://localhost:8000/api/v1/select-timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe })
      });
    } catch (err) {
      console.error("Failed to select timeframe in backend:", err);
    }
  },

  marketData: {}, // Live market data keyed by asset
  
  // 92% Payout Assets
  payoutAssets: [
    'AUDNZDOTC', 'EURUSDOTC', 'GBPUSDOTC', 'USDJPYOTC', 
    'USDCADOTC', 'AUDUSDOTC', 'NZDUSDOTC', 'EURGBPOTC'
  ],
  
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
      }
    } catch (err) {
      console.error("Failed to refresh assets:", err);
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
      
      // Subscribe to currently selected asset
      const { selectedAsset } = get();
      if (selectedAsset) {
        socket.emit('subscribe_asset', selectedAsset);
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
      // Update market data state
      // Assuming data structure: { asset: "AUDNZD_otc", price: 1.2345, ... }
      if (data && data.asset) {
        set((state) => ({
          marketData: {
            ...state.marketData,
            [data.asset]: data
          }
        }));
      }
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
  },

  disconnectSocket: () => {
    const { socket, statusInterval } = get();
    if (socket) {
      socket.disconnect();
    }
    if (statusInterval) {
      clearInterval(statusInterval);
    }
    set({ socket: null, wsStatus: 'disconnected', statusInterval: null });
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
