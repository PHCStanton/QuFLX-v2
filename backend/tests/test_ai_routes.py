import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from backend.services.gateway.main import app
from backend.services.ai.service import AIServiceError
from backend.services.gateway.routes.ai import _get_ai_service

client = TestClient(app)

@pytest.fixture
def mock_ai_service():
    mock = AsyncMock()
    app.dependency_overrides[_get_ai_service] = lambda: mock
    yield mock
    app.dependency_overrides.pop(_get_ai_service, None)

@pytest.mark.asyncio
async def test_ask_ai_route_success(mock_ai_service):
    mock_result = {
        "answer": "Hello from mock AI",
        "meta": {"ok": True}
    }
    mock_ai_service.ask.return_value = mock_result
    
    response = client.post(
        "/api/v1/ai/ask",
        json={"prompt": "How is the market?", "asset": "EURUSD"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "Hello from mock AI"
    assert "request_id" in data

@pytest.mark.asyncio
async def test_ask_ai_route_validation_error():
    # Missing prompt
    response = client.post(
        "/api/v1/ai/ask",
        json={"asset": "EURUSD"}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"

@pytest.mark.asyncio
async def test_ask_ai_route_image_too_large():
    # Simulate a large image data URL
    large_image = "data:image/png;base64," + "A" * (3 * 1024 * 1024) # ~3MB
    response = client.post(
        "/api/v1/ai/ask",
        json={"prompt": "Analyze this", "image_base64": large_image}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_image"
    assert "too large" in response.json()["detail"]

@pytest.mark.asyncio
async def test_ask_ai_route_service_error(mock_ai_service):
    mock_ai_service.ask.side_effect = AIServiceError(
        code="provider_error",
        user_message="AI provider failed",
        status_code=502,
        retryable=True
    )
    
    response = client.post(
        "/api/v1/ai/ask",
        json={"prompt": "Error test"}
    )
    
    assert response.status_code == 502
    assert response.json()["code"] == "provider_error"
    assert response.json()["detail"] == "AI provider failed"
