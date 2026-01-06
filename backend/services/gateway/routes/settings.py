import os
import json
import logging
from typing import Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body

router = APIRouter()
logger = logging.getLogger("gateway.settings")

# Try to find project root
project_root = Path(__file__).resolve().parents[3]
SETTINGS_FILE = project_root / "config_files" / "gateway_settings.json"

def load_settings() -> Dict[str, Any]:
    try:
        if not SETTINGS_FILE.exists():
            return {"theme": "dark", "notifications": True}
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
        return {"theme": "dark", "notifications": True}

def save_settings(settings: Dict[str, Any]):
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")

@router.get("")
async def get_settings():
    return load_settings()

@router.put("")
async def update_settings(payload: Dict[str, Any] = Body(...)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings payload must be an object")
    current = load_settings()
    merged = {**current, **payload}
    save_settings(merged)
    return merged

@router.get("/selection-workflow")
async def get_selection_workflow():
    try:
        config_path = project_root / "config_files" / "92_Percent_config.json"
        if not config_path.exists():
            return {"click_wait_s": 2.0, "use_double_click": True}
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            return cfg.get("selection_workflow", {"click_wait_s": 2.0, "use_double_click": True})
    except Exception as e:
        logger.error(f"Failed to read selection workflow config: {e}")
        return {"click_wait_s": 2.0, "use_double_click": True}

@router.post("/selection-workflow")
async def update_selection_workflow(payload: Dict[str, Any] = Body(...)):
    try:
        config_path = project_root / "config_files" / "92_Percent_config.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        cfg = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        
        cfg["selection_workflow"] = {
            "click_wait_s": float(payload.get("click_wait_s", 2.0)),
            "use_double_click": bool(payload.get("use_double_click", True))
        }
        
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
            
        return cfg["selection_workflow"]
    except Exception as e:
        logger.error(f"Failed to update selection workflow config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
