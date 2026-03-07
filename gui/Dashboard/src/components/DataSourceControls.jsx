import Card from './Card';
import NeomorphicSwitch from './NeomorphicSwitch';
import NeomorphicGlowButton from './NeomorphicGlowButton';
import { Upload, Activity, RefreshCw, History } from 'lucide-react';

const ActionButton = ({ icon, label, active, onClick, disabled, title, accentColor }) => (
  <NeomorphicGlowButton
    icon={icon}
    label={label}
    onClick={onClick}
    disabled={disabled}
    active={active}
    title={title}
    accentColor={accentColor}
  />
);

const StreamStatusIndicator = ({ streamHealth }) => {
  const health = typeof streamHealth === 'string' ? streamHealth : 'idle';

  const statusLabel =
    health === 'streaming'
      ? 'Live'
      : health === 'slow'
        ? 'Slow'
        : health === 'stale'
          ? 'Stale'
          : 'Idle';

  const accentColor = 
    health === 'streaming' ? '#22c55e' : // accent-green
    health === 'slow' ? '#eab308' :      // yellow-500
    health === 'stale' ? '#ef4444' :     // accent-red
    '#718096';                           // gray-400

  return (
    <div
      title={`Stream status: ${statusLabel}. Control streaming from the top bar.`}
      className="flex flex-col items-center justify-center p-3 rounded-[24px] transition-all duration-500"
      style={{
          background: '#111118',
          boxShadow: `inset 6px 6px 12px #07070a, inset -6px -6px 12px #1b1b24, 0 0 10px ${accentColor}22`,
          border: `1px solid ${accentColor}44`
      }}
    >
      <Activity size={24} style={{ 
          color: accentColor, 
          filter: health === 'streaming' ? `drop-shadow(0 0 12px ${accentColor})` : 'none'
      }} className={health === 'streaming' ? 'animate-pulse' : ''} />
      <span className="text-[9px] mt-2 font-black uppercase tracking-[0.1em] text-center" style={{ color: accentColor }}>
        Stream: {statusLabel}
      </span>
    </div>
  );
};

const DataSourceControls = ({
  backendReady,
  autoRefresh,
  onToggleAutoRefresh,
  otcOnly,
  onToggleOtcOnly,
  onGetAssets,
  onCollectHistory,
  onUpload,
  isBusyRefreshing,
  streamHealth,
  autoRunAlertMonitor,
  onToggleAutoRunAlertMonitor,
  alertsStatus,
  onStartAlerts,
  onStopAlerts,
  enableTickLogging,
  onToggleTickLogging,
  children
}) => {
  return (
    <div className="shrink-0 min-h-[140px]">
      <Card className="p-3 rounded-lg h-full quflx-section-light flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between mb-2 shrink-0 w-full px-1 py-1">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Data Source</h3>
        </div>

        <div className="flex flex-col gap-3">
          {!backendReady && (
            <div className="mb-2 p-2 bg-yellow-500/10 dark:bg-yellow-900/20 border border-yellow-500/50 dark:border-yellow-700/50 rounded text-xs text-yellow-700 dark:text-yellow-300">
              <div className="flex items-center gap-2">
                <span className="animate-pulse">⚠️</span>
                <span>Backend not ready - checking status...</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-1">
            <ActionButton
              icon={<RefreshCw className={isBusyRefreshing ? 'animate-spin' : ''} />}
              label="Refresh"
              onClick={onGetAssets}
              disabled={isBusyRefreshing}
              title="Fetch latest asset list from backend"
              accentColor="#00d4ff" // Cyan glow for refresh
            />
            <ActionButton
              icon={<History />}
              label="History"
              onClick={onCollectHistory}
              title="Collect historical data for analysis"
              accentColor="#a855f7" // Purple glow for history
            />
            <StreamStatusIndicator streamHealth={streamHealth} />
            <div className="relative flex items-center justify-center p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[8px_8px_16px_#07070a,-8px_-8px_16px_#1b1b24]">
              <div className="absolute top-2 text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">OTC</div>
              <div className="mt-4 scale-90">
                <NeomorphicSwitch checked={otcOnly} onChange={onToggleOtcOnly} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border-primary/10 pt-5 mt-2 px-1">
            <ActionButton
              icon={<Activity />}
              label={alertsStatus?.running ? 'Stop Alerts' : 'Start Alerts'}
              active={alertsStatus?.running}
              onClick={alertsStatus?.running ? onStopAlerts : onStartAlerts}
              title="Toggle Alert Monitor"
              accentColor={alertsStatus?.running ? '#ef4444' : '#22c55e'} // Red if running, green if not
            />
            <div className="relative flex items-center justify-center p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[8px_8px_16px_#07070a,-8px_-8px_16px_#1b1b24]">
              <div className="absolute top-2 text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Auto</div>
              <div className="mt-4 scale-90">
                <NeomorphicSwitch checked={autoRunAlertMonitor} onChange={onToggleAutoRunAlertMonitor} />
              </div>
            </div>
            <div className="relative flex items-center justify-center p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[8px_8px_16px_#07070a,-8px_-8px_16px_#1b1b24]">
              <div className="absolute top-2 text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Logs</div>
              <div className="mt-4 scale-90">
                <NeomorphicSwitch checked={enableTickLogging} onChange={onToggleTickLogging} />
              </div>
            </div>
            <div className="relative flex items-center justify-center p-4 rounded-[24px] bg-[#111118] border border-white/5 shadow-[8px_8px_16px_#07070a,-8px_-8px_16px_#1b1b24]">
              <div className="absolute top-2 text-[8px] font-black text-text-secondary uppercase tracking-[0.2em]">Refresh</div>
              <div className="mt-4 scale-90">
                <NeomorphicSwitch checked={autoRefresh} onChange={onToggleAutoRefresh} />
              </div>
            </div>
          </div>

          <div className="mt-2">
            {children}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DataSourceControls;
