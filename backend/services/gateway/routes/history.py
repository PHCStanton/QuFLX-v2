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
from .common import parse_script_json
from backend.utils.history_utils import persist_history_csv, get_recent_history_file
from backend.utils.asset_utils import normalize_asset
from backend.models.errors import (
    HistoryErrorCode, 
    HistoryErrorResponse, 
    HistorySuccessResponse,
    create_error_response
)

router = APIRouter()
logger = logging.getLogger("gateway.history")

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
            return {"asset": asset, "timeframe": int(timeframe), "data": [], "file": csv_path.name}

        # Take last N rows
        rows = df.tail(limit).to_dict("records")
        target_tf_str = f"{int(timeframe)}m"
        for r in rows:
            if "timeframe" not in r:
                r["timeframe"] = target_tf_str

        return {
            "asset": asset, 
            "timeframe": int(timeframe), 
            "count": len(rows), 
            "data": list(rows),
            "file": csv_path.name
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
    if not asset:
        raise HTTPException(status_code=400, detail="asset required")

    timeframe = payload.get("timeframe", "1m")
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

    # In Manual Mode, we increase the duration to give the user time to click
    # We'll wait up to 3 seconds for the payload to appear
    duration_s = int(payload.get("duration", 3))

    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
        
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        # Ensure project root is in PYTHONPATH for imports
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
        # Add both root and v2 to PYTHONPATH to be absolutely sure
        env["PYTHONPATH"] = project_root + os.pathsep + os.path.join(project_root, "v2")

        logger.info(f"BOOTSTRAP: Starting history_collector for {asset} (waiting {duration_s}s for manual click)")
        logger.info(f"BOOTSTRAP: runner_path={runner_path}")
        logger.info(f"BOOTSTRAP: PYTHONPATH={env['PYTHONPATH']}")

        # WINDOWS FIX: Use sync subprocess in thread pool instead of asyncio.create_subprocess_exec
        # asyncio.create_subprocess_exec raises NotImplementedError on Windows with SelectorEventLoop
        def run_subprocess():
            return subprocess.run(
                [
                    sys.executable,
                    runner_path,
                    "history_collector",
                    "--verbose",
                    "--inputs",
                    json.dumps({"action": "collect_and_save", "asset": asset, "timeframe": timeframe_min, "duration": duration_s}),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                timeout=duration_s + 10  # Add 10s buffer for subprocess overhead
            )
        
        # Run subprocess in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as executor:
            process = await loop.run_in_executor(executor, run_subprocess)

        stdout = process.stdout
        stderr = process.stderr

        if process.returncode != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Bootstrap history subprocess failed: {err_msg}")
            
            # Return structured error response
            error_response = create_error_response(
                error_code=HistoryErrorCode.SUBPROCESS_SPAWN_FAILED,
                error_message=f"History collection subprocess failed: {err_msg}",
                details={"asset": asset, "returncode": process.returncode}
            )
            return error_response.dict()

        output_str = stdout.decode().strip()
        try:
            out = parse_script_json(output_str)
        except Exception as e:
            logger.error(f"Invalid bootstrap history output: {e} | raw={output_str}")
            error_response = create_error_response(
                error_code=HistoryErrorCode.UNKNOWN_ERROR,
                error_message=f"Failed to parse subprocess output: {str(e)}",
                details={"asset": asset, "raw_output": output_str[:500]}
            )
            return error_response.dict()

        if not out.get("ok"):
            # Extract error code from capability result if available
            error_code_str = out.get("error_code", "unknown_error")
            error_msg = out.get("error", "History collection failed")
            
            # Map capability error codes to enum
            try:
                error_code = HistoryErrorCode(error_code_str)
            except ValueError:
                error_code = HistoryErrorCode.UNKNOWN_ERROR
            
            logger.error(f"Bootstrap history failed: {error_msg} (code: {error_code_str})")
            
            error_response = create_error_response(
                error_code=error_code,
                error_message=error_msg,
                details={"asset": asset, "timeframe": timeframe_min, "duration": duration_s}
            )
            return error_response.dict()

        # SUCCESS PATH: Extract candles and return in-memory response
        data = out.get("data", {})
        candles = data.get("candles") or []
        
        # Fallback: If candles not in response but filepath is, read from CSV
        if not candles and data.get("filepath"):
            try:
                df = pd.read_csv(data["filepath"])
                candles = df.to_dict("records")
                logger.info(f"Bootstrap: Read {len(candles)} candles from saved CSV file")
            except Exception as e:
                logger.error(f"Failed to read newly saved history file: {e}")
                error_response = create_error_response(
                    error_code=HistoryErrorCode.FILE_WRITE_FAILED,
                    error_message=f"Candles were collected but failed to read from CSV: {str(e)}",
                    details={"asset": asset, "filepath": data.get("filepath")}
                )
                return error_response.dict()

        logger.info(f"Bootstrap SUCCESS: Returning {len(candles)} candles for {asset} @ {timeframe_min}m")
        
        # Return structured success response (matches HistorySuccessResponse model)
        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe_min,
            "candles": candles,
            "file_path": data.get("filepath"),
            "collection_time_ms": None  # Could calculate this if needed
        }
    except HTTPException:
        raise
    except Exception as e:
        # CORE PRINCIPLE #8: Zero Silent Failures - log full details
        import traceback
        error_details = {
            "exception_type": type(e).__name__,
            "exception_message": str(e),
            "traceback": traceback.format_exc()
        }
        logger.error(f"Bootstrap history failed: {type(e).__name__}: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        
        # Return structured error instead of generic HTTPException
        error_response = create_error_response(
            error_code=HistoryErrorCode.SUBPROCESS_SPAWN_FAILED,
            error_message=f"Failed to spawn history collection subprocess: {type(e).__name__}: {str(e)}",
            details={"asset": asset, "error_type": type(e).__name__}
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

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
