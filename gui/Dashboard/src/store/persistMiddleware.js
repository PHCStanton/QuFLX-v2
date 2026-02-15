/*
Persist helper for Zustand stores.

Usage:
  import { create } from 'zustand';
  import { withQuFLXPersist, QFLX_PERSIST_KEYS } from './persistMiddleware';

  const useStore = create(
    withQuFLXPersist(QFLX_PERSIST_KEYS.market, 1, {
      partialize: (state) => ({ ...state })
    })((set, get) => ({ ... }))
  );

Notes:
- Uses localStorage for persistence (scoped to the current Chrome profile).
- Wraps storage calls with try/catch and logs failures (no silent failures).
- Emits dev-only console logs for load/save/remove to verify persistence.
*/

import { persist, createJSONStorage } from 'zustand/middleware';

export const QFLX_PERSIST_KEYS = {
  market: 'quflx-market',
  settings: 'quflx-settings',
  user: 'quflx-user',
  profiles: 'quflx-profiles',
  rightPanelWidthPx: 'quflx.ui.rightPanelWidthPx',
  lastAnnotatedScreenshotDataUrl: 'quflx:lastAnnotatedScreenshotDataUrl'
};

const isDev = (() => {
  try {
    return Boolean(import.meta?.env?.DEV);
  } catch {
    return false;
  }
})();

const createSafeLocalStorage = () => {
  const target = typeof window !== 'undefined' ? window.localStorage : null;

  return {
    getItem: (key) => {
      if (!target) return null;
      try {
        const value = target.getItem(key);
        if (isDev) {
          console.log(`[persist] load ${key}`, value ? 'hit' : 'miss');
        }
        return value;
      } catch (err) {
        console.warn(`[persist] Failed to read ${key} from localStorage`, err);
        return null;
      }
    },
    setItem: (key, value) => {
      if (!target) return;
      try {
        target.setItem(key, value);
        if (isDev) {
          console.log(`[persist] save ${key}`);
        }
      } catch (err) {
        console.warn(`[persist] Failed to write ${key} to localStorage`, err);
      }
    },
    removeItem: (key) => {
      if (!target) return;
      try {
        target.removeItem(key);
        if (isDev) {
          console.log(`[persist] remove ${key}`);
        }
      } catch (err) {
        console.warn(`[persist] Failed to remove ${key} from localStorage`, err);
      }
    }
  };
};

export const withQuFLXPersist = (name, version = 1, options = {}) => {
  const { partialize, migrate, onRehydrateStorage } = options;

  return (storeCreator) =>
    persist(storeCreator, {
      name,
      version,
      storage: createJSONStorage(createSafeLocalStorage),
      ...(typeof partialize === 'function' ? { partialize } : {}),
      ...(typeof migrate === 'function' ? { migrate } : {}),
      ...(typeof onRehydrateStorage === 'function' ? { onRehydrateStorage } : {})
    });
};
