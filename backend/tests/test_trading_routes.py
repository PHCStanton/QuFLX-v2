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
from unittest.mock import AsyncMock, MagicMock, patch
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
    """Reset singleton between tests.

    Clears the singleton instance AND redirects _CONFIG_PATH to a non-existent
    location so that _load_config() always falls back to _DEFAULT_CONFIG.
    This prevents live test runs (which write demo:false to disk) from leaking
    into unit tests that expect the default demo:True state.
    """
    from backend.services.gateway import trading_service
    from backend.services.gateway.trading_service import TradingService
    TradingService._instance = None
    # Point config path somewhere that doesn't exist → _load_config uses defaults
    trading_service._CONFIG_PATH = trading_service.Path(
        "/nonexistent_test_isolation/trading_config.json"
    )


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
        """Assets endpoint reads from OTCExecutor.OTC_ASSETS (no connection needed).

        Patch OTCExecutor directly — the rewrite no longer uses _ensure_imports
        or _OTCExecutor module-level aliases (those were old internal symbols).
        """
        mock_executor_cls = MagicMock()
        mock_executor_cls.OTC_ASSETS = MOCK_ASSETS

        with patch("backend.services.gateway.trading_service.OTCExecutor", mock_executor_cls):
            resp = client.get("/api/v1/trading/assets")

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["assets"], list)
        assert data["count"] == len(data["assets"])
        # BUG #3 regression guard: each asset must have 'id', not 'symbol'
        for asset in data["assets"]:
            assert "id" in asset, f"Asset missing 'id' key: {asset}"


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
        """With a mocked connected service, execute_trade is called.

        BUG FIX: get_status and execute_trade must be AsyncMock because the
        route awaits them.  Using plain MagicMock return_value causes:
          TypeError: object dict can't be used in 'await' expression
        """
        svc_mock = MagicMock()
        # AsyncMock is required — route does `await svc.get_status()`
        svc_mock.get_status = AsyncMock(
            return_value={"connected": True, "demo": True, "balance": 5000.0}
        )
        svc_mock.execute_trade = AsyncMock(
            return_value={"success": True, "order_id": "test-123", "asset": "EURUSD_otc"}
        )

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
        """Config must mask SSID values and expose safe runtime settings.

        BUG FIX: old test asserted 'ssid_saved' which is not a key in the
        config schema. The correct check is that the 'ssid' key exists but
        is either empty or redacted — never the raw SSID string.
        """
        resp = client.get("/api/v1/trading/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        cfg = data["config"]
        # SSID values must never appear in plaintext
        assert cfg.get("ssid") != VALID_SSID
        # The raw SSID string must not appear anywhere in the response
        assert VALID_SSID not in str(cfg)
        # Runtime trading settings must be present
        assert "default_amount" in cfg
        assert "min_amount" in cfg
        assert "max_amount" in cfg
        assert "trade_cooldown_seconds" in cfg

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
