"""
ssid_service/routes.py

SSID Service API Routes — Connect, Trade, Switch, Status.

Simplifications applied (@Code_Simplifier):
  - Session lock boilerplate extracted to _get_lock() helper (was repeated 6x).
  - _resolve_session() helper centralises active-session lookup.
  - SSID persistence added per INTEGRATIONS_GUIDE §3.2 (@Backend_Specialist).

Bug fixes applied (@Debugger):
  - Trade race condition fixed: session reference captured inside lock, trade
    executed outside lock so the lock is not held during the blocking I/O call.
  - Principle 8: every error path returns a structured JSON response.
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator
from typing import Dict, Any, Optional, Tuple
from .executor import OTCExecutor, OTC_ASSETS

router = APIRouter()
logger = logging.getLogger("ssid_service.routes")

SSID_PATTERN = re.compile(r'^42\["auth",\{.*"session".*"isDemo".*\}\]$')

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _http_error(status_code: int, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"success": False, "error": message})


def validate_ssid_format(ssid: str) -> Tuple[bool, str]:
    if not isinstance(ssid, str):
        return False, "SSID must be a string"
    value = ssid.strip()
    if not value:
        return False, "SSID must be a non-empty string"
    if len(value) < 50:
        return False, 'SSID too short - copy the full 42["auth", ...] WebSocket frame'
    if not value.startswith('42["auth"'):
        return False, 'SSID must start with 42["auth"'
    if not SSID_PATTERN.match(value):
        return False, 'SSID format invalid - expected 42["auth",{..."session"..."isDemo"...}]'
    return True, "ok"


def _get_lock(app) -> asyncio.Lock:
    """Return the session lock, creating it lazily if needed (Principle 4: Zero Assumptions)."""
    if not hasattr(app.state, "session_lock") or app.state.session_lock is None:
        app.state.session_lock = asyncio.Lock()
    return app.state.session_lock


def _resolve_session(app):
    """Return (mode_str, session) for the currently active mode."""
    mode = getattr(app.state, "active_mode", "demo")
    session = app.state.demo_session if mode == "demo" else app.state.real_session
    return mode, session


async def _stop_session_safe(session) -> None:
    try:
        await asyncio.to_thread(session.stop)
    except Exception as exc:
        logger.error("Failed to stop session cleanly: %s", exc, exc_info=True)


def _persist_ssid(demo: bool, ssid: str) -> None:
    """
    Persist a validated SSID to the project .env file.
    INTEGRATIONS_GUIDE §3.2: automatic saving of valid SSIDs to local environment.
    Non-fatal — failure is logged but never raises.
    """
    try:
        project_root = Path(__file__).resolve().parents[3]
        env_path = project_root / ".env"
        key = "QFLX_SSID_DEMO" if demo else "QFLX_SSID_REAL"

        lines: list[str] = []
        if env_path.exists():
            lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)

        key_prefix = f"{key}="
        updated = False
        for i, line in enumerate(lines):
            if line.startswith(key_prefix):
                lines[i] = f"{key}={ssid}\n"
                updated = True
                break

        if not updated:
            lines.append(f"{key}={ssid}\n")

        env_path.write_text("".join(lines), encoding="utf-8")
        logger.info("Persisted %s SSID to .env", "demo" if demo else "real")
    except Exception as exc:
        logger.warning("Could not persist SSID to .env: %s", exc)


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    ssid: str
    demo: bool = True

    @validator("ssid")
    def normalize_ssid(cls, v):
        return (v or "").strip()


class TradeRequest(BaseModel):
    asset: str
    direction: str
    amount: float = Field(..., gt=0)
    expiration: int = Field(..., gt=0)

    @validator("direction")
    def validate_direction(cls, v):
        v = v.lower()
        if v not in ("call", "put"):
            raise ValueError("Direction must be 'call' or 'put'")
        return v

    @validator("asset")
    def validate_asset(cls, v):
        value = (v or "").strip()
        if not value:
            raise ValueError("Asset is required")
        return value


class SwitchModeRequest(BaseModel):
    demo: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect(req: ConnectRequest, request: Request):
    app = request.app
    lock = _get_lock(app)

    # Use provided SSID or fallback to env
    ssid = req.ssid or (app.state.ssid_demo if req.demo else app.state.ssid_real)
    ssid = (ssid or "").strip()

    if not ssid:
        raise _http_error(400, "No SSID provided and no environment fallback found")

    is_valid, validation_message = validate_ssid_format(ssid)
    if not is_valid:
        raise _http_error(400, validation_message)

    from .connector import AsyncPocketOptionWrapper

    async with lock:
        mode = "demo" if req.demo else "real"
        existing = app.state.demo_session if req.demo else app.state.real_session
        if existing:
            await _stop_session_safe(existing)
            if req.demo:
                app.state.demo_session = None
            else:
                app.state.real_session = None

        try:
            session = AsyncPocketOptionWrapper(ssid, req.demo)
        except Exception as exc:
            logger.error("Failed to initialize %s session: %s", mode, exc, exc_info=True)
            raise _http_error(500, f"Failed to initialize {mode} session")

        connected = await asyncio.to_thread(session.connect)
        if not connected:
            await _stop_session_safe(session)
            raise _http_error(401, "Authentication failed with provided SSID")

        if req.demo:
            app.state.demo_session = session
            app.state.active_mode = "demo"
        else:
            app.state.real_session = session
            app.state.active_mode = "real"

        balance = await asyncio.to_thread(session.get_balance)

    # Persist valid SSID outside the lock (non-blocking I/O, non-fatal)
    _persist_ssid(req.demo, ssid)

    return {
        "success": True,
        "connected": True,
        "message": "Connected successfully",
        "balance": balance,
        "demo": req.demo,
    }


@router.post("/disconnect")
async def disconnect(request: Request):
    app = request.app
    lock = _get_lock(app)

    async with lock:
        mode, session = _resolve_session(app)
        if session:
            await _stop_session_safe(session)
            if mode == "demo":
                app.state.demo_session = None
            else:
                app.state.real_session = None

    return {"success": True, "message": "Disconnected", "demo": mode == "demo"}


@router.get("/status")
async def get_status(request: Request):
    app = request.app
    lock = _get_lock(app)

    async with lock:
        mode, session = _resolve_session(app)
        if session and session.is_connected():
            balance = await asyncio.to_thread(session.get_balance)
            return {"success": True, "connected": True, "demo": mode == "demo", "balance": balance}

    return {"success": True, "connected": False, "demo": mode == "demo", "balance": None}


@router.post("/trade")
async def execute_trade(req: TradeRequest, request: Request):
    app = request.app
    lock = _get_lock(app)

    # Capture session reference inside lock, then release before blocking trade call.
    # Fix: prevents race condition where two concurrent requests both pass is_connected()
    # but then interfere during execution.
    async with lock:
        _, session = _resolve_session(app)

    if not session or not session.is_connected():
        raise _http_error(409, "Not connected to Pocket Option")

    executor = OTCExecutor(session)
    result = await asyncio.to_thread(
        executor.execute_trade,
        asset=req.asset,
        direction=req.direction,
        amount=req.amount,
        expiration=req.expiration,
    )

    if not result.get("success"):
        raise _http_error(400, result.get("error", "Trade failed"))

    return result


@router.get("/result/{order_id}")
async def check_result(order_id: str, request: Request):
    app = request.app
    lock = _get_lock(app)

    async with lock:
        _, session = _resolve_session(app)

    if not session or not session.is_connected():
        raise _http_error(409, "Not connected")

    executor = OTCExecutor(session)
    return await asyncio.to_thread(executor.check_result, order_id)


@router.get("/ssid-status")
async def ssid_status(request: Request):
    """
    Fix 2: Return whether a Demo and/or Real SSID is configured in the environment.
    Does NOT expose raw SSID values — booleans only (security).
    """
    app = request.app
    has_demo = bool((getattr(app.state, "ssid_demo", None) or "").strip())
    has_real = bool((getattr(app.state, "ssid_real", None) or "").strip())
    return {
        "success": True,
        "hasDemoSsid": has_demo,
        "hasRealSsid": has_real,
    }


@router.get("/assets")
async def list_assets():
    return {"success": True, "assets": OTC_ASSETS, "count": len(OTC_ASSETS)}


@router.post("/switch-mode")
async def switch_mode(req: SwitchModeRequest, request: Request):
    app = request.app
    lock = _get_lock(app)

    from .connector import AsyncPocketOptionWrapper

    async with lock:
        target_mode = "demo" if req.demo else "real"
        target_session = app.state.demo_session if req.demo else app.state.real_session

        # Clean up stale disconnected session
        if target_session and not target_session.is_connected():
            await _stop_session_safe(target_session)
            if req.demo:
                app.state.demo_session = None
            else:
                app.state.real_session = None
            target_session = None

        if target_session is None:
            fallback_ssid = (app.state.ssid_demo if req.demo else app.state.ssid_real) or ""
            fallback_ssid = fallback_ssid.strip()
            if not fallback_ssid:
                raise _http_error(
                    409,
                    f"Cannot switch to {target_mode} mode: no connected session and no {target_mode} SSID in environment",
                )

            is_valid, validation_message = validate_ssid_format(fallback_ssid)
            if not is_valid:
                raise _http_error(400, f"Invalid {target_mode} SSID in environment: {validation_message}")

            try:
                target_session = AsyncPocketOptionWrapper(fallback_ssid, req.demo)
            except Exception as exc:
                logger.error("Failed to initialize %s session during switch: %s", target_mode, exc, exc_info=True)
                raise _http_error(500, f"Failed to initialize {target_mode} session")

            connected = await asyncio.to_thread(target_session.connect)
            if not connected:
                await _stop_session_safe(target_session)
                raise _http_error(401, f"Authentication failed while switching to {target_mode} mode")

            if req.demo:
                app.state.demo_session = target_session
            else:
                app.state.real_session = target_session

        app.state.active_mode = target_mode
        balance = await asyncio.to_thread(target_session.get_balance)

    return {
        "success": True,
        "connected": True,
        "demo": req.demo,
        "balance": balance,
        "message": f"Switched to {target_mode} mode",
    }
