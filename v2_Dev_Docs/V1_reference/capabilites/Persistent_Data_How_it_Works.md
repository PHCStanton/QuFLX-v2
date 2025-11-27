# Persistent Data — How It Works

This guide explains how the realtime streaming persistence works in QuantumFlux, where files are saved, what gets written, and how to control it per session. It also provides command examples for common workflows on Windows PowerShell.

## Overview

- Supports saving BOTH tick and candle data during streaming sessions.
- Candle data: only CLOSED candles are persisted (the currently forming candle is never written).
- Rotation ensures manageable file sizes:
  - Candle CSVs: 100 closed candles per file (default)
  - Tick CSVs: 1000 ticks per file (default)
- Files are written thread‑safely with headers and unique per‑session filename prefixes.

Core capability (`capabilities/data_streaming.py`) remains unmodified. Persistence is injected from custom sessions so you can opt in/out cleanly.

## Save Locations

- Candles (CSV):  
  `data/data_output/assets_data/realtime_stream/1M_candle_data`
- Ticks (CSV):  
  `data/data_output/assets_data/realtime_stream/1M_tick_data`

Windows absolute example paths:
- `C:\QuFLX\data\data_output\assets_data\realtime_stream\1M_candle_data`
- `C:\QuFLX\data\data_output\assets_data\realtime_stream\1M_tick_data`

## What Gets Saved

- Tick CSV header: `timestamp,asset,price`  
  Each row is a single tick (UTC timestamp string, symbol name, price).
- Candle CSV header: `timestamp,open,close,high,low`  
  Each row is a CLOSED candle (UTC timestamp string + OHLC). The last forming candle is not saved until the next candle starts.

## File Naming and Rotation

- Per‑session prefixes include a session timestamp to avoid collisions across runs, e.g.:
  - Candles: `EURUSD_otc_1m_2025_09_29_00_10_00_part001.csv`
  - Ticks: `EURUSD_otc_ticks_2025_09_29_00_10_00_part001.csv`
- Rotation:
  - Candles: new file after 100 rows (default)
  - Ticks: new file after 1000 rows (default)

You can change chunk sizes with CLI flags (see below).

## Which Session Saves by Default?

- Data collection session (persistence ON by default):
  - `scripts/custom_sessions/data_stream_collect.py`
- Trading/strategy sessions (persistence OFF by default; opt‑in only):
  - `scripts/custom_sessions/data_collect_topdown_select.py`
  - `scripts/custom_sessions/TF_dropdown_open_close.py`

This separation avoids generating CSVs during strategy development or live ops unless you explicitly enable it.

## Command Examples (PowerShell)

Always run from project root `C:\QuFLX` in Windows PowerShell.

- Dedicated data collection (persist both by default):
```powershell
python scripts\custom_sessions\data_stream_collect.py --mode both
```

- Data collection with custom chunk sizes:
```powershell
python scripts\custom_sessions\data_stream_collect.py --mode both --candle-chunk-size 200 --tick-chunk-size 500
```

- Topdown strategy workflow (no persistence, default):
```powershell
python scripts\custom_sessions\data_collect_topdown_select.py --mode both
```

- Topdown strategy with ad‑hoc capture (opt‑in):
```powershell
python scripts\custom_sessions\data_collect_topdown_select.py --mode both --save-candles --save-ticks
```

- TF dropdown automation (no persistence, default):
```powershell
python scripts\custom_sessions\TF_dropdown_open_close.py --mode both
```

- TF dropdown automation with candle capture only:
```powershell
python scripts\custom_sessions\TF_dropdown_open_close.py --mode candle --save-candles
```

## CLI Flags (by session)

Common flags supported where persistence is available:

- `--save-candles`  
  Enable candle CSV saving (OFF by default in trading/strategy sessions).
- `--save-ticks`  
  Enable tick CSV saving (OFF by default in trading/strategy sessions).
- `--candle-chunk-size N`  
  Closed candle rows per CSV file (default 100).
- `--tick-chunk-size N`  
  Tick rows per CSV file (default 1000).

Data collection session also supports:
- `--no-save-candles`, `--no-save-ticks` to explicitly disable persistence if needed.

## Environment Overrides (Quick Toggles)

You can enable persistence without changing CLI flags via environment variables:

- Enable both:
```powershell
$env:QF_PERSIST = "1"
```

- Enable only candles:
```powershell
$env:QF_PERSIST_CANDLES = "1"
```

- Enable only ticks:
```powershell
$env:QF_PERSIST_TICKS = "1"
```

Unset by closing the terminal or removing the variables:
```powershell
Remove-Item Env:\QF_PERSIST
Remove-Item Env:\QF_PERSIST_CANDLES
Remove-Item Env:\QF_PERSIST_TICKS
```

Note: In trading/strategy sessions, persistence is injected only if a `--save-*` flag or an environment override is present.

## Streaming Modes and What’s Saved

- `--mode candle`  
  Candle data is streamed; tick saving requires `--save-ticks` plus non‑candle‑only streaming mode. In trading sessions, use `--save-candles` to persist candles.
- `--mode tick`  
  Tick data is streamed; no candle aggregation is emitted. Use `--save-ticks` to persist ticks.
- `--mode both`  
  Both are streamed; use `--save-candles`/`--save-ticks` to persist the respective data types in trading sessions. Data collection session persists both by default.

## How “Closed Candle” Is Determined

Internally, the streamer maintains per‑asset candle arrays. A candle is considered closed when the next candle starts. The persistence layer writes up to the last fully closed candle index and keeps track to avoid duplicates. The most recent forming candle remains in memory only until it closes.

## Troubleshooting

- “No CSV files are appearing”
  - In trading/strategy sessions: ensure you passed `--save-candles`/`--save-ticks` or set `QF_PERSIST*` env vars.
  - Confirm the session is attached to Chrome with `--remote-debugging-port=9222`.
  - Check write permissions to `data/data_output/assets_data/realtime_stream/`.
- “Too many small files”
  - Increase chunk sizes, e.g. `--candle-chunk-size 500`, `--tick-chunk-size 5000`.
- “Timestamps look off”
  - All timestamps are saved in UTC (`YYYY-MM-DD HH:MM:SSZ`).
- “Disk usage growing”
  - Reduce saved data types (disable ticks or candles), or use larger chunks to reduce file count, and archive periodically.

## Implementation Notes

- Implementation lives in:  
  `scripts/custom_sessions/stream_persistence.py`  
  - `RotatingCSVWriter`: header + row append + count‑based rotation  
  - `StreamPersistenceManager`: manages per‑asset (tick) and per‑(asset,timeframe) candle writers
- Sessions inject persistence by wrapping the streamer’s output method; the core capability is unchanged.
- Session‑scoped filename prefixes prevent collisions across runs and make session grouping straightforward.

## Quick Reference

- Data collection (persist ON):
```powershell
python scripts\custom_sessions\data_stream_collect.py --mode both
```

- Strategy/topdown (persist OFF by default):
```powershell
python scripts\custom_sessions\data_collect_topdown_select.py --mode both
python scripts\custom_sessions\TF_dropdown_open_close.py --mode both
```

- Opt‑in persistence:
```powershell
python scripts\custom_sessions\data_collect_topdown_select.py --mode both --save-candles --save-ticks
python scripts\custom_sessions\TF_dropdown_open_close.py --mode candle --save-candles
```

- Env override (enable both quickly):
```powershell
$env:QF_PERSIST = "1"
```

This setup gives you precise operational control: only the dedicated collector writes by default; trading and strategy sessions remain clean unless you explicitly enable persistence.
