import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const SETTINGS_VERSION = 3;

const normalizeTheme = (value) => {
  if (value === 'black-white') return 'black-white';
  if (value === 'ironman') return 'ironman';
  if (value === 'orange-dark') return 'orange-dark';
  if (value === 'system') return 'system';
  return 'dark';
};

const normalizeAiImageSource = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'none') return 'none';
  if (v === 'annotated') return 'annotated';
  return 'live';
};

const normalizeScreenshotTool = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'line') return 'line';
  if (v === 'rect') return 'rect';
  if (v === 'text') return 'text';
  if (v === 'circle') return 'circle';
  return 'arrow';
};

const normalizeScreenshotColor = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'blue') return 'blue';
  if (v === 'white') return 'white';
  if (v === 'yellow') return 'yellow';
  if (v === 'green') return 'green';
  return 'orange';
};

const normalizeScreenshotFontSize = (value) => {
  const n = Number(value);
  if (n === 12 || n === 16 || n === 20 || n === 28) return n;
  return defaultSettings.screenshot.defaultFontSize;
};

const normalizeScreenshotSaveMode = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'crop') return 'crop';
  return 'full';
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
    imageSource: 'live',
  },
  screenshot: {
    defaultTool: 'arrow',
    defaultColor: 'orange',
    defaultFontSize: 16,
    notesMarginEnabled: false,
    notesMarginWidth: 320,
    saveMode: 'full',
    emojiStripEnabled: false,
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
  const s = settings && typeof settings === 'object' ? settings : {};

  const merged = {
    ...defaultSettings,
    ...s,
    global: {
      ...(defaultSettings.global || {}),
      ...(s.global || {}),
    },
    automation: {
      ...(defaultSettings.automation || {}),
      ...(s.automation || {}),
    },
    analysis: {
      ...(defaultSettings.analysis || {}),
      ...(s.analysis || {}),
    },
    ai: {
      ...(defaultSettings.ai || {}),
      ...(s.ai || {}),
    },
    screenshot: {
      ...(defaultSettings.screenshot || {}),
      ...(s.screenshot || {}),
    },
    userProfile: {
      ...(defaultSettings.userProfile || {}),
      ...(s.userProfile || {}),
    },
    riskManager: {
      ...(defaultSettings.riskManager || {}),
      ...(s.riskManager || {}),
    },
    calendarJournal: {
      ...(defaultSettings.calendarJournal || {}),
      ...(s.calendarJournal || {}),
    },
    strategyLab: {
      ...(defaultSettings.strategyLab || {}),
      ...(s.strategyLab || {}),
    },
  };

  merged.global.theme = normalizeTheme(merged.global.theme);
  merged.ai = { ...(merged.ai || {}) };
  merged.ai.imageSource = normalizeAiImageSource(merged.ai.imageSource);

  merged.screenshot = { ...(merged.screenshot || {}) };
  merged.screenshot.defaultTool = normalizeScreenshotTool(merged.screenshot.defaultTool);
  merged.screenshot.defaultColor = normalizeScreenshotColor(merged.screenshot.defaultColor);
  merged.screenshot.defaultFontSize = normalizeScreenshotFontSize(merged.screenshot.defaultFontSize);
  merged.screenshot.notesMarginEnabled = Boolean(merged.screenshot.notesMarginEnabled);
  merged.screenshot.notesMarginWidth = clampNumber(merged.screenshot.notesMarginWidth, {
    min: 200,
    max: 600,
    fallback: defaultSettings.screenshot.notesMarginWidth,
  });
  merged.screenshot.saveMode = normalizeScreenshotSaveMode(merged.screenshot.saveMode);
  merged.screenshot.emojiStripEnabled = Boolean(merged.screenshot.emojiStripEnabled);

  return merged;
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
              screenshot: {
                ...(current.screenshot || {}),
                ...(backendSettings.screenshot || {}),
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
              screenshot: {
                ...(current.screenshot || {}),
                ...(saved.screenshot || {}),
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
