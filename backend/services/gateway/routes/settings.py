import os
import json
import logging
from typing import Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger("gateway.settings")

# Project root and settings file path
project_root = Path(__file__).resolve().parents[4]
SETTINGS_FILE = project_root / "data" / "settings" / "platform_settings.json"

class GlobalSettings(BaseModel):
    theme: str = "dark"
    language: str = "en"
    autoStartCollector: bool = True
    autoStartGateway: bool = True
    debugLevel: str = "info"

class AutomationSettings(BaseModel):
    historyWaitTime: int = Field(8, ge=3, le=30)
    autoSelectAssets: bool = True
    retryAttempts: int = Field(2, ge=0, le=5)
    retryDelay: int = Field(500, ge=0, le=5000)

class AnalysisSettings(BaseModel):
    defaultTimeframe: str = "1m"
    chartPrecision: int = Field(5, ge=0, le=8)
    autoLoadIndicators: bool = False

class AISettings(BaseModel):
    responseVerbosity: str = "balanced"
    autoIncludeChart: bool = True
    autoIncludeContext: bool = True

class PlatformSettings(BaseModel):
    global_settings: GlobalSettings = Field(default_factory=GlobalSettings, alias="global")
    automation: AutomationSettings = Field(default_factory=AutomationSettings)
    analysis: AnalysisSettings = Field(default_factory=AnalysisSettings)
    ai: AISettings = Field(default_factory=AISettings)

    class Config:
        allow_population_by_field_name = True

def get_default_settings() -> Dict[str, Any]:
    return PlatformSettings().dict(by_alias=True)

def load_settings() -> Dict[str, Any]:
    try:
        if not SETTINGS_FILE.exists():
            logger.info(f"Settings file not found at {SETTINGS_FILE}, creating defaults.")
            defaults = get_default_settings()
            save_settings(defaults)
            return defaults
            
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Basic validation/merging with defaults to handle schema updates
            defaults = get_default_settings()
            for section, values in defaults.items():
                if section not in data:
                    data[section] = values
                else:
                    # Merge keys within section
                    for k, v in values.items():
                        if k not in data[section]:
                            data[section][k] = v
            return data
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
        return get_default_settings()

def save_settings(settings: Dict[str, Any]):
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        logger.info(f"Settings saved to {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@router.get("")
async def get_platform_settings():
    """Retrieve all platform settings."""
    return load_settings()

@router.put("")
async def update_platform_settings(payload: Dict[str, Any] = Body(...)):
    """Update platform settings with validation."""
    try:
        # Validate payload against Pydantic model
        validated = PlatformSettings(**payload)
        settings_dict = validated.dict(by_alias=True)
        save_settings(settings_dict)
        return settings_dict
    except ValueError as e:
        logger.error(f"Validation error updating settings: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/section/{section_name}")
async def get_settings_section(section_name: str):
    """Retrieve a specific settings section."""
    settings = load_settings()
    if section_name not in settings:
        raise HTTPException(status_code=404, detail=f"Section {section_name} not found")
    return settings[section_name]
