import { create } from 'zustand';
import { getApiBaseUrl } from '../api/apiBase';

const STALE_MS = 60_000;

const useAiProvidersStore = create((set, get) => ({
  providers: [],
  error: null,
  loading: false,
  lastFetched: 0,
  _controller: null,
  _requestId: 0,

  refresh: async ({ force = false } = {}) => {
    const { providers, lastFetched, loading, _controller, _requestId } = get();
    if (!force && loading) {
      return;
    }
    if (!force && providers.length > 0 && Date.now() - lastFetched < STALE_MS) {
      return;
    }

    const requestId = _requestId + 1;
    if (loading && _controller) {
      _controller.abort();
    }

    const controller = new AbortController();
    set({
      loading: true,
      error: null,
      _controller: controller,
      _requestId: requestId,
    });

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/ai/providers`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`providers endpoint returned ${response.status}`);
      }

      const data = await response.json();
      if (get()._requestId !== requestId || controller.signal.aborted) {
        return;
      }

      set({
        providers: Array.isArray(data.providers) ? data.providers : [],
        error: null,
        loading: false,
        lastFetched: Date.now(),
        _controller: null,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (get()._requestId === requestId) {
          set({ loading: false, _controller: null });
        }
        return;
      }

      console.error('useAiProvidersStore: failed to load providers', error);
      if (get()._requestId !== requestId) {
        return;
      }

      set({
        providers: [],
        error: 'AI providers unavailable — check Gateway connection',
        loading: false,
        _controller: null,
      });
    }
  },

  abort: () => {
    const controller = get()._controller;
    if (!controller) {
      return;
    }
    controller.abort();
    set({ loading: false, _controller: null });
  },
}));

export default useAiProvidersStore;
