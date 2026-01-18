import subprocess
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.services.gateway.routes import history as history_routes


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(history_routes.router, prefix="/api/v1/history")
    return TestClient(app)


def test_bootstrap_history_missing_asset_returns_400(client: TestClient) -> None:
    res = client.post("/api/v1/history/bootstrap-history", json={"timeframe": "1m", "duration": 3})
    assert res.status_code == 400
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error_code") == "invalid_asset"


def test_bootstrap_history_invalid_timeframe_returns_400(client: TestClient) -> None:
    res = client.post(
        "/api/v1/history/bootstrap-history",
        json={"asset": "EURUSD", "timeframe": "abc", "duration": 3},
    )
    assert res.status_code == 400
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error_code") == "invalid_timeframe"


def test_bootstrap_history_timeout_returns_504(monkeypatch: Any, client: TestClient) -> None:
    def fake_run(*args: Any, **kwargs: Any):
        raise subprocess.TimeoutExpired(cmd="runner", timeout=1)

    monkeypatch.setattr(history_routes.subprocess, "run", fake_run)

    res = client.post(
        "/api/v1/history/bootstrap-history",
        json={"asset": "EURUSD", "timeframe": "1m", "duration": 3},
    )
    assert res.status_code == 504
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error_code") == "capability_timeout"


def test_bootstrap_history_manual_click_timeout_returns_504(monkeypatch: Any, client: TestClient) -> None:
    payload = {
        "ok": False,
        "error": "Manual click not detected",
        "error_code": "manual_click_timeout",
        "data": {},
        "artifacts": [],
    }

    def fake_run(*args: Any, **kwargs: Any):
        stdout = __import__("json").dumps(payload).encode("utf-8")
        return subprocess.CompletedProcess(args=["python"], returncode=0, stdout=stdout, stderr=b"")

    monkeypatch.setattr(history_routes.subprocess, "run", fake_run)

    res = client.post(
        "/api/v1/history/bootstrap-history",
        json={"asset": "EURUSD", "timeframe": "1m", "duration": 3},
    )
    assert res.status_code == 504
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error_code") == "manual_click_timeout"

