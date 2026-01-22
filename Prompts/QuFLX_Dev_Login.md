You are an expert React + Zustand + Tailwind developer working on QuFLX v2 (a real-time OTC binary options trading dashboard).

Task: Implement persistent storage for frontend settings and state so that changes survive browser reloads, dev-server restarts, and Chrome profile restarts — without real user authentication yet.

Key requirements:
- Use the existing Chrome debugging profile named "Cooldog" (launched with --remote-debugging-port=9222 --profile-directory="Cooldog").
- Persistence must be scoped to this profile (via browser storage: localStorage or IndexedDB).
- Target stores: marketStore (asset, timeframe, dataSourceMode, specificAssets, etc.), settingsStore (theme, AI prefs, etc.), riskStore (DD limits, sizing rules), and any other Zustand stores holding user-configurable state.
- Do NOT tie persistence to Pocket Option login/session (separate origin, impossible anyway).
- Preference: Use localStorage first (simplest), with clear path to IndexedDB later if larger data (e.g. screenshots, journals) is needed.
- Must be backward-compatible — existing non-persisted state should still work.
- Add a "Reset All Settings" button in Settings → Advanced (clears persistence for testing).
- Keep it simple, no new deps beyond zustand/middleware if possible.

Implementation guidelines:
- Use zustand's built-in `persist` middleware with createJSONStorage (localStorage default).
- Wrap each store with a helper like createPersistedStore(name, initialState, storeFn).
- Store names: e.g. 'quflx-market', 'quflx-settings', 'quflx-risk'.
- Partialize: persist only user-configurable fields (exclude transient data like current price, live ticks).
- Version: 1 (bump if schema changes later).
- Error handling: graceful fallback to initial state if storage fails.
- Dev-only: console.log on load/save for verification.

Deliverables expected:
1. New file: src/store/persistMiddleware.js (or utils/persist.js) with the helper.
2. Example refactored store (e.g. marketStore.js or settingsStore.js) showing before/after.
3. Code for "Reset All Settings" button + handler (clear specific keys or localStorage.clear() with confirmation).
4. Brief README-style comment block explaining how to add persistence to new stores.

CORE_PRINCIPLES to follow:
- Functional Simplicity First
- No silent failures (log storage errors)
- Incremental & testable
- Zero assumptions about future auth

Do NOT:
- Implement real auth
- Use backend sync yet
- Touch Pocket Option-related code

Output format:
- Explanation (brief)
- Code files/sections with comments
- How to test (reload page → settings persist)
- Any gotchas or next steps (e.g. migrate to IndexedDB)

Start now.