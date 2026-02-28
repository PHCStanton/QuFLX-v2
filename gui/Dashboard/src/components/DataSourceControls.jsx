import Card from './Card';
import ToggleSwitch from './ToggleSwitch';
import { Upload, Activity, RefreshCw, History } from 'lucide-react';

const ActionButton = ({ icon, label, active, onClick, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${disabled
      ? 'bg-section-bg/20 border-border-primary text-text-secondary/50 cursor-not-allowed'
      : active
        ? 'bg-accent-green/20 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.2)]'
        : 'bg-section-bg/80 border-border-primary hover:border-accent-green/50 hover:text-accent-green text-text-secondary'
      }`}
  >
    {icon}
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
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

  const className =
    health === 'streaming'
      ? 'bg-accent-green/20 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.2)]'
      : health === 'slow'
        ? 'bg-yellow-500/15 border-yellow-500/60 text-yellow-500'
        : health === 'stale'
          ? 'bg-accent-red/15 border-accent-red/60 text-accent-red'
          : 'bg-section-bg/80 border-border-primary text-text-secondary';

  return (
    <div
      title={`Stream status: ${statusLabel}. Control streaming from the top bar.`}
      className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${className}`}
    >
      <Activity size={14} />
      <span className="text-[10px] mt-1 font-medium">Stream: {statusLabel}</span>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ActionButton
              icon={<RefreshCw size={14} className={isBusyRefreshing ? 'animate-spin' : ''} />}
              label="Refresh"
              onClick={onGetAssets}
              disabled={isBusyRefreshing}
              title="Fetch latest asset list from backend"
            />
            <ActionButton
              icon={<History size={14} />}
              label="History"
              onClick={onCollectHistory}
              title="Collect historical data for analysis"
            />
            <StreamStatusIndicator streamHealth={streamHealth} />
            <div className="flex flex-col items-center justify-center p-2 rounded border border-border-primary bg-section-bg/80">
              <span className="text-[10px] text-text-secondary uppercase">OTC</span>
              <ToggleSwitch checked={otcOnly} onChange={onToggleOtcOnly} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-border-primary/30 pt-3">
            <ActionButton
              icon={<Activity size={14} />}
              label={alertsStatus?.running ? 'Stop Alerts' : 'Start Alerts'}
              active={alertsStatus?.running}
              onClick={alertsStatus?.running ? onStopAlerts : onStartAlerts}
              title="Toggle Alert Monitor"
            />
            <div className="flex flex-col items-center justify-center p-2 rounded border border-border-primary bg-section-bg/80">
              <span className="text-[10px] text-text-secondary uppercase">Auto</span>
              <ToggleSwitch checked={autoRunAlertMonitor} onChange={onToggleAutoRunAlertMonitor} />
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded border border-border-primary bg-section-bg/80">
              <span className="text-[10px] text-text-secondary uppercase">Logs</span>
              <ToggleSwitch checked={enableTickLogging} onChange={onToggleTickLogging} />
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded border border-border-primary bg-section-bg/80">
              <span className="text-[10px] text-text-secondary uppercase">Refresh</span>
              <ToggleSwitch checked={autoRefresh} onChange={onToggleAutoRefresh} />
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
