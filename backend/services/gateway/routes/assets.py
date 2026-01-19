import os
import sys
import json
import logging
import asyncio
import traceback
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path

from backend.services.gateway.routes.common import parse_script_json
from backend.utils.asset_utils import normalize_asset

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/refresh-assets")
async def refresh_assets(payload: Dict[str, Any] = Body(...)):
    """
    Executes V2 capability: RefreshAssets with configurable parameters
    """
    logger.info(f"DEBUG: Entered refresh_assets with payload: {payload}")
    try:
        # Validate and bound input parameters (Fail Fast - CORE_PRINCIPLES #9)
        min_pct = max(1, min(100, int(payload.get("min_pct", 92))))
        max_assets = payload.get("max_assets")
        if max_assets is not None:
            max_assets = max(1, min(50, int(max_assets)))
        target_assets = payload.get("target_assets")
        target_assets_mode = payload.get("target_assets_mode", "ignore")
        sweep_all = bool(payload.get("sweep_all", True))
        unstar_below = bool(payload.get("unstar_below", True))
        filter_mode = payload.get("filter_mode")

        if filter_mode not in ("otc", "fx"):
            filter_mode = None
        
        inputs = {
            "min_pct": min_pct,
            "sweep_all": sweep_all,
            "unstar_below": unstar_below,
            "filter_mode": filter_mode,
            "max_assets": max_assets,
            "target_assets": target_assets,
            "target_assets_mode": target_assets_mode,
        }
        
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
        
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        
        # ASYNC SUBPROCESS EXECUTION
        import subprocess
        
        def run_script():
            return subprocess.run(
                [sys.executable, runner_path, "refresh_assets", "--inputs", json.dumps(inputs)],
                capture_output=True,
                text=True,
                env=env
            )
            
        process_result = await asyncio.to_thread(run_script)
        
        stdout_str = process_result.stdout.strip()
        stderr_str = process_result.stderr.strip()

        if process_result.returncode != 0:
            # If we have JSON in stdout even on failure, use that error
            try:
                err_json = parse_script_json(stdout_str)
                err_msg = err_json.get("error") or stderr_str or "Unknown error"
            except Exception:
                err_msg = stderr_str or stdout_str or "Unknown error"
                
            logger.error(f"Error refreshing assets (code {process_result.returncode}): {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")
            
        try:
            output_json = parse_script_json(stdout_str)
            if not output_json.get("ok"):
                raise HTTPException(status_code=500, detail=f"Script returned error: {output_json.get('error')}")

            data = output_json.get("data", {})
            processed = data.get("processed", {})
            selected_now = processed.get("selected_now", []) if isinstance(processed, dict) else []
            already_favorited = processed.get("already_favorited", []) if isinstance(processed, dict) else []
            eligible = [a for a in (selected_now + already_favorited) if isinstance(a, str)]
            assets = sorted({a for a in eligible})

            return {
                "assets": assets,
                "metadata": {
                    "total_processed": processed.get("counts", {}).get("rows_seen", 0),
                    "starred_now": len(selected_now),
                    "already_favorited": len(already_favorited),
                    "skipped_max_limit": processed.get("counts", {}).get("skipped_max_limit", 0),
                    "max_assets_limit": max_assets,
                    "target_assets_specified": bool(target_assets),
                    "filter_mode": filter_mode,
                },
            }

        except Exception as e:
            logger.error(f"Invalid JSON output from refresh_assets: {e} | raw={stdout_str}")
            raise HTTPException(status_code=500, detail="Invalid script output")
            
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"Refresh assets failed with exception: {e}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Refresh assets failed: {str(e)}")

@router.post("/select-asset")
async def select_asset(payload: Dict[str, str] = Body(...)):
    """
    Selects an asset in the Pocket Option UI using Selenium.
    """
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="Asset name required")
        
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../asset_control.py"))
        
        # ASYNC SUBPROCESS EXECUTION
        process = await asyncio.create_subprocess_exec(
            sys.executable, script_path, "--action", "select_asset", "--asset", asset,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Error selecting asset: {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")
            
        output_json = parse_script_json(stdout.decode())
        if not output_json.get("ok"):
             raise HTTPException(status_code=500, detail=f"Selection failed: {output_json.get('error')}")
             
        return {"status": "success", "message": f"Selected {asset}"}
        
    except Exception as e:
        logger.error(f"Select asset failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sync-asset-ui")
async def sync_asset_ui(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    logger.info(f"SYNC_UI: Received request for asset={asset}")
    if not asset or not isinstance(asset, str):
        raise HTTPException(status_code=400, detail="Asset required")

    min_pct = payload.get("min_pct", 92)
    try:
        # Validate and bound min_pct parameter (Fail Fast - CORE_PRINCIPLES #9)
        min_pct_int = max(1, min(100, int(min_pct)))
    except Exception:
        raise HTTPException(status_code=400, detail="min_pct must be an integer between 1-100")

    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))
        inputs = {"assets": [asset], "min_pct": min_pct_int, "all": False}
        logger.info(f"SYNC_UI: Running favorites_walk_select with inputs={inputs}")

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        process = await asyncio.create_subprocess_exec(
            sys.executable, runner_path, "favorites_walk_select", "--inputs", json.dumps(inputs),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        
        stdout, stderr = await process.communicate()
        stdout_str = stdout.decode().strip()
        stderr_str = stderr.decode().strip()

        if process.returncode != 0:
            logger.error(f"SYNC_UI: Script failed (code {process.returncode}). stderr={stderr_str} stdout={stdout_str}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {stderr_str or stdout_str}")

        try:
            out = parse_script_json(stdout.decode())
        except Exception as e:
            logger.error(f"Invalid sync asset UI output: {e} | raw={stdout.decode()}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error") or "asset sync failed"))

        data = out.get("data", {})
        return {"status": "success", "asset": asset, "data": data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync asset UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
