import { useRef } from 'react';
import { CollapsibleCard } from './Card';
import { RefreshCw, Database, Radio, Power } from 'lucide-react';
import clickSound from '../assets/Sounds/UIClick-Short_soft click.mp3';

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

const GlobalControls = ({
  backendReady,
  autoRefresh,
  onToggleAutoRefresh,
  otcOnly,
  onToggleOtcOnly,
  onGetAssets,
  isBusyRefreshing,
  alertsStatus,
  onStartAlerts,
  onStopAlerts,
  enableTickLogging,
  onToggleTickLogging,
}) => {
  return (
    <CollapsibleCard
      id="global-controls"
      headerLeft={
        <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.25em] opacity-80">
          Global Controls
        </h3>
      }
      className="p-4 rounded-[20px] bg-[#0d0d12]"
      bodyClassName="flex flex-col gap-6"
    >
      {!backendReady && (
        <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-[10px] text-yellow-500 font-bold uppercase tracking-wider text-center">
          <span className="animate-pulse">⚠️ Backend Connecting...</span>
        </div>
      )}

      {/* Action Row */}
      <div className="grid grid-cols-5 gap-2 px-1">
        <NeoButton
          icon={RefreshCw}
          label="Refresh"
          onClick={onGetAssets}
          disabled={isBusyRefreshing}
          active={isBusyRefreshing}
          tooltip="Fetch latest asset list"
          accentColor="#00d4ff"
        />
        <NeoButton
          icon={AutoRefreshIcon}
          label="Auto"
          active={autoRefresh}
          onClick={onToggleAutoRefresh}
          tooltip="Auto Refresh List"
          accentColor="#a855f7"
        />
         <NeoButton
          icon={Database}
          label="Ticks"
          active={enableTickLogging}
          onClick={onToggleTickLogging}
          tooltip="Tick Logging"
          accentColor="#00d4ff"
        />
        <NeoButton
          icon={Radio}
          label="OTC"
          active={otcOnly}
          onClick={onToggleOtcOnly}
          tooltip="Toggle OTC Assets"
          accentColor="#22c55e"
        />
        <NeoButton
          icon={Power}
          label={alertsStatus?.running ? "Stop" : "Alerts"}
          active={alertsStatus?.running}
          onClick={alertsStatus?.running ? onStopAlerts : onStartAlerts}
          tooltip="Toggle Alert Monitor"
          accentColor={alertsStatus?.running ? "#ef4444" : "#22c55e"}
        />
      </div>
    </CollapsibleCard>
  );
};

export default GlobalControls;
