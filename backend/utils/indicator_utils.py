import json
import time
from threading import Lock
from typing import Any, Dict, Optional, Tuple

import pandas as pd

from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
from backend.utils.asset_utils import normalize_asset
from backend.utils.data_store import get_candle_path, timeframe_to_str

_INDICATOR_CACHE_TTL_SECONDS = 5.0
_INDICATOR_CACHE: Dict[Tuple[str, int, str], Tuple[float, float, pd.DataFrame, int]] = {}
_INDICATOR_CACHE_LOCK = Lock()


def _build_cache_key(
    normalized_asset: str,
    timeframe_min: int,
    pipeline_params: Optional[Dict[str, Any]],
) -> Tuple[str, int, str]:
    params_signature = json.dumps(pipeline_params or {}, sort_keys=True, separators=(",", ":"), default=str)
    return normalized_asset, timeframe_min, params_signature


def calculate_indicators_for_asset(
    asset: str,
    timeframe_min: int,
    pipeline_params: Optional[Dict[str, Any]] = None,
    current_candle: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, int]:
    """
    Calculate indicators for one asset/timeframe using the in-process pipeline.
    Safe to call from asyncio.to_thread().
    """
    normalized_asset = normalize_asset(asset)
    cache_key = _build_cache_key(normalized_asset, timeframe_min, pipeline_params)
    csv_path = get_candle_path(normalized_asset, timeframe_to_str(timeframe_min))
    if not csv_path or not csv_path.exists():
        raise FileNotFoundError(f"History not found for {normalized_asset} @ {timeframe_min}m")

    if current_candle is None:
        csv_mtime = float(csv_path.stat().st_mtime)
        now = time.monotonic()
        with _INDICATOR_CACHE_LOCK:
            cached = _INDICATOR_CACHE.get(cache_key)
            if cached and cached[0] == csv_mtime and (now - cached[1]) < _INDICATOR_CACHE_TTL_SECONDS:
                return cached[2], cached[3]

    df = pd.read_csv(csv_path)

    if current_candle:
        if not isinstance(current_candle, dict):
            raise TypeError("current_candle must be a mapping")

        def _required_float(field_name: str) -> float:
            raw_value = current_candle.get(field_name)
            if raw_value is None:
                raise ValueError(f"current_candle is missing required field: {field_name}")
            try:
                return float(raw_value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"current_candle field '{field_name}' must be numeric") from exc

        ts = current_candle.get("time") or current_candle.get("timestamp")
        if ts is None:
            raise ValueError("current_candle is missing required field: timestamp")

        try:
            timestamp = float(ts)
        except (TypeError, ValueError) as exc:
            raise ValueError("current_candle field 'timestamp' must be numeric") from exc

        new_row = {
            "timestamp": timestamp,
            "open": _required_float("open"),
            "high": _required_float("high"),
            "low": _required_float("low"),
            "close": _required_float("close"),
        }
        if not df.empty and float(df.iloc[-1]["timestamp"]) == float(ts):
            for key, value in new_row.items():
                df.loc[df.index[-1], key] = value
        else:
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

    if df.empty:
        raise ValueError(f"History file is empty: {csv_path}")

    df.columns = [str(col).lower() for col in df.columns]
    pipeline = TechnicalIndicatorsPipeline(config={"indicator_params": pipeline_params or {}})
    result_df = pipeline.calculate_indicators(df, timeframe_min=timeframe_min)

    if current_candle is None:
        with _INDICATOR_CACHE_LOCK:
            _INDICATOR_CACHE[cache_key] = (
                csv_mtime,
                time.monotonic(),
                result_df,
                len(result_df),
            )

    return result_df, len(result_df)


def build_indicator_snapshots(result_df: pd.DataFrame, tail_count: int = 50) -> Dict[str, list]:
    """
    Build AI-friendly indicator snapshots keyed to align with frontend labels
    where possible, while still supplementing with additional backend-only series.
    """
    indicator_map = [
        ("RSI", "rsi_14"),
        ("CCI", "cci"),
        ("MACD Histogram", "macd_histogram"),
        ("DeMarker", "demarker"),
        ("ADX", "adx"),
        ("ATR", "atr_14"),
        ("Schaff Trend Cycle", "schaff_tc"),
        ("SuperTrend", "supertrend"),
        ("EMA", "ema_16"),
        ("Bollinger Bands", "bb_middle"),
        ("Support & Resistance", "support_level"),
        ("EMA Cross-Over", "ema_21"),
        ("RSI 21", "rsi_21"),
        ("MACD", "macd"),
        ("MACD Signal", "macd_signal"),
        ("BB Upper", "bb_upper"),
        ("BB Lower", "bb_lower"),
        ("BB Width", "bb_width"),
        ("ATR 21", "atr_21"),
        ("Plus DI", "plus_di"),
        ("Minus DI", "minus_di"),
        ("Stochastic %K", "stoch_k"),
        ("Stochastic %D", "stoch_d"),
        ("Williams %R", "williams_r"),
        ("ROC 10", "roc_10"),
        ("EMA 50", "ema_50"),
        ("EMA 100", "ema_100"),
        ("SuperTrend Direction", "supertrend_direction"),
        ("Resistance Level", "resistance_level"),
        ("Distance to Resistance %", "dist_to_resistance"),
        ("Distance to Support %", "dist_to_support"),
        ("Resistance Freshness", "resistance_freshness"),
        ("Support Freshness", "support_freshness"),
        ("S/R Flip", "sr_flip"),
    ]
    snapshots: Dict[str, list] = {}

    for display_name, column_name in indicator_map:
        points = _extract_points(result_df, column_name, tail_count)
        if points:
            snapshots[display_name] = points

    return snapshots


def _extract_points(result_df: pd.DataFrame, column_name: str, tail_count: int) -> list:
    if column_name not in result_df.columns:
        return []

    valid = result_df[["timestamp", column_name]].dropna()
    if valid.empty:
        return []

    tail = valid.tail(tail_count)
    points = []
    for _, row in tail.iterrows():
        points.append(
            {
                "time": int(float(row["timestamp"])),
                "value": _coerce_value(row[column_name]),
            }
        )
    return points


def _coerce_value(value: Any) -> Any:
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    return str(value)
