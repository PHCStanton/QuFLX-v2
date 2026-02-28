/**
 * LiveTradingPanel.jsx — Live Trading Panel
 *
 * Sections (top-to-bottom):
 *   1. Real-mode safety banner (when in Real mode)
 *   2. Connection Bar   — SSID input, Connect/Disconnect, Demo/Real toggle
 *   3. Account Status   — Balance, mode badge, last updated
 *   4. Trade Form       — Asset, Direction, Amount, Expiry, Execute
 *   5. Recent Trades    — Mini-table with WIN/LOSS/pending results
 *   6. 92% Assets       — Collapsed AssetPayoutPanel
 *
 * Relies on: tradingStore.js, settingsStore.js (liveTrading section)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import useTradingStore from '../store/tradingStore';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import AssetPayoutPanel from './AssetPayoutPanel';
import CollapsiblePanel from './CollapsiblePanel';
import { normalizeSpecificAsset } from '../utils/assetUtils';
import clickSound from '../assets/Sounds/UIClick-Camera_snapshot.mp3';

// ─── Module-level audio singleton (prevents object leak on rapid toggling) ───
let clickAudioInstance = null;
const getClickAudio = () => {
  if (!clickAudioInstance) {
    clickAudioInstance = new Audio(clickSound);
  }
  return clickAudioInstance;
};

// ─── Local Components ───────────────────────────────────────────────────────

/**
 * Customized Neomorphic switch for Demo/Real mode
 */
const TradingModeSwitch = React.memo(function TradingModeSwitch({ isDemo, onChange, isConnecting }) {
  // checked = REAL mode (false = DEMO)
  const checked = !isDemo;

  const handleChange = () => {
    if (isConnecting) return;
    const nextDemo = !isDemo;
    const audio = getClickAudio();
    audio.currentTime = 0; // Reset for rapid clicks
    audio.play().catch((e) => {
      // Non-critical: audio play was blocked (e.g., user hasn't interacted with page yet)
      console.debug('[TradingModeSwitch] Audio play blocked:', e?.message || e);
    });
    if (onChange) onChange(nextDemo);
  };

  return (
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isDemo ? 'text-[#3b82f6]' : 'text-text-secondary'}`}>Demo</span>

      <label className="relative inline-block w-[46px] h-[22px] cursor-pointer select-none">
        <input
          type="checkbox"
          className="hidden"
          checked={checked}
          onChange={handleChange}
          disabled={isConnecting}
        />
        {/* Track */}
        <div className={`absolute inset-0 rounded-full transition-all duration-300 border shadow-inner ${checked ? 'border-[#ff4757]/40 bg-[#ff4757]/10' : 'border-[#3b82f6]/40 bg-[#3b82f6]/10'}`}
          style={{
            boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.5)',
          }}
        />

        {/* Knob */}
        <div className={`absolute top-[3px] left-[3px] w-[16px] h-[16px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] border shadow-md flex items-center justify-center
          ${checked
            ? 'translate-x-[24px] bg-[#ff4757] border-white/40 shadow-[0_0_8px_rgba(255,71,87,0.4)]'
            : 'bg-[#3b82f6] border-white/40 shadow-[0_0_8px_rgba(59,130,246,0.4)]'}`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>
      </label>

      <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${!isDemo ? 'text-[#ff4757]' : 'text-text-secondary'}`}>Real</span>
    </div>
  );
});

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = {
  /** Format USD balance */
  bal: (n) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,

  /** Format OTC asset for display (Normalized format: EURUSDOTC) */
  asset: (s) => (s ? normalizeSpecificAsset(s) : '—'),

  /** Format expiry seconds for display (e.g., "1m 30s", "5m", "1h 15m") */
  expiry: (s) => {
    if (!s || s <= 0) return '—';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const remSec = s % 60;
    if (s < 3600) return remSec ? `${m}m ${remSec}s` : `${m}m`;
    const h = Math.floor(s / 3600);
    const remMin = Math.floor((s % 3600) / 60);
    return remMin ? `${h}h ${remMin}m` : `${h}h`;
  },

  /** Format timestamp in HH:MM:SS */
  time: (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Countdown timer shown on active/pending trades */
const TradeCountdown = React.memo(function TradeCountdown({ expiresAt }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    // Check expiry directly from props rather than state to avoid stale closure
    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) return;

    const id = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span className={`font-mono text-[10px] ${remaining <= 5 ? 'text-yellow-400 animate-pulse' : 'text-text-secondary'}`}>
      {fmt.expiry(remaining)}
    </span>
  );
});

