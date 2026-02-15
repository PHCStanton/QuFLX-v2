# Dashboard Fixes & Playwright Additions Report (2026-02-15)

## Summary
- Cleared frontend lint warnings and stabilized hook dependencies.
- Added a comprehensive Playwright QA spec covering key user flows.
- Verified with lint, build, Playwright QA, and backend pytest.

## Fixes and Modifications
- Removed unused React/useEffect imports to resolve lint warnings.
- StrategyLabPanel: wrapped upload/analyze/entries handlers with useCallback and aligned dependencies to avoid stale closures.
- VoiceParticlePage: moved Particle class outside component and memoized init/run loop callbacks for stable effects.
- useNaturalVoice: trimmed dependency list to correct hook warning and prevent unnecessary reconnects.

## New Tests
- Added tests/phase5.additional.qa.spec.js with 8 new Playwright scenarios:
  - Profiles creation + activation request flow
  - Settings persistence across reload
  - AI Insights send response rendering (mocked)
  - Asset refresh list update (mocked)
  - Alerts start/stop UI state changes (mocked)
  - Screenshot annotation controls + close flow
  - Right panel resize persistence
  - Error toast visibility + auto-dismiss on timeframe failure

## Verification
- Frontend lint: npm run lint (clean)
- Frontend build: npm run build
- Playwright QA: npm run test:qa (14 passed)
- Backend tests: conda run -n QuFLX-v2 pytest (38 passed)

## Files Updated
- gui/Dashboard/src/components/NeomorphicSwitch.jsx
- gui/Dashboard/src/components/SettingsPanel.jsx
- gui/Dashboard/src/components/StrategyLabPanel.jsx
- gui/Dashboard/src/components/VoiceParticlePage.jsx
- gui/Dashboard/src/hooks/useNaturalVoice.js
- gui/Dashboard/tests/phase5.additional.qa.spec.js
