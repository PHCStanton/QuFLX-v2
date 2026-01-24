import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def voice_app(monkeypatch):
    from backend.services.gateway.routes import ai_voice

    monkeypatch.delenv('XAI_API_KEY', raising=False)
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.delenv('GROK_API_KEY', raising=False)

    app = FastAPI()
    app.include_router(ai_voice.router, prefix='/api/v1/ai/voice')
    return app


def test_voice_ws_missing_api_key(voice_app):
    client = TestClient(voice_app)

    with client.websocket_connect('/api/v1/ai/voice/ws') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'error'
        assert msg['code'] == 'missing_api_key'
        assert 'request_id' in msg
