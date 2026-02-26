from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.services.gateway.main import app


class DummyResponse:
    def __init__(self, status_code: int, payload=None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("No JSON payload")
        return self._payload


def test_trading_proxy_returns_503_when_ssid_service_unavailable():
    client = TestClient(app)
    connect_error = httpx.ConnectError(
        "connect error",
        request=httpx.Request("GET", "http://127.0.0.1:8001/api/status"),
    )

    with patch("backend.services.gateway.routes.trading.httpx.AsyncClient.get", side_effect=connect_error):
        response = client.get("/api/v1/trading/status")

    assert response.status_code == 503
    body = response.json()
    assert body["detail"]["success"] is False
    assert "SSID service is unavailable" in body["detail"]["error"]


def test_trading_proxy_forwards_success_status_response():
    client = TestClient(app)
    payload = {"success": True, "connected": False, "demo": True, "balance": None}

    with patch(
        "backend.services.gateway.routes.trading.httpx.AsyncClient.get",
        return_value=DummyResponse(status_code=200, payload=payload),
    ):
        response = client.get("/api/v1/trading/status")

    assert response.status_code == 200
    assert response.json() == payload


def test_trading_proxy_normalizes_upstream_error_shape():
    client = TestClient(app)
    upstream_payload = {"detail": {"success": False, "error": "Authentication failed with provided SSID"}}

    with patch(
        "backend.services.gateway.routes.trading.httpx.AsyncClient.post",
        return_value=DummyResponse(status_code=401, payload=upstream_payload),
    ):
        response = client.post(
            "/api/v1/trading/connect",
            json={"ssid": '42["auth",{"session":"x"' + ("y" * 70) + '","isDemo":1}]', "demo": True},
        )

    assert response.status_code == 401
    body = response.json()
    assert body["detail"]["success"] is False
    assert body["detail"]["error"] == "Authentication failed with provided SSID"
