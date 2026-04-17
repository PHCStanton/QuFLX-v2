import pytest
import json
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from backend.services.ai.service import AIService, AIServiceError
from backend.services.ai.providers import ProviderSpec

# ── Fixtures ────────────────────────────────────────────────────────────────────

@pytest.fixture
async def ai_service_grok(monkeypatch):
    """AIService wired to the grok-4 provider spec (cloud, API key required)."""
    monkeypatch.setenv("GROK_API_KEY", "test-key-12345")
    spec = ProviderSpec(
        key="grok-4",
        label="Grok 4 (Thinking)",
        base_url="https://api.x.ai/v1",
        api_key_env="GROK_API_KEY",
        model="grok-4-latest",
        supports_voice_server=True,
        supports_vision=True,
        max_ctx_kb=150,
        is_local=False,
    )
    service = AIService(spec)
    yield service
    await service.close()


@pytest.fixture
async def ai_service_local(monkeypatch):
    """AIService wired to the gemma-local provider spec (no auth, local)."""
    monkeypatch.setenv("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1")
    monkeypatch.setenv("LOCAL_AI_MODEL", "gemma-4-2b-it-Q4_0")
    spec = ProviderSpec(
        key="gemma-local",
        label="Gemma 4 E2B (Local)",
        base_url="http://127.0.0.1:8080/v1",
        api_key_env=None,
        model="gemma-4-2b-it-Q4_0",
        supports_voice_server=False,
        supports_vision=True,
        max_ctx_kb=24,
        is_local=True,
    )
    service = AIService(spec)
    yield service
    await service.close()


@pytest.fixture
async def ai_service_disabled(monkeypatch):
    """AIService with api_key_env pointing to a missing env var → _enabled=False."""
    # Ensure GROK_API_KEY is NOT set in the environment (delete first, then check)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    spec = ProviderSpec(
        key="grok-4",
        label="Grok 4",
        base_url="https://api.x.ai/v1",
        api_key_env="GROK_API_KEY",  # env var not set → _enabled=False
        model="grok-4-latest",
        supports_voice_server=True,
        supports_vision=True,
        max_ctx_kb=150,
        is_local=False,
    )
    service = AIService(spec)
    yield service
    await service.close()

@pytest.mark.asyncio
async def test_ask_success(ai_service_grok):
    """Valid request → answer returned with meta."""
    mock_response = {
        "choices": [{"message": {"role": "assistant", "content": "Test answer"}}],
        "model": "grok-4-latest",
        "usage": {"total_tokens": 10},
    }
    with patch.object(ai_service_grok._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200, json=lambda: mock_response
        )
        result = await ai_service_grok.ask(prompt="Hello")
        assert result["answer"] == "Test answer"
        assert result["meta"]["ok"] is True
        assert result["meta"]["model"] == "grok-4-latest"


@pytest.mark.asyncio
async def test_ask_disabled_provider_raises(ai_service_disabled):
    """Provider with no API key and is_local=False → missing_api_key."""
    with pytest.raises(AIServiceError) as excinfo:
        await ai_service_disabled.ask(prompt="Hello")
    assert excinfo.value.code == "missing_api_key"


@pytest.mark.asyncio
async def test_ask_provider_error(ai_service_grok):
    """Non-200 response → provider_error with correct status code."""
    with patch.object(ai_service_grok._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(status_code=500, text="Internal Server Error")
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service_grok.ask(prompt="Hello")
        assert excinfo.value.code == "provider_error"
        assert excinfo.value.status_code == 502


@pytest.mark.asyncio
async def test_ask_timeout_retries(ai_service_grok):
    """Timeout → tenacity retries 3× then raises timeout error."""
    with patch.object(
        ai_service_grok._client, "post", side_effect=httpx.TimeoutException("Timeout")
    ) as mock_post:
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service_grok.ask(prompt="Hello")
        assert mock_post.call_count == 3  # 3 attempts
        assert excinfo.value.code == "timeout"
        assert excinfo.value.status_code == 504


@pytest.mark.asyncio
async def test_ask_unreachable(ai_service_grok):
    """Connection error → provider_unreachable."""
    with patch.object(
        ai_service_grok._client, "post", side_effect=httpx.ConnectError("Connection refused")
    ):
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service_grok.ask(prompt="Hello")
        assert excinfo.value.code == "provider_unreachable"
        assert excinfo.value.status_code == 502


@pytest.mark.asyncio
async def test_service_close_grok(ai_service_grok):
    """close() calls aclose() on the pooled HTTP client."""
    client = ai_service_grok._client
    assert client is not None
    with patch.object(client, "aclose", new_callable=AsyncMock) as mock_aclose:
        await ai_service_grok.close()
        mock_aclose.assert_called_once()


@pytest.mark.asyncio
async def test_service_close_local(ai_service_local):
    """Local service (is_local=True) → client initialized, close() calls aclose()."""
    # is_local=True → _enabled=True even with no API key → client IS initialized
    assert ai_service_local._client is not None
    with patch.object(ai_service_local._client, "aclose", new_callable=AsyncMock) as mock_aclose:
        await ai_service_local.close()
        mock_aclose.assert_called_once()


@pytest.mark.asyncio
async def test_prompt_construction_modal_concise(ai_service_grok):
    """Modal + concise mode → max_tokens ≤ 300, correct style markers."""
    with patch.object(ai_service_grok._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "grok-4-latest",
                "usage": {"prompt_tokens": 100},
            },
        )
        await ai_service_grok.ask(
            prompt="Test prompt",
            context={"uiMode": "modal", "responseVerbosity": "concise"},
        )
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        system_msg = payload["messages"][0]["content"]
        user_msg = payload["messages"][1]["content"][0]["text"]
        assert "QuFLX AI" in system_msg
        assert "MODE: Quick Response" in user_msg
        assert "STYLE: Concise" in user_msg
        assert "USER PROMPT: Test prompt" in user_msg
        assert payload["max_tokens"] <= 300


