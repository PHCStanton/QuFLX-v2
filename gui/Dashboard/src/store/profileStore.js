import { create } from 'zustand';
import { withQuFLXPersist, QFLX_PERSIST_KEYS } from './persistMiddleware';
import { getApiBaseUrl } from '../api/apiBase';
import useSettingsStore from './settingsStore';
import useUserStore from './userStore';

const PROFILE_SAVE_DELAY_MS = 800;

const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

const requestJson = async (path, options) => {
  const res = await fetch(`${getApiBaseUrl()}${path}`, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) {
        detail = data.detail;
      }
    } catch (parseError) {
      void parseError;
    }
    throw new Error(`Profile request failed: ${detail}`);
  }
  return res.json();
};

let saveTimeout = null;
let settingsSubscription = null;
let skipNextSync = false;

const useProfileStore = create(
  withQuFLXPersist(QFLX_PERSIST_KEYS.profiles, 1, {
    partialize: (state) => ({ activeProfileId: state.activeProfileId }),
  })((set, get) => {
    const applyProfile = (profile) => {
      if (profile && profile.settings) {
        skipNextSync = true;
        useSettingsStore.getState().applyProfileSettings(profile.settings);
      }
      const displayName = profile?.settings?.userProfile?.displayName || profile?.name;
      if (displayName) {
        useUserStore.getState().updateUser({ name: displayName });
      }
    };

    const scheduleProfileSave = (settings) => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(async () => {
        const activeProfileId = get().activeProfileId;
        if (!activeProfileId) return;
        try {
          const updated = await requestJson(`/api/v1/profiles/${activeProfileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
          });
          set((state) => ({
            profiles: state.profiles.map((profile) =>
              profile.id === activeProfileId ? { ...profile, updatedAt: updated.updatedAt } : profile
            )
          }));
        } catch (err) {
          set({ error: getErrorMessage(err) });
        }
      }, PROFILE_SAVE_DELAY_MS);
    };

    const ensureSettingsSync = () => {
      if (settingsSubscription) return;
      settingsSubscription = useSettingsStore.subscribe(
        (state) => state.settings,
        (settings) => {
          if (!get().activeProfileId) return;
          if (skipNextSync) {
            skipNextSync = false;
            return;
          }
          scheduleProfileSave(settings);
        }
      );
    };

    return {
      profiles: [],
      activeProfileId: null,
      isLoading: false,
      error: null,

      ensureSettingsSync,

      loadProfiles: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await requestJson('/api/v1/profiles', { method: 'GET' });
          set({ profiles: data.profiles || [], isLoading: false });
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
        }
      },

      loadActiveProfile: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await requestJson('/api/v1/profiles/active', { method: 'GET' });
          const profile = data.profile;
          set({ activeProfileId: data.activeProfileId || profile?.id || null, isLoading: false });
          if (profile) {
            applyProfile(profile);
          }
          return profile;
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
          return null;
        }
      },

      setActiveProfile: async (profileId) => {
        if (!profileId) return null;
        set({ isLoading: true, error: null });
        try {
          const data = await requestJson('/api/v1/profiles/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId })
          });
          set({ activeProfileId: data.activeProfileId || profileId, isLoading: false });
          if (data.profile) {
            applyProfile(data.profile);
          }
          return data.profile || null;
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
          return null;
        }
      },

      createProfile: async (name, settings) => {
        const trimmed = typeof name === 'string' ? name.trim() : '';
        if (!trimmed) {
          set({ error: 'Profile name is required' });
          return null;
        }
        set({ isLoading: true, error: null });
        try {
          const payload = {
            name: trimmed,
            settings: settings && typeof settings === 'object' ? settings : useSettingsStore.getState().settings
          };
          const profile = await requestJson('/api/v1/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          set((state) => ({
            profiles: state.profiles.concat([
              { id: profile.id, name: profile.name, createdAt: profile.createdAt, updatedAt: profile.updatedAt }
            ]),
            isLoading: false
          }));
          return profile;
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
          return null;
        }
      },

      updateProfile: async (profileId, patch) => {
        if (!profileId) return null;
        set({ isLoading: true, error: null });
        try {
          const profile = await requestJson(`/api/v1/profiles/${profileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch || {})
          });
          set((state) => ({
            profiles: state.profiles.map((item) =>
              item.id === profileId ? { ...item, name: profile.name, updatedAt: profile.updatedAt } : item
            ),
            isLoading: false
          }));
          return profile;
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
          return null;
        }
      },

      deleteProfile: async (profileId) => {
        if (!profileId) return false;
        set({ isLoading: true, error: null });
        try {
          await requestJson(`/api/v1/profiles/${profileId}`, { method: 'DELETE' });
          set((state) => ({
            profiles: state.profiles.filter((profile) => profile.id !== profileId),
            isLoading: false
          }));
          const activeProfileId = get().activeProfileId;
          if (activeProfileId === profileId) {
            await get().loadActiveProfile();
          }
          return true;
        } catch (err) {
          set({ error: getErrorMessage(err), isLoading: false });
          return false;
        }
      },
    };
  })
);

export default useProfileStore;
