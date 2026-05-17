import pytest
import pandas as pd
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from backend.services.gateway.main import app
from backend.services.ai.service import AIServiceError, AIService
from backend.services.gateway.routes import ai as ai_route
from backend.services.gateway.routes.ai import _resolve_ai_service
from backend.services.ai.registry import AIProviderRegistry
from backend.services.ai.providers import ProviderSpec


# ── Fixtures ────────────────────────────────────────────────────────────────────

class MockAIService:
    """Proper mock of AIService that responds to .spec and .ask correctly."""
    def __init__(self, key, spec, *, ask_result=None, ask_side_effect=None):
        from backend.services.ai.providers import ProviderSpec
        self.spec = ProviderSpec(
            key=spec.get("key", key),
            label=spec.get("label", key),
            base_url=spec.get("base_url", "https://api.x.ai/v1"),
            api_key_env=spec.get("api_key_env"),
            model=spec.get("model", "grok-4-latest"),
            supports_voice_server=spec.get("supports_voice_server", False),
            supports_vision=spec.get("supports_vision", True),
            max_ctx_kb=spec.get("max_ctx_kb", 150),
            is_local=spec.get("is_local", False),
        )
        self._enabled = True
        self._ask_result = ask_result
        self._ask_side_effect = ask_side_effect

    async def ask(self, **kwargs):
        if self._ask_side_effect:
            if isinstance(self._ask_side_effect, Exception):
                raise self._ask_side_effect
            raise self._ask_side_effect
        return self._ask_result or {"answer": "mock answer", "meta": {"ok": True}}

    async def ask_stream(self, **kwargs):
        if self._ask_side_effect:
            if isinstance(self._ask_side_effect, Exception):
                raise self._ask_side_effect
            raise self._ask_side_effect
        yield {"type": "delta", "delta": "Hello "}
        yield {"type": "done", "answer": "Hello world", "meta": {"ok": True, "model": self.spec.model}}

    async def close(self):
        pass

    async def probe(self):
        return True


@pytest.fixture
def mock_registry():
    """Provides a fresh AIProviderRegistry with all providers mocked."""
    from backend.services.ai.providers import build_provider_specs
    specs = build_provider_specs()

    mock_services = {}
    for key, spec in specs.items():
        mock_services[key] = MockAIService(key, {"key": key, "max_ctx_kb": spec.max_ctx_kb, "label": spec.label})

    registry = MagicMock()
    registry._services = mock_services
    registry.specs = specs
    registry.resolve_default.return_value = "grok-4-fast"

    def get_side_effect(key):
        if key not in mock_services:
            raise KeyError(f"Unknown AI provider: {key!r}")
        svc = mock_services[key]
        if not svc._enabled:
            raise RuntimeError(f"Provider {key!r} is not enabled")
        return svc

    registry.get.side_effect = get_side_effect
    return registry


@pytest.fixture
def client_with_registry(mock_registry):
    """Creates a TestClient with app.state.ai_registry pre-set to mock_registry."""
    # Patch the module-level request context so _resolve_ai_service finds our mock
    with patch("backend.services.gateway.routes.ai.AIProviderRegistry", return_value=mock_registry):
        app.state.ai_registry = mock_registry
        client = TestClient(app)
        yield client
        if hasattr(app.state, 'ai_registry'):
            del app.state.ai_registry


# ── Route tests ────────────────────────────────────────────────────────────────

def test_ask_ai_route_success(client_with_registry, mock_registry):
    """Smoke: /ask returns answer when registry+service work."""
    mock_svc = mock_registry._services["grok-4-fast"]
    mock_svc._ask_result = {"answer": "Hello from mock AI", "meta": {"ok": True}}

    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"prompt": "How is the market?", "asset": "EURUSD"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "Hello from mock AI"
    assert "request_id" in data


def test_ask_ai_route_validation_error(client_with_registry):
    """Missing prompt → 400 invalid_request."""
    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"asset": "EURUSD"}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"


def test_ask_ai_route_image_too_large(client_with_registry):
    """Image > 2 MB → 400 invalid_image."""
    large_image = "data:image/png;base64," + "A" * (3 * 1024 * 1024)
    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"prompt": "Analyze this", "image_base64": large_image}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_image"
    assert "too large" in response.json()["detail"]


def test_ask_ai_route_service_error(client_with_registry, mock_registry):
    """AIServiceError → propagates status code from exception."""
    mock_svc = mock_registry._services["grok-4-fast"]
    # Use MockAIService._ask_side_effect (not .ask.side_effect since ask() is not a Mock)
    mock_svc._ask_side_effect = AIServiceError(
        code="provider_error",
        user_message="AI provider failed",
        status_code=502,
        retryable=True,
    )

    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"prompt": "Error test"}
    )

    assert response.status_code == 502
    assert response.json()["code"] == "provider_error"
    assert response.json()["detail"] == "AI provider failed"


def test_ask_ai_stream_route_success(client_with_registry):
    """Streaming route emits delta events and done sentinel."""
    with client_with_registry.stream(
        "POST",
        "/api/v1/ai/ask/stream",
        json={"prompt": "How is the market?", "asset": "EURUSD"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert 'data: {"type":"delta","delta":"Hello "}' in body
    assert 'data: {"type":"done","answer":"Hello world","meta":{"ok":true,"model":"grok-4-latest"}}' in body
    assert 'data: [DONE]' in body


def test_ask_ai_route_unknown_model(client_with_registry):
    """Unknown model key → 422 (Pydantic validation error raises ValueError → caught as 400)."""
    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"prompt": "test", "model": "unknown-model-xyz"}
    )
    # Pydantic raises ValidationError → our handler returns 400
    # (ValueError from @validator is ValidationError in Pydantic V2)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"


def test_ask_ai_route_gemma_context_too_large(client_with_registry, mock_registry):
    """Context exceeding Gemma's 24 KB limit → 413 context_too_large."""
    mock_svc = mock_registry._services["gemma-local"]
    # Ensure this is never called — context too large check fires first
    mock_svc._ask_side_effect = RuntimeError("should not be called")

    # Build a context that definitely exceeds 24 KB
    huge_context = {"data": "x" * 30_000}  # ~30 KB when serialized

    response = client_with_registry.post(
        "/api/v1/ai/ask",
        json={"prompt": "test", "model": "gemma-local", "context": huge_context}
    )
    assert response.status_code == 413
    assert response.json()["code"] == "context_too_large"


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
