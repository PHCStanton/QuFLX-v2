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
```

---

## FAQ

### 1. Why am I getting 404 on `/api/v1/history/{asset}/...`?
The history endpoint reads from **local CSV files** in `data/data_output/history/{asset}/`.
If no data has been collected yet, there's nothing to return → 404.

**Solution:** Use the **"Collect History"** button in the frontend first, or manually run the history collector script.

---

### 2. How does Tick Data get saved?
The Alert Dispatcher has a built-in `TickLogger` class:
- **Buffer**: Incoming data is buffered in memory.
- **Flush Threshold**: Every 1000 data points, it writes to a CSV file.
- **Location**: `data/ticks/{asset}/{timestamp_start}_{timestamp_end}.csv`

> **Note**: Currently the dispatcher fetches **candles** (not raw ticks). To log raw ticks, you would need to connect to the Redis `market_data` channel directly.

---

### 3. Can I use "Collect History" without the Alert System?
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
