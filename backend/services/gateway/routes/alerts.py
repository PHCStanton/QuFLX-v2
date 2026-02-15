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

def _client_host(request: Request) -> str:
    if request.client is None:
        return ""
    return request.client.host or ""

def _is_local_client(host: str) -> bool:
    return host in {"127.0.0.1", "::1", "testclient"}

def _check_dev_gate(request: Request, ops_token: Optional[str]) -> Optional[JSONResponse]:
    if os.getenv("QFLX_ENABLE_OPS") != "1":
        return _json_error(
            status_code=403,
            detail="QFLX_ENABLE_OPS is not enabled",
            user_message="Alerts controls are disabled. Enable local ops to use this feature."
        )

    host = _client_host(request)
    if not _is_local_client(host):
        return _json_error(
            status_code=403,
            detail=f"Alerts endpoints are local-only. client_host={host}",
            user_message="Alerts controls are only allowed from the local machine."
        )

    expected_token = os.getenv("QFLX_OPS_TOKEN", "").strip()
    if expected_token:
        provided = (ops_token or "").strip()
        if provided != expected_token:
            return _json_error(
                status_code=403,
                detail="Missing or invalid ops token",
                user_message="Ops token required to use local controls."
            )

    return None

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
    except Exception as exc:
        logger.error(f"Alerts cleanup failed: {exc}")

def _stop_process(proc: subprocess.Popen):
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception as exc:
        logger.error(f"Alerts terminate failed: {exc}")
        try:
            proc.kill()
            proc.wait(timeout=3)
        except Exception as exc:
            logger.error(f"Alerts kill failed: {exc}")

@router.post("/start")
async def start_alerts(
    request: Request,
    assets: List[str] = Body(default=[]),
    use_redis: bool = Body(default=False, embed=True),
    x_qflx_ops_token: Optional[str] = Header(default=None)
):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err
    
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
            env["ENABLE_TICK_LOGGING"] = str(final_use_redis).lower()
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
async def stop_alerts(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err
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
async def get_alerts_status(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err
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