@pytest.mark.asyncio
async def test_prompt_construction_insights_detailed(ai_service_grok):
    """Insights + detailed mode → max_tokens = 900, correct style markers."""
    with patch.object(ai_service_grok._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "grok-4-latest",
                "usage": {"prompt_tokens": 100},
            },
        )
        await ai_service_grok.ask(
            prompt="Deep dive",
            context={"uiMode": "insights", "responseVerbosity": "detailed"},
        )
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        user_msg = payload["messages"][1]["content"][0]["text"]
        assert "MODE: Deep Analysis" in user_msg
        assert "STYLE: Detailed" in user_msg
        assert "USER PROMPT: Deep dive" in user_msg
        assert payload["max_tokens"] == 900


@pytest.mark.asyncio
async def test_cache_telemetry_grok(ai_service_grok):
    """x-grok-conv-id header attached + cache telemetry in meta."""
    with patch.object(ai_service_grok._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "grok-4",
                "usage": {
                    "prompt_tokens": 1000,
                    "cached_tokens": 800,
                    "completion_tokens": 50,
                },
            },
        )
        result = await ai_service_grok.ask(
            prompt="Cached check", conversation_id="test-conv-123"
        )
        args, kwargs = mock_post.call_args
        assert kwargs["headers"]["x-grok-conv-id"] == "test-conv-123"
        assert result["meta"]["cache"]["hit_rate"] == 80.0
        assert result["meta"]["cache"]["cached_tokens"] == 800


@pytest.mark.asyncio
async def test_cache_telemetry_local_skips_conv_header(ai_service_local):
    """Local provider → x-grok-conv-id header NOT attached."""
    with patch.object(ai_service_local._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "gemma-4-2b-it-Q4_0",
                "usage": {"prompt_tokens": 100, "completion_tokens": 10},
            },
        )
        await ai_service_local.ask(prompt="Local", conversation_id="conv-999")
        args, kwargs = mock_post.call_args
        # Local provider must not receive x-grok-conv-id
        assert "x-grok-conv-id" not in kwargs.get("headers", {})


@pytest.mark.asyncio
async def test_probe_grok_available(ai_service_grok):
    """probe() returns True when /models responds 200."""
    with patch(
        "backend.services.ai.service.httpx.AsyncClient"
    ) as MockClient:
        instance = AsyncMock()
        instance.__aenter__.return_value.get.return_value = AsyncMock(status_code=200)
        MockClient.return_value = instance
        result = await ai_service_grok.probe()
        assert result is True


@pytest.mark.asyncio
async def test_probe_grok_unavailable(ai_service_grok):
    """probe() returns False when /models throws."""
    with patch(
        "backend.services.ai.service.httpx.AsyncClient"
    ) as MockClient:
        instance = AsyncMock()
        instance.__aenter__.return_value.get.side_effect = Exception("Network error")
        MockClient.return_value = instance
        result = await ai_service_grok.probe()
        assert result is False


@pytest.mark.asyncio
async def test_probe_local_disabled():
    """Local provider with no API key → _enabled=False → probe() returns False."""
    spec = ProviderSpec(
        key="gemma-local", label="Gemma Local",
        base_url="http://127.0.0.1:8080/v1",
        api_key_env=None, model="gemma", supports_voice_server=False,
        supports_vision=True, max_ctx_kb=24, is_local=False,
    )
    svc = AIService(spec)
    result = await svc.probe()
    assert result is False


@pytest.mark.asyncio
async def test_chat_url_composed_correctly():
    """chat_url property → base URL + /chat/completions."""
    spec = ProviderSpec(
        key="test", label="Test",
        base_url="https://api.x.ai/v1", api_key_env=None,
        model="grok-4", supports_voice_server=True, supports_vision=True,
        max_ctx_kb=150, is_local=False,
    )
    svc = AIService(spec)
    assert svc.chat_url == "https://api.x.ai/v1/chat/completions"


@pytest.mark.asyncio
async def test_local_provider_no_auth():
    """Local provider (no API key, is_local=True) → client initialized with no auth headers."""
    spec = ProviderSpec(
        key="gemma-local", label="Gemma Local",
        base_url="http://127.0.0.1:8080/v1",
        api_key_env=None, model="gemma-4-2b-it-Q4_0",
        supports_voice_server=False, supports_vision=True,
        max_ctx_kb=24, is_local=True,
    )
    svc = AIService(spec)
    assert svc._enabled is True
    assert svc._client is not None
    # No Authorization header
    assert "Authorization" not in svc._client.headers
