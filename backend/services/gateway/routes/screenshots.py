import os
import sys
import json
import asyncio
import logging
import re
from typing import Dict, Any
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from .common import parse_script_json

router = APIRouter()
logger = logging.getLogger("gateway.screenshots")

@router.post("/capture")
async def capture_chart_screenshot(payload: Dict[str, Any] = Body(...)):
    """
    Captures a screenshot of the trading chart using Selenium.
    """
    asset = payload.get("asset") or "chart"
    timeframe = payload.get("timeframe") or "tf"
    suffix = payload.get("suffix", "")
    if suffix and not suffix.startswith("_"):
        suffix = f"_{suffix}"

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py")
        )
        
        # Safe filenames
        safe_asset = re.sub(r"[^\w\-]+", "_", str(asset)) or "asset"
        safe_timeframe = re.sub(r"[^\w\-]+", "_", str(timeframe)) or "tf"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{safe_asset}_{safe_timeframe}_{ts}{suffix}.png"
        
        output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/data_output/screenshots"))
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)

        inputs = {"action": "screenshot", "filepath": filepath}

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            runner_path,
            "chart_screenshot",
            "--inputs",
            json.dumps(inputs),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Screenshot failed: {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")

        output_str = stdout.decode().strip()
        try:
            out = parse_script_json(output_str)
        except Exception as e:
            logger.error(f"Invalid screenshot output: {e} | raw={output_str}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error")))

        return {
            "status": "success",
            "filename": filename,
            "filepath": filepath,
            "asset": asset,
            "timeframe": timeframe
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Screenshot failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save")
async def save_chart_screenshot(payload: Dict[str, Any] = Body(...)):
    """
    Saves a base64-encoded screenshot received from the frontend.
    """
    raw_image = payload.get("image_base64")
    if not isinstance(raw_image, str) or not raw_image.strip():
        raise HTTPException(status_code=400, detail="image_base64 (non-empty string) is required")

    annotated = bool(payload.get("annotated", False))
    asset = payload.get("asset") or "chart"
    timeframe = payload.get("timeframe") or "tf"

    if raw_image.startswith("data:"):
        _, _, data_part = raw_image.partition(",")
        if not data_part:
            raise HTTPException(status_code=400, detail="Invalid data URL for image_base64")
        image_payload = data_part
    else:
        image_payload = raw_image

    try:
        import base64
        image_bytes = base64.b64decode(image_payload)
        
        # Use common normalization or safe filename logic
        safe_asset = re.sub(r"[^\w\-]+", "_", str(asset)) or "asset"
        safe_timeframe = re.sub(r"[^\w\-]+", "_", str(timeframe)) or "tf"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        suffix = "_annotated" if annotated else ""
        filename = f"{safe_asset}_{safe_timeframe}_{ts}{suffix}.png"
        
        output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/data_output/screenshots"))
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "wb") as f:
            f.write(image_bytes)

        return {
            "status": "success",
            "filename": filename,
            "filepath": filepath,
            "asset": asset,
            "timeframe": timeframe,
            "annotated": annotated
        }
    except Exception as e:
        logger.error(f"Save screenshot failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
