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
            timeframe_min = 1
    else:
        timeframe_min = 1

    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))
        
        csv_path = get_recent_history_file(asset, timeframe_min)

        if not csv_path:
            raise HTTPException(status_code=404, detail=f"History not found for {asset} @ {timeframe_min}m")

        args = [
            sys.executable,
            runner_path,
            "indicator_calculator",
            "--inputs",
            json.dumps({"csv_path": str(csv_path), "asset": asset, "timeframe": timeframe_min}),
        ]

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
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
        processed = data.get("processed", {})
        eligible = processed.get("selected_now", []) + processed.get("already_favorited", [])
        
        return {
            "ok": True, 
            "data": data, 
            "assets": list({a for a in eligible if isinstance(a, str)})
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Indicators failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
