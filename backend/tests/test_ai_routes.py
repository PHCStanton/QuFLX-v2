import pytest
import pandas as pd
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from backend.services.gateway.main import app
from backend.services.ai.service import AIServiceError
from backend.services.gateway.routes import ai as ai_route
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


@pytest.mark.asyncio
async def test_inject_backend_indicators_supplements_empty_context():
    context = {}
    result_df = pd.DataFrame(
        {
            "timestamp": [1, 2, 3],
            "rsi_14": [40.0, 41.0, 42.0],
            "ema_16": [10.0, 11.0, 12.0],
            "bb_middle": [20.0, 21.0, 22.0],
        }
    )

    with patch("backend.services.gateway.routes.ai.asyncio.to_thread", new=AsyncMock(return_value=(result_df, 3))):
        await ai_route._inject_backend_indicators(context, "EURUSD_otc", "1m")

    assert context["backendDataInjected"] is True
    assert "RSI" in context["indicatorSnapshots"]
    assert "EMA" in context["indicatorSnapshots"]
    assert "Bollinger Bands" in context["indicatorSnapshots"]


@pytest.mark.asyncio
async def test_inject_backend_indicators_preserves_frontend_values():
    context = {
        "indicatorSnapshots": {
            "RSI": [{"time": 99, "value": 77.7}],
        }
    }
    result_df = pd.DataFrame(
        {
            "timestamp": [1, 2, 3],
            "rsi_14": [40.0, 41.0, 42.0],
            "macd_histogram": [0.1, 0.2, 0.3],
        }
    )

    with patch("backend.services.gateway.routes.ai.asyncio.to_thread", new=AsyncMock(return_value=(result_df, 3))):
        await ai_route._inject_backend_indicators(context, "EURUSD", "1m")

    assert context["indicatorSnapshots"]["RSI"] == [{"time": 99, "value": 77.7}]
    assert "MACD Histogram" in context["indicatorSnapshots"]


@pytest.mark.asyncio
async def test_inject_backend_indicators_honors_skip_flag():
    context = {"skipBackendIndicators": True}

    with patch("backend.services.gateway.routes.ai.asyncio.to_thread", new=AsyncMock()) as mocked_to_thread:
        await ai_route._inject_backend_indicators(context, "EURUSD", "1m")

    mocked_to_thread.assert_not_called()
    assert "indicatorSnapshots" not in context


@pytest.mark.asyncio
async def test_inject_backend_indicators_normalizes_asset_and_supports_daily_timeframe():
    context = {}
    result_df = pd.DataFrame(
        {
            "timestamp": [1, 2, 3],
            "rsi_14": [40.0, 41.0, 42.0],
        }
    )

    with patch("backend.services.gateway.routes.ai.asyncio.to_thread", new=AsyncMock(return_value=(result_df, 3))) as mocked_to_thread:
        await ai_route._inject_backend_indicators(context, "EURUSD_otc", "1d")

    mocked_to_thread.assert_awaited_once_with(
        ai_route.calculate_indicators_for_asset,
        "EURUSDOTC",
        1440,
    )
    assert context["backendDataInjected"] is True


@pytest.mark.asyncio
async def test_inject_backend_indicators_skips_missing_history():
    context = {}

    with patch(
        "backend.services.gateway.routes.ai.asyncio.to_thread",
        new=AsyncMock(side_effect=FileNotFoundError()),
    ):
        await ai_route._inject_backend_indicators(context, "EURUSD", "1m")

    assert "backendDataInjected" not in context
