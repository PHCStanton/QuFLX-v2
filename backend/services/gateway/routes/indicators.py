"""
OPT-1: In-process indicator calculation (no subprocess).

Replaces the previous asyncio.create_subprocess_exec() architecture with:
  1. Direct import of TechnicalIndicatorsPipeline + IndicatorCalculator
  2. CPU-bound work offloaded to asyncio.to_thread() (non-blocking gateway event loop)
  3. Per-asset DataFrame cache keyed by (asset, csv_path) — invalidated when the
     CSV file changes (new history bootstrap or candle append creates a new file).

Expected improvement: ~500ms → ~50ms per request (10x speedup, no disk I/O per tick).
"""

import asyncio
import hashlib
import json
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body

from backend.utils.data_store import get_candle_path
from backend.utils.asset_utils import normalize_asset
from backend.utils.indicator_utils import calculate_indicators_for_asset

router = APIRouter()
logger = logging.getLogger("gateway.indicators")

# ── In-memory DataFrame cache ────────────────────────────────────────────────
# Key: asset (str)  →  Value: (cache_key, params_hash, result_df)
# Invalidated when cache_key (csv_path + mtime) OR pipeline_params change.
# Fix 1: params_hash ensures parameter changes (e.g. EMA 16→20) always trigger
# a fresh calculation instead of returning stale cached results.
_df_cache: Dict[str, Tuple[str, str, pd.DataFrame]] = {}


def _params_hash(pipeline_params: Dict[str, Any]) -> str:
    """Deterministic MD5 hash of pipeline params dict (sorted keys)."""
    return hashlib.md5(
        json.dumps(pipeline_params, sort_keys=True).encode()
    ).hexdigest()


def _get_cache_key(csv_path: Path) -> str:
    """Generate a cache key based on file path and modification time."""
    try:
        mtime = csv_path.stat().st_mtime
        return f"{csv_path}:{mtime}"
    except FileNotFoundError:
        return f"{csv_path}:0"


def _get_cached_df(asset: str, csv_path: Path, params_hash: str) -> Optional[pd.DataFrame]:
    """Return cached result_df if BOTH cache_key AND params_hash match, else None."""
    cached = _df_cache.get(asset)
    cache_key = _get_cache_key(csv_path)
    if cached and cached[0] == cache_key and cached[1] == params_hash:
        return cached[2]
    return None


def _set_cached_df(asset: str, csv_path: Path, params_hash: str, df: pd.DataFrame) -> None:
    _df_cache[asset] = (_get_cache_key(csv_path), params_hash, df)


def _invalidate_cache(asset: str) -> None:
    """Explicitly evict an asset from the cache (e.g. after new history write)."""
    _df_cache.pop(asset, None)


# ── Series extraction helpers (vectorized — OPT-2 already applied here) ─────

def _extract_numeric(result_df: pd.DataFrame, col_name: str) -> list:
    if col_name not in result_df.columns:
        return []
    valid = result_df[["timestamp", col_name]].dropna()
    if valid.empty:
        return []
    times = valid["timestamp"].values.astype("float64").astype("int64")
    values = valid[col_name].values.astype("float64")
    return [{"time": int(t), "value": float(v)} for t, v in zip(times, values)]


def _extract_string(result_df: pd.DataFrame, col_name: str) -> list:
    if col_name not in result_df.columns:
        return []
    valid = result_df[["timestamp", col_name]].dropna()
    if valid.empty:
        return []
    # String columns are small — iterrows acceptable here
    return [
        {"time": int(float(row["timestamp"])), "value": str(row[col_name])}
        for _, row in valid.iterrows()
    ]


def _extract_bool(result_df: pd.DataFrame, col_name: str) -> list:
    if col_name not in result_df.columns:
        return []
    valid = result_df[["timestamp", col_name]].dropna()
    if valid.empty:
        return []
    times = valid["timestamp"].values.astype("float64").astype("int64")
    values = valid[col_name].values
    return [{"time": int(t), "value": bool(v)} for t, v in zip(times, values)]


def _extract_int(result_df: pd.DataFrame, col_name: str) -> list:
    if col_name not in result_df.columns:
        return []
    valid = result_df[["timestamp", col_name]].dropna()
    if valid.empty:
        return []
    times = valid["timestamp"].values.astype("float64").astype("int64")
    values = valid[col_name].values
    return [{"time": int(t), "value": int(v)} for t, v in zip(times, values)]


