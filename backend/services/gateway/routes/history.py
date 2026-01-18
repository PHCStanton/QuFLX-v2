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
    Supports both legacy {timeframe}.csv and new unified timestamp-based filenames.
    """
    logger.info(f"HISTORY: Fetching history for asset={asset}, timeframe={timeframe}")
    csv_path = get_recent_history_file(asset, timeframe)
    
    if not csv_path:
        logger.warning(f"HISTORY: No history file found for {asset} @ {timeframe}m")
        raise HTTPException(status_code=404, detail=f"No history found for {asset} @ {timeframe}m")

    logger.info(f"HISTORY: Found history file: {csv_path}")

    try:
        df = pd.read_csv(csv_path)
        if df.empty:
            return {
                "ok": True,
                "asset": asset,
                "timeframe": int(timeframe),
                "count": 0,
                "candles": [],
                "data": [],
                "file_path": csv_path.name,
                "file": csv_path.name,
            }

        # Take last N rows
        rows = df.tail(limit).to_dict("records")
        target_tf_str = f"{int(timeframe)}m"
        for r in rows:
            if "timeframe" not in r:
                r["timeframe"] = target_tf_str

        return {
            "ok": True,
            "asset": asset,
            "timeframe": int(timeframe),
            "count": len(rows),
            "candles": list(rows),
            "data": list(rows),
            "file_path": csv_path.name,
            "file": csv_path.name,
        }
    except Exception as e:
        logger.error(f"Error reading history CSV {csv_path}: {e}")
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
        if tf.endswith("m"):
            raw = tf[:-1]
            if not raw.isdigit():
                return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")
            timeframe_min = max(1, int(raw))
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
        duration_s = int(duration_raw)
    except Exception:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_raw}")

    if duration_s < 1:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_s}")

    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
        
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        # Ensure project root is in PYTHONPATH for imports
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
        # Add both root and v2 to PYTHONPATH to be absolutely sure
        env["PYTHONPATH"] = project_root + os.pathsep + os.path.join(project_root, "v2")

        def run_subprocess():
            inputs = {
                "action": "collect_and_save",
                "asset": asset,
                "timeframe": timeframe_min,
                "duration": duration_s,
            }
            return subprocess.run(
                [
                    sys.executable,
                    runner_path,
                    "history_collector",
                    "--verbose",
                    "--inputs",
                    json.dumps(inputs),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                timeout=duration_s + 15,
            )

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as executor:
            process = await loop.run_in_executor(executor, run_subprocess)

        stdout = process.stdout
        stderr = process.stderr

        if process.returncode != 0:
            err_msg = (stderr.decode(errors="replace") or "").strip()
            logger.error(f"Bootstrap history subprocess failed: {err_msg}")
            return _json_error(
                HistoryErrorCode.SUBPROCESS_SPAWN_FAILED,
                f"History collection subprocess failed: {err_msg}",
                details={"asset": asset, "returncode": process.returncode},
            )

        output_str = (stdout.decode(errors="replace") or "").strip()
        out = parse_script_json(output_str)
        if not out.get("ok"):
            error_code_str = out.get("error_code") or out.get("data", {}).get("error_code") or "unknown_error"
            error_msg = out.get("error") or "History collection failed"

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
            "file_path": data.get("filepath"),
            "collection_time_ms": None,
        }
        
    except subprocess.TimeoutExpired as e:
        logger.error(f"Bootstrap history timed out: {type(e).__name__}: {e}")
        return _json_error(
            HistoryErrorCode.CAPABILITY_TIMEOUT,
            f"Bootstrap timed out: {type(e).__name__}: {str(e)}",
            details={"asset": asset, "timeframe": timeframe_min, "duration": duration_s},
        )
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
    Append a newly formed candle to the most recent history CSV.
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
        if tf.endswith("m"):
            try:
                timeframe_min = max(1, int(tf[:-1]))
            except Exception:
                timeframe_min = 1
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))
    else:
        timeframe_min = int(timeframe)

    success = append_candle_to_history(asset, timeframe_min, candle)
    
    if not success:
        # If no history file found, maybe we should persist it as a new one?
        # For now, just return 404
        raise HTTPException(status_code=404, detail=f"No recent history file found for {asset} @ {timeframe_min}m to append to.")

    return {"status": "success", "asset": asset, "timeframe": timeframe_min}

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
