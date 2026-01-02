# Recommended Platform Settings Scaffolding – QuFLX v2
**Date:** 2025-12-31  
**Status:** Architecture Proposal  
**Author:** @Reviewer (delegated by @Team-Leader)

## 1. Executive Summary
This document outlines the foundational scaffolding for the Platform Settings feature in QuFLX v2. The focus is on a scalable, modular architecture that supports deep user customization for trading automation, analysis, and AI behaviors without cluttering the global state.

## 2. Review of Current State
- **Frontend:** Placeholder 'Settings' tab exists in `Sidebar.jsx`. A `settingsStore.js` slice is already provisioned with basic persistence.
- **Backend:** `gateway/main.py` has initial stubs for profile/settings data but lacks a dedicated router or versioned JSON schemas.
- **Gap:** No standardized UI forms or validation logic for platform-specific (non-account) settings.

## 3. Proposed Settings Structure (Scaffolding)

### 3.1 Global System Settings
*Foundational controls for core services.*
- **Service Management:** Toggle auto-start for Collector and Gateway.
- **Diagnostics:** Debug log verbosity (Normal / Verbose / Trace).
- **Environment:** Mock-mode toggle for testing (use simulated exchange data).

### 3.2 Automation & Execution Settings
*Fine-tuning how QuFLX interacts with PocketOption.*
- **Interaction Delays:** Configurable `click_delay_ms` (standardize the currently hardcoded values).
- **Retry Thresholds:** Max attempts for timeframe sync and asset selection.
- **Default Filters:** Permanent `OTC-Only` vs `Global` preference.
- **Payout Gating:** Global minimum payout threshold for the "Get Assets" tool.

### 3.3 Analysis & Charting Settings
*Customizing the data visualization layers.*
- **Aggregation Buffers:** Number of ticks to hold in memory before pruning.
- **Indicator Persistence:** Option to auto-load last used indicators on fresh session.
- **Chart Precision:** Number of decimals for price display on Y-axis.
- **Default Timeframe:** Starting timeframe when switching assets.

### 3.4 AI Behavioral Settings
*Configuring the Grok/xAI integration.*
- **Context Injection Level:** 
  - Minimal (Ticker only)
  - Full (Ticker + Indicators + Recent History)
- **Response Format:** Concise (Bullet points) vs Analytical (Detailed report).
- **Vision Quality:** Scaling factor for chart screenshots before sending to Grok Vision.

### 3.5 Risk Management (Platform Presets)
*Hard-stops and platform-level safety.*
- **Global Max Positions:** Platform-enforced upper limit on concurrent open trades.
- **Session Hard-Stop:** Auto-disconnect services after X% total drawdown detected in current session.

## 4. Implementation Roadmap (Backend & Frontend)

### Phase 1: Store Refinement (Frontend)
- Update `settingsStore.js` to include the specific sections above with typed defaults.
- Implement a `SettingsRouter.jsx` to render the appropriate sub-forms when the 'Settings' tab is active.

### Phase 2: Configuration API (Backend)
- Move settings persistence to a dedicated JSON file (e.g., `config/platform_settings.json`) managed by a new `gateway/http/settings_http.py` router.
- Implement a `GET /api/v1/settings` and `PATCH /api/v1/settings` endpoint.

### Phase 3: Integration Injection
- Refactor capabilities (e.g., `TimeframeMenu`) to pull timing and retry values from the backend settings repository rather than using hardcoded defaults.

## 5. CORE_PRINCIPLES Alignment
- **Separation of Concerns:** Platform settings are decoupled from User Account settings (auth/billing).
- **Zero Assumptions:** Every setting has a sane, fail-safe default.
- **Defensive Design:** Settings are validated on the backend before being persisted to JSON.

---
*Verified for structural integrity by @Reviewer. Ready for developer review.*
