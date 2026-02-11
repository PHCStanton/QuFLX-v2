import Card from './Card';
import AssetPayoutPanel from './AssetPayoutPanel';
import useAlerts from '../hooks/useAlerts';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Play, Square, Activity, ShieldCheck, ListChecks, Info } from 'lucide-react';

const AnalysisPanel = () => {
  const { running, pid, started_at, loading, startAlerts, stopAlerts } = useAlerts();
  const { subscribedAssetKeys } = useMarketStore();
  const { settings, updateSection } = useSettingsStore();

  const handleToggleDispatcher = async () => {
    if (running) {
      await stopAlerts();
    } else {
      await startAlerts(subscribedAssetKeys, settings.alerts?.enableTickLogging);
    }
  };

  return (
    <div className="col-span-3 flex flex-col gap-3 h-full min-h-0 bg-dashboard-bg p-2 custom-scrollbar overflow-y-auto">
      {/* 92% Payout Assets Section */}
      <div className="flex-none min-h-[40px] max-h-[40%] overflow-hidden rounded-xl border border-border-primary">
        <AssetPayoutPanel
          showControls={false}
          defaultIsTopCollapsed={true}
          initialTopHeight={0}
        />
      </div>

      {/* Realtime Analytics Control Card */}
      <Card className="p-4 rounded-xl flex-none quflx-section-light border border-border-primary shadow-lg overflow-hidden relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className={running ? "text-accent-green animate-pulse" : "text-text-secondary"} size={18} />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">Realtime Analytics</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${running ? "bg-accent-green/20 text-accent-green" : "bg-red-500/20 text-red-400"
              }`}>
              {running ? "Active" : "Stopped"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-card-bg/50 p-3 rounded-lg border border-border-primary/30">
            <p className="text-[10px] text-text-secondary uppercase font-semibold mb-1">Process ID</p>
            <p className="text-sm font-mono text-text-primary">{pid || "---"}</p>
          </div>
          <div className="bg-card-bg/50 p-3 rounded-lg border border-border-primary/30">
            <p className="text-[10px] text-text-secondary uppercase font-semibold mb-1">Uptime</p>
            <p className="text-sm font-mono text-text-primary">
              {started_at ? new Date(started_at).toLocaleTimeString() : "---"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-card-bg/30 rounded-lg border border-border-primary/20">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-accent-blue" size={16} />
              <div>
                <p className="text-xs font-semibold text-text-primary">AI Confirmation</p>
                <p className="text-[10px] text-text-secondary">Verify alerts before dispatch</p>
              </div>
            </div>
            <NeomorphicSwitch
              checked={settings.alerts?.enableAIConfirm || false}
              onChange={() => updateSection('alerts', { enableAIConfirm: !settings.alerts?.enableAIConfirm })}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleDispatcher}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all font-bold text-sm shadow-md ${running
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40"
                  : "bg-accent-green text-black hover:opacity-90 border border-accent-green/50"
                } disabled:opacity-50`}
            >
              {running ? <><Square size={16} fill="currentColor" /> Stop Scanner</> : <><Play size={16} fill="currentColor" /> Start Scanner</>}
            </button>
          </div>
        </div>
      </Card>

      {/* Monitoring Whitelist Card */}
      <Card className="p-4 rounded-xl flex-1 quflx-section-light border border-border-primary shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border-primary/30">
          <div className="flex items-center gap-2">
            <ListChecks className="text-accent-blue" size={18} />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-tight">Monitoring Pool</h3>
          </div>
          <span className="text-[10px] font-bold text-text-secondary bg-section-bg px-2 py-0.5 rounded border border-border-primary">
            {subscribedAssetKeys.length} Assets
          </span>
        </div>

        {subscribedAssetKeys.length > 0 ? (
          <div className="space-y-1">
            {subscribedAssetKeys.map(asset => (
              <div key={asset} className="flex items-center justify-between py-1.5 px-2 hover:bg-card-bg/50 rounded transition-colors group">
                <span className="text-xs font-mono text-text-primary tracking-wide">{asset}</span>
                <span className="text-[9px] text-accent-green opacity-0 group-hover:opacity-100 font-bold uppercase tracking-widest transition-opacity">Streaming</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center text-center opacity-60">
            <Info className="text-text-secondary mb-2" size={24} />
            <p className="text-xs text-text-secondary">No assets selected.<br />Enable ticker in Payout Panel.</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AnalysisPanel;

