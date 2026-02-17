import { useState } from 'react';
import { CollapsibleCard } from './Card';
import AssetPayoutPanel from './AssetPayoutPanel';
import useAlerts from '../hooks/useAlerts';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Play, Square, Activity, ShieldCheck, ListChecks, Info, Trash2, X } from 'lucide-react';

const AnalysisPanel = () => {
  const [isPoolOpen, setIsPoolOpen] = useState(false);

  const { running, pid, started_at, loading, startAlerts, stopAlerts } = useAlerts();
  const {
    monitoringAssetKeys,
    alertFeed,
    setSelectedAsset,
    scanHeartbeat,
    addMonitoredAsset,
    removeMonitoredAsset,
    clearMonitoringAssets,
    marketData
  } = useMarketStore();
  const { settings, updateSection } = useSettingsStore();

  const alertsSettings = settings.alerts || {};
  const scanIntervalSeconds = typeof alertsSettings.scanIntervalSeconds === 'number' ? alertsSettings.scanIntervalSeconds : 60;

  const isHeartbeatActive = scanHeartbeat && (Date.now() - scanHeartbeat.receivedAt < Math.max(120000, scanIntervalSeconds * 3000));
  const notStreamingWindowMs = Math.max(15000, scanIntervalSeconds * 1000);
  const monitoredAssets = Array.isArray(monitoringAssetKeys) ? monitoringAssetKeys : [];
  const alertFeedList = Array.isArray(alertFeed) ? alertFeed : [];
  const heartbeatAssetsScanned = scanHeartbeat && Array.isArray(scanHeartbeat.assets_scanned) ? scanHeartbeat.assets_scanned : [];
  const heartbeatAssetsKnown = scanHeartbeat && Array.isArray(scanHeartbeat.assets_known) ? scanHeartbeat.assets_known : [];
  const heartbeatAssetsWhitelisted = scanHeartbeat && Array.isArray(scanHeartbeat.assets_whitelisted) ? scanHeartbeat.assets_whitelisted : [];

  const latestAlertByAsset = alertFeedList.reduce((acc, alert) => {
    acc[alert.asset] = alert;
    return acc;
  }, {});

  const heartbeatTitle = scanHeartbeat
    ? `Last Scan (${scanHeartbeat.scan_duration_ms}ms) | Active: ${heartbeatAssetsScanned.length ? heartbeatAssetsScanned.join(', ') : 'None'} | Whitelist: ${heartbeatAssetsWhitelisted.length ? heartbeatAssetsWhitelisted.join(', ') : 'None'}`
    : 'Waiting for heartbeat...';

  const handleToggleDispatcher = async () => {
    if (running) {
      await stopAlerts();
    } else {
      let assetsToMonitor = [...monitoredAssets];
      
      // Auto-populate from payout assets if pool is empty (Fix #5)
      if (assetsToMonitor.length === 0) {
        const { payoutAssets } = useMarketStore.getState();
        if (payoutAssets && payoutAssets.length > 0) {
          console.log('[AnalysisPanel] Auto-populating Monitor Pool from payout assets:', payoutAssets);
          payoutAssets.forEach(asset => addMonitoredAsset(asset));
          assetsToMonitor = useMarketStore.getState().monitoringAssetKeys;
        } else {
          // Empty pool guard (Fix #6)
          alert('Monitor Pool is empty and no payout assets available. Please add assets to monitor first.');
          return;
        }
      }
      
      const success = await startAlerts(assetsToMonitor, alertsSettings.enableTickLogging);
      if (success) {
        // Emit whitelist immediately so backend doesn't stay in standby
        useMarketStore.getState().publishMonitoringAssets();
        
        // Retry whitelist publish with delays to catch dispatcher startup (Fix #4)
        setTimeout(() => {
          useMarketStore.getState().publishMonitoringAssets();
        }, 3000);
        setTimeout(() => {
          useMarketStore.getState().publishMonitoringAssets();
        }, 8000);
      }
    }
  };

  const handleClearMonitorPool = (event) => {
    event.stopPropagation();
    if (!monitoredAssets.length) return;
    const confirmed = window.confirm('Clear Monitor Pool?');
    if (!confirmed) return;
    clearMonitoringAssets({ preserveSelected: true });
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
                title={heartbeatTitle}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isHeartbeatActive ? "bg-accent-green animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-text-secondary"}`} />
                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
                  {isHeartbeatActive ? "Sync" : "Stale"}
                </span>
              </div>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${running ? "bg-accent-green/20 text-accent-green" : "bg-red-500/20 text-red-400"
              }`}>
              {running ? "Scanning" : "Stopped"}
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
              checked={alertsSettings.enableAIConfirm === true}
              onChange={() => updateSection('alerts', { enableAIConfirm: !alertsSettings.enableAIConfirm })}
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

      <div data-testid="monitoring-pool">
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
                {monitoredAssets.length} Assets
              </span>
              <span className="text-[10px] font-bold text-text-secondary bg-section-bg px-2 py-0.5 rounded border border-border-primary">
                Signals {alertFeedList.length}
              </span>
              <button
                type="button"
                onClick={handleClearMonitorPool}
                aria-label="Clear Monitor Pool"
                className="text-[10px] font-bold text-text-secondary bg-section-bg px-2 py-0.5 rounded border border-border-primary hover:border-accent-blue/60 hover:text-text-primary transition-colors"
              >
                <span className="flex items-center gap-1">
                  <Trash2 size={12} />
                  Clear
                </span>
              </button>
            </div>
          }
        >
          {monitoredAssets.length > 0 ? (
            <div className="space-y-1">
              {monitoredAssets.map(asset => {
                const isConfirmed = heartbeatAssetsScanned.includes(asset);
                const alert = latestAlertByAsset[asset];
                const isSignal = Boolean(alert);
                const isMissingHistory = heartbeatAssetsKnown.length ? !heartbeatAssetsKnown.includes(asset) : false;
                const assetTicks = marketData && marketData[asset] ? marketData[asset] : [];
                const lastTick = assetTicks.length ? assetTicks[assetTicks.length - 1] : null;
                const lastTickTimestamp = lastTick && typeof lastTick.receivedAt === 'number' ? lastTick.receivedAt : 0;
                const isStreaming = lastTickTimestamp && Date.now() - lastTickTimestamp <= notStreamingWindowMs;
                const isNotStreaming = !isStreaming;

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
                          title={isSignal ? "Signal Identified" : isConfirmed ? "Scanning" : "Pending / Connecting..."}
                        />
                        <span className={`text-xs font-mono tracking-wide ${isSignal || isConfirmed ? "text-text-primary" : "text-text-secondary"}`}>
                          {asset}
                        </span>
                        {isSignal && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-accent-blue">
                            Signal
                          </span>
                        )}
                        {isMissingHistory && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-400">
                            Missing History
                          </span>
                        )}
                        {isNotStreaming && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">
                            No Live Data
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isSignal ? (
                          <>
                            <span className={`text-[10px] font-black px-1.5 rounded ${alert.direction === 'CALL' ? 'bg-accent-green text-black' : 'bg-red-500 text-white'
                              }`}>
                              {alert.direction}
                            </span>
                            <span className="text-[9px] font-mono text-text-secondary">
                              {new Date(alert.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </>
                        ) : (
                          <span className={`text-[9px] font-bold uppercase tracking-widest transition-opacity ${isConfirmed ? "text-accent-green opacity-100" : "text-yellow-500 opacity-80"
                            }`}>
                            {isConfirmed ? "Scanning" : "Pending"}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeMonitoredAsset(asset);
                          }}
                          aria-label={`Remove ${asset}`}
                          className="p-1 rounded border border-border-primary/40 text-text-secondary hover:text-text-primary hover:border-accent-blue/60 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
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
              <p className="text-xs text-text-secondary">No monitored assets yet.<br />Click an asset to add it.</p>
            </div>
          )}
        </CollapsibleCard>
      </div>
    </div>
  );
};

export default AnalysisPanel;
