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

const API_BASE = 'http://localhost:8000/api/v1/trading';

const DEFAULT_STATE = {
    // Connection
    isConnected: false,
    isConnecting: false,
    isDemoMode: true,      // SAFETY: always start in demo
    balance: null,
    lastBalanceUpdate: null,
    ssidInput: '',         // For the input field only — never persisted

    // Trade execution
    isExecuting: false,
    lastCooldownEnd: null, // timestamp ms when cooldown expires

    // OTC assets loaded from backend
    assets: [],
    assetsLoaded: false,

    // Selected trade parameters (initialized to sensible defaults)
    selectedAsset: '',
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
        } catch {
            // best-effort
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
        } catch {
            // ignore polling errors silently
        }
    },

    // ------------------------------------------------------------------ //
    // Execute trade
    // ------------------------------------------------------------------ //

    executeTrade: async ({ asset, direction, amount, expiration }) => {
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
                lastCooldownEnd: Date.now() + (3 * 1000), // 3s default cooldown
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

            // Update the matching trade in history
            set((state) => {
                const trades = state.trades.map((t) =>
                    t.id === orderId
                        ? { ...t, status: data.result || 'error', profit: data.profit ?? null }
                        : t
                );
                const activeTrade =
                    state.activeTrade?.id === orderId ? null : state.activeTrade;
                return { trades, activeTrade };
            });

            // Refresh balance after result
            get().pollStatus();
            return data;
        } catch {
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
            if (data.success && Array.isArray(data.assets)) {
                set({
                    assets: data.assets,
                    assetsLoaded: true,
                    selectedAsset: data.assets[0] || '',
                });
            }
        } catch {
            // ignore
        }
    },

    // ------------------------------------------------------------------ //
    // Switch Demo / Real mode
    // ------------------------------------------------------------------ //

    switchMode: async (demo) => {
        set({ isConnecting: true, error: null });
        try {
            const res = await fetch(`${API_BASE}/switch-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ demo }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                set({ isConnecting: false, error: data.error || 'Mode switch failed' });
                return false;
            }
            set({
                isConnecting: false,
                isDemoMode: data.demo ?? demo,
                balance: data.balance,
                lastBalanceUpdate: Date.now(),
            });
            return true;
        } catch (err) {
            set({ isConnecting: false, error: err.message });
            return false;
        }
    },

    // ------------------------------------------------------------------ //
    // Reset entire store (e.g. on logout)
    // ------------------------------------------------------------------ //

    reset: () => set({ ...DEFAULT_STATE }),
}));

export default useTradingStore;
