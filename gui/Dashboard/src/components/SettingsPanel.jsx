import { useEffect, useMemo, useRef, useState } from 'react';
import useTradingStore from '../store/tradingStore';
import useSettingsStore from '../store/settingsStore';
import useMarketStore from '../store/marketStore';
import useProfileStore from '../store/profileStore';
import useUserStore from '../store/userStore';
import CollapsiblePanel from './CollapsiblePanel';
import {
  SettingRow,
  SliderInput,
  DropdownInput,
  RadioGroup
} from './Settings/SettingsPrimitives';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Save, RotateCcw, Download } from 'lucide-react';
import { QFLX_PERSIST_KEYS } from '../store/persistMiddleware';
import { indicatorOptions } from '../config/chartOptions';
import useTextToSpeech from '../utils/useTextToSpeech';

const SettingsPanel = () => {
  const { settings, updateSection, resetAll, saveSettings } = useSettingsStore();
  const { connect, isConnecting, connectError, isConnected, isDemoMode,
    hasDemoSsid, hasRealSsid, fetchSsidStatus } = useTradingStore();
  const { activeProfileId, profiles, updateProfile } = useProfileStore();
  const { setActiveTab } = useMarketStore();
  const [demoSsid, setDemoSsid] = useState('');
  const [realSsid, setRealSsid] = useState('');
  const [saveToast, setSaveToast] = useState(false);

  // Fix 5a: Fetch SSID saved-status on mount so badges survive tab switches
  useEffect(() => {
    fetchSsidStatus();
  }, [fetchSsidStatus]);

  const handleConnectDemo = async () => {
    if (!demoSsid.trim()) return;
    await connect(demoSsid.trim(), true);
    setDemoSsid('');
  };

  const handleConnectReal = async () => {
    if (!realSsid.trim()) return;
    await connect(realSsid.trim(), false);
    setRealSsid('');
  };

  const { assetFilterState, setAssetFilterState, activeIndicators, setActiveIndicators } = useMarketStore();
  const { user, updateUser } = useUserStore();
  const sidebarSkinFileInputRef = useRef(null);
  const [sidebarSkinError, setSidebarSkinError] = useState('');
  const dashboardBgFileInputRef = useRef(null);
  const [dashboardBgError, setDashboardBgError] = useState('');

  const { supported: ttsSupported, voices: ttsVoices } = useTextToSpeech();

  const ttsVoiceOptions = useMemo(() => {
    const base = [{ label: 'System default', value: '' }];
    if (!ttsSupported) return base;
    if (!Array.isArray(ttsVoices) || !ttsVoices.length) return base;
    const mapped = ttsVoices
      .filter((v) => v && typeof v.voiceURI === 'string')
      .map((v) => ({
        label: `${v.name || 'Voice'}${v.lang ? ` (${v.lang})` : ''}`,
        value: v.voiceURI,
      }));
    return [...base, ...mapped];
  }, [ttsSupported, ttsVoices]);

  const indicatorPresetOptions = useMemo(
    () => [
      { label: 'Custom (keep current)', value: 'custom' },
      { label: 'None', value: 'none' },
      { label: 'Trend (EMA + SuperTrend + BBands)', value: 'trend' },
      { label: 'Momentum (RSI + MACD Histogram)', value: 'momentum' },
    ],
    []
  );

  const applyIndicatorPreset = (presetId) => {
    if (presetId === 'custom') {
      return;
    }

    if (presetId === 'none') {
      setActiveIndicators([]);
      return;
    }

    const keysByPreset = {
      trend: ['ema', 'supertrend', 'bollinger_bands'],
      momentum: ['rsi', 'macd_histogram'],
    };

    const desired = keysByPreset[presetId] || [];
    const metas = desired
      .map((value) => indicatorOptions.find((o) => o.value === value))
      .filter(Boolean);

    const next = metas.map((meta) => {
      const value =
        meta.displayValue ||
        (meta.params
          ? Object.values(meta.params)
            .filter((v) => v !== undefined && v !== null)
            .join(',')
          : 'Default');

      return {
        id: `${presetId}-${meta.value}`,
        name: meta.label,
        value,
        type: meta.value,
        key: meta.key,
        kind: meta.kind,
        source: meta.source || 'backend',
        params: meta.params || {},
        paramConfig: meta.paramConfig || []
      };
    });

    setActiveIndicators(next);
  };

  const sidebarSkinPreviewUrl = useMemo(() => {
    return settings.global.sidebarSkinDataUrl || '';
  }, [settings.global.sidebarSkinDataUrl]);

  const handleSave = async () => {
    // Fix 6: Save & Close — save settings, flush to active profile, show toast, navigate away
    const success = await saveSettings();
    if (success) {
      // Immediate flush to active profile JSON (profile system debounces normally,
      // but "Save & Close" must be instant before navigating away)
      if (activeProfileId) {
        await updateProfile(activeProfileId, { settings });
      }
      // Show inline toast with active profile name
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
      // Navigate away (the "Close" part)
      setTimeout(() => setActiveTab('analysis'), 600);
    }
  };

  const handleExportConfig = () => {
    // Fix 7: Export current settings as a named JSON file
    const profileName = profiles.find((p) => p.id === activeProfileId)?.name || 'Default';
    const date = new Date().toISOString().slice(0, 10);
    const payload = JSON.stringify(
      { profileName, exportedAt: new Date().toISOString(), settings },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QuFLX_Settings_${profileName}_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetAllPersisted = () => {
    const ok = window.confirm(
      'This will reset QuFLX settings to defaults, clear all locally persisted QuFLX state, and reload the page. Continue?'
    );
    if (!ok) return;

    try {
      resetAll();
    } catch (err) {
      console.error('Failed to reset settings state:', err);
    }

    try {
      const knownKeys = Object.values(QFLX_PERSIST_KEYS);
      knownKeys.forEach((key) => {
        try {
          window.localStorage.removeItem(key);
        } catch (err) {
          console.warn(`Failed to remove localStorage key: ${key}`, err);
        }
      });

      try {
        const extraKeys = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (!key) continue;
          if (key.startsWith('quflx-') || key.startsWith('quflx.') || key.startsWith('quflx:')) {
            extraKeys.push(key);
          }
        }
        extraKeys.forEach((key) => {
          try {
            window.localStorage.removeItem(key);
          } catch (err) {
            console.warn(`Failed to remove localStorage key: ${key}`, err);
          }
        });
      } catch (err) {
        console.warn('Failed to enumerate localStorage keys:', err);
      }
    } catch (err) {
      console.error('Failed to clear local persisted state:', err);
    }

    try {
      window.location.reload();
    } catch (err) {
      console.error('Failed to reload page after reset:', err);
    }
  };

  const handleSidebarSkinUpload = (file) => {
    if (!file) return;

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setSidebarSkinError('Please upload a JPG, PNG, or WebP image.');
      return;
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setSidebarSkinError('Image is too large. Please use an image under 2MB.');
      return;
    }

    setSidebarSkinError('');

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setSidebarSkinError('Could not read that image.');
        return;
      }
      updateSection('global', { sidebarSkinDataUrl: result });
    };
    reader.onerror = () => {
      setSidebarSkinError('Could not read that image.');
    };
    reader.readAsDataURL(file);
  };

  const handleSidebarSkinClear = () => {
    updateSection('global', { sidebarSkinDataUrl: null });
    setSidebarSkinError('');
    if (sidebarSkinFileInputRef.current) {
      sidebarSkinFileInputRef.current.value = '';
    }
  };

  const handleDashboardBgUpload = (file) => {
    if (!file) return;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setDashboardBgError('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    const maxBytes = 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      setDashboardBgError('Image is too large. Please use an image under 4MB.');
      return;
    }
    setDashboardBgError('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) { setDashboardBgError('Could not read that image.'); return; }
      updateSection('global', { dashboardBgDataUrl: result });
    };
    reader.onerror = () => setDashboardBgError('Could not read that image.');
    reader.readAsDataURL(file);
  };

  const handleDashboardBgClear = () => {
    updateSection('global', { dashboardBgDataUrl: null });
    setDashboardBgError('');
    if (dashboardBgFileInputRef.current) {
      dashboardBgFileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-dashboard-bg overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto w-full space-y-6">

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-3">
            <span className="text-accent-green">⚙️</span> SETTINGS
          </h1>
          <div className="flex items-center gap-3">
            {/* Fix 6: Inline save toast */}
            {saveToast && (
              <span className="text-xs font-bold text-accent-green animate-in fade-in duration-300 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30">
                ✓ Saved to {profiles.find((p) => p.id === activeProfileId)?.name || 'Profile'}
              </span>
            )}
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-4 py-2 bg-section-bg hover:bg-section-bg/80 text-text-primary rounded-lg transition-colors text-sm font-medium border border-border-primary shadow-sm"
            >
              <RotateCcw size={16} /> Reset All
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-accent-green hover:opacity-90 text-text-primary rounded-lg transition-colors text-sm font-bold shadow-lg shadow-accent-green/20"
            >
              <Save size={16} /> Save & Close
            </button>
          </div>
        </div>

        {/* User Account — includes SSID management (moved from Exchange Connection panel) */}
        <CollapsiblePanel
          id="settings-user-account"
          title="User Account"
          defaultOpen={false}
          bodyClassName="flex flex-col gap-6 p-4"
        >
          {/* Identity fields — 2-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SettingRow label="Display Name" description="How you appear in the platform">
              <input
                type="text"
                value={user?.name || ''}
                onChange={(e) => updateUser({ name: e.target.value })}
                className="bg-section-bg border border-border-primary rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
              />
            </SettingRow>
            <SettingRow label="Email Address" description="Primary contact and login email">
              <input
                type="email"
                value={user?.email || ''}
                onChange={(e) => updateUser({ email: e.target.value })}
                className="bg-section-bg border border-border-primary rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
              />
            </SettingRow>
            <SettingRow label="Account Tier" description="Your current subscription level">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-accent-blue/20 text-accent-blue text-[10px] font-bold uppercase tracking-wider">
                  {user?.tier || 'Standard'}
                </span>
              </div>
            </SettingRow>
          </div>

          {/* Divider */}
          <div className="border-t border-border-primary/50" />

          {/* SSID Management */}
          <div className="p-3 rounded bg-accent-blue/10 border border-accent-blue/30 text-xs text-text-secondary">
            <p className="mb-1 font-bold text-accent-blue">Pocket Option SSID Management</p>
            <p>Paste your SSID cookie below. "Connect &amp; Save" will verify it and persist it to your local environment file.</p>
          </div>

          <SettingRow
            label="Demo Account SSID"
            description="Pocket Option SSID for Demo trading"
          >
            <div className="flex flex-col gap-2 w-full">
              {hasDemoSsid && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent-green/10 border border-accent-green/30 w-fit">
                  <span className="text-[10px] font-black text-accent-green">✓ Demo SSID saved</span>
                  <span className="text-[9px] text-text-secondary opacity-60">— paste new to replace</span>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={demoSsid}
                  onChange={(e) => setDemoSsid(e.target.value)}
                  placeholder={hasDemoSsid ? 'SSID saved — paste new to replace' : 'Paste Demo SSID...'}
                  className="flex-1 bg-card-bg border border-border-primary rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
                />
                <button
                  onClick={handleConnectDemo}
                  disabled={isConnecting || !demoSsid.trim()}
                  className="px-4 py-2 bg-accent-blue/20 text-accent-blue border border-accent-blue/50 rounded text-xs font-bold hover:bg-accent-blue/30 disabled:opacity-50"
                >
                  {isConnecting ? '...' : 'Connect & Save'}
                </button>
              </div>
              {isConnected && isDemoMode && <span className="text-[10px] text-accent-green font-bold">✓ Connected to Demo</span>}
            </div>
          </SettingRow>

          <SettingRow
            label="Real Account SSID"
            description="Pocket Option SSID for Real trading"
          >
            <div className="flex flex-col gap-2 w-full">
              {hasRealSsid && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#ff4757]/10 border border-[#ff4757]/30 w-fit">
                  <span className="text-[10px] font-black text-[#ff4757]">✓ Real SSID saved</span>
                  <span className="text-[9px] text-text-secondary opacity-60">— paste new to replace</span>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={realSsid}
                  onChange={(e) => setRealSsid(e.target.value)}
                  placeholder={hasRealSsid ? 'SSID saved — paste new to replace' : 'Paste Real SSID...'}
                  className="flex-1 bg-card-bg border border-border-primary rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
                />
                <button
                  onClick={handleConnectReal}
                  disabled={isConnecting || !realSsid.trim()}
                  className="px-4 py-2 bg-[#ff4757]/20 text-[#ff4757] border border-[#ff4757]/50 rounded text-xs font-bold hover:bg-[#ff4757]/30 disabled:opacity-50"
                >
                  {isConnecting ? '...' : 'Connect & Save'}
                </button>
              </div>
              {isConnected && !isDemoMode && <span className="text-[10px] text-[#ff4757] font-bold">✓ Connected to Real</span>}
            </div>
          </SettingRow>

          {connectError && (
            <div className="p-3 rounded bg-[#ff4757]/10 border border-[#ff4757]/30 text-xs text-[#ff4757]">
              Error: {connectError}
            </div>
          )}
        </CollapsiblePanel>

        {/* Global Settings */}
        <CollapsiblePanel
          id="settings-global"
          title="Global Settings"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Theme" description="Overall appearance of the dashboard">
            <DropdownInput
              value={settings.global.theme}
              options={[
                { label: 'System Default', value: 'system' },
                { label: 'Dark Mode', value: 'dark' },
                { label: 'Orange Dark', value: 'orange-dark' },
                { label: 'Ironman', value: 'ironman' },
                { label: 'Black & White', value: 'black-white' }
              ]}
              onChange={(val) => updateSection('global', { theme: val })}
            />
          </SettingRow>
          <SettingRow label="Add Sidebar Image" description="Upload a 16:9 image for the sidebar background">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <input
                  ref={sidebarSkinFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleSidebarSkinUpload(e.target.files?.[0] || null)}
                  className="text-xs text-text-secondary"
                />
                <button
                  type="button"
                  onClick={handleSidebarSkinClear}
                  disabled={!settings.global.sidebarSkinDataUrl}
                  className="px-3 py-2 rounded bg-section-bg hover:bg-section-bg/80 text-text-primary text-xs font-medium border border-border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
              {sidebarSkinError && (
                <div className="text-xs text-red-400">{sidebarSkinError}</div>
              )}
              {sidebarSkinPreviewUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={sidebarSkinPreviewUrl}
                    alt="Sidebar image preview"
                    className="w-28 h-16 rounded border border-border-primary object-cover"
                  />
                  <div className="text-xs text-text-secondary">
                    Applied to the left sidebar background.
                  </div>
                </div>
              )}
            </div>
          </SettingRow>
          <SettingRow label="Add Background" description="Upload a tiling image for the main dashboard background">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <input
                  ref={dashboardBgFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleDashboardBgUpload(e.target.files?.[0] || null)}
                  className="text-xs text-text-secondary"
                />
                <button
                  type="button"
                  onClick={handleDashboardBgClear}
                  disabled={!settings.global.dashboardBgDataUrl}
                  className="px-3 py-2 rounded bg-section-bg hover:bg-section-bg/80 text-text-primary text-xs font-medium border border-border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
              {dashboardBgError && (
                <div className="text-xs text-red-400">{dashboardBgError}</div>
              )}
              {settings.global.dashboardBgDataUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={settings.global.dashboardBgDataUrl}
                    alt="Dashboard background preview"
                    className="w-28 h-16 rounded border border-border-primary object-cover"
                  />
                  <div className="text-xs text-text-secondary">
                    Custom background active — overrides the default texture.
                  </div>
                </div>
              )}
            </div>
          </SettingRow>
          <SettingRow label="Language" description="Interface language">
            <DropdownInput
              value={settings.global.language}
              options={[
                { label: 'English (EN)', value: 'en' },
                { label: 'Spanish (ES)', value: 'es' },
                { label: 'Russian (RU)', value: 'ru' }
              ]}
              onChange={(val) => updateSection('global', { language: val })}
            />
          </SettingRow>
          <SettingRow label="App Font Size" description="Base font scale (px)">
            <SliderInput
              value={settings.global.fontSize || 13}
              min={10}
              max={20}
              step={1}
              unit="px"
              onChange={(val) => updateSection('global', { fontSize: val })}
            />
          </SettingRow>
          <SettingRow label="Auto-start Collector" description="Start data collection service on launch">
            <NeomorphicSwitch
              checked={settings.global.autoStartCollector}
              onChange={() => updateSection('global', { autoStartCollector: !settings.global.autoStartCollector })}
            />
          </SettingRow>
          <SettingRow label="Auto-start Gateway" description="Start API gateway service on launch">
            <NeomorphicSwitch
              checked={settings.global.autoStartGateway}
              onChange={() => updateSection('global', { autoStartGateway: !settings.global.autoStartGateway })}
            />
          </SettingRow>
        </CollapsiblePanel>

        {/* Automation & Execution */}
        <CollapsiblePanel
          id="settings-automation"
          title="Automation & Execution"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="History Wait Time" description="How long to wait for manual asset click (seconds)">
            <SliderInput
              value={settings.automation.historyWaitTime}
              min={0.5}
              max={5}
              step={0.5}
              unit="s"
              onChange={(val) => updateSection('automation', { historyWaitTime: val })}
            />
          </SettingRow>
          <SettingRow label="Link Timeframe Sync" description="Auto-sync platform timeframe when you change the timeframe">
            <NeomorphicSwitch
              checked={Boolean(settings.automation.linkTimeframeSync)}
              onChange={() =>
                updateSection('automation', {
                  linkTimeframeSync: !settings.automation.linkTimeframeSync
                })
              }
            />
          </SettingRow>
          <SettingRow label="Retry Attempts" description="Max attempts for UI automation tasks">
            <SliderInput
              value={settings.automation.retryAttempts}
              min={0}
              max={5}
              onChange={(val) => updateSection('automation', { retryAttempts: val })}
            />
          </SettingRow>
          <SettingRow label="Retry Delay" description="Delay between automation retries (ms)">
            <SliderInput
              value={settings.automation.retryDelay}
              min={0}
              max={5000}
              step={100}
              unit="ms"
              onChange={(val) => updateSection('automation', { retryDelay: val })}
            />
          </SettingRow>
          <SettingRow label="Auto Refresh Interval" description="Minutes between automatic asset list refreshes">
            <SliderInput
              value={settings.automation.autoRefreshInterval || 5}
              min={1}
              max={60}
              step={1}
              unit="min"
              onChange={(val) => updateSection('automation', { autoRefreshInterval: val })}
            />
          </SettingRow>
        </CollapsiblePanel>

        {/* Analysis & Charting */}
        <CollapsiblePanel
          id="settings-analysis"
          title="Analysis & Charting"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Data Source Mode" description="Controls how chart data is populated">
            <DropdownInput
              value={settings.analysis.dataSourceMode}
              options={[
                { label: 'History + Streaming', value: 'history_and_streaming' },
                { label: 'History Only', value: 'history_only' },
                { label: 'Streaming Only', value: 'streaming_only' }
              ]}
              onChange={(val) => updateSection('analysis', { dataSourceMode: val })}
            />
          </SettingRow>
          <SettingRow label="Default Timeframe" description="Starting timeframe when switching assets">
            <DropdownInput
              value={settings.analysis.defaultTimeframe}
              options={[
                { label: '15s', value: '15s' },
                { label: '1m', value: '1m' },
                { label: '5m', value: '5m' },
                { label: '15m', value: '15m' },
                { label: '1h', value: '1h' }
              ]}
              onChange={(val) => updateSection('analysis', { defaultTimeframe: val })}
            />
          </SettingRow>
          <SettingRow label="Chart Precision" description="Number of decimals for price display">
            <SliderInput
              value={settings.analysis.chartPrecision}
              min={0}
              max={8}
              onChange={(val) => updateSection('analysis', { chartPrecision: val })}
            />
          </SettingRow>
          <SettingRow label="Auto-load Indicators" description="Restore last used indicators on startup">
            <NeomorphicSwitch
              checked={settings.analysis.autoLoadIndicators}
              onChange={() => updateSection('analysis', { autoLoadIndicators: !settings.analysis.autoLoadIndicators })}
            />
          </SettingRow>
          <SettingRow label="Show Indicator Price Labels" description="Show or hide price tags on the ruler for all indicators">
            <NeomorphicSwitch
              checked={settings.analysis.showIndicatorPriceLabels !== false}
              onChange={() => updateSection('analysis', { showIndicatorPriceLabels: settings.analysis.showIndicatorPriceLabels === false })}
            />
          </SettingRow>
          <SettingRow label="Show Chart Tooltip" description="Show or hide the OHLC tooltip when hovering over the chart">
            <NeomorphicSwitch
              checked={settings.analysis.showChartTooltip !== false}
              onChange={() => updateSection('analysis', { showChartTooltip: settings.analysis.showChartTooltip === false })}
            />
          </SettingRow>
          <SettingRow label="Chart Watermark" description="Display the active asset name as a faint watermark on the chart">
            <NeomorphicSwitch
              checked={settings.analysis.showChartWatermark !== false}
              onChange={() => updateSection('analysis', { showChartWatermark: settings.analysis.showChartWatermark === false })}
            />
          </SettingRow>
        </CollapsiblePanel>

        {/* AI Assistant */}
        <CollapsiblePanel
          id="settings-ai"
          title="AI Assistant"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Response Verbosity" description="Detail level of AI analysis">
            <RadioGroup
              value={settings.ai.responseVerbosity}
              options={[
                { label: 'Concise', value: 'concise' },
                { label: 'Balanced', value: 'balanced' },
                { label: 'Detailed', value: 'detailed' }
              ]}
              onChange={(val) => updateSection('ai', { responseVerbosity: val })}
            />
          </SettingRow>
          <SettingRow label="Ask AI Image" description="Select which image is sent with AI queries">
            <DropdownInput
              value={settings.ai.imageSource}
              options={[
                { label: 'None', value: 'none' },
                { label: 'Live Snapshot', value: 'live' },
                { label: 'Latest Annotated Screenshot', value: 'annotated' }
              ]}
              onChange={(val) => updateSection('ai', { imageSource: val })}
            />
          </SettingRow>
          <SettingRow label="Auto-include Context" description="Send market data context with AI queries">
            <NeomorphicSwitch
              checked={settings.ai.autoIncludeContext}
              onChange={() => updateSection('ai', { autoIncludeContext: !settings.ai.autoIncludeContext })}
            />
          </SettingRow>

          <SettingRow label="Voice Input Mode" description="Method for listening to voice commands">
            <DropdownInput
              value={settings.ai.voiceInputMode}
              options={[
                { label: 'Disabled', value: 'off' },
                { label: 'Browser (Free, Local)', value: 'browser' },
                { label: 'Server (Adv, High Quality)', value: 'server' }
              ]}
              onChange={(val) => updateSection('ai', { voiceInputMode: val })}
            />
          </SettingRow>

          <SettingRow label="Voice Read-Back" description="Read AI answers aloud">
            <NeomorphicSwitch
              checked={settings.ai.voiceReadBackEnabled}
              onChange={() => updateSection('ai', { voiceReadBackEnabled: !settings.ai.voiceReadBackEnabled })}
            />
          </SettingRow>

          <SettingRow label="Read-Back Mode" description="Voice engine for reading AI responses">
            <DropdownInput
              value={settings.ai.voiceReadBackMode}
              options={[
                { label: 'Browser (Free, Robotic)', value: 'browser' },
                { label: 'Server (xAI Natural Voice)', value: 'server' }
              ]}
              disabled={!settings.ai.voiceReadBackEnabled}
              onChange={(val) => updateSection('ai', { voiceReadBackMode: val })}
            />
          </SettingRow>

          {settings.ai.voiceReadBackMode === 'server' && (
            <SettingRow label="xAI Voice" description="Natural voice personality">
              <DropdownInput
                value={settings.ai.voiceReadBackVoice}
                options={[
                  { label: 'Ara (Female, Warm)', value: 'Ara' },
                  { label: 'Eve (Female, Calm)', value: 'Eve' },
                  { label: 'Leo (Male, Confident)', value: 'Leo' },
                  { label: 'Orion (Male, Deep)', value: 'Orion' },
                  { label: 'Nova (Female, Energetic)', value: 'Nova' },
                  { label: 'Sage (Neutral, Wise)', value: 'Sage' }
                ]}
                disabled={!settings.ai.voiceReadBackEnabled}
                onChange={(val) => updateSection('ai', { voiceReadBackVoice: val })}
              />
            </SettingRow>
          )}

          {settings.ai.voiceReadBackMode === 'browser' && (
            <>
              <SettingRow label="Voice Rate" description="Speech speed">
                <SliderInput
                  value={settings.ai.voiceReadBackRate}
                  min={0.5}
                  max={2}
                  step={0.1}
                  unit="x"
                  disabled={!settings.ai.voiceReadBackEnabled || !ttsSupported}
                  onChange={(val) => updateSection('ai', { voiceReadBackRate: val })}
                />
              </SettingRow>

              <SettingRow label="Voice Pitch" description="Speech pitch">
                <SliderInput
                  value={settings.ai.voiceReadBackPitch}
                  min={0}
                  max={2}
                  step={0.1}
                  unit=""
                  disabled={!settings.ai.voiceReadBackEnabled || !ttsSupported}
                  onChange={(val) => updateSection('ai', { voiceReadBackPitch: val })}
                />
              </SettingRow>

              <SettingRow label="Browser Voice" description="Select a system voice">
                <DropdownInput
                  value={settings.ai.voiceReadBackVoiceURI || ''}
                  options={ttsVoiceOptions}
                  disabled={!settings.ai.voiceReadBackEnabled || !ttsSupported}
                  onChange={(val) => updateSection('ai', { voiceReadBackVoiceURI: val || null })}
                />
              </SettingRow>
            </>
          )}

          <SettingRow label="Custom Instructions" description="System prompt override for specific trading rules">
            <textarea
              className="w-full h-24 bg-card-bg border border-border-primary rounded p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
              placeholder="e.g. Always use ONLY QuFLX live OTC data. Never external sources..."
              value={settings.ai.customInstructions || ''}
              onChange={(e) => updateSection('ai', { customInstructions: e.target.value })}
            />
          </SettingRow>
        </CollapsiblePanel>

        {/* Alerts & Notifications */}
        <CollapsiblePanel
          id="settings-alerts"
          title="Alerts & Notifications"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Enable AI Confirmation" description="Use AI to verify scanner alerts before dispatching">
            <NeomorphicSwitch
              checked={settings.alerts?.enableAIConfirm || false}
              onChange={() => updateSection('alerts', { enableAIConfirm: !settings.alerts?.enableAIConfirm })}
            />
          </SettingRow>

          <SettingRow label="Min AI Confidence" description="Minimum score (0-1) for AI to approve an alert">
            <SliderInput
              value={settings.alerts?.minAIConfidence ?? 0.7}
              min={0}
              max={1}
              step={0.1}
              onChange={(val) => updateSection('alerts', { minAIConfidence: val })}
            />
          </SettingRow>

          <SettingRow label="Pulse Candle Count" description="Number of candles used for technical analysis">
            <div className="space-y-3 w-full">
              <div className="flex gap-2">
                {[30, 90, 100, 200].map(val => (
                  <button
                    key={val}
                    onClick={() => updateSection('alerts', { candleCount: val })}
                    className={`px-3 py-1 rounded text-[10px] font-bold transition-all border ${(settings.alerts?.candleCount ?? 100) === val
                      ? "bg-accent-blue text-white border-accent-blue shadow-glow-blue"
                      : "bg-card-bg text-text-secondary border-border-primary hover:border-accent-blue/50"
                      }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <SliderInput
                value={settings.alerts?.candleCount ?? 100}
                min={30}
                max={500}
                step={10}
                onChange={(val) => updateSection('alerts', { candleCount: val })}
              />
            </div>
          </SettingRow>

          <SettingRow label="Scan Interval" description="Frequency of market analysis scans (default 60s)">
            <SliderInput
              value={settings.alerts?.scanIntervalSeconds ?? 60}
              min={30}
              max={300}
              step={30}
              unit="s"
              onChange={(val) => updateSection('alerts', { scanIntervalSeconds: val })}
            />
          </SettingRow>

          <SettingRow label="Alert Cooldown" description="Silence alerts for the same asset for X minutes">
            <SliderInput
              value={settings.alerts?.alertCooldownMinutes ?? 5}
              min={1}
              max={60}
              step={1}
              unit="m"
              onChange={(val) => updateSection('alerts', { alertCooldownMinutes: val })}
            />
          </SettingRow>

          <SettingRow label="Discord Webhook URL" description="Target for alert notifications">
            <input
              type="text"
              value={settings.alerts?.discordWebhookUrl || ''}
              onChange={(e) => updateSection('alerts', { discordWebhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full bg-card-bg border border-border-primary rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
            />
          </SettingRow>

          <div className="mt-6 pt-4 border-t border-border-primary/30">
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-blue">📊</span> Tick Logging (Redis Mode)
            </h3>

            <SettingRow label="Enable Raw Tick Logging" description="Subscribe to Redis and save all ticks to CSV">
              <NeomorphicSwitch
                checked={settings.alerts?.enableTickLogging || false}
                onChange={() => updateSection('alerts', { enableTickLogging: !settings.alerts?.enableTickLogging })}
              />
            </SettingRow>

            <SettingRow label="Ticks Per File" description="Persist to a new CSV file every X ticks">
              <SliderInput
                value={settings.alerts?.tickChunkSize ?? 1000}
                min={10}
                max={5000}
                step={50}
                onChange={(val) => updateSection('alerts', { tickChunkSize: val })}
              />
            </SettingRow>

            <SettingRow label="Storage Location" description="Directory relative to project root">
              <input
                type="text"
                value={settings.alerts?.tickLoggingDir || 'data/ticks'}
                onChange={(e) => updateSection('alerts', { tickLoggingDir: e.target.value })}
                className="w-full bg-card-bg border border-border-primary rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
              />
            </SettingRow>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          id="settings-screenshot"
          title="Screenshot & Markup"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Default Tool" description="Tool selected when screenshot editor opens">
            <DropdownInput
              value={settings.screenshot.defaultTool}
              options={[
                { label: 'Arrow', value: 'arrow' },
                { label: 'Line', value: 'line' },
                { label: 'Rect', value: 'rect' },
                { label: 'Text', value: 'text' },
                { label: 'Circle', value: 'circle' }
              ]}
              onChange={(val) => updateSection('screenshot', { defaultTool: val })}
            />
          </SettingRow>
          <SettingRow label="Default Color" description="Default color for markups and text">
            <DropdownInput
              value={settings.screenshot.defaultColor}
              options={[
                { label: 'Orange', value: 'orange' },
                { label: 'Blue', value: 'blue' },
                { label: 'White', value: 'white' },
                { label: 'Yellow', value: 'yellow' },
                { label: 'Green', value: 'green' }
              ]}
              onChange={(val) => updateSection('screenshot', { defaultColor: val })}
            />
          </SettingRow>
          <SettingRow label="Default Font Size" description="Font size used for screenshot text tool">
            <DropdownInput
              value={settings.screenshot.defaultFontSize}
              options={[
                { label: '12', value: 12 },
                { label: '16', value: 16 },
                { label: '20', value: 20 },
                { label: '28', value: 28 }
              ]}
              onChange={(val) => updateSection('screenshot', { defaultFontSize: Number(val) })}
            />
          </SettingRow>
          <SettingRow label="Notes Margin" description="Add a writable notes margin to the screenshot editor">
            <NeomorphicSwitch
              checked={settings.screenshot.notesMarginEnabled}
              onChange={() =>
                updateSection('screenshot', { notesMarginEnabled: !settings.screenshot.notesMarginEnabled })
              }
            />
          </SettingRow>
          <SettingRow label="Notes Width" description="Width of the notes margin (pixels)">
            <SliderInput
              value={settings.screenshot.notesMarginWidth}
              min={200}
              max={600}
              step={20}
              unit="px"
              onChange={(val) => updateSection('screenshot', { notesMarginWidth: val })}
            />
          </SettingRow>
          <SettingRow label="Default Save Mode" description="How screenshots are exported by default">
            <DropdownInput
              value={settings.screenshot.saveMode}
              options={[
                { label: 'Full (Chart + Notes)', value: 'full' },
                { label: 'Crop to Chart Only', value: 'crop' }
              ]}
              onChange={(val) => updateSection('screenshot', { saveMode: val })}
            />
          </SettingRow>
          <SettingRow label="Emoji Strip" description="Show a quick emoji strip in screenshot editor">
            <NeomorphicSwitch
              checked={settings.screenshot.emojiStripEnabled}
              onChange={() =>
                updateSection('screenshot', { emojiStripEnabled: !settings.screenshot.emojiStripEnabled })
              }
            />
          </SettingRow>
        </CollapsiblePanel>

        {/* Live Trading */}
        <CollapsiblePanel
          id="settings-live-trading"
          title="Live Trading"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Default Trade Amount" description="Amount pre-filled in the trade form (USD)">
            <SliderInput
              value={settings.liveTrading?.defaultAmount ?? 10}
              min={1}
              max={1000}
              step={1}
              unit="$"
              onChange={(val) => updateSection('liveTrading', { defaultAmount: val })}
            />
          </SettingRow>

          <SettingRow label="Min Trade Amount" description="Lowest allowed trade size (USD)">
            <SliderInput
              value={settings.liveTrading?.minAmount ?? 1}
              min={1}
              max={settings.liveTrading?.maxAmount ?? 1000}
              step={1}
              unit="$"
              onChange={(val) => updateSection('liveTrading', { minAmount: val })}
            />
          </SettingRow>

          <SettingRow label="Max Trade Amount" description="Highest allowed trade size (USD)">
            <SliderInput
              value={settings.liveTrading?.maxAmount ?? 1000}
              min={settings.liveTrading?.minAmount ?? 1}
              max={1000}
              step={10}
              unit="$"
              onChange={(val) => updateSection('liveTrading', { maxAmount: val })}
            />
          </SettingRow>

          <SettingRow label="Default Expiry" description="Trade duration pre-selected in the trade form">
            <DropdownInput
              value={settings.liveTrading?.defaultExpiration ?? 300}
              options={[
                { label: '5 seconds', value: 5 },
                { label: '15 seconds', value: 15 },
                { label: '30 seconds', value: 30 },
                { label: '1 minute', value: 60 },
                { label: '3 minutes', value: 180 },
                { label: '5 minutes (default)', value: 300 },
                { label: '30 minutes', value: 1800 },
                { label: '1 hour', value: 3600 },
              ]}
              onChange={(val) => updateSection('liveTrading', { defaultExpiration: Number(val) })}
            />
          </SettingRow>

          <SettingRow label="Trade Cooldown" description="Minimum seconds between consecutive trades">
            <SliderInput
              value={settings.liveTrading?.tradeCooldownSeconds ?? 3}
              min={1}
              max={30}
              step={1}
              unit="s"
              onChange={(val) => updateSection('liveTrading', { tradeCooldownSeconds: val })}
            />
          </SettingRow>

          <SettingRow label="Confirm Real-Money Trades" description="Show confirmation dialog before executing trades in Real mode">
            <NeomorphicSwitch
              checked={settings.liveTrading?.confirmRealTrades !== false}
              onChange={() =>
                updateSection('liveTrading', {
                  confirmRealTrades: !settings.liveTrading?.confirmRealTrades,
                })
              }
            />
          </SettingRow>
        </CollapsiblePanel>

        <CollapsiblePanel
          id="settings-risk-manager"
          title="Risk Manager"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Daily Max Trades" description="Maximum trades per day">
            <SliderInput
              value={settings.riskManager.dailyMaxTrades}
              min={0}
              max={200}
              step={1}
              onChange={(val) => updateSection('riskManager', { dailyMaxTrades: val })}
            />
          </SettingRow>
          <SettingRow label="Max Consecutive Losses" description="Stop trading after this many losses">
            <SliderInput
              value={settings.riskManager.maxConsecutiveLosses}
              min={0}
              max={50}
              step={1}
              onChange={(val) => updateSection('riskManager', { maxConsecutiveLosses: val })}
            />
          </SettingRow>
          <SettingRow label="Daily Profit Target" description="Target profit for the day">
            <SliderInput
              value={settings.riskManager.dailyProfitTarget}
              min={0}
              max={1000}
              step={5}
              unit="$"
              onChange={(val) => updateSection('riskManager', { dailyProfitTarget: val })}
            />
          </SettingRow>
          <SettingRow label="Max Drawdown" description="Stop trading after drawdown percent">
            <SliderInput
              value={settings.riskManager.maxDrawdownPercent}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(val) => updateSection('riskManager', { maxDrawdownPercent: val })}
            />
          </SettingRow>
        </CollapsiblePanel>

        <CollapsiblePanel
          id="settings-advanced"
          title="Advanced"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="Reset All Settings" description="Clears local persistence and resets backend settings">
            <button
              type="button"
              onClick={handleResetAllPersisted}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-200 rounded-lg transition-colors text-sm font-medium border border-red-700/40"
            >
              <RotateCcw size={16} /> Reset All Settings
            </button>
          </SettingRow>
        </CollapsiblePanel>

        <CollapsiblePanel
          id="settings-asset-controls"
          title="Asset Controls"
          defaultOpen={false}
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-6 p-4"
        >
          <SettingRow label="OTC Only" description="Persist the OTC-only filter in the Dashboard Data Source">
            <NeomorphicSwitch
              checked={assetFilterState?.filterMode === 'otc'}
              onChange={() =>
                setAssetFilterState({
                  ...(assetFilterState || {}),
                  filterMode: assetFilterState?.filterMode === 'otc' ? null : 'otc'
                })
              }
            />
          </SettingRow>

          <SettingRow label="Included Assets" description="Comma / space separated symbols (persisted)">
            <textarea
              rows={3}
              value={assetFilterState?.includeAssets || ''}
              onChange={(e) =>
                setAssetFilterState({
                  ...(assetFilterState || {}),
                  includeAssets: e.target.value
                })
              }
              placeholder="AUDNZDOTC, EURUSDOTC"
              className="w-full min-w-[12rem] px-2 py-1 text-xs bg-card-bg border border-border-primary rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
            />
          </SettingRow>

          <SettingRow label="Ignored Assets" description="Comma / space separated symbols (persisted)">
            <textarea
              rows={3}
              value={assetFilterState?.ignoreAssets || ''}
              onChange={(e) =>
                setAssetFilterState({
                  ...(assetFilterState || {}),
                  ignoreAssets: e.target.value
                })
              }
              placeholder="USDJPYOTC, GBPUSDOTC"
              className="w-full min-w-[12rem] px-2 py-1 text-xs bg-card-bg border border-border-primary rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green"
            />
          </SettingRow>

          <SettingRow label="Indicator Preset" description="Apply a preset indicator setup">
            <DropdownInput
              value={settings.analysis.indicatorPresetId || 'custom'}
              options={indicatorPresetOptions}
              onChange={(val) => {
                updateSection('analysis', { indicatorPresetId: val });
                applyIndicatorPreset(val);
              }}
            />
          </SettingRow>

          <SettingRow label="Active Indicators" description="Current indicator set persisted across sessions">
            <div className="text-xs text-text-secondary">
              {Array.isArray(activeIndicators) && activeIndicators.length
                ? activeIndicators.map((i) => i.name).filter(Boolean).join(', ')
                : 'None'}
            </div>
          </SettingRow>
        </CollapsiblePanel>

        <div className="pt-8 border-t border-border-primary flex justify-between items-center">
          <div className="text-xs text-text-secondary">
            QuFLX v2.0.0-beta | Settings Version: {settings.version}
          </div>
          <button
            onClick={handleExportConfig}
            className="flex items-center gap-2 px-4 py-2 bg-section-bg hover:bg-section-bg/80 text-text-primary rounded-lg transition-colors text-sm font-medium border border-border-primary shadow-sm"
          >
            <Download size={16} /> Export Config (JSON)
          </button>
        </div>

      </div>
    </div >
  );
};

export default SettingsPanel;
