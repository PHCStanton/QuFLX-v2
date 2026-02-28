import { useState } from 'react';
import CollapsiblePanel from './CollapsiblePanel';
import AssetPayoutPanel from './AssetPayoutPanel';
import useAlerts from '../hooks/useAlerts';
import useMarketStore from '../store/marketStore';
import useSettingsStore from '../store/settingsStore';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Play, Square, Activity, ShieldCheck, ListChecks, Info, Trash2, X, Loader2 as Loader } from 'lucide-react';

const AnalysisPanel = () => {
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
      <CollapsiblePanel
        id="analysis-assets"
        title="92% Payout Assets"
        defaultOpen={false}
        expandable={true}
        className="bg-section-bg"
      >
        <div className="overflow-hidden rounded-lg">
          <AssetPayoutPanel
            showControls={false}      
          />
        </div>
      </CollapsiblePanel>

      {/* Real-time Analytics Section */}
      <CollapsiblePanel
        id="analysis-realtime-analytics"
        title="Real-time Analytics"
        expandable={true}
        className="bg-section-bg"
        headerRight={
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isHeartbeatActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
            <span className="text-[10px] font-medium text-text-secondary uppercase tracking-tight">
              {isHeartbeatActive ? 'Dispatcher Active' : 'Standby'}
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-card-bg/50 border border-border-primary rounded-xl flex items-center justify-between group hover:border-accent-primary/50 transition-all">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${running ? 'bg-accent-primary/20 text-accent-primary' : 'bg-white/5 text-text-secondary'}`}>
                  <Activity size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Analysis Engine</p>
                  <p className="text-sm font-bold text-text-primary">{running ? 'RUNNING' : 'STOPPED'}</p>
                </div>
              </div>
              <button
                onClick={handleToggleDispatcher}
                disabled={loading}
                className={`p-2.5 rounded-xl transition-all duration-300 ${running
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : 'bg-accent-primary/10 text-accent-primary hover:bg-accent-primary hover:text-black shadow-[0_0_15px_rgba(102,148,255,0.2)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={running ? 'Stop Dispatcher' : 'Start Dispatcher'}
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : (running ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />)}
              </button>
            </div>

            <div className="p-3 bg-card-bg/50 border border-border-primary rounded-xl flex items-center gap-3 group hover:border-accent-primary/50 transition-all">
              <div className={`p-2 rounded-lg ${isHeartbeatActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-text-secondary'}`}>
                <ShieldCheck size={18} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Health Status</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-text-primary truncate" title={heartbeatTitle}>
                    {isHeartbeatActive ? 'HEALTHY' : 'STANDBY'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-card-bg/50 border border-border-primary rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-accent-primary" />
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Engine Information</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Process ID:</span>
                <span className="text-text-primary font-mono bg-white/5 px-2 py-0.5 rounded">{pid || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Started At:</span>
                <span className="text-text-primary">{started_at ? new Date(started_at).toLocaleTimeString() : 'Not running'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Scan Interval:</span>
                <span className="text-text-primary font-bold text-accent-primary">{scanIntervalSeconds}s</span>
              </div>
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      {/* Monitor Pool Section */}
      <CollapsiblePanel
        id="analysis-monitoring-pool"
        title="Monitoring Pool"
        expandable={true}
        className="bg-section-bg"
        headerLeft={
          <div className="flex items-center gap-2">
            <ListChecks size={18} className="text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-primary">Monitor Pool</h4>
            <span className="px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary text-[10px] font-bold">
              {monitoredAssets.length}
            </span>
          </div>
        }
        headerRight={
          <button
            onClick={handleClearMonitorPool}
            disabled={!monitoredAssets.length}
            className="p-1.5 text-text-secondary hover:text-red-400 disabled:opacity-30 transition-colors"
            title="Clear All"
          >
            <Trash2 size={16} />
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar max-h-[300px] pr-1">
          {monitoredAssets.length > 0 ? (
            monitoredAssets.map((asset) => {
              const isWhitelisted = heartbeatAssetsWhitelisted.includes(asset);
              const isKnown = heartbeatAssetsKnown.includes(asset);
              const isScanned = heartbeatAssetsScanned.includes(asset);
              const isStreaming = isHeartbeatActive && isScanned;
              const lastAlert = latestAlertByAsset[asset];
              
              return (
                <div
                  key={asset}
                  onClick={() => setSelectedAsset(asset)}
                  className={`group relative flex items-center gap-2 px-3 py-2 bg-card-bg/50 border ${isStreaming ? 'border-green-500/30' : 'border-border-primary'} rounded-xl cursor-pointer hover:border-accent-primary transition-all overflow-hidden`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-text-secondary/30'}`} />
                  <span className="text-xs font-bold text-text-primary">{asset}</span>
                  
                  {lastAlert && (
                    <span className={`w-1.5 h-1.5 rounded-full ${lastAlert.direction === 'CALL' ? 'bg-green-400' : 'bg-red-400'}`} />
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMonitoredAsset(asset);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-text-secondary hover:text-red-400 rounded-lg transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="w-full py-8 text-center border border-dashed border-border-primary rounded-xl">
              <p className="text-xs text-text-secondary italic">No assets in monitoring pool</p>
              <p className="text-[10px] text-text-secondary/60 mt-1">Add assets from Payout list to begin scanning</p>
            </div>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
};

export default AnalysisPanel;
