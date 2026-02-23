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

import { useEffect, useRef, useState, useCallback } from 'react';
import useTradingStore from '../store/tradingStore';
import useSettingsStore from '../store/settingsStore';
import AssetPayoutPanel from './AssetPayoutPanel';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = {
  /** Format USD balance */
  bal: (n) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,

  /** Format OTC asset for display */
  asset: (s) => (s ? s.replace('_otc', '').replace('_OTC', '') : '—'),

  /** Format expiry seconds for display */
  expiry: (s) => {
    if (!s) return '—';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${s / 60}m`;
    return `${s / 3600}h`;
  },

  /** Format timestamp in HH:MM:SS */
  time: (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Countdown timer shown on active/pending trades */
function TradeCountdown({ expiresAt }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(r);
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span className={`font-mono text-[10px] ${remaining <= 5 ? 'text-yellow-400 animate-pulse' : 'text-text-secondary'}`}>
      {fmt.expiry(remaining)}
    </span>
  );
}

/** CALL / PUT direction buttons */
function DirectionButtons({ value, onChange, disabled }) {
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
}

/** Trade result badge */
function ResultBadge({ status }) {
  if (status === 'win')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00c97a]/20 text-[#00c97a] uppercase">WIN</span>;
  if (status === 'loss')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#ff4757]/20 text-[#ff4757] uppercase">LOSS</span>;
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400 uppercase flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      WAIT
    </span>
  );
}

// ─── Real-money Confirmation Modal ───────────────────────────────────────────

function ConfirmTradeModal({ asset, direction, amount, expiration, onConfirm, onCancel }) {
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
    isConnected, isConnecting, isDemoMode,
    balance, lastBalanceUpdate,
    ssidInput, setSsidInput,
    selectedAsset, setSelectedAsset,
    selectedDirection, setSelectedDirection,
    tradeAmount, setTradeAmount,
    tradeExpiration, setTradeExpiration,
    isExecuting, lastCooldownEnd,
    assets, assetsLoaded,
    trades, activeTrade,
    error, connectError,
    connect, disconnect, switchMode,
    executeTrade, checkResult, fetchAssets,
    clearError,
  } = useTradingStore();

  const settings = useSettingsStore((s) => s.settings);
  const lt = settings.liveTrading || {};

  // ── Local UI state ───────────────────────────────────────────────────
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [pendingTrade, setPendingTrade] = useState(null); // for confirm modal
  const ssidRef = useRef(null);
  const pollTimer = useRef(null);

  // ── Init from settings ───────────────────────────────────────────────
  useEffect(() => {
    if (!tradeAmount || tradeAmount === 10) setTradeAmount(lt.defaultAmount ?? 10);
    if (!tradeExpiration || tradeExpiration === 300) setTradeExpiration(lt.defaultExpiration ?? 300);
  }, [lt.defaultAmount, lt.defaultExpiration]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const id = setTimeout(() => {
      if (activeTrade?.id) checkResult(activeTrade.id);
    }, Math.max(delay, 1000));
    return () => clearTimeout(id);
  }, [activeTrade, checkResult]);

  // ── Cooldown state ───────────────────────────────────────────────────
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    if (!lastCooldownEnd) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lastCooldownEnd - Date.now()) / 1000));
      setCooldownLeft(left);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lastCooldownEnd]);

  const containerRef = useRef(null); // Reference for scrolling

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleUseForTrade = useCallback((asset) => {
    setSelectedAsset(asset);
    // Scroll to top of panel to show the trade form
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSelectedAsset]);

  const handleConnect = useCallback(async () => {
    if (!ssidInput.trim()) {
      ssidRef.current?.focus();
      return;
    }
    const ok = await connect(ssidInput.trim(), isDemoMode);
    if (!ok) {
      // Focus the SSID input on error for quick entry
      ssidRef.current?.focus();
    }
  }, [ssidInput, isDemoMode, connect]);

  const handleModeToggle = useCallback(async () => {
    if (isConnected) {
      await switchMode(!isDemoMode);
    } else {
      useTradingStore.setState({ isDemoMode: !isDemoMode });
    }
  }, [isConnected, isDemoMode, switchMode]);

  const handleAmountStep = useCallback((delta) => {
    setTradeAmount(Math.max(lt.minAmount ?? 1, Math.min(lt.maxAmount ?? 1000, tradeAmount + delta)));
  }, [tradeAmount, lt.minAmount, lt.maxAmount, setTradeAmount]);

  const handleExecute = useCallback(async () => {
    if (!isConnected || !selectedAsset || !selectedDirection) return;
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
    await executeTrade(params);
  }, [isConnected, selectedAsset, selectedDirection, tradeAmount, tradeExpiration, isDemoMode, lt.confirmRealTrades, executeTrade]);

  const handleConfirmed = useCallback(async () => {
    if (pendingTrade) await executeTrade(pendingTrade);
    setPendingTrade(null);
  }, [pendingTrade, executeTrade]);

  const canExecute =
    isConnected &&
    Boolean(selectedAsset) &&
    Boolean(selectedDirection) &&
    !isExecuting &&
    cooldownLeft === 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 gap-2 p-2 overflow-y-auto custom-scrollbar">

      {/* Confirmation modal */}
      {pendingTrade && (
        <ConfirmTradeModal
          {...pendingTrade}
          onConfirm={handleConfirmed}
          onCancel={() => setPendingTrade(null)}
        />
      )}

      {/* ── 1. Real-mode banner ─────────────────────────────────────── */}
      {isConnected && !isDemoMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#ff4757]/10 border border-[#ff4757]/40 text-[#ff4757] text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4757] animate-pulse inline-block" />
          ⚠ Real-Money Mode — Trades use real USD
        </div>
      )}

      {/* ── 2. Connection Bar ───────────────────────────────────────── */}
      <div className="rounded-lg border border-border-primary bg-section-bg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">SSID Connection</span>
          {/* Status dot */}
          <span className={`flex items-center gap-1 text-[9px] font-bold uppercase
            ${isConnecting ? 'text-yellow-400' : isConnected ? 'text-[#00c97a]' : 'text-text-secondary'}`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block
              ${isConnecting ? 'bg-yellow-400 animate-pulse' : isConnected ? 'bg-[#00c97a]' : 'bg-text-secondary'}`} />
            {isConnecting ? 'Connecting…' : isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* SSID input row */}
        {!isConnected && (
          <div className="flex gap-1.5">
            <input
              id="ssid-input"
              ref={ssidRef}
              type="password"
              value={ssidInput}
              onChange={(e) => setSsidInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              placeholder="Paste your SSID here…"
              autoComplete="off"
              className="flex-1 bg-card-bg border border-border-primary rounded px-2 py-1.5 text-[10px] text-text-primary placeholder-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent-green min-w-0"
            />
            <button
              id="connect-btn"
              disabled={isConnecting || !ssidInput.trim()}
              onClick={handleConnect}
              className="px-3 py-1.5 rounded bg-accent-green hover:opacity-90 text-[#0a0f1c] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-opacity whitespace-nowrap"
            >
              {isConnecting ? '…' : 'Connect'}
            </button>
          </div>
        )}

        {/* Connected row: Disconnect + mode toggle */}
        {isConnected && (
          <div className="flex items-center justify-between gap-2">
            <button
              id="disconnect-btn"
              onClick={disconnect}
              className="px-3 py-1.5 rounded bg-section-bg hover:bg-card-bg text-text-secondary text-[10px] font-medium border border-border-primary transition-colors"
            >
              Disconnect
            </button>

            {/* Demo / Real toggle */}
            <button
              id="mode-toggle-btn"
              onClick={handleModeToggle}
              disabled={isConnecting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all
                ${isDemoMode
                  ? 'bg-[#3b82f6]/15 border-[#3b82f6]/50 text-[#3b82f6]'
                  : 'bg-[#ff4757]/15 border-[#ff4757]/50 text-[#ff4757]'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isDemoMode ? 'Switch to Real account' : 'Switch to Demo account'}
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isDemoMode ? 'bg-[#3b82f6]' : 'bg-[#ff4757]'}`} />
              {isDemoMode ? 'DEMO' : 'REAL'}
            </button>
          </div>
        )}

        {connectError && (
          <p className="text-[9px] text-[#ff4757] leading-tight mt-0.5">{connectError}</p>
        )}
      </div>

      {/* ── 3. Account Status ───────────────────────────────────────── */}
      {isConnected && (
        <div className="rounded-lg border border-border-primary bg-card-bg p-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-text-secondary uppercase tracking-wider mb-0.5">Balance</p>
            <p className={`text-xl font-bold font-mono ${isDemoMode ? 'text-[#3b82f6]' : 'text-[#00c97a]'}`}>
              {fmt.bal(balance)}
            </p>
            {lastBalanceUpdate && (
              <p className="text-[8px] text-text-secondary mt-0.5">Updated {fmt.time(lastBalanceUpdate)}</p>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest
            ${isDemoMode ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
              : 'bg-[#ff4757]/15 text-[#ff4757] border border-[#ff4757]/30'}`}>
            {isDemoMode ? 'DEMO' : 'REAL'}
          </span>
        </div>
      )}

      {/* ── 4. Trade Execution Form ─────────────────────────────────── */}
      <div className={`rounded-lg border bg-section-bg p-3 flex flex-col gap-2.5 transition-opacity
        ${isConnected ? 'border-border-primary opacity-100' : 'border-border-primary/40 opacity-50 pointer-events-none'}`}>

        <p className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">Trade</p>

        {/* Asset selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-text-secondary">Asset</label>
          <select
            id="asset-select"
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="bg-card-bg border border-border-primary rounded px-2 py-1.5 text-[10px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green w-full"
          >
            {!assetsLoaded && <option value="">Loading assets…</option>}
            {assetsLoaded && assets.length === 0 && <option value="">No assets available</option>}
            {assets.map((a) => (
              <option key={a} value={a}>{fmt.asset(a)}</option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-text-secondary">Direction</label>
          <DirectionButtons
            value={selectedDirection}
            onChange={setSelectedDirection}
            disabled={!isConnected}
          />
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-text-secondary">Amount (USD)</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleAmountStep(-5)}
              className="px-2 py-1.5 rounded bg-card-bg border border-border-primary text-text-secondary text-[10px] hover:text-text-primary transition-colors select-none"
            >-5</button>
            <button
              onClick={() => handleAmountStep(-1)}
              className="px-2 py-1.5 rounded bg-card-bg border border-border-primary text-text-secondary text-[10px] hover:text-text-primary transition-colors select-none"
            >-1</button>
            <input
              id="trade-amount-input"
              type="number"
              value={tradeAmount}
              min={lt.minAmount ?? 1}
              max={lt.maxAmount ?? 1000}
              step={1}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setTradeAmount(Math.max(lt.minAmount ?? 1, Math.min(lt.maxAmount ?? 1000, v)));
              }}
              className="flex-1 bg-card-bg border border-border-primary rounded px-2 py-1.5 text-[10px] text-text-primary text-center focus:outline-none focus:ring-1 focus:ring-accent-green min-w-0"
            />
            <button
              onClick={() => handleAmountStep(1)}
              className="px-2 py-1.5 rounded bg-card-bg border border-border-primary text-text-secondary text-[10px] hover:text-text-primary transition-colors select-none"
            >+1</button>
            <button
              onClick={() => handleAmountStep(5)}
              className="px-2 py-1.5 rounded bg-card-bg border border-border-primary text-text-secondary text-[10px] hover:text-text-primary transition-colors select-none"
            >+5</button>
          </div>
        </div>

        {/* Expiry chips */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-text-secondary">Expiry</label>
          <div className="flex flex-wrap gap-1">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.value}
                id={`expiry-${p.label}`}
                onClick={() => setTradeExpiration(p.value)}
                className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all border
                  ${tradeExpiration === p.value
                    ? 'bg-accent-green/20 border-accent-green text-accent-green'
                    : 'bg-card-bg border-border-primary text-text-secondary hover:border-accent-green/40'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Execute button */}
        <button
          id="execute-trade-btn"
          disabled={!canExecute}
          onClick={handleExecute}
          className={`w-full py-2.5 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all border
            ${canExecute
              ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/30 hover:shadow-[0_0_12px_rgba(234,179,8,0.2)]'
              : 'bg-card-bg border-border-primary/40 text-text-secondary/40 cursor-not-allowed'}
            ${isExecuting ? 'animate-pulse' : ''}`}
        >
          {isExecuting
            ? '⏳ Placing Trade…'
            : cooldownLeft > 0
              ? `⏱ Cooldown ${cooldownLeft}s`
              : !isConnected
                ? '🔌 Connect First'
                : !selectedDirection
                  ? '↑↓ Select Direction'
                  : `⚡ ${isDemoMode ? 'Demo' : 'Real'} Trade — ${fmt.bal(tradeAmount)}`}
        </button>

        {error && (
          <div className="flex items-start gap-1.5 p-2 rounded bg-[#ff4757]/10 border border-[#ff4757]/30">
            <span className="text-[#ff4757] text-[10px] flex-1">{error}</span>
            <button onClick={clearError} className="text-text-secondary hover:text-text-primary text-[10px]">✕</button>
          </div>
        )}
      </div>

      {/* ── 5. Recent Trades ────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="rounded-lg border border-border-primary bg-card-bg p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-text-secondary mb-2">Recent Trades</p>
          <div className="flex flex-col gap-1">
            {trades.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 py-1 border-b border-border-primary/30 last:border-0">
                {/* Direction arrow */}
                <span className={`text-[10px] font-bold ${t.direction === 'call' ? 'text-[#00c97a]' : 'text-[#ff4757]'}`}>
                  {t.direction === 'call' ? '▲' : '▼'}
                </span>
                {/* Asset */}
                <span className="text-[9px] text-text-primary font-mono flex-1 truncate">{fmt.asset(t.asset)}</span>
                {/* Amount */}
                <span className="text-[9px] text-text-secondary font-mono">{fmt.bal(t.amount)}</span>
                {/* Timer or result */}
                {t.status === 'pending' ? (
                  <TradeCountdown expiresAt={t.expiresAt} />
                ) : (
                  t.profit !== null && (
                    <span className={`text-[9px] font-mono ${t.profit >= 0 ? 'text-[#00c97a]' : 'text-[#ff4757]'}`}>
                      {t.profit >= 0 ? '+' : ''}{fmt.bal(t.profit)}
                    </span>
                  )
                )}
                <ResultBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. 92% Assets (collapsible) ────────────────────────────── */}
      <div className="rounded-lg border border-border-primary bg-section-bg overflow-hidden">
        <button
          id="assets-collapse-btn"
          onClick={() => {
            const next = !assetsOpen;
            setAssetsOpen(next);
            if (next && !assetsLoaded) fetchAssets();
          }}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-card-bg/50 transition-colors"
        >
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">
            92% Payout Assets
          </span>
          <span className={`text-text-secondary text-[10px] transition-transform ${assetsOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {assetsOpen && (
          <div className="border-t border-border-primary/30">
            <AssetPayoutPanel
              showControls={false}
              defaultIsTopCollapsed={false}
              defaultIsBottomCollapsed={true}
              onUseForTrade={handleUseForTrade}
              className="max-h-64"
            />
          </div>
        )}
      </div>

    </div>
  );
};

export default LiveTradingPanel;
