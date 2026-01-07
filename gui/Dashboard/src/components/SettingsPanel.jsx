import React, { useEffect } from 'react';
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
  const { settings, updateSection, resetSection, resetAll, fetchSettings, saveSettings } = useSettingsStore();

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
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-text-primary rounded-lg transition-colors text-sm font-medium border border-gray-300 dark:border-gray-700 shadow-sm"
            >
              <RotateCcw size={16} /> Reset All
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-accent-green hover:bg-accent-green/90 text-white dark:text-black rounded-lg transition-colors text-sm font-bold shadow-lg shadow-accent-green/20"
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
                { label: 'Light Mode', value: 'light' },
                { label: 'Orange Dark', value: 'orange-dark' }
              ]}
              onChange={(val) => updateSection('global', { theme: val })}
            />
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
              min={3}
              max={30}
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
          <SettingRow label="Auto-include Chart" description="Send chart screenshot with AI queries">
            <NeomorphicSwitch 
              checked={settings.ai.autoIncludeChart}
              onChange={() => updateSection('ai', { autoIncludeChart: !settings.ai.autoIncludeChart })}
            />
          </SettingRow>
          <SettingRow label="Auto-include Context" description="Send market data context with AI queries">
            <NeomorphicSwitch 
              checked={settings.ai.autoIncludeContext}
              onChange={() => updateSection('ai', { autoIncludeContext: !settings.ai.autoIncludeContext })}
            />
          </SettingRow>
        </SettingsSection>

        <div className="pt-8 border-t border-gray-300 dark:border-gray-800 flex justify-between items-center">
          <div className="text-xs text-text-secondary">
            QuFLX v2.0.0-beta | Settings Version: {settings.version}
          </div>
          <button 
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-text-primary rounded-lg transition-colors text-sm font-medium border border-gray-300 dark:border-gray-700 shadow-sm"
          >
            <Download size={16} /> Export Config (JSON)
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;
