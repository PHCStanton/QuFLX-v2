import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const SETTINGS_VERSION = 1;

const defaultSettings = {
  version: SETTINGS_VERSION,
  global: {
    theme: 'dark',
    language: 'en',
    autoStartCollector: true,
    autoStartGateway: true,
    debugLevel: 'info',
  },
  automation: {
    historyWaitTime: 15,
    autoSelectAssets: true,
    retryAttempts: 2,
    retryDelay: 500,
  },
  analysis: {
    defaultTimeframe: '1m',
    chartPrecision: 5,
    autoLoadIndicators: false,
  },
  ai: {
    responseVerbosity: 'balanced',
    autoIncludeChart: true,
    autoIncludeContext: true,
  },
  userProfile: {
    displayName: '',
    experienceLevel: 'intermediate',
  },
  riskManager: {
    dailyMaxTrades: 10,
    maxConsecutiveLosses: 3,
    dailyProfitTarget: 50,
    maxDrawdownPercent: 5,
  },
  calendarJournal: {},
  strategyLab: {}
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      
      // Initialize settings from backend if possible
      fetchSettings: async () => {
        try {
          const response = await fetch('/api/v1/settings');
          if (response.ok) {
            const backendSettings = await response.json();
            set({ settings: { ...get().settings, ...backendSettings } });
          }
        } catch (error) {
          console.error('Failed to fetch settings from backend:', error);
        }
      },

      // Save settings to backend
      saveSettings: async (newSettings) => {
        try {
          const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings || get().settings),
          });
          if (response.ok) {
            const saved = await response.json();
            set({ settings: saved });
            return true;
          }
        } catch (error) {
          console.error('Failed to save settings to backend:', error);
        }
        return false;
      },

      setSettings: (next) => set({ settings: next }),
      
      updateSection: (section, partial) => {
        const current = get().settings;
        const prevSection = current[section] || {};
        const nextSettings = {
          ...current,
          [section]: {
            ...prevSection,
            ...partial
          }
        };
        set({ settings: nextSettings });
        // Optionally auto-save to backend
        // get().saveSettings(nextSettings);
      },

      resetSection: (section) => {
        const current = get().settings;
        const baseSection = defaultSettings[section] || {};
        const nextSettings = {
          ...current,
          [section]: baseSection
        };
        set({ settings: nextSettings });
        get().saveSettings(nextSettings);
      },

      resetAll: () => {
        set({ settings: defaultSettings });
        get().saveSettings(defaultSettings);
      }
    }),
    {
      name: 'quflx-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage)
    }
  )
);

export default useSettingsStore;
