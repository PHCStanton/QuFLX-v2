import pytest
import json
import asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

@pytest.fixture()
def voice_app(monkeypatch):
    from backend.services.gateway.routes import ai_voice
    
    # Ensure API key is set for some tests
    monkeypatch.setenv('XAI_API_KEY', 'test-key')

    app = FastAPI()
    app.include_router(ai_voice.router, prefix='/api/v1/ai/voice')
    return app

def test_voice_ws_missing_api_key(voice_app, monkeypatch):
    monkeypatch.delenv('XAI_API_KEY', raising=False)
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.delenv('GROK_API_KEY', raising=False)
    
    client = TestClient(voice_app)
    with client.websocket_connect('/api/v1/ai/voice/ws') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'error'
        assert msg['code'] == 'missing_api_key'

def test_voice_ws_invalid_json(voice_app):
    client = TestClient(voice_app)
    
    mock_upstream = AsyncMock()
    # Mocking as an async context manager
    mock_connect = MagicMock()
    mock_connect.return_value.__aenter__.return_value = mock_upstream
    
    with patch("websockets.connect", mock_connect):
        with client.websocket_connect('/api/v1/ai/voice/ws') as ws:
            ws.send_text("not json")
            msg = ws.receive_json()
            assert msg['code'] == 'invalid_json'

def test_voice_ws_unsupported_event(voice_app):
    client = TestClient(voice_app)
    
    mock_upstream = AsyncMock()
    mock_connect = MagicMock()
    mock_connect.return_value.__aenter__.return_value = mock_upstream
    
    with patch("websockets.connect", mock_connect):
        with client.websocket_connect('/api/v1/ai/voice/ws') as ws:
            ws.send_json({"type": "malicious.event", "data": "hack"})
            msg = ws.receive_json()
            assert msg['code'] == 'unsupported_event'
            assert "Unsupported event type" in msg['detail']

def test_voice_ws_upstream_fails(voice_app):
    client = TestClient(voice_app)
    
    with patch("websockets.connect", side_effect=Exception("Connection failed")):
        with client.websocket_connect('/api/v1/ai/voice/ws') as ws:
            msg = ws.receive_json()
            assert msg['code'] == 'relay_failed'
