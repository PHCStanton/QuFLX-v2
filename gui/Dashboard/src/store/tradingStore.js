/**
 * tradingStore.js — Live Trading Zustand Store
 *
 * Manages all live trading state: connection, balance, trade execution,
 * recent trade history, and OTC asset list.
 *
 * Design decisions:
 *  - isDemoMode defaults TRUE for safety
 *  - SSID input field value is NOT persisted (security)
 *  - Trade history is session-only (not persisted)
 *  - Backend URL follows the same pattern as other stores
 */

import { create } from 'zustand';
import { getApiBaseUrl } from '../api/apiBase';

const API_BASE = `${getApiBaseUrl()}/api/v1/trading`;

const DEFAULT_STATE = {
    // Connection
    isConnected: false,
    isConnecting: false,
    isSwitchingMode: false,
    isDemoMode: true,      // SAFETY: always start in demo
    balance: null,
    lastBalanceUpdate: null,
    ssidInput: '',         // For the input field only
    ssid_demo: '',         // Persisted demo SSID
    ssid_real: '',         // Persisted real SSID

    // Trade execution
    isExecuting: false,
    lastCooldownEnd: null, // timestamp ms when cooldown expires

    // OTC assets loaded from backend
    assets: [],            // Array of { id, name, payout }
    assetsLoaded: false,

    // Selected trade parameters (initialized to sensible defaults)
    selectedAsset: '',     // Stores the id (e.g. EURUSD_otc)
    selectedDirection: null, // 'call' | 'put'
    tradeAmount: 10,
    tradeExpiration: 300,    // seconds

    // Trade history (session only)
    trades: [],              // Array of trade result objects
    activeTrade: null,       // Currently pending trade (awaiting result)

    // UI state
    error: null,
    connectError: null,
};

