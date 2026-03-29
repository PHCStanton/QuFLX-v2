import os
import csv
import re
import logging
import pandas as pd
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import re
import csv

logger = logging.getLogger(__name__)

def persist_history_csv(asset: str, timeframe_min: int, candles: List[Dict[str, Any]]) -> None:
    """Persist candles to CSV so indicator endpoint can reuse the same history.

    Uses the unified filename format:
    data/data_output/history/{asset_clean}/{asset_base}_{asset_type}_{tf_str}_{now_ts}.csv
    """
    if not candles:
        return

    from .asset_utils import normalize_asset
    
    # Assuming this util is in backend/utils/, project root is 2 levels up
    root = Path(__file__).resolve().parents[2]
    
    # Canonical normalize — used for both directory name AND filename base
    # Single source of truth; no split needed.
    asset_clean = normalize_asset(asset)
    asset_base = asset_clean
    
    # Asset type
    asset_type = "otc" if "otc" in asset.lower() else "fx"
    
    # Timeframe string
    tf_str = f"{int(timeframe_min)}m"
    
    # Timestamp
    now_ts = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    
    # Unified filename
    filename = f"{asset_base}_{asset_type}_{tf_str}_{now_ts}.csv"
    
    save_dir = root / "data" / "data_output" / "history" / asset_clean
    save_dir.mkdir(parents=True, exist_ok=True)
    filepath = save_dir / filename

    # Always write to a NEW file as requested by user
    with filepath.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for c in candles:
            try:
                ts = float(c.get("timestamp"))
                # Use float timestamp for unified format consistency
                open_ = float(c.get("open"))
                high = float(c.get("high"))
                low = float(c.get("low"))
                close = float(c.get("close"))
                volume = float(c.get("volume", 0.0))
            except Exception:
                continue
            writer.writerow([ts, open_, high, low, close, volume])

def get_recent_history_file(asset: str, timeframe_min: int) -> Optional[Path]:
    """
    Finds the most recent history file for a given asset and timeframe.
    Uses the unified timestamp-based filename format in normalized directories.
    """
    from .asset_utils import normalize_asset
    
    asset_clean = normalize_asset(asset)
    root = Path(__file__).resolve().parents[2]
    asset_dir = root / "data" / "data_output" / "history" / asset_clean
    
    if not asset_dir.exists():
        return None

    files = list(asset_dir.glob("*.csv"))
    if not files:
        return None

    target_tf_str = f"{int(timeframe_min)}m"
    matching_files = []
    
    for f in files:
        fname = f.name.lower()
        # Check for unified format: ..._{tf_str}_{now_ts}.csv
        if f"_{target_tf_str}_" in fname:
            # Extract timestamp for sorting: 2026_01_05_14_59_30
            # Filename format: {asset_base}_{asset_type}_{tf_str}_{now_ts}.csv
            # now_ts is 6 parts: YYYY_MM_DD_HH_MM_SS
            parts = fname.replace(".csv", "").split("_")
            if len(parts) >= 6:
                ts_val = "_".join(parts[-6:])
                matching_files.append((f, ts_val))
            else:
                matching_files.append((f, "0"))

    if not matching_files:
        return None

    # Sort by timestamp (descending)
    matching_files.sort(key=lambda x: x[1], reverse=True)
    return matching_files[0][0]

def append_candle_to_history(asset: str, timeframe_min: int, candle: Dict[str, Any]) -> bool:
    """
    Finds the most recent history file and appends a single candle to it.
    If no history exists, it does nothing (use persist_history_csv for first time).
    """
    csv_path = get_recent_history_file(asset, timeframe_min)
    if not csv_path:
        return False

    try:
        # Check if timestamp already exists to avoid duplicates
        df = pd.read_csv(csv_path)
        new_ts = float(candle.get("timestamp") or candle.get("time"))

        row = {
            "timestamp": new_ts,
            "open": float(candle.get("open")),
            "high": float(candle.get("high")),
            "low": float(candle.get("low")),
            "close": float(candle.get("close")),
            "volume": float(candle.get("volume", 0.0)),
        }
        
        # If timestamp is exactly the same as last row, update it (it's the current candle)
        # But for 'registering new candles', we usually append a closed candle.
        if not df.empty:
            last_ts = float(df.iloc[-1]["timestamp"])
            if last_ts == new_ts:
                # Update last row
                for col, val in row.items():
                    if col in df.columns:
                        df.loc[df.index[-1], col] = val
                df.to_csv(csv_path, index=False)
                return True
            elif new_ts < last_ts:
                # Out of order or old data, ignore for now or handle appropriately
                return False

        # Append new row
        columns = list(df.columns) if not df.empty else [
            "timestamp",
            "open",
            "high",
            "low",
            "close",
            "volume",
        ]
        with csv_path.open("a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([row.get(col) for col in columns])
        return True
    except Exception as e:
        logger.error(f"Error appending candle to {csv_path}: {e}")
        return False
