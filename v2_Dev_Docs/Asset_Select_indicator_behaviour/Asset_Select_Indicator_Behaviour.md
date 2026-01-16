**Backend & Console Behavior on Asset Selection and Indicator Addition – QuFLX v2**  
**Documented: 16 January 2026**  
**Purpose:** Clear, structured overview of what happens in the backend (`gateway.py`, `history.py`, `indicators.py`, etc.) and frontend console when:

1. User selects a 92%+ payout asset  
2. Indicators are added (e.g. RSI)  
3. Three data modes: History Payload Only, History + Streaming, Streaming Only

### 1. Startup from localhost:5173 (Initial Load – No Asset Selected Yet)

**Frontend Console:**  (v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_A.png)
- No major errors on plain dashboard load  
- Typical startup sequence:  
  - `marketStore.js` initializes empty state  
  - `settingsStore.js` attempts to fetch settings → may log `Failed to fetch settings from backend: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON` (backend not responding or 404/500 returning HTML error page)

**Backend Terminal (`gateway.py`):**  
- No activity until first asset request  
- Health check may log:  
  ```
  INFO: 127.0.0.1:xxxxx - "GET /api/v1/status HTTP/1.1" 200 OK
  ```

### 2. History Payload Only Mode (Current Default Behavior on Asset Selection)

**User Action:** Select asset (e.g. AUD/USD OTC) with 92%+ payout filter

**Frontend Sequence:** (v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_B.png)
1. Asset selected → `marketStore.js` triggers `loadHistory`  
2. First check: `GET /api/v1/history/{asset}?timeframe=1&limit=200` → **404 Not Found** (no recent CSV)  
   - Console: `GET http://localhost:8000/api/v1/history/AUD/USD%20OTC?... 404 (Not Found)`
3. Triggers bootstrap: `POST /api/v1/history/bootstrap-history` → **200 OK** (if successful)  
   - Client subscribes to socket: `Client xxxx subscribed to AUDUSDOTC`
4. Indicators load (if added): `POST /api/v1/indicators` with params → computes from new CSV
(v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_C.png)
**Backend Terminal (`gateway.py`):**
`
(v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_D.png)
(v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_E.png)``
INFO: 127.0.0.1:xxxxx - "OPTIONS /api/v1/history/bootstrap-history HTTP/1.1" 200 OK
INFO: 127.0.0.1:xxxxx - "POST /api/v1/history/bootstrap-history HTTP/1.1" 200 OK
2026-01-16 xx:xx:xx,xxx - gateway.socket - INFO - Client xxxx subscribed to AUDUSDOTC
```

**When Indicators Added (e.g. RSI):**
- `loadIndicators` → `POST /api/v1/indicators` with asset/timeframe/indicators/params  
- Backend computes from latest CSV → returns series  
- Console: No errors if history exists; otherwise silent or `lastError` toast

**Red Ribbon Toast Example (Failure Case):**
```
Failed to append candle: No recent history file found for AUD/USD OTC @ 1m to append to.
```

### 3. History Payload + Streaming Mode (Live Feed Active)
(v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_F.png)

**User Action:** Asset selected, streaming active

**Frontend Sequence:**
1. Same as History Only: 404 → bootstrap → 200 OK → subscribe  
2. Streaming starts: `useTickAggregation` aggregates ticks into candles  
3. On each **new closed candle**:  
   - `POST /api/v1/history/append-candle` → **200 OK** (adds to CSV)  
   - Indicators refresh (via `onNewCandle` callback → `loadIndicators`)  
4. Console may show periodic `POST .../append-candle 200 OK`

**Backend Terminal:**
```
INFO: 127.0.0.1:xxxxx - "GET /api/v1/history/... 404 Not Found"
INFO: 127.0.0.1:xxxxx - "POST /api/v1/history/bootstrap-history HTTP/1.1" 200 OK
INFO: 127.0.0.1:xxxxx - "POST /api/v1/history/append-candle HTTP/1.1" 200 OK  (repeated on each new candle)
2026-01-16 xx:xx:xx,xxx - gateway.socket - INFO - Client xxxx subscribed to AUDUSDOTC

# ADDING INDICATORS
(v2_Dev_Docs\Asset_Select_indicator_behaviour\Screenshot_G.png)
- RSI 

CONSOLE ERROR: THIS ERROR OCCURS WHEN OPENING THE SIDEBAR, BUT NOT ALL THE TIME.
marketStore.js:645 Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.
```

### 4. Streaming Only Mode (Tick Collection – No History Load)

**Current Behavior (as implemented):**
- Skips `bootstrap-history` and history file checks  
- `useTickAggregation` builds candles purely from incoming ticks  
- Indicators remain unavailable until enough candles accumulate (warm-up period)  
- No `/api/v1/history/...` calls → no 404 spam  
- Console: Clean – only socket subscription logs

**Backend Terminal:**
- Minimal: only socket subscription log  
- No history-related requests

### Common Console Errors Observed

**When Sidebar Opens/Closes or Indicators Change:**
```
marketStore.js:645 Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.
```
→ Likely infinite loop in `useEffect` caused by state updates triggering re-renders without proper deps.

**When Settings Fetch Fails:**
```
settingsStore.js:111 Failed to fetch settings from backend: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```
→ Backend returns HTML error page (404/500) instead of JSON → JSON parse fails.

### Summary of Key Flows

| Mode                        | History Load? | Bootstrap Called? | Append-Candle? | Indicators Refresh? | Typical Console Noise |
|-----------------------------|---------------|-------------------|----------------|---------------------|-----------------------|
| History Payload Only        | Yes           | Yes (on 404)      | No             | Once (on load)      | 404 + bootstrap logs  |
| History + Streaming         | Yes           | Yes (on 404)      | Yes (candle close) | On load + each new candle | 404 + append logs     |
| Streaming Only              | No            | No                | No             | After warm-up       | Clean                 |

This flow is now stable and predictable after the recent fixes.  
The main remaining UX polish is the maximum update depth warning (likely `useEffect` dependency issue) and better error handling for settings fetch failures.

Let me know if you want me to compile a quick fix list for the console warnings or prepare the next implementation step (composite screenshot / unified tooltip).