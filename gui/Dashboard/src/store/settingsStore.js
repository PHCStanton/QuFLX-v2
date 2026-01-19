import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const SETTINGS_VERSION = 2;

const normalizeTheme = (value) => {
  if (value === 'orange-dark') return 'orange-dark';
  if (value === 'system') return 'system';
  return 'dark';
};

const defaultSettings = {
  version: SETTINGS_VERSION,
  global: {
    theme: 'dark',
    language: 'en',
    autoStartCollector: true,
    autoStartGateway: true,
    debugLevel: 'info',
    sidebarSkinDataUrl: null,
  },
  automation: {
    historyWaitTime: 8,
    autoSelectAssets: true,
    retryAttempts: 2,
    retryDelay: 500,
  },
  analysis: {
    defaultTimeframe: '1m',
    chartPrecision: 5,
    autoLoadIndicators: false,
    dataSourceMode: 'history_and_streaming',
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

const clampNumber = (value, { min, max, fallback }) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
};

const sanitizeSettingsForBackend = (settings) => {
  const next = { ...settings };
  if (next.global) {
    next.global = { ...next.global };
    delete next.global.sidebarSkinDataUrl;
  }
  return next;
};

const normalizeSettings = (settings) => {
  const next = { ...settings };
  const global = next.global ? { ...next.global } : {};
  global.theme = normalizeTheme(global.theme);
  next.global = global;
  return next;
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      
      // Initialize settings from backend if possible
      fetchSettings: async () => {
        try {
          const current = get().settings;
          const localSidebarSkinDataUrl = current.global?.sidebarSkinDataUrl ?? null;
          const response = await fetch('/api/v1/settings');
          if (response.ok) {
            const backendSettings = await response.json();

            const merged = {
              ...current,
              ...backendSettings,
              global: {
                ...(current.global || {}),
                ...(backendSettings.global || {}),
                sidebarSkinDataUrl: localSidebarSkinDataUrl,
              },
              automation: {
                ...(current.automation || {}),
                ...(backendSettings.automation || {}),
              },
              analysis: {
                ...(current.analysis || {}),
                ...(backendSettings.analysis || {}),
              },
              ai: {
                ...(current.ai || {}),
                ...(backendSettings.ai || {}),
              },
              userProfile: {
                ...(current.userProfile || {}),
                ...(backendSettings.userProfile || {}),
              },
              riskManager: {
                ...(current.riskManager || {}),
                ...(backendSettings.riskManager || {}),
              },
              calendarJournal: {
                ...(current.calendarJournal || {}),
                ...(backendSettings.calendarJournal || {}),
              },
              strategyLab: {
                ...(current.strategyLab || {}),
                ...(backendSettings.strategyLab || {}),
              },
            };

            merged.automation = {
              ...(merged.automation || {}),
              historyWaitTime: clampNumber(merged.automation?.historyWaitTime, {
                min: 1,
                max: 8,
                fallback: defaultSettings.automation.historyWaitTime,
              }),
            };

            set({ settings: normalizeSettings(merged) });
          }
        } catch (error) {
          console.error('Failed to fetch settings from backend:', error);
        }
      },

      // Save settings to backend
      saveSettings: async (newSettings) => {
        try {
          const current = get().settings;
          const localSidebarSkinDataUrl = current.global?.sidebarSkinDataUrl ?? null;

          const payload = sanitizeSettingsForBackend(normalizeSettings(newSettings || current));
          const response = await fetch('/api/v1/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            const saved = await response.json();

            const merged = {
              ...current,
              ...saved,
              global: {
                ...(current.global || {}),
                ...(saved.global || {}),
                sidebarSkinDataUrl: localSidebarSkinDataUrl,
              },
              automation: {
                ...(current.automation || {}),
                ...(saved.automation || {}),
              },
              analysis: {
                ...(current.analysis || {}),
                ...(saved.analysis || {}),
              },
              ai: {
                ...(current.ai || {}),
                ...(saved.ai || {}),
              },
              userProfile: {
                ...(current.userProfile || {}),
                ...(saved.userProfile || {}),
              },
              riskManager: {
                ...(current.riskManager || {}),
                ...(saved.riskManager || {}),
              },
              calendarJournal: {
                ...(current.calendarJournal || {}),
                ...(saved.calendarJournal || {}),
              },
              strategyLab: {
                ...(current.strategyLab || {}),
                ...(saved.strategyLab || {}),
              },
            };

            set({ settings: normalizeSettings(merged) });
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
        set({ settings: section === 'global' ? normalizeSettings(nextSettings) : nextSettings });
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
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const next = { ...persistedState };
        if (next?.settings) {
          next.settings = normalizeSettings(next.settings);
        }
        return next;
      }
    }
  )
);

export default useSettingsStore;
