Live Trading Panel — SSID API Integration
Overview
Implement the Live Trading sidebar panel by integrating the existing ssid_integration_package into QuFLX v2. The panel allows traders to connect to Pocket Option via SSID, view balances, execute manual trades, track WIN/LOSS results, switch between Demo/Real accounts, select expiry timeframes, and view 92% payout assets.

IMPORTANT

This involves REAL MONEY. Every design decision below defaults to the safest option. Demo mode is the default. Real-money trading requires explicit user confirmation.

User Review Required
IMPORTANT

Decisions confirmed by user:

SSID persistence → Stored in a JSON config file (data/settings/trading_config.json). SSIDs change over time so file persistence is preferred.
Trade amount limits → Keep defaults: min $1, max $1000.
Auto-trading → Phase 5 deferred for future implementation.
Settings Panel → All trading settings go in a new "Live Trading" section in the Settings Panel (
settingsStore.js
 + 
SettingsPanel.jsx
).
Architecture
External
ssid_integration_package
FastAPI Gateway
Frontend
HTTP /api/v1/trading/*
WebSocket
LiveTradingPanel.jsx
tradingStore.js
routes/trading.py
trading_service.py
SSIDConnector
OTCExecutor
Pocket Option WS
Proposed Changes
Phase 1 — Backend Trading Service & Routes
[NEW] 
trading_service.py
Singleton service managing the SSID connection lifecycle. Wraps blocking 
SSIDConnector
 / 
OTCExecutor
 calls in asyncio.run_in_executor() for async compatibility with FastAPI.

Key methods:

connect(ssid, demo)
 → Validates SSID, creates 
SSIDConnector
, connects, returns status + balance
disconnect()
 → Graceful teardown
get_status() → Returns { connected, demo, balance, last_updated }
execute_trade(asset, direction, amount, expiration)
 → Pre-flight checks → OTCExecutor.execute_trade()
check_result(order_id) → OTCExecutor.check_trade_result()
get_assets() → Returns verified OTC asset list
switch_mode(demo) → Disconnect + reconnect with new mode
Safety controls baked in:

3-second cooldown between trades
Balance check before every trade
Connection validation before every trade
Trade amount min/max enforcement
SSID persistence:

Load/save SSID from data/settings/trading_config.json
Config also stores: demo flag, default_amount, default_expiration
Managed via backend /api/v1/trading/config endpoint
[NEW] 
trading.py
REST endpoints under /api/v1/trading:

Method	Endpoint	Description
POST	/connect	Connect with SSID + demo flag
POST	/disconnect	Disconnect session
GET	/status	Connection status + balance
POST	/execute	Execute a trade
GET	/result/{order_id}	Check trade WIN/LOSS
GET	/assets	List verified OTC assets
POST	/switch-mode	Switch Demo ↔ Real
GET	/config	Get trading config (without raw SSID)
PUT	/config	Update trading config
All endpoints return structured JSON with success boolean + either data or 
error
 keys.

[MODIFY] 
main.py
Register the new trading router with the FastAPI app:

diff
+from backend.services.gateway.routes.trading import router as trading_router
 ...
+app.include_router(trading_router, prefix="/api/v1/trading", tags=["trading"])
Phase 2 — Frontend Connection & Status UI
[NEW] 
tradingStore.js
Dedicated Zustand store for trading state (separate from marketStore per existing convention):

{
  isConnected: false,
  isConnecting: false,
  isDemoMode: true,         // DEFAULT: DEMO
  balance: null,
  lastBalanceUpdate: null,
  ssid: '',                 // Only held in React for the input field
  trades: [],               // Recent trade history
  activeTrade: null,        // Currently pending trade
  error: null,
  // Actions
  connect(ssid, demo) → POST /connect
  disconnect() → POST /disconnect
  pollStatus() → GET /status
  executeTrade(params) → POST /execute
  checkResult(orderId) → GET /result/:id
  fetchAssets() → GET /assets
  switchMode(demo) → POST /switch-mode
}
[MODIFY] 
LiveTradingPanel.jsx
Full rewrite from placeholder to working panel. Layout (top-to-bottom):

Section 1 — Connection Bar

SSID text input (password-masked) + "Connect" button
Status badge: 🔴 Disconnected / 🟡 Connecting / 🟢 Connected
Demo/Real toggle switch (defaults to Demo, highlighted in blue)
Section 2 — Account Status

Balance display: large green number (e.g. $10,425.50)
Account type badge: DEMO (blue) or REAL (red/amber)
Last updated timestamp
Section 3 — Trade Execution Form

Asset dropdown (populated from /assets endpoint, shows payout %)
Direction: two large buttons — green CALL ↑ / red PUT ↓
Amount input with ±$1 / ±$5 steppers
Expiry preset chips: 5s 15s 30s 1m 3m 5m 30m 1h
"Execute Trade" button (yellow/amber, with loading state)
⚠️ For Real mode: extra confirmation modal before execution
Section 4 — Trade Results

Mini-table of recent trades: Asset, Direction, Amount, Expiry, Timer, Result
WIN shown in green, LOSS in red, pending with spinner
Auto-checks result after expiration via polling
Section 5 — 92% Assets (collapsed by default)

Existing 
AssetPayoutPanel
 with showControls={false}, defaultIsTopCollapsed={true}
"Last Refreshed" timestamp + manual refresh button
Phase 3 — Trade Execution Safety
Safety Features (built into Phase 2–3 code)
Feature	Description
Demo default	isDemoMode starts true, real mode requires toggle
Real-money confirmation	Modal dialog: "You are about to trade $X REAL on ASSET. Confirm?"
Cooldown	3s minimum between trades, button disabled during cooldown
Balance guard	Cannot trade more than current balance
Connection guard	Cannot open trade form without active connection
Visual mode indicator	Red persistent banner when in REAL mode
Phase 4 — 92% Asset Integration
The existing 
AssetPayoutPanel
 is already embedded in 
LiveTradingPanel.jsx
. This phase adds:

A "Use for Trade" action button on each asset row → populates the trade form's asset dropdown
"Last Refreshed" timestamp on the 92% assets section header
Optional: auto-refresh toggle (re-runs refreshAssets on a 5-minute interval)
Settings Panel Integration
[MODIFY] 
settingsStore.js
Add liveTrading section to defaultSettings and wire into 
normalizeSettings
 + 
mergeSettings
:

js
liveTrading: {
  defaultAmount: 10,
  defaultExpiration: 300,
  minAmount: 1,
  maxAmount: 1000,
  confirmRealTrades: true,
  tradeCooldownSeconds: 3,
}
Bump SETTINGS_VERSION to 5.

[MODIFY] 
SettingsPanel.jsx
Add a new <SettingsSection title="Live Trading"> (inserted before "Risk Manager") with:

Default Trade Amount (slider, $1–$1000)
Default Expiry (dropdown: 5s, 15s, 30s, 1m, 3m, 5m, 30m, 1h)
Confirm Real Trades (toggle, default ON)
Trade Cooldown (slider, 1–30s)
Min/Max Amount (number inputs)
Frontend Design Specification
The panel follows the existing QuFLX design language:

Background: bg-card-bg with glassmorphism (quflx-section-light)
Cards: rounded-lg with border border-border-primary
Text: text-text-primary / text-text-secondary with uppercase tracking-wider for section headers
Accent colors: Green accent-green for positive/connected, Red #ff4757 for negative/sell, Blue #3b82f6 for Demo badge, Amber #f59e0b for Real badge
Buttons: quflx-neo-square-btn pattern, direction buttons full-width side-by-side
Collapse pattern: Uses existing CollapsibleCard component
Layout: flex flex-col gap-2 h-full min-h-0 matching other panels
Verification Plan
Automated Tests
Backend route tests — extend existing test patterns in backend/tests/:

bash
cd c:\QuFLX\v2
conda activate QuFLX-v2
python -m pytest backend/tests/test_trading_routes.py -v
We will create backend/tests/test_trading_routes.py that tests:

/status returns disconnected state when no connection
/connect with invalid SSID returns error
/assets returns the hardcoded OTC asset list
/execute returns error when not connected
NOTE

These tests mock the SSIDConnector and OTCExecutor — they do NOT connect to Pocket Option or execute real trades.

Build Verification
bash
cd c:\QuFLX\v2\gui\Dashboard
npm run build
Must produce zero errors. Warnings are acceptable if pre-existing.

Manual Verification
Start Gateway: conda activate QuFLX-v2 && python -m backend.services.gateway.main
Start Dashboard: cd gui\Dashboard && npm run dev
Navigate to Live Trading tab → Verify panel renders with all sections
Test connection flow:
Enter invalid SSID → Should show error toast
Verify Demo/Real toggle defaults to Demo
Verify balance shows null when disconnected
Test with real SSID (user's judgment):
Connect in Demo mode → Verify balance appears
Execute a $1 demo trade → Verify trade appears in results
Wait for expiry → Verify WIN/LOSS result shows
TIP

For full trade execution testing, the user must provide a valid SSID from Pocket Option browser dev tools. We cannot automate this test.

Files Changed Summary
Action	File	Purpose
NEW	backend/services/gateway/trading_service.py	SSID connection + trade execution service
NEW	backend/services/gateway/routes/trading.py	REST API endpoints
NEW	gui/Dashboard/src/store/tradingStore.js	Zustand trading state
NEW	backend/tests/test_trading_routes.py	Automated route tests
MODIFY	backend/services/gateway/main.py	Register trading router
MODIFY	gui/Dashboard/src/components/LiveTradingPanel.jsx	Full panel implementation
MODIFY	gui/Dashboard/src/store/settingsStore.js	Add liveTrading settings section
MODIFY	gui/Dashboard/src/components/SettingsPanel.jsx	Add Live Trading settings UI