# OTC Alert Dispatcher - User Guide

## Quick Start

### Running the Backend (Pick ONE)
```bash
# Option A: Standard (Recommended for Development)
uvicorn backend.services.gateway.main:app --reload
Will this 
# Option B: Direct Python (if uvicorn not available)
python -m backend.services.gateway.main
```
> **Do NOT run both at the same time.** They both start the same server on port 8000.

---

### Running the Alert Dispatcher

```bash
# Test Mode (Mock data, no real API calls)
python backend/scripts/otc_alert_dispatch.py --test-alert

# Live Mode (Requires backend running + "Collect History" first)
python backend/scripts/otc_alert_dispatch.py --assets EURUSD_OTC GBPUSD_OTC

# Real-time Tick Logging Mode (Subscribes to Redis market_data)
python backend/scripts/otc_alert_dispatch.py --redis --assets EURUSD_OTC
```

---

## Dashboard Integration

The Alert Dispatcher is now integrated directly into the QuFLX Dashboard under the **Data Source** panel.

### Controls
1. **Auto-run Alerts (Toggle)**: When enabled, clicking "Collect History" will automatically start the Alert Dispatcher in the background for all favored assets.
2. **Tick Logging (Toggle)**: When enabled, starting the Alert Monitor will also subscribe to live ticks via Redis and log them to `data/ticks/`.
3. **Alert Monitor (START/STOP)**: Manually control the background dispatcher process.

### Benefits
- **Hands-off Operation**: No need to manually run the python script from the terminal.
- **Background Logging**: Raw ticks are saved in the background even if the browser isn't monitoring a specific asset.
- **Discord Alerts**: Real-time trade setup notifications based on AI-verified technical analysis.

---

## FAQ & Troubleshooting

### Q: Why do I get a 404 when clicking an asset?
**A:** This usually means the local history CSV hasn't been created yet. Click **"Collect History"** in the Data Source panel to fetch and save historical data for your favorite assets.

### Q: Does "Collect History" affect the Alert Dispatcher?
**A:** If **"Auto-run Alerts"** is ON, starting history collection will also trigger the dispatcher. This ensures that by the time you have history, the sniper is already looking for setups on that data.

### Q: Where are the logs?
**A:** 
- **Script Logs**: `system_LOGS/alert_dispatch/dispatch.log`
- **Background Process Logs**: `data/data_output/logs/alerts_*.log`
- **Tick Data**: `data/ticks/{ASSET}/{start}_{end}.csv`

### Q: AI Connection Fails
**A:** Ensure the `backend.services.gateway.main` is running. In a local environment, the dispatcher connects to `http://localhost:8000/api/v1/ai/generate`.

---

## How does Tick Data get saved?
The Alert Dispatcher has a built-in `TickLogger` class:
- **Buffer**: Incoming data is buffered in memory.
- **Flush Threshold**: Every 1000 data points, it writes to a CSV file.
- **Location**: `data/ticks/{asset}/{timestamp_start}_{timestamp_end}.csv`

> **Note**: Currently the dispatcher fetches **candles** (not raw ticks). To log raw ticks, you would need to connect to the Redis `market_data` channel directly.

---

## Can I use "Collect History" without the Alert System?
**Yes!** They are independent:
- **Collect History**: Gathers historical candle data from the broker into local CSVs.
- **Alert System**: Monitors those CSVs (or live feeds) for trading conditions.

You can collect history anytime to build your local data archive.

---

## CLI Reference

| Flag | Description |
|------|-------------|
| `--help` | Show all options |
| `--test-alert` | Run once with mock data to verify Discord works |
| `--assets X Y Z` | Specify which assets to monitor (space-separated) |

---

## Recommended Workflow

1. **Start Backend**: `uvicorn backend.services.gateway.main:app --reload`
2. **Start Frontend**: `cd gui/Dashboard && npm run dev`
3. **Collect History**: Click "Collect History" button for desired assets.
4. **Run Dispatcher**: `python backend/scripts/otc_alert_dispatch.py`
5. **Monitor Discord**: Alerts appear when conditions are met.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404 on history` | No CSV data exists | Run "Collect History" first |
| `Discord Webhook missing` | `.env` not configured | Add `DISCORD_WEBHOOK_URL` to `.env` |
| `AI Connection Failed` | Backend not running | Start backend with uvicorn |
