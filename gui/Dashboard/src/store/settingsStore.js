import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const SETTINGS_VERSION = 1;

const defaultSettings = {
  version: SETTINGS_VERSION,
  global: {},
  userProfile: {},
  aiAssistant: {},
  dashboard: {},
  analysis: {},
  liveTrading: {},
  riskManager: {},
  calendarJournal: {},
  strategyLab: {}
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      setSettings: (next) => set({ settings: next }),
      updateSection: (section, partial) => {
        const current = get().settings;
        const prevSection = current[section] || {};
        return set({
          settings: {
            ...current,
            [section]: {
              ...prevSection,
              ...partial
            }
          }
        });
      },
      resetSection: (section) => {
        const current = get().settings;
        const baseSection = defaultSettings[section] || {};
        return set({
          settings: {
            ...current,
            [section]: baseSection
          }
        });
      },
      resetAll: () => set({ settings: defaultSettings })
    }),
    {
      name: 'quflx-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage)
    }
  )
);

export default useSettingsStore;

