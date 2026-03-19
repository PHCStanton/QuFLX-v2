You are working on the OTC_SNIPER project.

**Critical Context & Constraint:**
The asset list in the left sidebar is populated **exclusively via the SSID method** (from Pocket Option WebSocket / backend/session.py and payouts.py). 
We are **NOT** using the Selenium "Favorite Select" capability like in the QuFLX-v2 project.

**Goal:**
Implement proper asset selection handling so that when a trader clicks/selects any asset in the left sidebar (SSID Assets List), the system immediately:
1. Focuses the live tick stream on that exact asset.
2. Activates the OTEO engine (files located in `/ssid\web_app\backend\src`):
   - `manipulation_detector.py`
   - `oteo_engine.py`
   - `oteo_indicator.py`
3. Delivers correct real-time OTEO scores + manipulation flags.
4. Feeds the data correctly to the Sparkline (SVG version) for accurate visual display.

**Requirements:**

- All logic must live in the backend (clear separation of concerns). 
- The collector and/or `@ssid\web_app\backend\main.py` must correctly handle the "focus asset" request.
- Create a dedicated class if needed (suggested name: `SSIDAssetFocusManager` or `AssetStreamFocusHandler`) to manage the focused tick stream. This class should be reusable in future projects.
- When an asset is selected in the sidebar:
  - Update the active symbol in the backend.
  - Route only that asset’s ticks to OTEOEngine + ManipulationDetector.
  - Ensure `update_tick()` and `update_history()` receive the correct data.
  - Push the resulting OTEO score + flags via Socket.IO (`oteo_update` and `manipulation_alert` events).
- The Sparkline (SVG) must receive clean, correctly scoped data and render without lag or incorrect values.

**Success Criteria:**
- Selecting a new asset instantly switches the live OTEO calculation and Sparkline to that asset only.
- No cross-contamination between assets.
- Clear, modular code that can be copied into other projects without modification.

Please implement this step-by-step, starting with the new focus handler class (if required), then updating `main.py` and the relevant stream manager. Show the exact code changes and explain the flow.