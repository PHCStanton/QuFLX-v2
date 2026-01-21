import { useEffect, useMemo, useRef, useState } from 'react';
import useSettingsStore from '../store/settingsStore';
import { 
  SettingsSection, 
  SettingRow, 
  SliderInput, 
  DropdownInput, 
  RadioGroup 
} from './Settings/SettingsPrimitives';
import NeomorphicSwitch from './NeomorphicSwitch';
import { Save, RotateCcw, Download } from 'lucide-react';

const SettingsPanel = () => {
  const { settings, updateSection, resetAll, fetchSettings, saveSettings } = useSettingsStore();
  const sidebarSkinFileInputRef = useRef(null);
  const [sidebarSkinError, setSidebarSkinError] = useState('');

  const sidebarSkinPreviewUrl = useMemo(() => {
    return settings.global.sidebarSkinDataUrl || '';
  }, [settings.global.sidebarSkinDataUrl]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    const success = await saveSettings();
    if (success) {
      // Could add a toast notification here
      console.log('Settings saved successfully');
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

  return (
    <div className="flex-1 flex flex-col bg-dashboard-bg overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-3">
            <span className="text-accent-green">⚙️</span> SETTINGS
          </h1>
          <div className="flex gap-3">
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

        {/* Global Settings */}
        <SettingsSection title="Global Settings">
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
          <SettingRow label="Add Skin" description="Upload a 16:9 image for the sidebar background">
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
                    alt="Sidebar skin preview"
                    className="w-28 h-16 rounded border border-border-primary object-cover"
                  />
                  <div className="text-xs text-text-secondary">
                    Applied to the left sidebar background.
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
        </SettingsSection>

        {/* Automation & Execution */}
        <SettingsSection title="Automation & Execution">
          <SettingRow label="History Wait Time" description="How long to wait for manual asset click (seconds)">
            <SliderInput 
              value={settings.automation.historyWaitTime}
              min={1}
              max={8}
              step={1}
              unit="s"
              onChange={(val) => updateSection('automation', { historyWaitTime: val })}
            />
          </SettingRow>
          <SettingRow label="Auto-Select Assets" description="Automatically select asset in Pocket Option UI">
            <NeomorphicSwitch 
              checked={settings.automation.autoSelectAssets}
              onChange={() => updateSection('automation', { autoSelectAssets: !settings.automation.autoSelectAssets })}
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
        </SettingsSection>

        {/* Analysis & Charting */}
        <SettingsSection title="Analysis & Charting">
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
        </SettingsSection>

        {/* AI Assistant */}
        <SettingsSection title="AI Assistant">
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
        </SettingsSection>

        <SettingsSection title="Screenshot & Markup">
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
        </SettingsSection>

        <SettingsSection title="Risk Manager">
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
        </SettingsSection>

        <div className="pt-8 border-t border-border-primary flex justify-between items-center">
          <div className="text-xs text-text-secondary">
            QuFLX v2.0.0-beta | Settings Version: {settings.version}
          </div>
          <button 
            className="flex items-center gap-2 px-4 py-2 bg-section-bg hover:bg-section-bg/80 text-text-primary rounded-lg transition-colors text-sm font-medium border border-border-primary shadow-sm"
          >
            <Download size={16} /> Export Config (JSON)
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;
