Q1–Q8 Full Implementation Plan
All bug fixes and features from the 
Session Review (2026-03-10)
. Ordered by priority: critical fixes first, then features.

User Review Required
IMPORTANT

Scope decision: Q7A (S/R REST endpoint + panel) and Q8A (semi-auto chart markers) are medium-high effort features. This plan includes them but they can be deferred to a follow-up session if you prefer to focus on the critical fixes + Q5/Q6 first.

WARNING

Q8B (Auto-Trade via SSID) is intentionally excluded from this plan. It requires a dedicated safety architecture review and paper-trade mode before implementation.

Proposed Changes
Q2 — Tick Flush Threshold + Stale Data Improvements (Critical)
Reduces cold-start latency and adds graceful handling when data is stale.

[MODIFY] 
otc_alert_dispatch.py
Change default CHUNK_SIZE from 1000 → 200 (line 603):

diff
- self.CHUNK_SIZE = int(os.getenv("TICK_CHUNK_SIZE", "1000"))
+ self.CHUNK_SIZE = int(os.getenv("TICK_CHUNK_SIZE", "200"))
Add stale-data log throttling in 
fetch_data()
 (~line 1032): Track last STALE log per asset, only log once per 60s instead of every scan cycle:

python
# New instance variable in __init__:
self._stale_log_times: Dict[str, float] = {}
# In fetch_data(), replace the bare logger.warning:
now_ts = int(datetime.now().timestamp())
last_stale_log = self._stale_log_times.get(asset, 0)
if now_ts - last_stale_log >= 60:
    logger.warning(f"Data for {asset} is STALE ({age}s old). Skipping scan.")
    self._stale_log_times[asset] = now_ts
Add fetch_history fallback in 
fetch_data()
: When CSV is stale AND the API is reachable, trigger a fresh pull before returning empty:

python
# After the STALE return [], add:
# Attempt API fallback for fresh data
try:
    async with aiohttp.ClientSession() as session:
        url = f"{self.market_source_url}/{asset}/1m?limit={required_limit}"
        async with session.get(url, timeout=5) as resp:
            if resp.status == 200:
                data = await resp.json()
                candles = data.get('candles', []) or data.get('data', [])
                if candles:
                    logger.info(f"Stale CSV fallback: fetched {len(candles)} candles via API for {asset}")
                    return candles
except Exception as e:
    logger.debug(f"Stale CSV API fallback failed for {asset}: {e}")
return []
Q3 — Redis Publish Missing Events (Critical)
The gateway already subscribes to alerts:dispatched → new_alert, strategy:regime → regime_update, and trading:signals → trading_signal. Only the backend publishers are missing.

[MODIFY] 
otc_alert_dispatch.py
Publish strategy:regime after regime detection in 
process_asset()
 (~line 1100, after result = self.scanner.analyze(...)): When a non-neutral regime is detected, publish it to Redis so the frontend regime_update counter and 
RegimePanel
 receive data:

python
# After scanner.analyze() returns and result is not None:
if redis and result.get('is_tradeable'):
    try:
        client = await self._get_redis_client()
        regime_data = {
            "asset": asset,
            "regime": result['condition'].value if hasattr(result['condition'], 'value') else str(result['condition']),
            "trend": result.get('direction', '').lower() if result.get('direction') else 'neutral',
            "strength": result.get('confluence_score', 0) / 100,
            "volatility": result['technicals'].get('volatility_zone', 'normal'),
            "description": f"{result['condition'].value} — Score: {result.get('confluence_score', 0)}",
            "technicals": result['technicals'],
            "timestamp": datetime.now().isoformat()
        }
        await client.publish("strategy:regime", json.dumps(regime_data))
    except Exception as e:
        logger.error(f"Redis regime publish error for {asset}: {e}")
Publish trading:signals after developing alerts (~line 1146, after 
send_developing_alert()
):

python
# After self.discord.send_developing_alert(ctx):
if redis:
    try:
        client = await self._get_redis_client()
        signal_data = {
            "asset": ctx.asset,
            "regime": ctx.condition.value,
            "direction": ctx.direction,
            "expiry": ctx.suggested_expiry,
            "price": ctx.price,
            "confluence": ctx.technicals.get('confluence_score', 0),
            "status": "DEVELOPING",
            "timestamp": datetime.now().isoformat()
        }
        await client.publish("trading:signals", json.dumps(signal_data))
    except Exception as e:
        logger.error(f"Redis developing signal publish error for {asset}: {e}")
