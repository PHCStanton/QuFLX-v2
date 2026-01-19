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


async def _run_capability(capability: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    runner_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py")
    )

    args = [
        sys.executable,
        runner_path,
        capability,
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
            env=env,
        )
        stdout, stderr = await process.communicate()
        return {
            "return_code": process.returncode,
            "stdout": (stdout or b"").decode(errors="replace").strip(),
            "stderr": (stderr or b"").decode(errors="replace").strip(),
        }
    except NotImplementedError:
        import subprocess

        def run_sync():
            p = subprocess.run(args, capture_output=True, env=env, text=False)
            return p.returncode, p.stdout, p.stderr

        return_code, stdout, stderr = await asyncio.to_thread(run_sync)
        return {
            "return_code": int(return_code),
            "stdout": (stdout or b"").decode(errors="replace").strip(),
            "stderr": (stderr or b"").decode(errors="replace").strip(),
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
        run_inputs = {
            "labels": [label],
            "attempts": 3,
            "delay_ms": 250,
            "tf_wait_s": 0.15,
            "focus_on_chart": True,
            "save_diag": True,
        }

        proc = await _run_capability("timeframe_select_sync", run_inputs)
        output_str = proc.get("stdout") or ""
        stderr_str = proc.get("stderr") or ""

        out = parse_script_json(output_str)
        if proc.get("return_code") != 0 and out.get("ok") is True:
            logger.error("timeframe_select_sync returned non-zero but ok=True")

        if not out.get("ok"):
            raw_error = str(out.get("error") or "timeframe sync failed")
            data = out.get("data") or {}
            options = data.get("options") if isinstance(data, dict) else None
            if isinstance(options, list) and options:
                raw_error = f"{raw_error}. Visible options: {', '.join([str(x) for x in options[:20]])}"

            if "Failed to connect to Chrome" in raw_error or "Selenium not available" in raw_error:
                raise HTTPException(status_code=424, detail=raw_error)

            if raw_error in {"open failed", "menu button not found", "timeframe not found"}:
                raise HTTPException(status_code=424, detail=raw_error)

            if stderr_str and raw_error == "timeframe sync failed":
                raw_error = f"{raw_error}: {stderr_str}"

            raise HTTPException(status_code=500, detail=raw_error)

        return {
            "status": "success",
            "timeframe": normalized,
            "label": label,
            "data": out.get("data", {}),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync timeframe UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
