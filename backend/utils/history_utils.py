import logging
import warnings
from typing import List, Dict, Any, Optional
from pathlib import Path
from backend.utils.data_store import upsert_candles, get_candle_path
from backend.utils.asset_utils import normalize_asset

logger = logging.getLogger(__name__)

def persist_history_csv(asset: str, timeframe_min: int, candles: List[Dict[str, Any]]) -> None:
    """
    [DEPRECATED] Thin wrapper redirecting to data_store.upsert_candles.
    """
    warnings.warn("persist_history_csv is deprecated. Use backend.utils.data_store.upsert_candles instead.", DeprecationWarning, stacklevel=2)
    tf_str = f"{int(timeframe_min)}m"
    upsert_candles(
        asset=normalize_asset(asset),
        timeframe_str=tf_str,
        candles=candles,
        session_id="legacy_wrapper",
        source="legacy_persist_history_csv"
    )

def get_recent_history_file(asset: str, timeframe_min: int = 1) -> Optional[Path]:
    """
    [DEPRECATED] Thin wrapper redirecting to data_store.get_candle_path.
    """
    warnings.warn("get_recent_history_file is deprecated. Use backend.utils.data_store.get_candle_path instead.", DeprecationWarning, stacklevel=2)
    tf_str = f"{int(timeframe_min)}m"
    path = get_candle_path(normalize_asset(asset), tf_str)
    if path.exists():
        return path
    return None

def append_candle_to_history(asset: str, timeframe_min: int, candle: Dict[str, Any]) -> bool:
    """
    [DEPRECATED] Thin wrapper redirecting to data_store.upsert_candles.
    """
    warnings.warn("append_candle_to_history is deprecated. Use backend.utils.data_store.upsert_candles instead.", DeprecationWarning, stacklevel=2)
    tf_str = f"{int(timeframe_min)}m"
    written = upsert_candles(
        asset=normalize_asset(asset),
        timeframe_str=tf_str,
        candles=[candle],
        session_id="legacy_wrapper",
        source="legacy_append_candle_to_history"
    )
    return written > 0