const useTradingStore = create((set, get) => ({
    ...DEFAULT_STATE,

    // ------------------------------------------------------------------ //
    // Setters for form fields
    // ------------------------------------------------------------------ //

    setSsidInput: (val) => set({ ssidInput: val }),
    setSelectedAsset: (asset) => set({ selectedAsset: asset }),
    setSelectedDirection: (dir) => set({ selectedDirection: dir }),
    setTradeAmount: (amount) => set({ tradeAmount: amount }),
    setTradeExpiration: (exp) => set({ tradeExpiration: exp }),
    setDemoMode: (demo) => set({ isDemoMode: demo }),
    clearError: () => set({ error: null, connectError: null }),

    // ------------------------------------------------------------------ //
    // Connect
    // ------------------------------------------------------------------ //

    connect: async (ssid, demo) => {
        set({ isConnecting: true, connectError: null, error: null });
        try {
            const res = await fetch(`${API_BASE}/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ssid, demo }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                set({ isConnecting: false, connectError: data.error || 'Connection failed' });
                return false;
            }
            set({
                isConnected: true,
                isConnecting: false,
                isDemoMode: data.demo ?? demo,
                balance: data.balance,
                lastBalanceUpdate: Date.now(),
                ssidInput: '',      // clear from field after successful connect
                connectError: null,
            });
            // Load assets after connecting
            get().fetchAssets();
            return true;
        } catch (err) {
            set({ isConnecting: false, connectError: err.message });
            return false;
        }
    },

    // ------------------------------------------------------------------ //
    // Disconnect
    // ------------------------------------------------------------------ //

    disconnect: async () => {
        try {
            await fetch(`${API_BASE}/disconnect`, { method: 'POST' });
        } catch (err) {
            console.warn('[tradingStore] Disconnect failed:', err.message);
        }
        set({
            isConnected: false,
            isDemoMode: true,
            balance: null,
            lastBalanceUpdate: null,
            activeTrade: null,
            error: null,
            connectError: null,
        });
    },

    // ------------------------------------------------------------------ //
    // Poll status (for balance refresh)
    // ------------------------------------------------------------------ //

    pollStatus: async () => {
        if (!get().isConnected) return;
        try {
            const res = await fetch(`${API_BASE}/status`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) {
                set({
                    isConnected: data.connected ?? get().isConnected,
                    isDemoMode: data.demo ?? get().isDemoMode,
                    balance: data.balance ?? get().balance,
                    lastBalanceUpdate: Date.now(),
                });
            }
        } catch (err) {
            console.warn('[tradingStore] pollStatus failed:', err.message);
        }
    },

    // ------------------------------------------------------------------ //
    // Execute trade
    // ------------------------------------------------------------------ //

    executeTrade: async ({ asset, direction, amount, expiration, cooldownSeconds = 3 }) => {
        set({ isExecuting: true, error: null });
        try {
            const res = await fetch(`${API_BASE}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset, direction, amount, expiration }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                set({ isExecuting: false, error: data.error || data.detail?.error || 'Trade failed' });
                return null;
            }

            const trade = {
                id: data.order_id || `trade-${Date.now()}`,
                asset,
                direction,
                amount,
                expiration,
                placedAt: Date.now(),
                expiresAt: Date.now() + expiration * 1000,
                status: 'pending', // 'pending' | 'win' | 'loss' | 'error'
                profit: null,
            };

            set((state) => ({
                isExecuting: false,
                activeTrade: trade,
                lastCooldownEnd: Date.now() + (cooldownSeconds * 1000),
                trades: [trade, ...state.trades].slice(0, 20), // keep last 20
            }));

            return trade;
        } catch (err) {
            set({ isExecuting: false, error: err.message });
            return null;
        }
    },

    // ------------------------------------------------------------------ //
    // Check trade result
    // ------------------------------------------------------------------ //

    checkResult: async (orderId) => {
        try {
            const res = await fetch(`${API_BASE}/result/${encodeURIComponent(orderId)}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.success) return null;

            // FIX (BUG-2): Backend returns { win: boolean, profit: number }
            // Map data.win to status: 'win' | 'loss' | 'error'
            const status = data.win === true ? 'win' : data.win === false ? 'loss' : 'error';

            // Update the matching trade in history
            set((state) => {
                const trades = state.trades.map((t) =>
                    t.id === orderId
                        ? { ...t, status, profit: data.profit ?? null }
                        : t
                );
                const activeTrade =
                    state.activeTrade?.id === orderId ? null : state.activeTrade;
                return { trades, activeTrade };
            });

            // Refresh balance after result
            get().pollStatus();
            return data;
        } catch (err) {
            console.warn('[tradingStore] checkResult failed:', err.message);
            return null;
        }
    },

    // ------------------------------------------------------------------ //
    // Fetch verified OTC assets
    // ------------------------------------------------------------------ //

    fetchAssets: async () => {
        try {
            const res = await fetch(`${API_BASE}/assets`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.assets) && data.assets.length > 0) {
                // BUG #3 FIX: backend now returns {id}, but handle {symbol} as fallback
                // for backward compatibility during any transitional state.
                const firstAsset = data.assets[0];
                const firstId = firstAsset?.id ?? firstAsset?.symbol ?? '';
                set({
                    assets: data.assets,
                    assetsLoaded: true,
                    // Only set selectedAsset if not already set
                    selectedAsset: get().selectedAsset || firstId,
                });
            }
        } catch (err) {
            console.warn('[tradingStore] fetchAssets failed:', err.message);
        }
    },

    // ------------------------------------------------------------------ //
    // Switch Demo / Real mode
    // ------------------------------------------------------------------ //

    switchMode: async (demo) => {
        set({ isSwitchingMode: true, error: null });
        try {
            const res = await fetch(`${API_BASE}/switch-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ demo }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                // FIX (BUG-4): FastAPI HTTPException returns { detail: { error: "..." } }
                // Extract from both possible locations and use connectError for display in connection bar
                const errMsg = data.detail?.error || data.error || 'Mode switch failed';
                set({ isSwitchingMode: false, connectError: errMsg });
                return false;
            }
            set({
                isSwitchingMode: false,
                isDemoMode: data.demo ?? demo,
                balance: data.balance,
                lastBalanceUpdate: Date.now(),
                connectError: null, // Clear any previous error on success
            });
            return true;
        } catch (err) {
            set({ isSwitchingMode: false, connectError: err.message });
            return false;
        }
    },

    // ------------------------------------------------------------------ //
    // Reset entire store (e.g. on logout)
    // ------------------------------------------------------------------ //

    reset: () => set({ ...DEFAULT_STATE }),
}));

export default useTradingStore;
