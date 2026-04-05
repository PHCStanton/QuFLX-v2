import os
import sys
import json
import asyncio
import logging
import re
import pandas as pd
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from .common import parse_script_json
from backend.utils.history_utils import persist_history_csv, get_recent_history_file, append_candle_to_history
from backend.utils.data_store import read_candles, upsert_candles, generate_session_id, log_session
from backend.utils.asset_utils import normalize_asset
from backend.models.errors import (
    HistoryErrorCode, 
    HistoryErrorResponse, 
    HistorySuccessResponse,
    create_error_response
)

router = APIRouter()
logger = logging.getLogger("gateway.history")


def _error_status_for_code(code: HistoryErrorCode) -> int:
    if code in {HistoryErrorCode.INVALID_ASSET, HistoryErrorCode.INVALID_TIMEFRAME, HistoryErrorCode.INVALID_DURATION, HistoryErrorCode.UNSUPPORTED_TIMEFRAME}:
        return 400
    if code in {HistoryErrorCode.CHROME_NOT_CONNECTED, HistoryErrorCode.COLLECTOR_NOT_RUNNING}:
        return 503
    if code in {HistoryErrorCode.MANUAL_CLICK_TIMEOUT, HistoryErrorCode.MANUAL_CLICK_NOT_DETECTED, HistoryErrorCode.CAPABILITY_TIMEOUT}:
        return 504
    if code in {HistoryErrorCode.SUBPROCESS_SPAWN_FAILED, HistoryErrorCode.FILE_WRITE_FAILED}:
        return 500
    return 500


def _json_error(code: HistoryErrorCode, message: str, details: Dict[str, Any] | None = None) -> JSONResponse:
    resp = create_error_response(error_code=code, error_message=message, details=details)
    return JSONResponse(status_code=_error_status_for_code(code), content=resp.model_dump())

@router.get("/{asset}")
async def get_history(asset: str, timeframe: int = 1, limit: int = 100):
    """
    Fetch historical candle data for a specific asset and timeframe from local CSV.
    """
    asset = normalize_asset(asset)
    target_tf_str = f"{int(timeframe)}m"
    logger.info(f"HISTORY: Fetching history for asset={asset}, timeframe={timeframe}")
    
    try:
        candles = read_candles(asset, target_tf_str, limit=limit)
        
        if not candles:
            # Fallback to old utility if new store is empty (backward compatibility during transition)
            csv_path = get_recent_history_file(asset, timeframe)
            if not csv_path:
                logger.warning(f"HISTORY: No history file found for {asset} @ {timeframe}m")
                raise HTTPException(status_code=404, detail=f"No history found for {asset} @ {timeframe}m")
                
            df = pd.read_csv(csv_path)
            if not df.empty:
                # df.tail() gets OLD data in old CSVs because they are reverse-sorted
                rows = df.head(limit).to_dict("records")
                for r in rows:
                    if "timeframe" not in r:
                        r["timeframe"] = target_tf_str
                candles = list(rows)
            file_name = csv_path.name
        else:
            file_name = f"{asset}_{target_tf_str}.csv"
            for r in candles:
                if "timeframe" not in r:
                    r["timeframe"] = target_tf_str

        return {
            "ok": True,
            "asset": asset,
            "timeframe": int(timeframe),
            "count": len(candles),
            "candles": candles,
            "data": candles,
            "file_path": file_name,
            "file": file_name,
        }
    except Exception as e:
        logger.error(f"Error reading history for {asset}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bootstrap-history")
