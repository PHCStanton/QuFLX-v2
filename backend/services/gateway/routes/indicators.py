import os
import sys
import json
import asyncio
import logging
import re
from typing import Dict, Any, List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from .common import parse_script_json
from backend.utils.history_utils import get_recent_history_file
from backend.utils.asset_utils import normalize_asset

router = APIRouter()
logger = logging.getLogger("gateway.indicators")

@router.post("")
async def calculate_indicators(payload: Dict[str, Any] = Body(...)):
    """
    Calculate technical indicators for a given asset and timeframe.
    """
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="asset required")

    timeframe = payload.get("timeframe", "1m")
    indicators = payload.get("indicators", [])
    params = payload.get("params", {})
    current_candle = payload.get("current_candle")
    
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            raise HTTPException(status_code=400, detail="Indicators are not supported for 'ticks' timeframe")
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
            raise HTTPException(status_code=400, detail=f"Indicators are not supported for seconds timeframe: {timeframe}")
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))
        else:
            timeframe_min = 1
    else:
        timeframe_min = 1

    try:
        # Correct path to runner.py at project root
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
        
        if not os.path.exists(runner_path):
            logger.error(f"Runner script not found at: {runner_path}")
            raise HTTPException(status_code=500, detail=f"Runner script not found at: {runner_path}")
        
        csv_path = get_recent_history_file(asset, timeframe_min)

        if not csv_path:
            raise HTTPException(status_code=404, detail=f"History not found for {asset} @ {timeframe_min}m")

        inputs = {
            "csv_path": str(csv_path),
            "asset": asset,
            "timeframe": timeframe_min,
            "indicators": indicators,
            "params": params,
            "current_candle": current_candle
        }

        args = [
            sys.executable,
            runner_path,
            "indicator_calculator",
            "--inputs",
            json.dumps(inputs),
        ]

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout, stderr = await process.communicate()
            return_code = process.returncode
        except NotImplementedError:
            # Fallback: ProactorEventLoop not active (e.g. gateway started externally without policy).
            # Logged at DEBUG to avoid log spam — root cause should be fixed in main.py (loop="none").
            logger.debug("asyncio.create_subprocess_exec not implemented, falling back to subprocess.run in thread")
            import subprocess
            def run_sync():
                p = subprocess.run(
                    args,
                    capture_output=True,
                    env=env,
                    text=False # We handle decoding manually
                )
                return p.stdout, p.stderr, p.returncode
            
            stdout, stderr, return_code = await asyncio.to_thread(run_sync)

        if return_code != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Indicator calculation failed: {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")

        output_str = stdout.decode().strip()
        try:
            out = parse_script_json(output_str)
        except Exception as e:
            logger.error(f"Invalid indicator output: {e} | raw={output_str}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error")))

        data = out.get("data", {})
        
        return {
            "ok": True, 
            **data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Indicators failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
