# Chart Rendering Issues - Troubleshooting Guide

**Last Updated**: 2025-12-02

---

## Issues Fixed in Phase 1

### 1. "Only One Candle Displayed"

**Previous Behavior**:
- Chart showed a single static candle from mock data
- This candle never changed regardless of live price updates
- Asset switching didn't update the chart

**What Was Wrong**:
- ChartWorkspace initialized with 10 hardcoded mock data points
- Live Socket.IO data arrived but was never used
- Chart display was disconnected from real market data

**Current Behavior**:
- Chart starts empty on asset selection
- First real market tick creates the first candle
- Candle updates continuously as ticks arrive
- Switching assets clears the chart and loads new asset's data

**User Verification**:
1. Open Dashboard and select an asset
2. You should see a loading spinner
3. Once data arrives, first candle appears
4. Watch candle's close price change with incoming ticks
5. Switch to different asset - chart should clear and show new asset's price

---

### 2. "Chart Not Following Selected Asset Price"

**Previous Behavior**:
- Chart could receive market data from multiple assets simultaneously
- No validation that incoming data matched the selected asset
- You could select EURUSD but see AUDNZD price data

**What Was Wrong**:
- Frontend subscribed to generic `market_data` event (all assets)
- No asset matching validation in the chart update logic
- MarketData state accumulated data from all assets without filtering

**Current Behavior**:
- Frontend joins asset-specific Socket.IO room (e.g., `market_data:EURUSD`)
- Only data for the selected asset is processed
- Chart automatically ignores data from other assets
- Market state only holds current asset's data

**User Verification**:
1. Open DevTools Console (F12)
2. Select asset A (e.g., AUDNZD) and note the price
3. Switch to asset B (e.g., EURUSD) - price should immediately change
4. Switch back to A - price should return to A's value
5. Watch the asset-specific room joins in Network/WebSocket tab

---

### 3. "Timeframe Selection Fails (500 Error)"

**Current Behavior** (Frontend Side):
- Error message appears in red banner at top of chart area
- Shows what went wrong
- User can dismiss error with ✕ button
- Chart remains operational

**What Happens on Backend**:
The 500 error indicates backend timeframe selector couldn't find UI elements in Pocket Option. This is a separate issue being tracked for Phase 2.

**User Workaround**:
- If timeframe selection fails, you can:
  1. Switch assets (this clears the chart)
  2. Try selecting timeframe again
  3. Check backend logs for UI selector errors
  4. Manually change timeframe in Pocket Option browser if needed

---

## New Features Added

### Loading State Indicator
- **When Appears**: Asset switch or timeframe change
- **What Shows**: Spinner with text "Loading data for {asset}..."
- **When Disappears**: Automatically when first data point arrives (or 3s timeout)

### Error Message Banner
- **When Appears**: Backend operation fails (e.g., timeframe selection)
- **What Shows**: Error description and dismissal button
- **Auto-Hide**: No (user must dismiss with ✕)

### Data Validation Logging
- **What It Does**: Console logs if data arrives for wrong asset
- **Useful For**: Debugging multi-asset scenarios
- **Example Log**: `Data asset mismatch: expected EURUSD, got AUDNZD`

---

## Architecture Changes

### Socket.IO Room Subscriptions

**Before**:
```
Client → Subscribe: generic "market_data" → Receive all assets
```

**After**:
```
Client → Subscribe: "market_data:EURUSD" → Receive only EURUSD
Client → Subscribe: "market_data:AUDNZD" → Receive only AUDNZD
(One room per selected asset)
```

### Market State Lifecycle

**Before**:
```
marketData = {
  EURUSD: {...},
  AUDNZD: {...},
  GBPUSD: {...}  // Accumulated from all assets
}
```

**After**:
```
When asset is EURUSD:
  marketData = {
    EURUSD: {...}  // Only current asset
  }

When asset switches to AUDNZD:
  marketData = {}  // Cleared
  Then refills with AUDNZD data
```

---

## Debugging Guide

### "Chart is still showing only one candle"

**Check**:
1. Open DevTools (F12) → Console
2. Select an asset
3. Look for message: `Asset changed to: EURUSD, clearing chart`
4. Wait for next message: `Socket connected` or `market_data` events
5. If no events appear, backend may not be streaming

**Next Steps**:
- Verify backend Gateway service is running
- Check Redis is running (`redis-cli ping` should return PONG)
- Look at backend logs for errors

### "Chart updates slowly or shows stale data"

**Check**:
1. Console → Select asset
2. Look for: `Data asset mismatch` warnings (would indicate wrong data)
3. Watch Network tab for WebSocket activity on `io/?EIO=4` connection
4. Should see rapid messages (ticks) arriving

**If Slow**:
- Frontend: Check browser CPU/memory (DevTools Performance tab)
- Backend: Check Redis and Gateway logs
- Network: Check if connection is stable (no disconnects)

### "Asset switching doesn't work"

**Check**:
1. Console should show: `Client {sid} subscribed to {asset}`
2. And: `Client {sid} requested to select asset: {asset}`
3. Look for error messages in red banner

**If Failing**:
- Check Socket.IO connection is active
- Verify asset name matches one of 92% payout assets
- Check backend `asset_control.py` logs for UI selector errors

---

## Expected Behavior Summary

| Action | Expected Result |
|--------|-----------------|
| Select Asset | Chart clears, loading spinner appears, new asset data flows in |
| Data Arrives | Loading spinner hides, first candle appears |
| Price Ticks | Current candle's close/high/low updates in real-time |
| Switch Asset | Old data cleared, loading spinner shows, new asset price appears |
| Change Timeframe | Chart clears, error appears if backend fails, new data expected |
| Multiple Assets | Only selected asset shows; others ignored |
| Rapid Switching | Latest selection always wins; no data mixing |

---

## Known Limitations (Phase 2)

1. **Timeframe Selection UI** - Backend selectors may not match current Pocket Option DOM
2. **Timeframe Mapping** - Currently all timeframes use 60s interval (1m) in frontend aggregation
3. **Historical Data** - No mechanism to fetch past candles on asset switch
4. **Error Recovery** - Errors don't auto-retry; user must manually retry

---

## Questions or Issues?

If you see behavior that doesn't match above:

1. **Check console logs** - Look for validation messages, asset mismatches, or errors
2. **Check network tab** - Verify WebSocket connection is active and receiving data
3. **Check backend logs** - Look for Redis connectivity or script execution errors
4. **Review PHASE1_FRONTEND_FIXES_SUMMARY.md** - Technical details of changes

For backend issues (500 errors, UI selectors), proceed to Phase 2 investigation.