Q4 — 
reset_scanner()
 Safe Task Cleanup (Medium)
[MODIFY] 
otc_alert_dispatch.py
Make 
reset_scanner()
 await task cancellation like 
close()
 does (~line 892–914):

diff
async def reset_scanner(self):
      """Clears all active monitoring tasks and assets (Phase 4 #15)."""
      logger.info("♻️ Resetting Scanner Monitoring Pool...")
      
-     # 1. Cancel all worker tasks
-     for asset, task in self._asset_tasks.items():
-         if not task.done():
-             task.cancel()
-             logger.info(f"Stop: Cancelled worker for {asset}")
-     self._asset_tasks.clear()
+     # 1. Cancel all worker tasks (await safe cleanup like close())
+     tasks_to_cancel = [t for t in self._asset_tasks.values() if not t.done()]
+     for task in tasks_to_cancel:
+         task.cancel()
+     if tasks_to_cancel:
+         await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
+     logger.info(f"Stop: Cancelled {len(tasks_to_cancel)} worker task(s).")
+     self._asset_tasks.clear()
Q1 — Tick Log Startup Validation Warning (Medium)
[MODIFY] 
otc_alert_dispatch.py
Add a startup live-data check in 
run_loop()
 after the initial whitelist wait (~line 1318). After 
scan_available_assets()
, verify at least one asset has fresh CSV data within 60s:

python
# After discovered = self.scan_available_assets()
if discovered:
    has_fresh = False
    for a in discovered[:5]:  # Check first 5 assets
        folder = self.asset_folder_map.get(a, a)
        csv_path = get_recent_history_file(folder, 1)
        if csv_path and csv_path.exists():
            import pandas as pd
            try:
                df_check = pd.read_csv(csv_path, nrows=1, usecols=[0])
                ts_col = df_check.columns[0]
                last_ts = float(df_check.iloc[0][ts_col])
                age = int(datetime.now().timestamp()) - int(last_ts)
                if age < 300:  # Less than 5 minutes old
                    has_fresh = True
                    break
            except Exception:
                pass
    
    if not has_fresh:
        logger.warning("⚠️ WARNING: No live tick data detected — all CSVs are stale or empty. Check Chrome stream is active and Tick Logging is ON.")
Q5 — Native Bell Notification System (TopBar)
Adds an in-app notification bell to the TopBar with badge counter and dropdown panel.

[NEW] 
notificationStore.js
Zustand store for notification state:

notifications: [] — last 50 notifications (newest first)
unreadCount: number — badge counter
addNotification(data) — push + increment unread
markAllRead() — reset unread count
clearAll() — empty the list
Persisted to localStorage
[NEW] 
NotificationBell.jsx
Bell icon component with:

Bell icon from lucide-react
Red badge with unreadCount (hidden when 0)
Click toggles a dropdown panel showing last 20 notifications
Each notification shows: asset, direction emoji, regime, confluence score, timestamp
"Mark all read" button in dropdown header
Styled to match existing TopBar badges
[MODIFY] 
TopBar.jsx
Add NotificationBell between the status badges and ProfileMenu:

diff
<div className="flex items-center gap-4">
+   <NotificationBell />
    <ProfileMenu />
  </div>
[MODIFY] 
marketStore.js
In the socket.on('new_alert') handler (~line 1184), also push to the notification store:

diff
socket.on('new_alert', (data) => {
    console.log('New In-App Alert:', data);
    set((state) => ({
      alertFeed: [data, ...state.alertFeed].slice(0, 50)
    }));
+   // Push to native notification store
+   try {
+     const { default: useNotificationStore } = await import('./notificationStore');
+     useNotificationStore.getState().addNotification(data);
+   } catch (err) { console.warn('Notification store push failed', err); }
    // Play alert sound...
  });
Q6 — Regime Detector Summary in Global Controls
Adds a compact regime status row to the existing 
GlobalControls.jsx
. Not a multi-asset panel (that requires Q3 regime publishing for all assets). This is a single-asset regime badge showing the current regime for the selected asset.

[MODIFY] 
GlobalControls.jsx
Add a regime status section between the session status and the action row (~line 400):

