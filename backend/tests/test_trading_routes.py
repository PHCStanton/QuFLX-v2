"""
test_trading_routes.py — Backend tests for /api/v1/trading endpoints

These tests use FastAPI TestClient and mock both SSIDConnector and OTCExecutor
so they NEVER connect to Pocket Option or execute real trades.

Run with:
    conda activate QuFLX-v2
    python -m pytest backend/tests/test_trading_routes.py -v
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Minimal app scaffold for testing (avoids importing Redis / Socket.IO)
# ---------------------------------------------------------------------------

from fastapi import FastAPI
from backend.services.gateway.routes.trading import router as trading_router

test_app = FastAPI()
test_app.include_router(trading_router, prefix="/api/v1/trading")
client = TestClient(test_app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_SSID = (
    '42["auth",{"session":"abc123def456","isDemo":1,"uid":99999,'
    '"platform":2,"timezone":"America/New_York","tournamentId":0,'
    '"captcha":""}]'
)

MOCK_ASSETS = [
    "EURUSD_otc", "GBPUSD_otc", "USDJPY_otc", "AUDUSD_otc",
    "USDCAD_otc", "USDCHF_otc", "NZDUSD_otc", "EURJPY_otc",
    "EURGBP_otc", "EURAUD_otc", "EURCAD_otc", "AUDNZD_otc",
    "AUDJPY_otc",
]


def _reset_service():
    """Reset singleton between tests."""
    from backend.services.gateway.trading_service import TradingService
    TradingService._instance = None


# ---------------------------------------------------------------------------
# Status endpoint (no connection needed)
# ---------------------------------------------------------------------------

class TestStatus:
    def setup_method(self):
        _reset_service()

    def test_status_when_disconnected(self):
        resp = client.get("/api/v1/trading/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["connected"] is False
        assert data["balance"] is None
        assert data["demo"] is True  # defaults to demo


# ---------------------------------------------------------------------------
# Assets endpoint
# ---------------------------------------------------------------------------

class TestAssets:
    def setup_method(self):
        _reset_service()

    def test_assets_returns_list_without_connection(self):
        """Assets endpoint reads from OTCExecutor.OTC_ASSETS (no connection needed)."""
        mock_executor = MagicMock()
        mock_executor.OTC_ASSETS = MOCK_ASSETS

        with patch("backend.services.gateway.trading_service._ensure_imports", return_value=True), \
             patch("backend.services.gateway.trading_service._OTCExecutor", mock_executor):
            resp = client.get("/api/v1/trading/assets")

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["assets"], list)
        assert data["count"] == len(data["assets"])


# ---------------------------------------------------------------------------
# Connect endpoint
# ---------------------------------------------------------------------------

class TestConnect:
    def setup_method(self):
        _reset_service()

    def test_connect_with_short_ssid_fails(self):
        resp = client.post(
            "/api/v1/trading/connect",
            json={"ssid": "short", "demo": True},
        )
        assert resp.status_code == 422  # Pydantic min_length fails

    def test_connect_with_valid_ssid_calls_service(self):
        """Successful connect returns balance and demo flag."""
        with patch(
            "backend.services.gateway.trading_service.TradingService._connect_sync",
            return_value={"success": True, "balance": 10000.0, "demo": True, "message": "✅ Connected"},
        ):
            resp = client.post(
                "/api/v1/trading/connect",
                json={"ssid": VALID_SSID, "demo": True},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["balance"] == 10000.0
        assert data["demo"] is True

    def test_connect_failure_returns_error(self):
        """Connector failure propagates as 400 with error detail."""
        with patch(
            "backend.services.gateway.trading_service.TradingService._connect_sync",
            return_value={"success": False, "error": "Connection timeout"},
        ):
            resp = client.post(
                "/api/v1/trading/connect",
                json={"ssid": VALID_SSID, "demo": True},
            )
        assert resp.status_code == 400
        data = resp.json()
        assert "Connection timeout" in str(data["detail"])


# ---------------------------------------------------------------------------
# Execute endpoint (requires connected state)
# ---------------------------------------------------------------------------

class TestExecute:
    def setup_method(self):
        _reset_service()

    def test_execute_when_disconnected_returns_409(self):
        resp = client.post(
            "/api/v1/trading/execute",
            json={"asset": "EURUSD_otc", "direction": "call", "amount": 10.0, "expiration": 300},
        )
        assert resp.status_code == 409  # Not connected

    def test_execute_invalid_direction_fails_validation(self):
        resp = client.post(
            "/api/v1/trading/execute",
            json={"asset": "EURUSD_otc", "direction": "up", "amount": 10.0, "expiration": 300},
        )
        assert resp.status_code == 422  # Pydantic validator

    def test_execute_when_connected_calls_service(self):
        """With a mocked connected service, execute_trade is called."""
        svc_mock = MagicMock()
        svc_mock.get_status.return_value = {"connected": True, "demo": True, "balance": 5000.0, "last_updated": "x"}
        svc_mock.execute_trade = MagicMock(
            return_value={"success": True, "order_id": "test-123", "asset": "EURUSD_otc"}
        )

        import asyncio
        async def fake_execute(*a, **kw):
            return {"success": True, "order_id": "test-123", "asset": "EURUSD_otc"}
        svc_mock.execute_trade = fake_execute

        with patch("backend.services.gateway.routes.trading.get_trading_service", return_value=svc_mock):
            resp = client.post(
                "/api/v1/trading/execute",
                json={"asset": "EURUSD_otc", "direction": "call", "amount": 10.0, "expiration": 300},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["order_id"] == "test-123"


# ---------------------------------------------------------------------------
# Config endpoints
# ---------------------------------------------------------------------------

class TestConfig:
    def setup_method(self):
        _reset_service()

    def test_get_config_masks_ssid(self):
        resp = client.get("/api/v1/trading/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        cfg = data["config"]
        # SSID must never be in plaintext
        assert cfg.get("ssid") != VALID_SSID
        assert "ssid_saved" in cfg

    def test_update_config_valid_fields(self):
        resp = client.put(
            "/api/v1/trading/config",
            json={"default_amount": 25.0, "trade_cooldown_seconds": 5},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    def test_update_config_empty_body_fails(self):
        resp = client.put("/api/v1/trading/config", json={})
        assert resp.status_code == 400
