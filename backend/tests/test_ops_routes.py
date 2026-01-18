import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class FakeProc:
    def __init__(self, pid: int = 123):
        self.pid = pid
        self._alive = True

    def poll(self):
        return None if self._alive else 0

    def terminate(self):
        self._alive = False

    def kill(self):
        self._alive = False

    def wait(self, timeout=None):
        self._alive = False
        return 0


@pytest.fixture()
def ops_app(monkeypatch):
    from backend.services.gateway.routes import ops

    ops._registry["chrome"].update({"proc": None, "pid": None, "started_at": None, "last_error": None})
    ops._registry["collector"].update(
        {
            "proc": None,
            "pid": None,
            "started_at": None,
            "last_error": None,
            "log_path": None,
            "log_file": None,
        }
    )

    app = FastAPI()
    app.include_router(ops.router, prefix="/api/v1/ops")
    return app


def test_ops_disabled_returns_403(ops_app, monkeypatch):
    monkeypatch.delenv("QFLX_ENABLE_OPS", raising=False)
    monkeypatch.delenv("QFLX_OPS_TOKEN", raising=False)

    client = TestClient(ops_app)
    res = client.get("/api/v1/ops/stream/status")

    assert res.status_code == 403
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error_code") == "ops_disabled"


def test_chrome_start_already_running(ops_app, monkeypatch):
    from backend.services.gateway.routes import ops

    monkeypatch.setenv("QFLX_ENABLE_OPS", "1")
    monkeypatch.delenv("QFLX_OPS_TOKEN", raising=False)
    monkeypatch.setattr(ops, "_is_port_open", lambda host, port, timeout_s=0.4: True)

    client = TestClient(ops_app)
    res = client.post("/api/v1/ops/chrome/start")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["status"] == "already_running"


def test_stream_start_idempotent(ops_app, monkeypatch):
    from backend.services.gateway.routes import ops

    monkeypatch.setenv("QFLX_ENABLE_OPS", "1")
    monkeypatch.delenv("QFLX_OPS_TOKEN", raising=False)

    def fake_popen(*args, **kwargs):
        return FakeProc(pid=456)

    monkeypatch.setattr(ops.subprocess, "Popen", fake_popen)

    client = TestClient(ops_app)

    res1 = client.post("/api/v1/ops/stream/start")
    assert res1.status_code == 200
    body1 = res1.json()
    assert body1["ok"] is True
    assert body1["status"] == "started"
    assert body1["pid"] == 456

    res2 = client.post("/api/v1/ops/stream/start")
    assert res2.status_code == 200
    body2 = res2.json()
    assert body2["ok"] is True
    assert body2["status"] == "already_running"
    assert body2["pid"] == 456


def test_stream_pause_already_stopped(ops_app, monkeypatch):
    monkeypatch.setenv("QFLX_ENABLE_OPS", "1")
    monkeypatch.delenv("QFLX_OPS_TOKEN", raising=False)

    client = TestClient(ops_app)
    res = client.post("/api/v1/ops/stream/pause")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["status"] == "already_stopped"


def test_stream_pause_stops_running_process(ops_app, monkeypatch):
    from backend.services.gateway.routes import ops

    monkeypatch.setenv("QFLX_ENABLE_OPS", "1")
    monkeypatch.delenv("QFLX_OPS_TOKEN", raising=False)

    fake_proc = FakeProc(pid=789)

    import asyncio

    async def seed_running():
        async with ops._ops_lock:
            ops._registry["collector"]["proc"] = fake_proc
            ops._registry["collector"]["pid"] = fake_proc.pid

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(seed_running())
    finally:
        loop.close()

    client = TestClient(ops_app)
    res = client.post("/api/v1/ops/stream/pause")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["status"] == "stopped"
