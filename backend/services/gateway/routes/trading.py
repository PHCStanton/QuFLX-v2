"""
routes/trading.py — Live Trading REST Endpoints

Endpoints under /api/v1/trading:

  POST   /connect         Connect with SSID + demo flag
  POST   /disconnect      Disconnect session
  GET    /status          Connection status + balance
  POST   /execute         Execute a trade
  GET    /result/{id}     Check trade WIN/LOSS result
  GET    /assets          List verified OTC assets
  POST   /switch-mode     Switch Demo <-> Real
  GET    /config          Get trading config (SSID masked)
  PUT    /config          Update trading settings
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, validator

from backend.services.gateway.trading_service import get_trading_service

logger = logging.getLogger("gateway.trading.routes")
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    ssid: str = Field(..., min_length=50, description="Pocket Option SSID cookie value")
    demo: bool = Field(True, description="True = demo account (default), False = real")


class ExecuteTradeRequest(BaseModel):
    asset: str = Field(..., description="OTC asset symbol e.g. EURUSD_otc")
    direction: str = Field(..., description="'call' or 'put'")
    amount: float = Field(..., gt=0, description="Trade amount in USD")
    expiration: int = Field(300, gt=0, description="Expiry in seconds (default 300s = 5m)")

    @validator("direction")
    @classmethod
    def validate_direction(cls, v: str) -> str:
        normalized = v.lower().strip()
        if normalized not in ("call", "put"):
            raise ValueError("direction must be 'call' or 'put'")
        return normalized

    @validator("asset")
    @classmethod
    def validate_asset_format(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("asset cannot be empty")
        return v


class SwitchModeRequest(BaseModel):
    demo: bool = Field(..., description="True = demo, False = real")


class UpdateConfigRequest(BaseModel):
    default_amount: Optional[float] = Field(None, gt=0)
    default_expiration: Optional[int] = Field(None, gt=0)
    min_amount: Optional[float] = Field(None, gt=0)
    max_amount: Optional[float] = Field(None, gt=0)
    confirm_real_trades: Optional[bool] = None
    trade_cooldown_seconds: Optional[int] = Field(None, ge=1, le=60)


def _ok(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": True, **data}


def _fail(message: str, code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=code, detail={"success": False, "error": message})


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect_trading(req: ConnectRequest) -> Dict[str, Any]:
    """
    Initiate a Pocket Option WebSocket connection using the provided SSID.
    Defaults to demo mode for safety.
    """
    logger.info("POST /connect: Starting connection request (demo=%s)", req.demo)
    svc = get_trading_service()
    result = await svc.connect(req.ssid, req.demo)
    logger.info("POST /connect: Connection completed with result: %s", {k: v if k != "balance" else f"${v}" if v else "None" for k, v in result.items()})
    if not result.get("success"):
        logger.warning("POST /connect: Connection failed - %s", result.get("error"))
        raise _fail(result.get("error", "Connection failed"))
    logger.info("Trading connected | demo=%s balance=%s", req.demo, result.get("balance"))
    response = _ok({"balance": result.get("balance"), "demo": result.get("demo"), "message": result.get("message")})
    logger.info("POST /connect: Sending response to client")
    return response


@router.post("/disconnect")
async def disconnect_trading() -> Dict[str, Any]:
    """Gracefully disconnect the current trading session."""
    svc = get_trading_service()
    result = await svc.disconnect()
    logger.info("Trading disconnected")
    return _ok({"message": result.get("message", "Disconnected")})


@router.get("/status")
async def get_trading_status() -> Dict[str, Any]:
    """Return current connection status, mode, and balance."""
    svc = get_trading_service()
    status_data = await svc.get_status()
    return _ok(status_data)


@router.post("/execute")
async def execute_trade(req: ExecuteTradeRequest) -> Dict[str, Any]:
    """
    Execute a binary options trade.

    ⚠️ REAL MONEY WARNING: When demo=False this trades real USD.
    The frontend must show a confirmation dialog before calling this endpoint.
    """
    svc = get_trading_service()

    # Guard: must be connected
    status_data = await svc.get_status()
    if not status_data.get("connected"):
        raise _fail("Not connected — connect first", status.HTTP_409_CONFLICT)

    result = await svc.execute_trade(
        asset=req.asset,
        direction=req.direction,
        amount=req.amount,
        expiration=req.expiration,
    )
    if not result.get("success"):
        raise _fail(result.get("error", "Trade execution failed"))

    logger.info(
        "Trade executed | asset=%s dir=%s amount=$%.2f exp=%ds",
        req.asset, req.direction, req.amount, req.expiration,
    )
    return _ok(result)


@router.get("/result/{order_id}")
async def get_trade_result(order_id: str) -> Dict[str, Any]:
    """Check the WIN/LOSS result of a completed trade by order ID."""
    svc = get_trading_service()
    result = await svc.check_trade_result(order_id)
    if not result.get("success"):
        raise _fail(result.get("error", "Result check failed"))
    return _ok(result)


@router.get("/assets")
async def list_trading_assets() -> Dict[str, Any]:
    """Return the list of verified OTC assets enriched with live payout data."""
    svc = get_trading_service()
    assets = await svc.get_assets()
    return _ok({"assets": assets, "count": len(assets)})


@router.post("/switch-mode")
async def switch_trading_mode(req: SwitchModeRequest) -> Dict[str, Any]:
    """
    Switch between Demo and Real account modes.
    Requires a prior successful connection (SSID must be saved in config).

    ⚠️ Switching to Real mode reconnects with real trading enabled.
    """
    svc = get_trading_service()
    result = await svc.switch_mode(req.demo)
    if not result.get("success"):
        raise _fail(result.get("error", "Mode switch failed"))
    logger.info("Trading mode switched | demo=%s", req.demo)
    return _ok({"balance": result.get("balance"), "demo": result.get("demo")})


@router.get("/config")
async def get_trading_config() -> Dict[str, Any]:
    """
    Return current trading configuration.
    The SSID field is masked — never returned in plaintext.
    """
    svc = get_trading_service()
    return _ok({"config": svc.get_config_safe()})


@router.put("/config")
async def update_trading_config(req: UpdateConfigRequest) -> Dict[str, Any]:
    """Update trading settings (amount limits, cooldowns, confirmations)."""
    svc = get_trading_service()
    updates = req.dict(exclude_none=True)
    if not updates:
        raise _fail("No valid fields to update")
    updated = svc.update_config(updates)
    return _ok({"config": updated})
