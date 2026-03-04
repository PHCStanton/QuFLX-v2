"""
routes/trading.py — Thin Proxy to SSID Service

This module forwards trading requests from the Gateway (Port 8000)
to the standalone SSID Service (Port 8001).
"""

import os
import logging
import httpx
import re
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("gateway.trading.proxy")
router = APIRouter()

# SSID Service configuration
SSID_SERVICE_PORT = os.getenv("QFLX_SSID_SERVICE_PORT", "8001")
SSID_SERVICE_URL = f"http://127.0.0.1:{SSID_SERVICE_PORT}/api"
PROXY_TIMEOUT_SECONDS = float(os.getenv("QFLX_SSID_PROXY_TIMEOUT_SECONDS", "35"))

# Shared httpx client for connection pooling (created lazily, reused across requests)
_shared_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """Return a shared httpx.AsyncClient, creating it lazily on first use."""
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=httpx.Timeout(PROXY_TIMEOUT_SECONDS))
    return _shared_client

# ---------------------------------------------------------------------------
# Request Models (kept for validation at the gateway level)
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    ssid: str = Field(default="", description="Pocket Option SSID cookie value. Empty string allowed — ssid_service will use .env fallback.")
    demo: bool = Field(True, description="True = demo account (default), False = real")

    @field_validator("ssid")
    @classmethod
    def validate_ssid(cls, v: str) -> str:
        value = (v or "").strip()
        # Fix 1: Allow empty SSID — ssid_service has fallback from .env (QFLX_SSID_DEMO/REAL).
        # Only validate format when the caller explicitly provides an SSID.
        if not value:
            return value
        if not value.startswith('42["auth"'):
            raise ValueError('ssid must start with 42["auth"')
        # Keep validation lightweight at gateway; deep validation happens in ssid_service.
        pattern = re.compile(r'^42\["auth",\{.*"session".*"isDemo".*\}\]$')
        if not pattern.match(value):
            raise ValueError('ssid must be a full 42["auth",{...}] payload')
        return value

class ExecuteTradeRequest(BaseModel):
    asset: str = Field(..., description="OTC asset symbol e.g. EURUSD_otc")
    direction: str = Field(..., description="'call' or 'put'")
    amount: float = Field(..., gt=0, description="Trade amount in USD")
    expiration: int = Field(300, gt=0, description="Expiry in seconds (default 300s = 5m)")

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v: str) -> str:
        normalized = v.lower().strip()
        if normalized not in ("call", "put"):
            raise ValueError("direction must be 'call' or 'put'")
        return normalized

    @field_validator("asset")
    @classmethod
    def validate_asset_format(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("asset cannot be empty")
        return v

class SwitchModeRequest(BaseModel):
    demo: bool = Field(..., description="True = demo, False = real")


def _extract_error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        # Handle fastapi error envelope: {"detail": ...}
        if "detail" in payload:
            detail = payload.get("detail")
            if isinstance(detail, dict):
                for key in ("error", "message", "detail", "user_message"):
                    value = detail.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
            elif isinstance(detail, str) and detail.strip():
                return detail.strip()

        for key in ("error", "message", "user_message"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    if isinstance(payload, str) and payload.strip():
        return payload.strip()

    return fallback

# ---------------------------------------------------------------------------
# Helper for Proxying
# ---------------------------------------------------------------------------

async def _proxy_request(method: str, path: str, json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = f"{SSID_SERVICE_URL}{path}"
    try:
        client = _get_client()
        if method.upper() == "GET":
            resp = await client.get(url)
        elif method.upper() == "POST":
            resp = await client.post(url, json=json_data)
        else:
            raise HTTPException(
                status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                detail={"success": False, "error": f"Unsupported proxy method: {method}"},
            )

        if resp.status_code != 200:
            try:
                upstream_payload = resp.json()
            except ValueError:
                upstream_payload = resp.text

            error_message = _extract_error_message(
                upstream_payload,
                f"SSID service request failed with status {resp.status_code}",
            )
            raise HTTPException(
                status_code=resp.status_code,
                detail={"success": False, "error": error_message},
            )

        return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
        logger.error("SSID Service unavailable for %s %s: %s", method, url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "error": "SSID service is unavailable or not responding. Start it from the TopBar SSID button.",
            },
        )
    except httpx.RequestError as exc:
        logger.error("SSID Service request failed for %s %s: %s", method, url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"success": False, "error": "SSID service unavailable"},
        )
    except Exception as exc:
        logger.error("Unexpected trading proxy error for %s %s: %s", method, url, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"success": False, "error": "Trading proxy error"},
        )

# ---------------------------------------------------------------------------
# Proxy Endpoints
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect_trading(req: ConnectRequest) -> Dict[str, Any]:
    """Proxy connect request to SSID Service."""
    return await _proxy_request("POST", "/connect", req.model_dump())

@router.post("/disconnect")
async def disconnect_trading() -> Dict[str, Any]:
    """Proxy disconnect request to SSID Service."""
    return await _proxy_request("POST", "/disconnect")

@router.get("/status")
async def get_trading_status() -> Dict[str, Any]:
    """Proxy live trading status from SSID Service."""
    return await _proxy_request("GET", "/status")

@router.post("/execute")
async def execute_trade(req: ExecuteTradeRequest) -> Dict[str, Any]:
    """Proxy trade execution to SSID Service."""
    return await _proxy_request("POST", "/trade", req.model_dump())

@router.get("/result/{order_id}")
async def get_trade_result(order_id: str) -> Dict[str, Any]:
    """Proxy trade result check to SSID Service."""
    return await _proxy_request("GET", f"/result/{order_id}")

@router.post("/switch-mode")
async def switch_trading_mode(req: SwitchModeRequest) -> Dict[str, Any]:
    """Proxy mode switch to SSID Service."""
    return await _proxy_request("POST", "/switch-mode", req.model_dump())

@router.get("/ssid-status")
async def get_ssid_status() -> Dict[str, Any]:
    """Proxy SSID status check to SSID Service (Fix 3). Returns hasDemoSsid/hasRealSsid booleans."""
    return await _proxy_request("GET", "/ssid-status")

@router.get("/assets")
async def list_trading_assets() -> Dict[str, Any]:
    """Proxy assets list request to SSID Service."""
    return await _proxy_request("GET", "/assets")