jsx
{/* Regime Indicator */}
{currentRegime && currentRegime.asset === selectedAsset && (
  <div className="px-2 py-2 rounded-xl bg-black/35 border border-border-primary/50 shadow-inner flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Activity size={12} className="text-text-secondary" />
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-text-secondary">Regime</span>
    </div>
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-black uppercase tracking-wider ${
        currentRegime.trend === 'bullish' ? 'text-green-400' :
        currentRegime.trend === 'bearish' ? 'text-red-400' : 'text-gray-400'
      }`}>{currentRegime.regime}</span>
      <span className={`px-1.5 py-0.5 text-[8px] rounded-full font-bold ${
        currentRegime.is_tradeable !== false ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>{currentRegime.is_tradeable !== false ? '🟢' : '🔴'}</span>
    </div>
  </div>
)}
This requires importing currentRegime and selectedAsset from marketStore in the component (currently they are not imported — will add to the props or use the store hook).

Q7A — S/R REST Endpoint (Backend Only — Frontend Deferred)
Adds a new endpoint that surfaces multi-timeframe S/R levels from the existing indicator pipeline.

[NEW] 
sr_levels.py
New route file at backend/services/gateway/routes/sr_levels.py:

GET /api/v1/strategy/sr-levels?asset=CADJPYOTC&timeframes=1,5,15,60
For each timeframe, reads the CSV and runs TechnicalIndicatorsPipeline to extract S/R levels
Returns sorted list: { level, type (S/R), timeframe_label, touches, freshness, distance_to_price }
Sorted by relevance (touches × freshness × proximity)
Uses the existing get_recent_history_file() utility
[MODIFY] 
main.py
Register the new route:

python
from backend.services.gateway.routes import sr_levels
app.include_router(sr_levels.router, prefix="/api/v1/strategy", tags=["Strategy"])
Q8A — Semi-Auto Chart Markers from Alerts
When a new_alert Socket.IO event fires, auto-plot an arrow marker at the alert price on the active chart.

[MODIFY] 
marketStore.js
In the socket.on('new_alert') handler, also push to a new alertMarkers array if the alert asset matches the selected asset:

javascript
alertMarkers: [],  // [{ time, position, color, shape, text }]
// In new_alert handler:
if (data.asset === get().selectedAsset) {
  const marker = {
    time: Math.floor(Date.now() / 1000),
    position: data.direction === 'CALL' ? 'belowBar' : 'aboveBar',
    color: data.direction === 'CALL' ? '#22c55e' : '#ef4444',
    shape: data.direction === 'CALL' ? 'arrowUp' : 'arrowDown',
    text: `${data.direction} ${data.regime?.split(' ')[0] || ''}`,
  };
  set((state) => ({
    alertMarkers: [...state.alertMarkers, marker].slice(-20)
  }));
}
[MODIFY] 
useChartMarkers.js
Extend the existing hook to also consume alertMarkers from marketStore and merge them with any existing Strategy Lab markers before applying to the chart series.

Verification Plan
Automated Tests
Existing tests (17 test files in backend/tests/) — run the full regression suite:

powershell
cd c:\QuFLX\v2
conda activate QuFLX-v2 ; python -m pytest backend/tests/ -v --tb=short
New test — Q3 Redis publish (backend/tests/test_alert_dispatch_publish.py):

Unit test that mocks Redis and verifies process_asset() publishes to strategy:regime and trading:signals channels
Verifies payload structure matches what the gateway expects
New test — Q4 reset_scanner cleanup:

Unit test that creates mock tasks, calls reset_scanner(), and asserts:
All tasks are cancelled
asyncio.gather() was awaited
No TaskDestroyedError
Manual Verification
Q2 — Tick flush: Start the dispatcher, observe log output. Confirm flushes happen at 200 ticks instead of 1000. Verify stale warnings are throttled to once per 60s per asset.

Q3 — Redis events:

Start the dispatcher and gateway
Open the Dashboard in the browser
Wait for a regime detection → verify the RegimePanel on the chart updates
Wait for a developing signal → verify the console logs a trading_signal Socket.IO event
Q5 — Bell notifications:

Open the Dashboard
Verify a bell icon appears in the TopBar next to the profile menu
When an alert fires (or simulate via Redis PUBLISH alerts:dispatched '{"asset":"TEST","direction":"CALL","regime":"Test"}'), verify the badge increments and the dropdown shows the notification
Q7A — S/R endpoint:

powershell
curl http://localhost:8000/api/v1/strategy/sr-levels?asset=CADJPYOTC&timeframes=1,15
Verify JSON response contains S/R levels sorted by relevance.

NOTE

For Q5 and Q8A, the best verification is visual — opening the Dashboard in the browser and confirming the UI elements appear and function correctly. If the user has a preferred way to simulate alert events for testing, please advise.