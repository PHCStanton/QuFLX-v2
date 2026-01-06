import os
import sys
import json
import asyncio
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Body
from .common import parse_script_json

router = APIRouter()
logger = logging.getLogger("gateway.timeframe")

SUPPORTED_TIMEFRAMES = [
    "ticks",
    "15s",
    "1m",
    "5m",
    "15m",
    "30m",
    "1h",
]

INTERVAL_SECONDS_MAP = {
    "ticks": 0,
    "15s": 15,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
}

LABEL_MAP = {
    "15s": "15s",
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
}

@router.post("/select-timeframe")
async def select_timeframe(payload: Dict[str, str] = Body(...)):
    timeframe = payload.get("timeframe")
    if not timeframe:
        raise HTTPException(status_code=400, detail="Timeframe required")

    normalized = timeframe.strip().lower()

    if normalized not in SUPPORTED_TIMEFRAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe: {timeframe}. Must be one of: {', '.join(SUPPORTED_TIMEFRAMES)}",
        )

    interval_seconds = INTERVAL_SECONDS_MAP.get(normalized, 0)

    logger.info(f"Timeframe updated: {normalized} (interval_seconds={interval_seconds})")

    return {
        "status": "success",
        "timeframe": normalized,
        "interval_seconds": interval_seconds,
    }

@router.post("/sync-timeframe-ui")
async def sync_timeframe_ui(payload: Dict[str, Any] = Body(...)):
    timeframe = payload.get("timeframe")
    if not timeframe:
        raise HTTPException(status_code=400, detail="Timeframe required")

    normalized = str(timeframe).strip().lower()

    if normalized not in SUPPORTED_TIMEFRAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe: {timeframe}. Must be one of: {', '.join(SUPPORTED_TIMEFRAMES)}",
        )

    if normalized == "ticks":
        raise HTTPException(status_code=400, detail="UI sync for 'ticks' timeframe is not supported")

    label = LABEL_MAP.get(normalized)
    if not label:
        raise HTTPException(status_code=400, detail=f"UI sync not configured for timeframe: {normalized}")

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py")
        )

        inputs = {"action": "select_timeframe", "label": label}

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        # Use async subprocess to avoid blocking the event loop
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            runner_path,
            "timeframe_menu",
            "--inputs",
            json.dumps(inputs),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Sync timeframe UI failed: {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")

        output_str = stdout.decode().strip()
        try:
            out = parse_script_json(output_str)
        except Exception as e:
            logger.error(f"Invalid sync timeframe UI output: {e} | raw={output_str}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raw_error = str(out.get("error") or "timeframe sync failed")
            if raw_error == "open failed":
                detail = (
                    "Failed to open timeframe menu in Pocket Option UI. "
                    "Ensure the trading chart is visible in the attached Chrome session "
                    "and try again."
                )
            else:
                detail = raw_error
            raise HTTPException(status_code=500, detail=detail)

        data = out.get("data", {})

        return {
            "status": "success",
            "timeframe": normalized,
            "label": label,
            "data": data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync timeframe UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