/** CALL / PUT direction buttons */
const DirectionButtons = React.memo(function DirectionButtons({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button
        id="trade-call-btn"
        disabled={disabled}
        onClick={() => onChange('call')}
        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border
          ${value === 'call'
            ? 'bg-[#00c97a]/20 border-[#00c97a] text-[#00c97a] shadow-[0_0_8px_rgba(0,201,122,0.3)]'
            : 'bg-card-bg border-border-primary text-text-secondary hover:border-[#00c97a]/50 hover:text-[#00c97a]'}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span>▲</span> CALL
      </button>
      <button
        id="trade-put-btn"
        disabled={disabled}
        onClick={() => onChange('put')}
        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border
          ${value === 'put'
            ? 'bg-[#ff4757]/20 border-[#ff4757] text-[#ff4757] shadow-[0_0_8px_rgba(255,71,87,0.3)]'
            : 'bg-card-bg border-border-primary text-text-secondary hover:border-[#ff4757]/50 hover:text-[#ff4757]'}
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span>▼</span> PUT
      </button>
    </div>
  );
});

/** Trade result badge */
const ResultBadge = React.memo(function ResultBadge({ status }) {
  if (status === 'win')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00c97a]/20 text-[#00c97a] uppercase">WIN</span>;
  if (status === 'loss')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#ff4757]/20 text-[#ff4757] uppercase">LOSS</span>;
  if (status === 'error')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 uppercase">ERR</span>;
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400 uppercase flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      WAIT
    </span>
  );
});

// ─── Real-money Confirmation Modal ───────────────────────────────────────────

