import os
import sys
import json
import logging
import asyncio
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path

# Add project root to path for internal imports if needed
project_root = Path(__file__).resolve().parents[4]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.services.gateway.routes.common import parse_script_json

router = APIRouter()
logger = logging.getLogger("gateway.asset_control")

@router.post("")
async def control_asset(payload: Dict[str, Any] = Body(...)):
    """
    Executes AssetControl capability for UI automation (select, star, etc.)
    """
    action = payload.get("action")
    asset = payload.get("asset")
    timeframe = payload.get("timeframe")
    
    if not action:
        raise HTTPException(status_code=400, detail="action required")
        
    inputs = {
        "action": action,
        "asset": asset,
        "timeframe": timeframe
    }
    
    try:
        # Path to the capability runner
        runner_path = project_root / "capabilities_v2" / "runner.py"
        
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["PYTHONPATH"] = str(project_root)
        
        # Execute via runner
        process = await asyncio.create_subprocess_exec(
            sys.executable, str(runner_path), "asset_control", "--inputs", json.dumps(inputs),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        
        stdout, stderr = await process.communicate()
        stdout_str = stdout.decode().strip()
        stderr_str = stderr.decode().strip()

        if process.returncode != 0:
            logger.error(f"AssetControl failed (code {process.returncode}): {stderr_str}")
            raise HTTPException(status_code=500, detail=f"Automation failed: {stderr_str or stdout_str}")
            
        try:
            output_json = parse_script_json(stdout_str)
            if not output_json.get("ok"):
                raise HTTPException(status_code=500, detail=output_json.get("error") or "Unknown automation error")
            
            return output_json
        except Exception as e:
            logger.error(f"Invalid JSON from AssetControl: {e} | raw={stdout_str}")
            raise HTTPException(status_code=502, detail="Invalid automation output")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AssetControl route error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