def _build_series(result_df: pd.DataFrame) -> Dict[str, list]:
    """Build the full series dict from a calculated result DataFrame."""
    series: Dict[str, list] = {}

    numeric_cols = [
        "sma_20", "ema_16", "ema_89", "wma_20",
        "rsi_14", "rsi_21", "stoch_k", "stoch_d", "williams_r", "roc_10",
        "macd", "macd_signal", "macd_histogram",
        "bb_upper", "bb_middle", "bb_lower", "bb_width", "bb_percent",
        "atr_14", "atr_21", "adx", "plus_di", "minus_di",
        "schaff_tc", "demarker", "cci",
        "supertrend",
        "support_level", "resistance_level",
        "ema_21", "ema_50", "ema_100",
        # INC-4: S/R Enhancement columns (Phases 1-5)
        "resistance_zone_upper", "resistance_zone_lower",
        "support_zone_upper", "support_zone_lower",
        "dist_to_resistance", "dist_to_support",
        "sr_flip_price",
    ]
    string_cols = ["supertrend_direction", "resistance_freshness", "support_freshness"]
    bool_cols = ["sr_flip"]
    int_cols = ["resistance_touch_count", "support_touch_count"]

    for col in numeric_cols:
        series[col] = _extract_numeric(result_df, col)
    for col in string_cols:
        series[col] = _extract_string(result_df, col)
    for col in bool_cols:
        series[col] = _extract_bool(result_df, col)
    for col in int_cols:
        series[col] = _extract_int(result_df, col)

    return series


# ── CPU-bound calculation (runs in thread pool via asyncio.to_thread) ────────

def _calculate_in_thread(
    asset: str,
    pipeline_params: Dict[str, Any],
    current_candle: Optional[Dict[str, Any]],
    timeframe_min: int = 1,
) -> Tuple[pd.DataFrame, Dict[str, list], int]:
    """
    Synchronous calculation — safe to run in a thread pool.
    Returns (result_df, series_dict, row_count).

    Fix 2: timeframe_min is forwarded to calculate_indicators() so the pipeline
    resamples to the correct grid (e.g. 5min for a 5m CSV) instead of always
    using the hardcoded 1min grid.
    """
    result_df, row_count = calculate_indicators_for_asset(
        asset=asset,
        timeframe_min=timeframe_min,
        pipeline_params=pipeline_params,
        current_candle=current_candle,
    )
    series = _build_series(result_df)
    return result_df, series, row_count


# ── Parameter mapping (frontend key → pipeline key) ─────────────────────────

def _map_params(custom_params: Dict[str, Any]) -> Dict[str, Any]:
    """Map frontend indicator params to TechnicalIndicatorsPipeline param names."""
    pipeline_params: Dict[str, Any] = {}
    for ind_key, p in custom_params.items():
        if ind_key == "rsi":
            if "period" in p: pipeline_params["rsi_period"] = p["period"]
        elif ind_key == "cci":
            if "period" in p: pipeline_params["cci_period"] = p["period"]
        elif ind_key == "demarker":
            if "period" in p: pipeline_params["demarker_period"] = p["period"]
        elif ind_key in ("macd_histogram", "macd"):
            if "fast" in p: pipeline_params["macd_fast"] = p["fast"]
            if "slow" in p: pipeline_params["macd_slow"] = p["slow"]
            if "signal" in p: pipeline_params["macd_signal"] = p["signal"]
        elif ind_key == "supertrend":
            if "period" in p: pipeline_params["supertrend_period"] = p["period"]
            if "multiplier" in p: pipeline_params["supertrend_multiplier"] = p["multiplier"]
        elif ind_key in ("ema", "ema_16"):
            if "period" in p: pipeline_params["ema_fast"] = p["period"]
        elif ind_key == "adx":
            if "period" in p: pipeline_params["adx_period"] = p["period"]
        elif ind_key in ("atr", "atr_14"):
            if "period" in p: pipeline_params["atr_period"] = p["period"]
        elif ind_key == "atr_21":
            if "period" in p: pipeline_params["atr_period_2"] = p["period"]
        elif ind_key in ("stc", "schaff_tc"):
            if "fast" in p: pipeline_params["schaff_fast"] = p["fast"]
            if "slow" in p: pipeline_params["schaff_slow"] = p["slow"]
            if "period" in p:
                pipeline_params["schaff_d_macd"] = p["period"]
                pipeline_params["schaff_d_pf"] = p["period"]
        elif ind_key in ("bollinger_bands", "bb_middle"):
            if "period" in p: pipeline_params["bb_period"] = p["period"]
            if "stdDev" in p: pipeline_params["bb_std"] = p["stdDev"]
            elif "std" in p: pipeline_params["bb_std"] = p["std"]
        elif ind_key == "support_resistance":
            if "period" in p: pipeline_params["support_resistance_period"] = p["period"]
        elif ind_key == "ema_cross":
            if "fast" in p: pipeline_params["ema_cross_fast"] = p["fast"]
            if "med" in p: pipeline_params["ema_cross_med"] = p["med"]
            if "slow" in p: pipeline_params["ema_cross_slow"] = p["slow"]
    return pipeline_params


