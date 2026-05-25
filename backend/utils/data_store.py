import os
import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
import pandas as pd
from backend.utils.asset_utils import normalize_asset

# Define base paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
SUPABASE_DATA_DIR = BASE_DIR / "data" / "supabase_migration_data"
CANDLES_DIR = SUPABASE_DATA_DIR / "candles"
SESSIONS_DIR = SUPABASE_DATA_DIR / "sessions"

# Ensure directories exist
CANDLES_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)

CANDLE_COLUMNS = [
    "timestamp", "open", "high", "low", "close", "volume", 
    "session_id", "source", "created_at"
]

def get_candle_path(asset: str, timeframe_str: str) -> Path:
    """Get the file path for a specific asset and timeframe."""
    asset_clean = normalize_asset(asset)
    if not asset_clean:
        raise ValueError(f"Cannot normalize asset: {asset!r}")

    tf = str(timeframe_str).strip().lower()
    if not tf:
        raise ValueError(f"Invalid timeframe string: {timeframe_str!r}")

    return CANDLES_DIR / f"{asset_clean}_{tf}.csv"

def get_session_path() -> Path:
    """Get the path to the sessions JSONL file."""
    return SESSIONS_DIR / "sessions.jsonl"

def generate_session_id() -> str:
    """Generate a unique session ID."""
    return f"sess_{uuid.uuid4().hex[:8]}"

def timeframe_to_str(minutes: int) -> str:
    """Convert integer minutes to string timeframe representation."""
    mapping = {
        1: "1m",
        3: "3m",
        5: "5m",
        15: "15m",
        30: "30m",
        60: "1h",
        240: "4h",
        1440: "1d"
    }
    return mapping.get(minutes, f"{minutes}m")

def log_session(session_data: Dict[str, Any]) -> None:
    """Log a collection session to the sessions JSONL file."""
    session_path = get_session_path()
    with open(session_path, "a", encoding="utf-8") as f:
        json.dump(session_data, f)
        f.write("\n")

def read_candles(asset: str, timeframe_str: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Read candles from CSV, sorted ascending by timestamp. Returns oldest to newest."""
    path = get_candle_path(asset, timeframe_str)
    if not path.exists():
        return []
        
    try:
        df = pd.read_csv(path)
        if df.empty:
            return []
            
        # Ensure it's sorted by timestamp ascending
        df = df.sort_values(by="timestamp", ascending=True)
        
        if limit is not None and limit > 0:
            df = df.tail(limit)
            
        # Replace NaNs with None/null for JSON serialization
        df = df.where(pd.notnull(df), None)
            
        return df.to_dict(orient="records")
    except Exception as e:
        raise RuntimeError(f"Failed to read candles for {asset} {timeframe_str}: {e}") from e

def upsert_candles(asset: str, timeframe_str: str, candles: List[Dict[str, Any]], session_id: str, source: str) -> int:
    """
    Upsert candles into the CSV file.
    Deduplicates by timestamp (new values overwrite old).
    Maintains ascending sort order.
    Returns the number of candles written.
    """
    if not candles:
        return 0
        
    asset_clean = normalize_asset(asset)
    if not asset_clean:
        raise ValueError(f"Cannot normalize asset: {asset!r}")

    tf = str(timeframe_str).strip().lower()
    if not tf:
        raise ValueError(f"Invalid timeframe string: {timeframe_str!r}")

    path = get_candle_path(asset_clean, tf)
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # Format incoming candles
    new_rows = []
    for c in candles:
        try:
            ts_raw = c.get("timestamp", c.get("time"))
            if ts_raw is None:
                raise ValueError("missing timestamp")

            ts_val = int(float(ts_raw))
            if ts_val < 1000000000:
                raise ValueError(f"invalid timestamp: {ts_val}")

            new_rows.append({
                "timestamp": ts_val,
                "open": float(c["open"]),
                "high": float(c["high"]),
                "low": float(c["low"]),
                "close": float(c["close"]),
                "volume": float(c.get("volume", 0.0)),
                "session_id": session_id,
                "source": source,
                "created_at": created_at
            })
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed candle for %s %s: %r (%s)", asset_clean, tf, c, exc)
            continue

    if not new_rows:
        return 0
        
    new_df = pd.DataFrame(new_rows)
    
    if not path.exists():
        # First time writing
        new_df = new_df.sort_values(by="timestamp", ascending=True)
        new_df.to_csv(path, index=False, columns=CANDLE_COLUMNS)
        return len(new_df)
    
    try:
        # Read existing
        existing_df = pd.read_csv(path)
        
        # Combine
        combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        
        # Sanitize numeric columns to prevent comparison or typing errors.
        for col in ["timestamp", "open", "high", "low", "close", "volume"]:
            if col in combined_df.columns:
                combined_df[col] = pd.to_numeric(combined_df[col], errors="coerce")

        # Drop invalid critical OHLC rows rather than propagating impossible candles.
        combined_df = combined_df.dropna(subset=["timestamp", "open", "high", "low", "close"])
        if "volume" in combined_df.columns:
            combined_df["volume"] = combined_df["volume"].fillna(0.0)

        combined_df["timestamp"] = combined_df["timestamp"].astype(int)
        
        # Deduplicate by timestamp, keeping the last (newest) entry
        combined_df = combined_df.drop_duplicates(subset=["timestamp"], keep="last")
        
        # Sort ascending
        combined_df = combined_df.sort_values(by="timestamp", ascending=True)
        
        # Atomic write: write to temp file then rename
        temp_path = path.with_suffix(".csv.tmp")
        combined_df.to_csv(temp_path, index=False, columns=CANDLE_COLUMNS)
        os.replace(temp_path, path)
        
        return len(new_df)
    except Exception as e:
        raise RuntimeError(f"Failed to upsert candles for {asset} {timeframe_str}: {e}") from e


def delete_candles(asset: str, timeframe_str: Optional[str] = None) -> int:
    """
    Delete candle CSV files for a given asset.
    If timeframe_str is specified, deletes only that timeframe's file.
    Otherwise, deletes all timeframes for the asset.
    Returns the number of files deleted.
    """
    asset_clean = normalize_asset(asset)
    if not asset_clean:
        raise ValueError(f"Cannot normalize asset: {asset!r}")

    files_deleted = 0
    if timeframe_str:
        path = get_candle_path(asset_clean, timeframe_str)
        if path.exists():
            path.unlink()
            files_deleted += 1
    else:
        for path in CANDLES_DIR.glob(f"{asset_clean}_*.csv"):
            if path.exists():
                path.unlink()
                files_deleted += 1
    return files_deleted

