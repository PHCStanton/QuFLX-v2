import { useEffect, useRef, useCallback } from 'react';
import { CollapsibleCard } from './Card';
import { RefreshCw, Database, Radio, Power, Lock, Unlock } from 'lucide-react';
import clickSound from '../assets/Sounds/UIClick-Short_soft click.mp3';
import snapshotSound from '../assets/Sounds/UIClick-Camera_snapshot.mp3';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import useTradingStore from '../store/tradingStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * NeoButton - Reusable neo-morphic button styled after AnalysisToggle.
 */
const NeoButton = ({ onClick, active, icon: Icon, label, tooltip, size = 44, accentColor = '#00ff88', disabled }) => {
  const audioRef = useRef(null);

  const handleClick = (e) => {
    if (disabled) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(clickSound);
      audioRef.current.volume = 0.5;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => { });
    if (onClick) onClick(e);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`neo-ctrl-btn ${active ? 'active' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
        title={tooltip}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          '--accent-color': accentColor,
        }}
      >
        {Icon && <Icon size={size * 0.5} className="neo-icon" />}
        <style>{`
          .neo-ctrl-btn {
            --bg: #1e2128;
            --shadow-dark: rgba(0,0,0,0.6);
            --shadow-light: rgba(255,255,255,0.05);
            
            border-radius: 12px;
            background: var(--bg);
            border: 1px solid rgba(255,255,255,0.05);
            outline: none;
            padding: 0;
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 4px 4px 8px var(--shadow-dark), -2px -2px 6px var(--shadow-light);
          }

          .neo-ctrl-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: rgba(255,255,255,0.1);
            box-shadow: 5px 5px 10px var(--shadow-dark), -2px -2px 7px var(--shadow-light);
          }

          .neo-ctrl-btn.active {
            border-color: rgba(var(--accent-glow), 0.3);
            background: linear-gradient(145deg, #1a1d24, #22262e);
            box-shadow: inset 4px 4px 8px var(--shadow-dark), inset -2px -2px 6px var(--shadow-light);
          }

          .neo-icon {
            color: #8899ac;
            transition: all 0.3s ease;
          }

          .neo-ctrl-btn:hover:not(:disabled) .neo-icon {
            color: #ccd6e0;
          }

          .neo-ctrl-btn.active .neo-icon {
            color: var(--accent-color);
            filter: drop-shadow(0 0 4px var(--accent-color)) drop-shadow(0 0 8px rgba(0,255,136,0.2));
          }
        `}</style>
      </button>
      {label && (
        <span className={`text-[9px] uppercase font-black tracking-widest text-center leading-none ${active ? 'text-accent-green' : 'text-text-secondary opacity-60'}`}>
          {label}
        </span>
      )}
    </div>
  );
};

const AutoRefreshIcon = ({ size, className }) => (
  <div className="relative flex items-center justify-center">
    <RefreshCw size={size} className={className} />
    <span 
      className="absolute font-black pointer-events-none" 
      style={{ 
        fontSize: `${size * 0.45}px`,
        lineHeight: 1,
        marginTop: '-1px'
      }}
    >
      A
    </span>
  </div>
);

const fmt = {
  bal: (n) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  time: (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  },
};

const GlobalControls = () => {
  const toggleAudioRef = useRef(null);
  const {
    backendReady,
    autoRefresh,
    assetFilterState,
    alertsStatus,
    payoutAssets,
    enableTickLogging,
    toggleAutoRefresh,
    setAssetFilterState,
    refreshAssets,
    startAlerts,
    stopAlerts,
    toggleTickLogging,
  } = useMarketStore(useShallow((state) => ({
    backendReady: Boolean(state.backendStatus?.readyForAssets),
    autoRefresh: state.autoRefresh,
    assetFilterState: state.assetFilterState,
    alertsStatus: state.alertsStatus,
    payoutAssets: state.payoutAssets,
    enableTickLogging: state.enableTickLogging,
    toggleAutoRefresh: state.toggleAutoRefresh,
    setAssetFilterState: state.setAssetFilterState,
    refreshAssets: state.refreshAssets,
    startAlerts: state.startAlerts,
    stopAlerts: state.stopAlerts,
    toggleTickLogging: state.toggleTickLogging,
  })));
  const settingsTickLoggingEnabled = useSettingsStore((state) => state.settings.alerts?.enableTickLogging);
  const updateSettingsSection = useSettingsStore((state) => state.updateSection);

  const {
    isConnected,
    isConnecting,
    isSwitchingMode,
    isDemoMode,
    balance,
    lastBalanceUpdate,
    connectError,
    hasDemoSsid,
    hasRealSsid,
    connect,
    disconnect,
    switchMode,
    setDemoMode,
    fetchSsidStatus,
    clearError,
  } = useTradingStore(useShallow((s) => ({
    isConnected: s.isConnected,
    isConnecting: s.isConnecting,
    isSwitchingMode: s.isSwitchingMode,
    isDemoMode: s.isDemoMode,
    balance: s.balance,
    lastBalanceUpdate: s.lastBalanceUpdate,
    connectError: s.connectError,
    hasDemoSsid: s.hasDemoSsid,
    hasRealSsid: s.hasRealSsid,
    connect: s.connect,
    disconnect: s.disconnect,
    switchMode: s.switchMode,
    setDemoMode: s.setDemoMode,
    fetchSsidStatus: s.fetchSsidStatus,
    clearError: s.clearError,
  })));

  useEffect(() => {
    fetchSsidStatus();
  }, [fetchSsidStatus]);

  const handleModeToggle = useCallback(async () => {
    if (isConnecting || isSwitchingMode) return;

    const nextDemo = !isDemoMode;

    if (!toggleAudioRef.current) {
      toggleAudioRef.current = new Audio(snapshotSound);
      toggleAudioRef.current.volume = 0.55;
    }
    toggleAudioRef.current.currentTime = 0;
    toggleAudioRef.current.play().catch(() => { });

    if (isConnected) {
      const ok = await switchMode(nextDemo);
      if (!ok) {
        await disconnect();
        setDemoMode(nextDemo);
      }
      return;
    }

    setDemoMode(nextDemo);
  }, [isConnecting, isSwitchingMode, isDemoMode, isConnected, switchMode, disconnect, setDemoMode]);

  const isBusySession = isConnecting || isSwitchingMode;
  const otcOnly = assetFilterState?.filterMode === 'otc';
  const isBusyRefreshing = autoRefresh;

  const handleToggleOtcOnly = useCallback(() => {
    setAssetFilterState({
      ...(assetFilterState || {}),
      filterMode: otcOnly ? null : 'otc',
    });
  }, [assetFilterState, otcOnly, setAssetFilterState]);

  const handleGetAssets = useCallback(() => {
    const options = {
      min_pct: assetFilterState?.minPayout || 92,
      max_assets: assetFilterState?.maxAssets || 5,
      include_assets: (assetFilterState?.includeAssets || '').split(',').map((asset) => asset.trim()).filter(Boolean),
      ignore_assets: (assetFilterState?.ignoreAssets || '').split(',').map((asset) => asset.trim()).filter(Boolean),
      filter_mode: assetFilterState?.filterMode,
    };
    refreshAssets(options);
  }, [assetFilterState, refreshAssets]);

  const handleToggleTickLogging = useCallback(() => {
    const nextValue = !settingsTickLoggingEnabled;
    updateSettingsSection('alerts', { enableTickLogging: nextValue });
    toggleTickLogging();
  }, [settingsTickLoggingEnabled, updateSettingsSection, toggleTickLogging]);

  const handleToggleAlerts = useCallback(() => {
    if (alertsStatus?.running) {
      stopAlerts();
      return;
    }

    if (!enableTickLogging) {
      handleToggleTickLogging();
    }
    startAlerts(payoutAssets);
  }, [alertsStatus, stopAlerts, enableTickLogging, handleToggleTickLogging, startAlerts, payoutAssets]);

  return (
    <CollapsibleCard
      id="global-controls"
      headerLeft={
        <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.25em] opacity-80">
          Global Controls
        </h3>
      }
      className="p-4 rounded-[20px] bg-[#0d0d12]"
      bodyClassName="pt-3 flex flex-col gap-2"
    >
      {!backendReady && (
        <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-[10px] text-yellow-500 font-bold uppercase tracking-wider text-center">
          <span className="animate-pulse">⚠️ Backend Connecting...</span>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 flex items-center justify-between px-4 rounded-xl relative overflow-hidden ${isBusySession ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => {
            if (isBusySession) return;
            handleModeToggle();
          }}
          style={{
            height: '48px',
            background: 'linear-gradient(135deg, #0d1520 0%, #1a1d24 50%, #1a0d0d 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: isDemoMode
              ? '4px 4px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(255,255,255,0.04), inset 0 0 24px rgba(0,120,255,0.1)'
              : '4px 4px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(255,255,255,0.04), inset 0 0 24px rgba(255,60,60,0.1)',
            '--accent-primary': isDemoMode ? '0,120,255' : '255,60,30',
            '--accent-glow': isDemoMode ? '0,120,255' : '255,60,30',
          }}
        >
          {/* Blue glow left */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1/2 pointer-events-none transition-opacity duration-300"
            style={{
              background: 'radial-gradient(ellipse at left center, rgba(0,120,255,0.2) 0%, transparent 70%)',
              opacity: isDemoMode ? 1 : 0.15,
            }}
          />
          {/* Red glow right */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none transition-opacity duration-300"
            style={{
              background: 'radial-gradient(ellipse at right center, rgba(255,60,30,0.2) 0%, transparent 70%)',
              opacity: !isDemoMode ? 1 : 0.15,
            }}
          />

          {/* DEMO label */}
          <span
            className="text-[11px] font-black uppercase tracking-widest z-10 transition-all duration-300 select-none"
            style={{
              color: isDemoMode ? '#4db8ff' : 'rgba(100,140,180,0.35)',
              textShadow: isDemoMode ? '0 0 10px rgba(77,184,255,0.7)' : 'none',
            }}
          >
            DEMO
          </span>

          {/* Toggle button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isBusySession) return;
              handleModeToggle();
            }}
            aria-label={isDemoMode ? 'Switch to real mode' : 'Switch to demo mode'}
            disabled={isBusySession}
            className="z-10 relative h-[30px] w-[60px] rounded-[15px] border transition-all duration-300"
            style={{
              background: !isDemoMode
                ? 'linear-gradient(135deg, rgba(255,60,30,0.22) 0%, rgba(255,255,255,0.04) 100%)'
                : 'linear-gradient(135deg, rgba(0,120,255,0.22) 0%, rgba(255,255,255,0.04) 100%)',
              borderColor: !isDemoMode ? 'rgba(255,60,30,0.35)' : 'rgba(0,120,255,0.35)',
              boxShadow: 'inset 2px 2px 8px rgba(0,0,0,0.9)',
            }}
          >
            <span
              className="absolute top-[3px] left-[3px] h-[24px] w-[24px] rounded-full transition-all duration-300"
              style={{
                transform: !isDemoMode ? 'translateX(30px)' : 'translateX(0px)',
                backgroundColor: !isDemoMode ? '#121212' : '#000000ff',
                border: !isDemoMode ? '1px solid rgba(255, 255, 255, 0.72)' : '1px solid rgba(255,255,255,0.6)',
                boxShadow: !isDemoMode
                  ? '3px 3px 6px rgba(0,0,0,0.8), -1px -1px 3px rgba(255,255,255,0.1)'
                  : '2px 2px 6px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.35)',
              }}
            />
          </button>

          {/* REAL label */}
          <span
            className="text-[11px] font-black uppercase tracking-widest z-10 transition-all duration-300 select-none"
            style={{
              color: !isDemoMode ? '#ff6b4a' : 'rgba(180,100,80,0.35)',
              textShadow: !isDemoMode ? '0 0 10px rgba(255,107,74,0.7)' : 'none',
            }}
          >
            REAL
          </span>
        </div>

        {/* Lock / Connect Icon Button */}
        <button
          type="button"
          onClick={() => {
            if (!toggleAudioRef.current) {
              toggleAudioRef.current = new Audio(snapshotSound);
              toggleAudioRef.current.volume = 0.55;
            }
            toggleAudioRef.current.currentTime = 0;
            toggleAudioRef.current.play().catch(() => { });
            isConnected ? disconnect() : connect('', isDemoMode);
          }}
          disabled={isBusySession}
          className={`z-10 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${isBusySession ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
          style={{
            width: '36px',
            height: '36px',
            background: 'linear-gradient(145deg, #1e2128, #16191f)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '3px 3px 7px rgba(0,0,0,0.6), -2px -2px 5px rgba(255,255,255,0.04)',
            color: !isConnected ? 'rgba(180,100,80,0.35)' : (isDemoMode ? '#4db8ff' : '#ff6b4a'),
            flexShrink: 0,
          }}
          title={!isConnected ? 'Connect Session' : 'Disconnect Session'}
        >
          {isConnected ? <Unlock size={16} /> : <Lock size={16} />}
        </button>
      </div>

      {/* Account balance placeholder + session status */}
      <div className="px-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary opacity-70">Available Balance</span>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.6)]' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-text-secondary/20'}`} />
            <span className={`text-[9px] font-black uppercase tracking-widest ${isConnected ? 'text-accent-green' : isConnecting ? 'text-yellow-500' : 'text-text-secondary/40'}`}>
              {isConnecting ? 'CONNECTING...' : isConnected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-xl font-black tracking-tight text-text-primary">{fmt.bal(balance)}</span>
          <span className="text-[9px] uppercase tracking-widest text-text-secondary/40">Synced: {fmt.time(lastBalanceUpdate)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {connectError && (
          <div className="p-3 rounded-xl bg-[#ff4757]/10 border border-[#ff4757]/30 flex items-center gap-2.5 shadow-lg">
            <span className="text-sm">⚠️</span>
            <span className="text-[10px] font-black text-[#ff4757] uppercase tracking-widest leading-relaxed">
              {connectError}
            </span>
            <button
              type="button"
              onClick={clearError}
              className="ml-auto p-1 text-[#ff4757] hover:bg-[#ff4757]/20 rounded-full transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        
        {!(isDemoMode ? hasDemoSsid : hasRealSsid) && !isConnected && (
           <p className="text-[9px] text-text-secondary text-center opacity-55">
             SSID configuration is in Settings Panel
           </p>
        )}
      </div>

      {/* Action Row */}
      <div className="grid grid-cols-5 gap-2 px-1">
        <NeoButton
          icon={RefreshCw}
          label="Refresh"
          onClick={handleGetAssets}
          disabled={isBusyRefreshing}
          active={isBusyRefreshing}
          tooltip="Fetch latest asset list"
          accentColor="#00d4ff"
        />
        <NeoButton
          icon={AutoRefreshIcon}
          label="Auto"
          active={autoRefresh}
          onClick={toggleAutoRefresh}
          tooltip="Auto Refresh List"
          accentColor="#a855f7"
        />
        <NeoButton
          icon={Radio}
          label="OTC"
          active={otcOnly}
          onClick={handleToggleOtcOnly}
          tooltip="Toggle OTC Assets"
          accentColor="#22c55e"
        />
        <NeoButton
          icon={Database}
          label="Ticks"
          active={enableTickLogging}
          onClick={handleToggleTickLogging}
          tooltip="Tick Logging"
          accentColor="#00d4ff"
        />
        <NeoButton
          icon={Power}
          label={alertsStatus?.running ? "Stop" : "Alerts"}
          active={alertsStatus?.running}
          onClick={handleToggleAlerts}
          tooltip="Toggle Alert Monitor (Also activates Ticks)"
          accentColor={alertsStatus?.running ? "#ef4444" : "#22c55e"}
        />
      </div>
    </CollapsibleCard>
  );
};

export default GlobalControls;
