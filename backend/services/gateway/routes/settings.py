import os
import json
import logging
from typing import Dict, Any, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, ConfigDict

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
    historyWaitTime: float = Field(1.5, ge=0.5, le=5.0)
    linkTimeframeSync: bool = False
    retryAttempts: int = Field(2, ge=0, le=5)
    retryDelay: int = Field(500, ge=0, le=5000)

class AnalysisSettings(BaseModel):
    defaultTimeframe: str = "1m"
    chartPrecision: int = Field(5, ge=0, le=8)
    autoLoadIndicators: bool = False
    dataSourceMode: str = "history_and_streaming"

class AISettings(BaseModel):
    responseVerbosity: str = "balanced"
    autoIncludeChart: bool = True
    autoIncludeContext: bool = True
    imageSource: str = "live"
    voiceInputMode: str = "off"
    voiceReadBackEnabled: bool = False
    voiceReadBackMode: str = "browser"
    voiceReadBackVoice: str = "Ara"
    voiceReadBackRate: float = 1.0
    voiceReadBackPitch: float = 1.0
    voiceReadBackVoiceURI: Optional[str] = None
    customInstructions: str = ""

class ScreenshotSettings(BaseModel):
    defaultTool: str = "arrow"
    defaultColor: str = "orange"
    defaultFontSize: int = Field(16, ge=8, le=64)
    notesMarginEnabled: bool = False
    notesMarginWidth: int = Field(320, ge=200, le=600)
    saveMode: str = "full"
    emojiStripEnabled: bool = False

class UserProfileSettings(BaseModel):
    displayName: str = ""
    experienceLevel: str = "intermediate"

class RiskManagerSettings(BaseModel):
    dailyMaxTrades: int = Field(10, ge=0, le=200)
    maxConsecutiveLosses: int = Field(3, ge=0, le=50)
    dailyProfitTarget: int = Field(50, ge=0, le=100000)
    maxDrawdownPercent: int = Field(5, ge=0, le=100)

class AlertsSettings(BaseModel):
    enableAIConfirm: bool = True
    minAIConfidence: float = Field(0.7, ge=0.0, le=1.0)
    candleCount: int = Field(100, ge=30, le=500)
    discordWebhookUrl: str = ""
    alertCooldownMinutes: int = Field(5, ge=1, le=1440)
    enableTickLogging: bool = False
    tickChunkSize: int = Field(1000, ge=10, le=10000)
    tickLoggingDir: str = "data/ticks"

class PlatformSettings(BaseModel):
    global_settings: GlobalSettings = Field(default_factory=GlobalSettings, alias="global")
    automation: AutomationSettings = Field(default_factory=AutomationSettings)
    analysis: AnalysisSettings = Field(default_factory=AnalysisSettings)
    ai: AISettings = Field(default_factory=AISettings)
    screenshot: ScreenshotSettings = Field(default_factory=ScreenshotSettings)
    userProfile: UserProfileSettings = Field(default_factory=UserProfileSettings)
    riskManager: RiskManagerSettings = Field(default_factory=RiskManagerSettings)
    alerts: AlertsSettings = Field(default_factory=AlertsSettings)
    calendarJournal: Dict[str, Any] = Field(default_factory=dict)
    strategyLab: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)

def get_default_settings() -> Dict[str, Any]:
    return PlatformSettings().model_dump(by_alias=True)

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
        settings_dict = validated.model_dump(by_alias=True)
        save_settings(settings_dict)
        
        # Phase 2C: Notify subscribers (like the Alert Dispatcher)
        if hasattr(request.app.state, 'redis') and request.app.state.redis:
            await request.app.state.redis.publish("settings:updated", json.dumps(settings_dict))
            logger.info("Published settings:updated notification")
            
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
