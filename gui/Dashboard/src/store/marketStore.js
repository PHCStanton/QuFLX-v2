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
  setSelectedAsset: (asset) => {
    set({ selectedAsset: asset });
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('subscribe_asset', asset);
    }
  },
  
  selectedTimeframe: '1m',
  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),

  marketData: {}, // Live market data keyed by asset
  
  // Mock Data for 92% Payout Assets
  payoutAssets: [
    'AUDNZDOTC', 'EURUSDOTC', 'GBPUSDOTC', 'USDJPYOTC', 
    'USDCADOTC', 'AUDUSDOTC', 'NZDUSDOTC', 'EURGBPOTC'
  ],

  // Connection State
  socket: null,
  wsStatus: 'disconnected', // 'connected', 'disconnected', 'error'
  setWsStatus: (status) => set({ wsStatus: status }),
  
  connectSocket: () => {
    const socket = io('http://localhost:8000', {
      transports: ['websocket'],
      autoConnect: true,
    });

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
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, wsStatus: 'disconnected' });
    }
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
