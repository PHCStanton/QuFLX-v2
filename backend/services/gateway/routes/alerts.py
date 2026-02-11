import os
import sys
import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List

from fastapi import APIRouter, Header, Request, Body, HTTPException
from fastapi.responses import JSONResponse
from .settings import load_settings

router = APIRouter()
logger = logging.getLogger("gateway.alerts")

# Project root (v2/)
project_root = Path(__file__).resolve().parents[4]

_alerts_lock = asyncio.Lock()

_registry: Dict[str, Any] = {
    "proc": None,
    "pid": None,
    "started_at": None,
    "last_error": None,
    "log_path": None,
    "log_file": None,
    "assets": []
}

def _json_error(*, status_code: int, detail: str, user_message: str = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "ok": False,
            "detail": detail,
            "user_message": user_message or detail
        }
    )

def _cleanup_if_exited():
    proc = _registry.get("proc")
    if proc is None:
        return
    try:
        if proc.poll() is not None:
            log_f = _registry.get("log_file")
            if log_f:
                log_f.close()
            _registry["proc"] = None
            _registry["pid"] = None
            _registry["log_file"] = None
    except Exception:
        pass

def _stop_process(proc: subprocess.Popen):
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
            proc.wait(timeout=3)
        except Exception:
            pass

@router.post("/start")
async def start_alerts(request: Request, assets: List[str] = Body(default=[]), use_redis: bool = Body(default=False, embed=True)):
    # Simple security check (local only) or similar to ops.py if needed
    # For now keeping it simple as per context
    
    try:
        async with _alerts_lock:
            _cleanup_if_exited()
            if _registry["proc"] is not None:
                return {"ok": True, "status": "already_running", "pid": _registry["pid"]}

            script_path = project_root / "backend" / "scripts" / "otc_alert_dispatch.py"
            if not script_path.exists():
                return _json_error(status_code=404, detail=f"Script not found: {script_path}")

            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            log_dir = project_root / "data" / "data_output" / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / f"alerts_{ts}.log"
            
            log_f = open(log_path, "w", encoding="utf-8")
            
            # Load user settings
            settings = load_settings()
            alert_settings = settings.get("alerts", {})
            
            cmd = [sys.executable, str(script_path)]
            if assets:
                cmd.extend(["--assets"] + assets)
            
            # Source of truth: Setting overrides Body if Body is False
            final_use_redis = use_redis or alert_settings.get("enableTickLogging", False)
            if final_use_redis:
                cmd.append("--redis")
            
            env = dict(os.environ)
            env["PYTHONPATH"] = str(project_root)
            
            # Pass Alert Settings via ENV
            env["ENABLE_AI_CONFIRM"] = str(alert_settings.get("enableAIConfirm", True)).lower()
            env["ALERT_MIN_CONFIDENCE"] = str(alert_settings.get("minAIConfidence", 0.7))
            env["ALERT_CANDLE_COUNT"] = str(alert_settings.get("candleCount", 100))
            
            discord_url = alert_settings.get("discordWebhookUrl", "").strip()
            if discord_url:
                env["DISCORD_WEBHOOK_URL"] = discord_url
            
            cooldown_min = alert_settings.get("alertCooldownMinutes", 5)
            env["ALERT_COOLDOWN_SECONDS"] = str(int(cooldown_min) * 60)
            env["SCAN_INTERVAL_SECONDS"] = str(alert_settings.get("scanIntervalSeconds", 60))
            
            # Tick Logging settings
            env["TICK_CHUNK_SIZE"] = str(alert_settings.get("tickChunkSize", 1000))
            env["TICK_LOG_DIR"] = alert_settings.get("tickLoggingDir", "data/ticks")
            
            proc = subprocess.Popen(
                cmd,
                cwd=str(project_root),
                stdout=log_f,
                stderr=subprocess.STDOUT,
                env=env
            )
            
            _registry["proc"] = proc
            _registry["pid"] = proc.pid
            _registry["started_at"] = datetime.now(timezone.utc).isoformat()
            _registry["log_path"] = str(log_path)
            _registry["log_file"] = log_f
            _registry["assets"] = assets

        return {"ok": True, "status": "started", "pid": proc.pid, "log_path": str(log_path)}
    except Exception as e:
        logger.error(f"Failed to start alerts: {e}", exc_info=True)
        return _json_error(status_code=500, detail=str(e), user_message="Failed to start alert dispatcher")

@router.post("/stop")
async def stop_alerts():
    try:
        async with _alerts_lock:
            _cleanup_if_exited()
            proc = _registry.get("proc")
            if proc is None:
                return {"ok": True, "status": "not_running"}
            
            await asyncio.to_thread(_stop_process, proc)
            
            if _registry["log_file"]:
                _registry["log_file"].close()
            
            _registry["proc"] = None
            _registry["pid"] = None
            _registry["log_file"] = None
            _registry["started_at"] = None

        return {"ok": True, "status": "stopped"}
    except Exception as e:
        logger.error(f"Failed to stop alerts: {e}")
        return _json_error(status_code=500, detail=str(e))

@router.get("/status")
async def get_alerts_status():
    async with _alerts_lock:
        _cleanup_if_exited()
        return {
            "ok": True,
            "running": _registry["proc"] is not None,
            "pid": _registry["pid"],
            "started_at": _registry["started_at"],
            "assets": _registry["assets"],
            "log_path": _registry["log_path"]
        }