# ── Route ────────────────────────────────────────────────────────────────────

@router.post("")
async def calculate_indicators(payload: Dict[str, Any] = Body(...)):
    """
    Calculate technical indicators for a given asset and timeframe.

    OPT-1: Runs TechnicalIndicatorsPipeline in-process via asyncio.to_thread().
    No subprocess spawn — ~10x faster than the previous architecture.
    """
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="asset required")
    # Normalize immediately — ensures consistent cache keys regardless of input format
    asset = normalize_asset(asset)

    timeframe = payload.get("timeframe", "1m")
    indicators = payload.get("indicators", [])   # accepted for API compat, not used to filter
    params = payload.get("params", {})
    current_candle = payload.get("current_candle")

    # ── Resolve timeframe to minutes ─────────────────────────────────────────
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            raise HTTPException(
                status_code=400,
                detail="Indicators are not supported for 'ticks' timeframe",
            )
        if tf.endswith("s"):
            raise HTTPException(
                status_code=400,
                detail=f"Indicators are not supported for seconds timeframe: {timeframe}",
            )
        if tf.endswith("m"):
            try:
                timeframe_min = max(1, int(tf[:-1]))
            except Exception:
                timeframe_min = 1
        elif tf.endswith("h"):
            try:
                timeframe_min = max(1, int(tf[:-1]) * 60)
            except Exception:
                timeframe_min = 1
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))

    # ── Locate history CSV ────────────────────────────────────────────────────
    csv_path = get_candle_path(asset, f"{timeframe_min}m")
    if not csv_path or not csv_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"History not found for {asset} @ {timeframe_min}m",
        )

    # ── Map frontend params → pipeline params ─────────────────────────────────
    pipeline_params = _map_params(params or {})

    # ── Fix 1: Compute params hash for cache key ──────────────────────────────
    # Cache is now keyed by (csv_path, params_hash) so any parameter change
    # (e.g. EMA period 16→20) causes a cache miss and triggers fresh calculation.
    p_hash = _params_hash(pipeline_params)

    # ── Check cache (skip recalculation if CSV + params haven't changed) ──────
    # When current_candle is provided, we must recalculate (live bar update).
    # When csv_path changed (new bootstrap), cache miss forces fresh calculation.
    # When params changed, cache miss forces fresh calculation (Fix 1).
    cached_df = None if current_candle else _get_cached_df(asset, csv_path, p_hash)

    try:
        if cached_df is not None:
            # Cache hit — just re-extract series (no disk I/O, no pipeline run)
            logger.debug(f"Cache hit for {asset} @ {timeframe_min}m — skipping recalculation")
            series = _build_series(cached_df)
            row_count = len(cached_df)
        else:
            # Cache miss — run full calculation in thread pool (non-blocking)
            logger.debug(f"Cache miss for {asset} @ {timeframe_min}m — running pipeline")
            result_df, series, row_count = await asyncio.to_thread(
                _calculate_in_thread,
                asset,
                pipeline_params,
                current_candle,
                timeframe_min,  # Fix 2: pass actual timeframe to pipeline
            )
            # Only cache when no live candle override (stable data)
            if not current_candle:
                _set_cached_df(asset, csv_path, p_hash, result_df)

        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe_min,
            "series": series,
            "count": row_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Indicators failed for {asset}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
