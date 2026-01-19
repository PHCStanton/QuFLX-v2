import Card from './Card';
import ToggleSwitch from './ToggleSwitch';
import { Upload, Activity, RefreshCw, History, ChevronUp, ChevronDown } from 'lucide-react';

const ActionButton = ({ icon, label, active, onClick, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
      disabled
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
  height,
  isCollapsed,
  onToggleCollapsed,
  isBottomCollapsed,
  backendReady,
  autoRefresh,
  onToggleAutoRefresh,
  otcOnly,
  onToggleOtcOnly,
  onGetAssets,
  onCollectHistory,
  isBusyRefreshing,
  streamHealth,
  children
}) => {
  return (
    <div
      className={`transition-all duration-300 ease-in-out ${
        isCollapsed
          ? 'h-10 min-h-0 shrink-0'
          : isBottomCollapsed
            ? 'flex-1 min-h-0'
            : 'shrink-0 min-h-[140px]'
      }`}
      style={{ height: isCollapsed ? 40 : isBottomCollapsed ? undefined : height }}
    >
      <Card className={`p-3 rounded-lg h-full quflx-section-light flex flex-col ${isCollapsed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Data Source</h3>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="p-1 hover:bg-section-bg/50 rounded text-text-secondary transition-colors"
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {!isCollapsed && (
          <>
            {!backendReady && (
              <div className="mb-2 p-2 bg-yellow-500/10 dark:bg-yellow-900/20 border border-yellow-500/50 dark:border-yellow-700/50 rounded text-xs text-yellow-700 dark:text-yellow-300">
                <div className="flex items-center gap-2">
                  <span className="animate-pulse">⚠️</span>
                  <span>Backend not ready - checking status...</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                icon={<Upload size={14} />}
                label="Upload CSV"
                disabled
                title="Upload CSV is not implemented yet"
              />
              <StreamStatusIndicator streamHealth={streamHealth} />
              <ActionButton
                icon={<RefreshCw size={14} className={isBusyRefreshing ? 'animate-spin' : ''} />}
                label="Get Assets"
                onClick={onGetAssets}
                disabled={!backendReady}
                title={backendReady ? 'Refresh available assets with current settings' : 'Backend not ready - check status'}
              />
              <ActionButton
                icon={<History size={14} />}
                label="Collect History"
                onClick={onCollectHistory}
                disabled={!backendReady}
                title={backendReady ? 'Collect history data from favorites' : 'Backend not ready - check status'}
              />
            </div>

            <div className="mt-2 flex items-center justify-between p-1.5 bg-section-bg/50 rounded border border-border-primary">
              <span className="text-[10px] uppercase font-bold text-text-secondary">Auto Refresh (5m)</span>
              <ToggleSwitch checked={autoRefresh} onChange={onToggleAutoRefresh} />
            </div>

            <div className="mt-2 flex items-center justify-between p-1.5 bg-section-bg/50 rounded border border-border-primary">
              <span className="text-[10px] uppercase font-bold text-text-secondary">OTC Only</span>
              <ToggleSwitch checked={otcOnly} onChange={onToggleOtcOnly} />
            </div>

            {children}
          </>
        )}
      </Card>
    </div>
  );
};

export default DataSourceControls;
