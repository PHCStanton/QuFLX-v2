import os
import csv
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import re
import csv

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
    
    # Directory name (canonical)
    asset_clean = normalize_asset(asset)
    
    # Asset base name for filename
    asset_base = normalize_asset(asset.split("(")[0])
    
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
        writer.writerow(["timestamp", "open", "close", "high", "low"])
        for c in candles:
            try:
                ts = float(c.get("timestamp"))
                # Use float timestamp for unified format consistency
                open_ = float(c.get("open"))
                close = float(c.get("close"))
                high = float(c.get("high"))
                low = float(c.get("low"))
            except Exception:
                continue
            writer.writerow([ts, open_, close, high, low])

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
