# 👔 Team Leader — SSID Persistence Fix Plan (v2 — Adapted 28-02-2026)

## 🔍 @Investigator Forensic Report

### Summary
The SSID persistence system has **5 critical gaps** that cause the SSID to reset every time the user switches tabs, panels, or starts a new session — despite the backend already having `.env` persistence logic.

Additionally, a **UI audit of the Settings Panel** (screenshot review, 28-02-2026) revealed **2 further gaps**:
- The **"Save & Close"** button saves to the global settings file but does **not** navigate away (no "Close") and does **not** flush to the Active Profile — it is a partial placeholder.
- The **"Export Config (JSON)"** button has **no `onClick` handler** — it is a complete placeholder.

These 2 gaps have been added as **Fix 6** and **Fix 7** to complete the UX story.

---

### Critical Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **CRITICAL** | `gateway/routes/trading.py` L28 | `ConnectRequest.ssid` has `min_length=50` — **blocks empty SSID reconnection**. The ssid_service has fallback logic to use `.env` SSIDs when empty, but the gateway rejects empty strings before they reach it. |
| 2 | **CRITICAL** | `SettingsPanel.jsx` L7-8 | `useState('')` for `demoSsid`/`realSsid` — **local component state destroyed on unmount** (tab switch). Every time user navigates away and back, inputs are blank. |
| 3 | **HIGH** | `LiveTradingPanel.jsx` L~280 | `connect('', isDemoMode)` sends empty SSID — **always fails** because gateway rejects it (Issue #1). The "Connect Session" button is effectively broken for saved SSIDs. |
| 4 | **HIGH** | `tradingStore.js` | `ssid_demo`/`ssid_real` fields exist in DEFAULT_STATE but are **never populated** from backend. No `fetchSsidStatus()` action exists. Store is not persisted. |
| 5 | **MEDIUM** | `ssid_service/routes.py` | No endpoint to check if SSIDs are configured. Frontend has no way to know "we have a saved SSID" to show proper UI state. |
| 6 | **MEDIUM** | `SettingsPanel.jsx` | **"Save & Close" is a partial placeholder** — saves to global settings file only, no navigation away, no toast, not linked to Active Profile. |
| 7 | **LOW** | `SettingsPanel.jsx` | **"Export Config (JSON)" is a dead placeholder** — button has no `onClick` handler. Does nothing. |

---

### 🪲 @Debugger Root Cause Chain
```
User pastes SSID → SettingsPanel connects → SSID saved to .env ✓
User switches tab → SettingsPanel unmounts → useState('') resets ✗
User returns → Input fields empty, no indication SSID is saved ✗
User clicks "Connect Session" → sends empty '' → Gateway min_length=50 rejects ✗
Backend fallback logic in ssid_service NEVER reached ✗

User clicks "Save & Close" → saves global settings file ✓
                           → does NOT navigate away ✗
                           → does NOT flush to Active Profile (IRONMAN_BLUE) ✗
                           → shows no toast/confirmation ✗

User clicks "Export Config (JSON)" → nothing happens ✗
```

---

### ⚡ @Optimizer Assessment
- The `.env` persistence in `ssid_service/routes.py` `_persist_ssid()` already works correctly
- The `ssid_service/routes.py` `/connect` endpoint already has proper fallback: `ssid = req.ssid or (app.state.ssid_demo if req.demo else app.state.ssid_real)`
- The `switch-mode` endpoint also has fallback logic using `app.state.ssid_*`
- **90% of the backend logic is already correct** — the gateway validation is the bottleneck
- The **Profile system is fully functional** (`profileStore.js` auto-saves settings to the active profile via debounced subscription) — "Save & Close" just needs to flush immediately and navigate

### ✂️ @Code_Simplifier Assessment
- No rewrite needed — this is a **targeted 7-file fix**, not structural debt
- Each fix is small, focused, and doesn't change existing behavior for non-empty SSIDs
- Fixes 6 & 7 are **pure frontend** — no backend changes required

---

### 🏗️ @Architect — Profile ↔ SSID Linkage Design

The profile system (`profileStore.js`) already stores the full `settings` object inside each profile JSON file (`data/profiles/{profile-id}.json`). The SSID itself stays in `.env` for security — the profile records only **whether an SSID slot is configured** (`hasDemoSsid: bool`, `hasRealSsid: bool`) as metadata inside `settings.liveTrading`.

```
User pastes SSID → "Connect & Save" → ssid_service validates → saves to .env
                                                              ↓
                                    hasDemoSsid: true stored in profile settings
                                                              ↓
                    Profile JSON: { settings: { liveTrading: { hasDemoSsid: true } } }
                                                              ↓
                  When IRONMAN_BLUE is active → UI shows "✓ SSID configured for this profile"
                  When profile switches → UI checks hasDemoSsid for that profile
```

The `.env` SSID is **global** (one per machine). The profile records **whether that SSID was configured while this profile was active**. This is the simplest correct approach — no raw SSID values ever stored in profile JSON.

---

## 📋 Fix Plan (7 Targeted Changes)

### Fix 1: Gateway — Allow empty SSID for reconnection
**File:** `backend/services/gateway/routes/trading.py`
- Change `ConnectRequest.ssid` from `Field(..., min_length=50)` to `Field(default="", description="...")`
- Move the `min_length` validation into the validator — only validate when SSID is non-empty
- When empty, pass through to ssid_service which uses `.env` fallback

### Fix 2: SSID Service — Add `/ssid-status` endpoint
**File:** `backend/services/ssid_service/routes.py`
- Add `GET /ssid-status` → returns `{ hasDemoSsid: bool, hasRealSsid: bool }`
- Does NOT expose actual SSID values (security)
- Frontend uses this to show "SSID saved" indicators

### Fix 3: Gateway — Proxy the new `/ssid-status` endpoint
**File:** `backend/services/gateway/routes/trading.py`
- Add proxy endpoint `GET /ssid-status` → forwards to ssid_service

### Fix 4: Frontend Store — Add SSID status tracking
**File:** `gui/Dashboard/src/store/tradingStore.js`
- Add `hasDemoSsid` / `hasRealSsid` boolean fields to `DEFAULT_STATE`
- Add `fetchSsidStatus()` action that calls `GET /api/v1/trading/ssid-status`
- Call `fetchSsidStatus()` on app mount and after successful connect

### Fix 5: Frontend UI — Show saved SSID state properly
**File:** `gui/Dashboard/src/components/SettingsPanel.jsx`
- On mount, call `fetchSsidStatus()` to check if SSIDs are saved
- Show "✓ SSID saved" badge when `hasDemoSsid`/`hasRealSsid` is true
- Change placeholder to "SSID saved — paste new to replace" when saved
- Input only needed when user wants to UPDATE the SSID

**File:** `gui/Dashboard/src/components/LiveTradingPanel.jsx`
- "Connect Session" button already sends empty SSID — will work after Fix 1
- Show "Using saved SSID" indicator when `hasDemoSsid`/`hasRealSsid` is true

### Fix 6 (NEW): Wire "Save & Close" Correctly — Profile-Aware Save + Navigate
**File:** `gui/Dashboard/src/components/SettingsPanel.jsx`

**Current behaviour (broken):**
- Calls `saveSettings()` → writes to `data/settings/platform_settings.json` ✓
- No navigation away from Settings ✗
- No toast/confirmation ✗
- Does NOT flush to the Active Profile (e.g. IRONMAN_BLUE) ✗

**Fixed behaviour:**
```
handleSave = async () => {
  1. saveSettings()                          ← saves global settings file (already works)
  2. profileStore.updateProfile(             ← immediate flush to active profile JSON
       activeProfileId,
       { settings: currentSettings }
     )
  3. show inline toast: "Saved to [PROFILE_NAME] ✓"
  4. setActiveTab('dashboard')               ← the "Close" part (navigate away)
}
```

**Implementation notes:**
- Import `useProfileStore` and `useMarketStore` into `SettingsPanel.jsx`
- Read `activeProfileId` and `profiles` from `profileStore` to get the active profile name for the toast
- `setActiveTab('dashboard')` uses the existing `marketStore.setActiveTab` action
- Toast is a simple inline state (`useState`) — no external library needed

### Fix 7 (NEW): Wire "Export Config (JSON)" Button
**File:** `gui/Dashboard/src/components/SettingsPanel.jsx`

**Current behaviour:** Button has no `onClick` — does nothing.

**Fixed behaviour:** On click, trigger a browser file download of the current settings as a JSON file, named after the active profile:
```
filename: QuFLX_Settings_IRONMAN_BLUE_2026-02-28.json
content:  { profileName, exportedAt, settings: { ...currentSettings } }
```

**Implementation notes:**
- Pure frontend — no backend call needed
- Use `URL.createObjectURL(new Blob([JSON.stringify(...)], { type: 'application/json' }))` pattern
- Filename includes active profile name and today's date for traceability
- This is the "Settings Config File" the user can share, backup, or import later

---

## Expected Behavior After All 7 Fixes

1. ✅ User pastes SSID once → verified → saved to `.env`
2. ✅ Switching tabs/panels → SSID stays saved, UI shows "SSID saved" indicator
3. ✅ New session → "Connect Session" uses saved `.env` SSID automatically
4. ✅ Auth fails (SSID expired) → 401 error shown → user pastes new SSID
5. ✅ Only when SSID is no longer recognized does user need to replace it
6. ✅ "Save & Close" → saves settings, flushes to IRONMAN_BLUE profile, shows toast, navigates to Dashboard
7. ✅ "Export Config (JSON)" → downloads `QuFLX_Settings_IRONMAN_BLUE_2026-02-28.json` with full settings

---

## Fix Priority & Sequence

| # | Fix | Files Touched | Priority | Type |
|---|-----|---------------|----------|------|
| 1 | Gateway allow empty SSID | `gateway/routes/trading.py` | CRITICAL | Backend |
| 2 | ssid_service `/ssid-status` endpoint | `ssid_service/routes.py` | HIGH | Backend |
| 3 | Gateway proxy `/ssid-status` | `gateway/routes/trading.py` | HIGH | Backend |
| 4 | tradingStore SSID status tracking | `tradingStore.js` | HIGH | Frontend |
| 5 | SettingsPanel SSID saved state UI | `SettingsPanel.jsx`, `LiveTradingPanel.jsx` | HIGH | Frontend |
| 6 | Wire Save & Close (profile flush + navigate) | `SettingsPanel.jsx` | MEDIUM | Frontend |
| 7 | Wire Export Config (JSON) | `SettingsPanel.jsx` | LOW | Frontend |

---

*Plan adapted: 28-02-2026 | Trigger: Settings Panel UI audit (screenshot review)*  
*Original plan: 5 fixes | Adapted plan: 7 fixes (+2 frontend-only additions)*  
*Ready to implement. Awaiting **APPROVE AND PROCEED** to toggle to Act mode.*
