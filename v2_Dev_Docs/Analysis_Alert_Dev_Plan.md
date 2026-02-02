# Analysis & Alert Integration Development Plan
**Version**: 1.0.0
**Status**: Active
**Associated Proposal**: `analysis_alert_dispatch_proposal.md`

This document serves as the master checklist for migrating the Alert-Dispatch logic into QuFLX v2 and implementing the Topdown Analysis features.

---

## Phase 1: Backend Strategy & Alerts Infrastructure
**Objective**: Port existing Node.js logic to Python and establish the backend engines for multi-timeframe analysis and notification dispatch.

### 1.1 Core Logic Port (Node -> Python)
- [ ] **Create `regimes.py` logic**
    - Target: `backend/services/strategy/regimes.py`
    - [ ] Port `ConditionDetector` logic (Trending vs Ranging vs Choppy).
    - [ ] Implement ADX/RSI/ATR threshold logic defined in Specs.
    - [ ] Define `MarketRegime` Enum/Data Class.

- [ ] **Create `topdown.py` logic**
    - Target: `backend/services/strategy/topdown.py`
    - [ ] Implement `TopdownAnalyzer` class.
    - [ ] Implement Confluence Scoring (e.g., "3 of 4 timeframes matching").
    - [ ] Implement "Go/No-Go" logic based on HTF bias.

### 1.2 Alert Engine & Gateway
- [ ] **Create Alert Dispatch Service**
    - Target: `backend/services/gateway/dispatch.py` (New module)
    - [ ] Define `Alert` data model (pydantic).
    - [ ] Define `AlertConfig` data model.
    - [ ] Implement internal `EventBus` for alert triggers.

- [ ] **API Endpoints**
    - Target: `backend/services/gateway/routes/alerts.py`
    - [ ] `GET /api/v1/alerts/config` (Get rules).
    - [ ] `POST /api/v1/alerts/config` (Update rules).
    - [ ] `GET /api/v1/alerts/history` (Get past alerts).
    - [ ] Register router in `backend/services/gateway/main.py`.

---

## Phase 2: React Frontend Implementation
**Objective**: Create the UI surfaces for viewing Signals (Notification Panel) and validating them (Analysis Panel).

### 2.1 State Management
- [ ] **Create `alertStore.js`**
    - Target: `gui/Dashboard/src/store/alertStore.js`
    - [ ] Implement Zustand store for `activeAlerts`, `alertHistory`, and `configs`.
    - [ ] Wire up WebSocket listeners for `alert:new` events.

### 2.2 Notification Panel (The "Signal Feed")
- [ ] **Create Component Structure**
    - Target: `gui/Dashboard/src/components/NotificationPanel.jsx`
    - [ ] Implement Collapsible Panel architecture (Side or Bottom).
    - [ ] Create `AlertCard` component (Time, Asset, Message, Severity Badge).
    - [ ] Add "Analyze" Action Button (Links to Analysis Panel).
    - [ ] Add Filters (Asset, Severity, Type).

### 2.3 Analysis Panel (The "Topdown View")
- [ ] **Update Component Structure**
    - Target: `gui/Dashboard/src/components/AnalysisPanel.jsx`
    - [ ] Implement "Confluence Matrix" view (Grid of Timeframes vs Indicators).
    - [ ] Implement "Confluence Score" visual (e.g., Traffic Light or Gauge).
    - [ ] Integrate `AssetPayoutPanel` (Already exists, ensure seamless fit).

---

## Phase 3: External Integrations
**Objective**: Enable alerts to leave the application via Discord and Gmail.

### 3.1 Discord Integration
- [ ] **Implement Client**
    - Target: `backend/services/gateway/integrations/discord_bot.py`
    - [ ] Implement Webhook sender (`aiohttp`).
    - [ ] Format Rich Embeds (Color-coded by severity).
    - [ ] Handle Rate Limits.

### 3.2 Gmail Integration
- [ ] **Implement Client**
    - Target: `backend/services/gateway/integrations/email_bot.py`
    - [ ] Setup `google-api-python-client` with OAuth/Service Account.
    - [ ] Create HTML Email Templates for alerts.

---

## Phase 4: AI "Meta-Alert" Integration
**Objective**: Allow the AI Assistant to generate alerts that flow into the same system.

### 4.1 AI Event Injection
- [ ] **Backend Injection**
    - [ ] Update `backend/services/gateway/routes/ai.py`.
    - [ ] Create function `inject_ai_insight(context, insight)`.
    - [ ] Map "Actionable Insights" to `Alert` objects.

### 4.2 Frontend Integration
- [ ] **Update `AiInsightsPanel`**
    - [ ] Add visual indicator when an insight has been "dispatched" as an alert.
    - [ ] Allow manual "Send to Alerts" action from chat responses.

---

## Future Optimization (Post-MVP)
- [ ] **User Sessions**: different alert configs for different trading sessions (London/NY).
- [ ] **Telegram Integration**: Add Telegram bot support.
- [ ] **SMS/Twilio**: High-priority SMS alerts.
