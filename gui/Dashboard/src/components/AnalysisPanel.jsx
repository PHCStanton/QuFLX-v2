import { useState } from 'react';
import { CollapsibleCard } from './Card';
import AssetPayoutPanel from './AssetPayoutPanel';
import useAlerts from '../hooks/useAlerts';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Play, Square, Activity, ShieldCheck, ListChecks, Info } from 'lucide-react';

const AnalysisPanel = () => {
  const [isPoolOpen, setIsPoolOpen] = useState(false);

  const { running, pid, started_at, loading, startAlerts, stopAlerts } = useAlerts();
  const { subscribedAssetKeys, alertFeed, setSelectedAsset, scanHeartbeat, addMonitoredAsset } = useMarketStore();
  const { settings, updateSection } = useSettingsStore();

  const isHeartbeatActive = scanHeartbeat && (Date.now() - scanHeartbeat.receivedAt < 120000);

  const latestAlertByAsset = alertFeed.reduce((acc, alert) => {
    acc[alert.asset] = alert;
    return acc;
  }, {});

  const combinedAssets = Array.from(new Set([
    ...subscribedAssetKeys,
    ...alertFeed.map(alert => alert.asset)
  ]));

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

      <CollapsibleCard
        className="p-4 rounded-xl flex-none quflx-section-light border border-border-primary shadow-lg overflow-hidden relative"
        headerClassName="mb-4"
        // ... (Realtime Analytics Props)
        headerLeft={
          <>
            <Activity className={running ? "text-accent-green animate-pulse" : "text-text-secondary"} size={18} />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">Realtime Analytics</h3>
          </>
        }
        headerRight={
          <>
            {running && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card-bg/50 border border-border-primary/50 group cursor-help transition-all"
                title={scanHeartbeat
                  ? `Last Scan (${scanHeartbeat.scan_duration_ms}ms) | Active: ${scanHeartbeat.assets_scanned?.join(', ') || 'None'} | Whitelist: ${scanHeartbeat.assets_whitelisted?.join(', ') || 'None'}`
                  : "Waiting for heartbeat..."
                }
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isHeartbeatActive ? "bg-accent-green animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-text-secondary"}`} />
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
                  {isHeartbeatActive ? "Sync" : "Stale"}
                </span>
              </div>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${running ? "bg-accent-green/20 text-accent-green" : "bg-red-500/20 text-red-400"
              }`}>
              {running ? "Active" : "Stopped"}
            </span>
          </>
        }
      >
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
      </CollapsibleCard>

      <CollapsibleCard
        isOpen={isPoolOpen}
        onToggle={() => setIsPoolOpen(!isPoolOpen)}
        className={`p-3 rounded-xl flex-none quflx-section-light border border-border-primary shadow-sm overflow-y-auto transition-all duration-300 ${isPoolOpen ? 'max-h-[600px]' : 'max-h-[60px]'
          }`}
        headerClassName="mb-4 pb-2 border-b border-border-primary/30"
        headerLeft={
          <>
            <ListChecks className="text-accent-blue" size={18} />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-tight">Monitoring Pool</h3>
          </>
        }
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-secondary bg-section-bg px-2 py-0.5 rounded border border-border-primary">
              {subscribedAssetKeys.length} Assets
            </span>
            <span className="text-[10px] font-bold text-text-secondary bg-section-bg px-2 py-0.5 rounded border border-border-primary">
              Signals {alertFeed.length}
            </span>
          </div>
        }
      >
        {combinedAssets.length > 0 ? (
          <div className="space-y-1">
            {combinedAssets.map(asset => {
              const isConfirmed = scanHeartbeat?.assets_scanned?.includes(asset);
              const alert = latestAlertByAsset[asset];
              const isSignal = Boolean(alert);

              return (
                <div
                  key={asset}
                  onClick={() => {
                    addMonitoredAsset(asset);
                    setSelectedAsset(asset);
                  }}
                  className={`p-2 rounded transition-all border border-border-primary/20 hover:border-accent-blue/40 cursor-pointer ${isSignal ? "" : "hover:bg-card-bg/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${isSignal
                          ? alert.direction === 'CALL'
                            ? "bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                            : "bg-red-500/70"
                          : isConfirmed
                            ? "bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse"
                            : "bg-yellow-500/50"
                          }`}
                        title={isSignal ? "Signal Identified" : isConfirmed ? "Active Monitoring" : "Pending / Connecting..."}
                      />
                      <span className={`text-xs font-mono tracking-wide ${isSignal || isConfirmed ? "text-text-primary" : "text-text-secondary"}`}>
                        {asset}
                      </span>
                      {isSignal && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-accent-blue">
                          Signal
                        </span>
                      )}
                    </div>
                    {isSignal ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-1.5 rounded ${alert.direction === 'CALL' ? 'bg-accent-green text-black' : 'bg-red-500 text-white'
                          }`}>
                          {alert.direction}
                        </span>
                        <span className="text-[9px] font-mono text-text-secondary">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <span className={`text-[9px] font-bold uppercase tracking-widest transition-opacity ${isConfirmed ? "text-accent-green opacity-100" : "text-yellow-500 opacity-80"
                        }`}>
                        {isConfirmed ? "Active" : "Pending"}
                      </span>
                    )}
                  </div>
                  {isSignal && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary truncate max-w-[140px]">{alert.regime}</span>
                      <div className="flex gap-2 overflow-x-hidden">
                        <div className="bg-card-bg px-1.5 py-0.5 rounded text-[9px] text-text-secondary border border-border-primary/30">
                          {alert.expiry}
                        </div>
                        <div className="bg-card-bg px-1.5 py-0.5 rounded text-[9px] text-text-secondary border border-border-primary/30">
                          Score: {alert.confluence}
                        </div>
                        {alert.ai_confirmed && (
                          <div className="bg-accent-blue/10 px-1.5 py-0.5 rounded text-[9px] text-accent-blue border border-accent-blue/20">
                            AI ✓
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center text-center opacity-60">
            <Info className="text-text-secondary mb-2" size={24} />
            <p className="text-xs text-text-secondary">No assets selected.<br />Enable ticker in Payout Panel.</p>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
};

export default AnalysisPanel;