const ConfirmTradeModal = React.memo(function ConfirmTradeModal({ asset, direction, amount, expiration, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#131929] border border-[#ff4757]/40 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#ff4757] text-xl">⚠️</span>
          <h3 className="text-text-primary font-bold text-sm uppercase tracking-wider">Confirm Real Trade</h3>
        </div>
        <p className="text-text-secondary text-xs mb-5 leading-relaxed">
          You are about to place a <strong className="text-white">{direction?.toUpperCase()}</strong> trade on{' '}
          <strong className="text-white">{fmt.asset(asset)}</strong> for{' '}
          <strong className="text-[#ff4757]">{fmt.bal(amount)} REAL USD</strong> expiring in{' '}
          <strong className="text-white">{fmt.expiry(expiration)}</strong>.
        </p>
        <div className="flex gap-2">
          <button
            id="confirm-trade-cancel-btn"
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-section-bg text-text-secondary text-xs font-medium border border-border-primary hover:border-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            id="confirm-trade-confirm-btn"
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-[#ff4757]/20 text-[#ff4757] text-xs font-bold border border-[#ff4757]/60 hover:bg-[#ff4757]/30 transition-colors"
          >
            Confirm Trade
          </button>
        </div>
      </div>
    </div>
  );
});

class LiveTradingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('LiveTradingPanel caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-2 rounded-lg bg-[#ff4757]/10 border border-[#ff4757]/40 text-[#ff4757] text-xs">
          <p className="font-bold mb-2">⚠️ Trading Panel Error</p>
          <p className="font-mono text-[10px] opacity-80">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-3 px-3 py-1 bg-[#ff4757]/20 rounded hover:bg-[#ff4757]/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main LiveTradingPanel ────────────────────────────────────────────────────

const EXPIRY_PRESETS = [
  { label: '5s', value: 5 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '3m', value: 180 },
  { label: '5m', value: 300 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
];

const LiveTradingPanel = () => {
  // ── Store selectors ──────────────────────────────────────────────────
  const {
    isConnected, isConnecting, isSwitchingMode, isDemoMode,
    balance, lastBalanceUpdate,
    selectedAsset, setSelectedAsset,
    selectedDirection, setSelectedDirection,
    tradeAmount, setTradeAmount,
    tradeExpiration, setTradeExpiration,
    isExecuting, lastCooldownEnd,
    assets, assetsLoaded,
    trades, activeTrade,
    error, connectError,
    connect, disconnect, switchMode, setDemoMode,
    executeTrade, checkResult, fetchAssets,
    hasDemoSsid, hasRealSsid, fetchSsidStatus,
    clearError,
  } = useTradingStore(useShallow((s) => ({
    isConnected: s.isConnected, isConnecting: s.isConnecting, isSwitchingMode: s.isSwitchingMode, isDemoMode: s.isDemoMode,
    balance: s.balance, lastBalanceUpdate: s.lastBalanceUpdate,
    selectedAsset: s.selectedAsset, setSelectedAsset: s.setSelectedAsset,
    selectedDirection: s.selectedDirection, setSelectedDirection: s.setSelectedDirection,
    tradeAmount: s.tradeAmount, setTradeAmount: s.setTradeAmount,
    tradeExpiration: s.tradeExpiration, setTradeExpiration: s.setTradeExpiration,
    isExecuting: s.isExecuting, lastCooldownEnd: s.lastCooldownEnd,
    assets: s.assets, assetsLoaded: s.assetsLoaded,
    trades: s.trades, activeTrade: s.activeTrade,
    error: s.error, connectError: s.connectError,
    connect: s.connect, disconnect: s.disconnect, switchMode: s.switchMode, setDemoMode: s.setDemoMode,
    executeTrade: s.executeTrade, checkResult: s.checkResult, fetchAssets: s.fetchAssets,
    hasDemoSsid: s.hasDemoSsid, hasRealSsid: s.hasRealSsid, fetchSsidStatus: s.fetchSsidStatus,
    clearError: s.clearError,
  })));

  const settings = useSettingsStore((s) => s.settings);
  const lt = settings.liveTrading || {};

  // ── Local UI state ───────────────────────────────────────────────────
  const [pendingTrade, setPendingTrade] = useState(null); // for confirm modal
  const ssidRef = useRef(null);
  const pollTimer = useRef(null);
  const defaultsAppliedRef = useRef(false); // Prevent settings from overwriting user choices

  // ── Init from settings (only once on mount) ───────────────────────────
  useEffect(() => {
    if (!defaultsAppliedRef.current) {
      setTradeAmount(lt.defaultAmount ?? 10);
      setTradeExpiration(lt.defaultExpiration ?? 300);
      defaultsAppliedRef.current = true;
    }
  }, [lt.defaultAmount, lt.defaultExpiration, setTradeAmount, setTradeExpiration]); // Run once on mount

  // Fix 5b: Fetch SSID badge status on mount so the Connection Bar shows "Saved SSID ready"
  useEffect(() => {
    fetchSsidStatus();
  }, [fetchSsidStatus]);

  // ── Balance polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) {
      pollTimer.current = setInterval(() => useTradingStore.getState().pollStatus(), 20_000);
    }
    return () => clearInterval(pollTimer.current);
  }, [isConnected]);

  // ── Auto-check active trade result when it expires ───────────────────
  useEffect(() => {
    if (!activeTrade) return;
    const delay = activeTrade.expiresAt - Date.now() + 3000; // 3s buffer
    const tradeId = activeTrade.id;
    const id = setTimeout(() => {
      if (tradeId) checkResult(tradeId);
    }, Math.max(delay, 1000));
    return () => clearTimeout(id);
  }, [activeTrade, checkResult]);

  // ── Cooldown state ───────────────────────────────────────────────────
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    if (!lastCooldownEnd) return;
    let id = null;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lastCooldownEnd - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left === 0 && id) {
        clearInterval(id);
      }
    };
    id = setInterval(tick, 500);
    tick();
    return () => clearInterval(id);
  }, [lastCooldownEnd]);

  const containerRef = useRef(null); // Reference for scrolling

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleUseForTrade = useCallback((asset) => {
    setSelectedAsset(asset);
    // Scroll to top of panel to show the trade form
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSelectedAsset]);

  const handleModeToggle = useCallback(async (nextDemo) => {
    // nextDemo is always passed by TradingModeSwitch (true = demo, false = real)
    if (nextDemo === isDemoMode) return;

    if (isConnected) {
      const ok = await switchMode(nextDemo);
      if (!ok) {
        // FIX (BUG-3): Mode switch failed (most likely: no saved SSID for target mode).
        // Auto-disconnect and let the user enter the new mode's SSID.
        // The error message is already displayed via connectError from the store.
        await disconnect();
        setDemoMode(nextDemo);
      }
    } else {
      setDemoMode(nextDemo);
    }
  }, [isConnected, isDemoMode, switchMode, setDemoMode, disconnect]);

  const handleAmountStep = useCallback((delta) => {
    const base = Number(tradeAmount) || 0;
    setTradeAmount(Math.max(lt.minAmount ?? 1, Math.min(lt.maxAmount ?? 1000, base + delta)));
  }, [tradeAmount, lt.minAmount, lt.maxAmount, setTradeAmount]);

  const handleExecute = useCallback(async () => {
    // Guard: validate all required inputs (Core Principle #9 — Fail Fast)
    if (!isConnected) return;
    if (!selectedAsset) return;
    if (!selectedDirection) return;
    if (!Number.isFinite(tradeAmount) || tradeAmount <= 0) return; // Validate positive amount
    if (tradeExpiration <= 0) return; // Validate positive expiration

    const params = {
      asset: selectedAsset,
      direction: selectedDirection,
      amount: tradeAmount,
      expiration: tradeExpiration,
    };
    // Gate: confirm modal for Real mode
    if (!isDemoMode && (lt.confirmRealTrades !== false)) {
      setPendingTrade(params);
      return;
    }
    await executeTrade({
      ...params,
      cooldownSeconds: lt.tradeCooldownSeconds ?? 3,
    });
  }, [isConnected, selectedAsset, selectedDirection, tradeAmount, tradeExpiration, isDemoMode, lt.confirmRealTrades, lt.tradeCooldownSeconds, executeTrade]);

  const handleConfirmed = useCallback(async () => {
    if (pendingTrade) {
      await executeTrade({
        ...pendingTrade,
        cooldownSeconds: lt.tradeCooldownSeconds ?? 3,
      });
    }
    setPendingTrade(null);
  }, [pendingTrade, lt.tradeCooldownSeconds, executeTrade]);

  const hasValidAmount = Number.isFinite(tradeAmount) && tradeAmount > 0;
  const hasValidExpiration = Number.isFinite(tradeExpiration) && tradeExpiration > 0;
  const canExecute =
    isConnected &&
    Boolean(selectedAsset) &&
    Boolean(selectedDirection) &&
    hasValidAmount &&
    hasValidExpiration &&
    !isExecuting &&
    cooldownLeft === 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="col-span-3 flex flex-col gap-3 h-full min-h-0 bg-dashboard-bg p-2 custom-scrollbar overflow-y-auto">

      {/* Confirmation modal */}
      {pendingTrade && (
        <ConfirmTradeModal
          {...pendingTrade}
          onConfirm={handleConfirmed}
          onCancel={() => setPendingTrade(null)}
        />
      )}

      {/* ── 1. Real-mode safety banner ──────────────────────────────── */}
      {!isDemoMode && isConnected && (
        <div className="p-3 mb-1 rounded-xl bg-[#ff4757]/10 border border-[#ff4757]/30 shadow-[0_0_15px_rgba(255,71,87,0.1)] flex items-start gap-3 animate-pulse-slow">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="text-[10px] font-black text-[#ff4757] uppercase tracking-wider mb-0.5">Real Mode Active</p>
            <p className="text-[9px] text-text-primary/80 font-medium leading-tight">Trades will be executed on your real account. Trade responsibly.</p>
          </div>
        </div>
      )}

      {/* ── 2. Connection Bar ─────────────────────────────────────── */}
      <CollapsiblePanel
        id="lt-connection-bar"
        title="Connection Status"
        expandable={true}
        className="bg-section-bg"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <TradingModeSwitch
              isDemo={isDemoMode}
              onChange={handleModeToggle}
              isConnecting={isConnecting || isSwitchingMode}
            />

            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-border-primary/50 shadow-inner">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-text-secondary/20'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
                {isConnecting ? 'CONNECTING...' : isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {!isConnected ? (
              <div className="flex flex-col gap-2">
                <button
                  id="lt-connect-btn"
                  onClick={() => connect('', isDemoMode)}
                  disabled={isConnecting}
                  className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-xl
                    ${isConnecting
                      ? 'bg-white/5 border border-border-primary text-text-secondary/20 cursor-not-allowed'
                      : 'bg-accent-blue text-white hover:opacity-95 hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)]'}`}
                >
                  {isConnecting ? 'Connecting...' : 'Connect Session'}
                </button>
                {/* Fix 5b: Show contextual saved-SSID indicator */}
                {(isDemoMode ? hasDemoSsid : hasRealSsid) ? (
                  <p className="text-[9px] text-accent-green font-bold text-center">
                    ✓ Saved {isDemoMode ? 'Demo' : 'Real'} SSID ready — click to connect
                  </p>
                ) : (
                  <p className="text-[9px] text-text-secondary text-center opacity-50">
                    SSID configuration is now in Settings Panel
                  </p>
                )}
              </div>
            ) : (
              <button
                id="lt-disconnect-btn"
                onClick={disconnect}
                className="w-full py-3 rounded-xl bg-white/5 border border-border-primary text-text-secondary hover:text-[#ff4757] hover:border-[#ff4757]/60 hover:bg-[#ff4757]/10 font-black text-[11px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-lg"
              >
                Disconnect Session
              </button>
            )}

            {(connectError || error) && (
              <div className="p-4 rounded-xl bg-[#ff4757]/10 border border-[#ff4757]/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500 shadow-lg">
                <span className="text-base">⚠️</span>
                <span className="text-[10px] font-black text-[#ff4757] uppercase tracking-widest leading-relaxed">
                  {connectError || error}
                </span>
                <button
                  onClick={clearError}
                  className="ml-auto p-1.5 text-[#ff4757] hover:bg-[#ff4757]/20 rounded-full transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </CollapsiblePanel>

      {/* ── 3. Account Status ─────────────────────────────────────── */}
      <CollapsiblePanel
        id="lt-account-status"
        title="Account Portfolio"
        expandable={true}
        className="bg-section-bg"
      >
        <div className="p-5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.25em] mb-2 opacity-60">Available Balance</span>
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl font-black text-text-primary tracking-tighter drop-shadow-sm">
                  {fmt.bal(balance)}
                </span>
                <span className="text-[11px] font-black text-text-secondary/40 uppercase tracking-[0.2em]">USD</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg border backdrop-blur-md transition-all
                ${isDemoMode
                  ? 'bg-accent-blue/10 border-accent-blue/40 text-accent-blue shadow-accent-blue/5'
                  : 'bg-[#ff4757]/10 border-[#ff4757]/40 text-[#ff4757] shadow-[#ff4757]/5'}`}
              >
                {isDemoMode ? 'Demo Account' : 'Real Account'}
              </div>
              <div className="flex items-center gap-2 text-[9px] font-black text-text-secondary/20 uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />
                <span>Synced: {fmt.time(lastBalanceUpdate)}</span>
              </div>
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      {/* ── 4. Trade Form ─────────────────────────────────────────── */}
      <CollapsiblePanel
        id="lt-trade-form"
        title="Execution Terminal"
        expandable={true}
        className="bg-section-bg"
      >
        <div className="p-5 flex flex-col gap-6">
          {/* Asset Selection */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-60">Selected Asset</span>
              {selectedAsset && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-green/10 border border-accent-green/20">
                  <div className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                  <span className="text-[9px] font-black text-accent-green uppercase tracking-widest">LIVE FEED</span>
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl bg-card-bg/80 border border-border-primary flex items-center justify-between group hover:border-border-primary/80 hover:bg-card-bg transition-all shadow-inner">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center border border-border-primary/40 shadow-xl group-hover:scale-105 transition-transform">
                  <span className="text-xl">💱</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-black text-text-primary tracking-tight">
                    {selectedAsset ? fmt.asset(selectedAsset) : 'No Asset Selected'}
                  </span>
                  <span className="text-[9px] font-bold text-text-secondary/30 uppercase tracking-[0.15em]">
                    {selectedAsset ? 'Binary Option OTC' : 'Select from Asset List below'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                className="p-2 rounded-xl hover:bg-[#ff4757]/10 text-text-secondary/20 hover:text-[#ff4757] transition-all"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Direction */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-60 px-1">Order Direction</span>
            <DirectionButtons
              value={selectedDirection}
              onChange={setSelectedDirection}
              disabled={!isConnected || isExecuting}
            />
          </div>

          {/* Amount & Expiry */}
          <div className="grid grid-cols-2 gap-5">
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-60 px-1">Amount</span>
              <div className="relative group">
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(Number(e.target.value))}
                  disabled={!isConnected || isExecuting}
                  className="w-full bg-card-bg/80 border border-border-primary rounded-xl pl-10 pr-4 py-4 text-xs font-black text-text-primary focus:outline-none focus:border-accent-blue/60 focus:ring-2 focus:ring-accent-blue/10 transition-all shadow-inner"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-[11px] font-black">$</span>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleAmountStep(10)} className="hover:text-accent-blue text-[9px] transition-colors">▲</button>
                  <button onClick={() => handleAmountStep(-10)} className="hover:text-[#ff4757] text-[9px] transition-colors">▼</button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-60 px-1">Duration</span>
              <div className="relative group">
                <div className="w-full bg-card-bg/80 border border-border-primary rounded-xl px-4 py-4 text-xs font-black text-text-primary flex items-center justify-between shadow-inner">
                  <span className="tracking-tight">{fmt.expiry(tradeExpiration)}</span>
                  <span className="text-[9px] font-bold text-text-secondary/20 uppercase tracking-[0.2em]">EXPIRY</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expiry Presets Grid */}
          <div className="grid grid-cols-4 gap-2">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.value}
                id={`expiry-${p.label}`}
                onClick={() => setTradeExpiration(p.value)}
                disabled={!isConnected || isExecuting}
                className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
                  ${tradeExpiration === p.value
                    ? 'bg-accent-green/10 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.15)] scale-[1.02]'
                    : 'bg-card-bg border-border-primary text-text-secondary/40 hover:border-border-primary/80 hover:text-text-primary hover:bg-card-bg/90'}
                  disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Execute Button */}
          <button
            id="execute-trade-btn"
            disabled={!canExecute}
            onClick={handleExecute}
            className={`w-full py-5 rounded-xl font-black text-[13px] uppercase tracking-[0.25em] transition-all shadow-2xl active:scale-[0.97]
              ${canExecute
                ? 'bg-accent-green text-black hover:opacity-95 hover:shadow-[0_12px_35px_rgba(34,197,94,0.3)] border-none'
                : 'bg-white/5 border border-border-primary text-text-secondary/20 cursor-not-allowed shadow-none'}
              ${isExecuting ? 'animate-pulse' : ''}`}
          >
            {isExecuting ? (
              <div className="flex items-center justify-center gap-4">
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span className="animate-pulse">EXECUTING ORDER</span>
              </div>
            ) : cooldownLeft > 0 ? (
              <div className="flex items-center justify-center gap-3">
                <span className="opacity-40">COOLDOWN</span>
                <span className="text-sm tracking-widest">{cooldownLeft}s</span>
              </div>
            ) : !isConnected ? (
              'SYSTEM OFFLINE'
            ) : !selectedDirection ? (
              'AWAITING DIRECTION'
            ) : (
              <div className="flex items-center justify-center gap-3">
                <span>PLACE {isDemoMode ? 'DEMO' : 'REAL'} TRADE</span>
                <span className="opacity-20">|</span>
                <span className="drop-shadow-sm">{fmt.bal(tradeAmount)}</span>
              </div>
            )}
          </button>
        </div>
      </CollapsiblePanel>

      {/* ── 5. Recent Trades ──────────────────────────────────────── */}
      <CollapsiblePanel
        id="lt-recent-trades"
        title="Recent Trades"
        expandable={true}
        className="bg-section-bg"
      >
        <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar max-h-[350px] pr-1">
          {activeTrade && (
            <div className="p-4 rounded-xl bg-accent-blue/10 border border-accent-blue/30 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 shadow-lg shadow-accent-blue/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                  <span className="text-[10px] font-black text-accent-blue uppercase tracking-[0.2em]">Active Order</span>
                </div>
                <TradeCountdown expiresAt={activeTrade.expiresAt} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-black text-text-primary tracking-tight">{fmt.asset(activeTrade.asset)}</span>
                  <span className="text-[10px] font-bold text-text-secondary/40 uppercase tracking-widest">{activeTrade.direction} @ {fmt.bal(activeTrade.amount)}</span>
                </div>
                <div className="px-2 py-1 rounded-lg bg-black/40 border border-border-primary/50">
                  <span className="text-[9px] font-black text-text-secondary/40 uppercase tracking-[0.15em]">PENDING</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {trades.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4 opacity-10">
                <span className="text-4xl grayscale">📊</span>
                <span className="text-[11px] font-black uppercase tracking-[0.3em]">No Recent Activity</span>
              </div>
            ) : (
              trades.slice(0, 10).map((t) => (
                <div key={t.id} className="p-4 rounded-xl bg-card-bg/60 border border-border-primary/40 flex items-center justify-between hover:bg-card-bg hover:border-border-primary/80 transition-all group shadow-sm hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all shadow-inner group-hover:scale-105
                      ${t.status === 'win' ? 'bg-[#00c97a]/10 border-[#00c97a]/40 text-[#00c97a]' :
                        t.status === 'loss' ? 'bg-[#ff4757]/10 border-[#ff4757]/40 text-[#ff4757]' :
                          'bg-black/30 border-border-primary/50 text-text-secondary/30'}`}
                    >
                      <span className="text-[11px] font-black">{t.direction === 'call' ? '▲' : '▼'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-black text-text-primary tracking-tight group-hover:text-accent-blue transition-colors">
                        {fmt.asset(t.asset)}
                      </span>
                      <span className="text-[10px] font-bold text-text-secondary/30 uppercase tracking-widest">
                        {fmt.time(t.timestamp)} • {fmt.bal(t.amount)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <ResultBadge status={t.status} />
                    {t.profit !== undefined && (
                      <span className={`text-[10px] font-black tracking-tighter drop-shadow-sm ${t.profit >= 0 ? 'text-[#00c97a]' : 'text-[#ff4757]'}`}>
                        {t.profit >= 0 ? '+' : ''}{fmt.bal(t.profit)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CollapsiblePanel>

      {/* ── 6. 92% Assets (collapsible) ────────────────────────────── */}
      <CollapsiblePanel
        id="live-trading-assets"
        title="High Payout Markets"
        expandable={true}
        onToggle={(isOpen) => {
          if (isOpen && !assetsLoaded) fetchAssets();
        }}
        className="bg-section-bg"
      >
        <AssetPayoutPanel
          showControls={false}
          defaultIsTopCollapsed={false}
          defaultIsBottomCollapsed={true}
          onUseForTrade={handleUseForTrade}
        />
      </CollapsiblePanel>

    </div>
  );
};

export default function LiveTradingPanelWrapper(props) {
  return (
    <LiveTradingErrorBoundary>
      <LiveTradingPanel {...props} />
    </LiveTradingErrorBoundary>
  );
}