async def bootstrap_history(payload: Dict[str, Any] = Body(...)):
    """
    Collect initial history for an asset using V2 history_collector.
    In Manual Mode, this waits for the user to click the asset in Pocket Option.
    """
    asset = payload.get("asset")
    if not isinstance(asset, str) or not asset.strip():
        return _json_error(HistoryErrorCode.INVALID_ASSET, "asset required")

    timeframe = payload.get("timeframe", "1m")
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            return _json_error(HistoryErrorCode.UNSUPPORTED_TIMEFRAME, f"unsupported timeframe: {timeframe}")
        if tf.endswith("m"):
            raw = tf[:-1]
            if not raw.isdigit():
                return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")
            timeframe_min = max(1, int(raw))
        elif tf.endswith("h"):
            raw = tf[:-1]
            if not raw.isdigit():
                return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")
            timeframe_min = max(1, int(raw) * 60)
        elif tf.endswith("s"):
            return _json_error(HistoryErrorCode.UNSUPPORTED_TIMEFRAME, f"unsupported timeframe: {timeframe}")
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))
        else:
            return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")
    elif isinstance(timeframe, int):
        timeframe_min = max(1, int(timeframe))
    else:
        return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")

    # In Manual Mode, we increase the duration to give the user time to click
    # We'll wait up to 3 seconds for the payload to appear
    duration_raw = payload.get("duration", 3)
    try:
        duration_s = float(duration_raw)
    except Exception:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_raw}")

    if duration_s < 0.5:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_s}")

    try:
        def run_in_process():
            import time
            from capabilities_v2.history_collector import HistoryCollector
            from capabilities_v2.base import Ctx

            def _get_shared_driver():
                try:
                    from backend.services.collector.connection import ChromeConnectionManager
                    mgr = ChromeConnectionManager()
                    return mgr.connect()
                except Exception as e:
                    logger.warning(f"_get_shared_driver: could not get shared driver: {e}")
                    return None

            driver = _get_shared_driver()
            if driver is None:
                return {"ok": False, "error": "Chrome browser not connected", "error_code": "chrome_not_connected"}

            ctx = Ctx(
                driver=driver,
                artifacts_root=str(Path("data/artifacts").resolve()),
                debug=True,
                dry_run=False,
                verbose=True
            )
            
            # Use 'collect' action to prevent old CSV writing behavior.
            cap = HistoryCollector()
            inputs = {
                "action": "collect",
                "asset": asset,
                "timeframe": timeframe_min,
                "duration": duration_s,
            }
            
            session_start = datetime.now(timezone.utc)
            start_ms = time.time()
            
            res = cap.run(ctx, inputs)
            duration_ms = int((time.time() - start_ms) * 1000)
            
            if not res.ok:
                return {
                    "ok": False, 
                    "error": res.error, 
                    "error_code": getattr(res, "error_code", "unknown_error")
                }
                
            candles = res.data.get("candles", [])
            
            # Persist using data_store
            session_id = generate_session_id()
            tf_str = f"{timeframe_min}m"
            
            log_data = {
                "session_id": session_id,
                "asset": normalize_asset(asset),
                "timeframe": tf_str,
                "started_at": session_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "candle_count": len(candles),
                "source": "history_capture",
                "status": "complete",
                "duration_ms": duration_ms
            }
            log_session(log_data)
            
            if candles:
                upsert_candles(
                    asset=normalize_asset(asset),
                    timeframe_str=tf_str,
                    candles=candles,
                    session_id=session_id,
                    source="history_capture"
                )
                
            return {
                "ok": True,
                "data": res.data,
                "collection_time_ms": duration_ms
            }

        out = await asyncio.to_thread(run_in_process)

        if not out.get("ok"):
            error_code_str = out.get("error_code", "unknown_error")
            error_msg = out.get("error", "History collection failed")

            try:
                error_code = HistoryErrorCode(error_code_str)
            except ValueError:
                error_code = HistoryErrorCode.UNKNOWN_ERROR

            logger.error(f"Bootstrap history failed: {error_msg} (code: {error_code_str})")
            return _json_error(
                error_code,
                error_msg,
                details={"asset": asset, "timeframe": timeframe_min, "duration": duration_s},
            )

        data = out.get("data", {}) or {}
        candles = data.get("candles") or []
        if not isinstance(candles, list):
            candles = []

        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe_min,
            "candles": candles,
            "file_path": None,
            "collection_time_ms": out.get("collection_time_ms"),
        }

    except Exception as e:
        logger.error(f"Bootstrap history failed: {type(e).__name__}: {e}")
        return _json_error(
            HistoryErrorCode.UNKNOWN_ERROR,
            f"Bootstrap failed: {type(e).__name__}: {str(e)}",
            details={"asset": asset, "timeframe": timeframe_min},
        )

@router.post("/append-candle")
async def append_candle(payload: Dict[str, Any] = Body(...)):
    """
    Append a newly formed candle to the history data store.
    Used for live streaming data persistence.
    """
    asset = payload.get("asset")
    timeframe = payload.get("timeframe", 1)
    candle = payload.get("candle")

    if not asset or not candle:
        raise HTTPException(status_code=400, detail="asset and candle required")

    # Handle timeframe string if needed
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            raise HTTPException(status_code=400, detail="append-candle does not support 'ticks' timeframe")
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
        elif tf.endswith("s"):
            raise HTTPException(status_code=400, detail=f"append-candle does not support seconds timeframe: {timeframe}")
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))
    else:
        timeframe_min = int(timeframe)

    norm_asset = normalize_asset(asset)
    tf_str = f"{timeframe_min}m"
    
    # Try new data store first
    try:
        written = upsert_candles(
            asset=norm_asset,
            timeframe_str=tf_str,
            candles=[candle],
            session_id="stream_append",
            source="tick_aggregation"
        )
        if written > 0:
            return {"status": "success", "asset": asset, "timeframe": timeframe_min, "store": "new"}
    except Exception as e:
        logger.error(f"Error appending candle via new data store: {e}")

    # Fallback to legacy
    success = append_candle_to_history(asset, timeframe_min, candle)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"No recent history file found for {asset} @ {timeframe_min}m to append to.")

    return {"status": "success", "asset": asset, "timeframe": timeframe_min, "store": "legacy"}

@router.post("/collect-history")
async def collect_history(payload: Dict[str, Any] = Body(default_factory=dict)):
    """
    Executes V2 capability: CollectHistory
    Iterates through high-payout assets to allow data collection in background.
    """
    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))

        duration = int(payload.get("duration", 10))
        timeframe = payload.get("timeframe", "1m")

        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data/data_output/logs"))
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, f"collect_history_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log")

        # Background process - we use Popen since it's a long-running collection
        # and we return the PID.
        log_f = open(log_path, "w", encoding="utf-8")
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        
        # Note: Popen is still used here because it's meant to be a detached background task
        # and we don't 'await' it to finish.
        import subprocess
        proc = subprocess.Popen(
            [
                sys.executable,
                runner_path,
                "collect_history",
                "--verbose",
                "--inputs",
                json.dumps({"duration": duration, "timeframe": timeframe}),
            ],
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env=env,
        )

        return {
            "status": "started", 
            "message": "History collection started in background", 
            "pid": proc.pid, 
            "log_path": log_path
        }

    except Exception as e:
        logger.error(f"Collect history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
