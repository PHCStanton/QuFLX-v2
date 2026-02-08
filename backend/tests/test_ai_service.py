import pytest
import json
import httpx
from unittest.mock import AsyncMock, patch
from backend.services.ai.service import AIService, AIServiceError

@pytest.fixture
async def ai_service(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key")
    service = AIService()
    yield service
    await service.close()

@pytest.mark.asyncio
async def test_ask_success(ai_service):
    mock_response = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Test answer"
                }
            }
        ],
        "model": "grok-4-latest",
        "usage": {"total_tokens": 10}
    }

    with patch.object(ai_service._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: mock_response
        )
        
        result = await ai_service.ask(prompt="Hello")
        
        assert result["answer"] == "Test answer"
        assert result["meta"]["ok"] is True
        assert result["meta"]["model"] == "grok-4-latest"

@pytest.mark.asyncio
async def test_ask_missing_api_key(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    service = AIService()
    
    with pytest.raises(AIServiceError) as excinfo:
        await service.ask(prompt="Hello")
    assert excinfo.value.code == "missing_api_key"

@pytest.mark.asyncio
async def test_ask_provider_error(ai_service):
    with patch.object(ai_service._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(status_code=500)
        
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service.ask(prompt="Hello")
        assert excinfo.value.code == "provider_error"
        assert excinfo.value.status_code == 502

@pytest.mark.asyncio
async def test_ask_timeout(ai_service):
    # The new version used tenacity, so we mock the client's post call
    with patch.object(ai_service._client, "post", side_effect=httpx.TimeoutException("Timeout")) as mock_post:
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service.ask(prompt="Hello")
        
        # Verify it retried 3 times (default in @retry)
        assert mock_post.call_count == 3
        assert excinfo.value.code == "timeout"
        assert excinfo.value.status_code == 504

@pytest.mark.asyncio
async def test_service_close(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key")
    service = AIService()
    client = service._client
    assert client is not None
    
    with patch.object(client, "aclose", new_callable=AsyncMock) as mock_aclose:
        await service.close()
        mock_aclose.assert_called_once()

@pytest.mark.asyncio
async def test_prompt_construction(ai_service):
    # Verify that uiMode and responseVerbosity influence the messages and max_tokens
    with patch.object(ai_service._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "test",
                "usage": {"prompt_tokens": 100}
            }
        )
        
        # Test Modal + Concise
        await ai_service.ask(
            prompt="Test prompt",
            context={"uiMode": "modal", "responseVerbosity": "concise"}
        )
        
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        system_msg = payload["messages"][0]["content"]
        user_msg = payload["messages"][1]["content"][0]["text"]
        
        # System message should be static
        assert "QuFLX AI" in system_msg
        assert "CORE RULES" in system_msg
        
        # Instructions should be in User message now for caching
        assert "MODE: Quick Response" in user_msg
        assert "STYLE: Concise" in user_msg
        assert "USER PROMPT: Test prompt" in user_msg
        assert payload["max_tokens"] <= 300

        # Test Insights + Detailed
        await ai_service.ask(
            prompt="Deep dive",
            context={"uiMode": "insights", "responseVerbosity": "detailed"}
        )
        
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        user_msg = payload["messages"][1]["content"][0]["text"]
        
        assert "MODE: Deep Analysis" in user_msg
        assert "STYLE: Detailed" in user_msg
        assert "USER PROMPT: Deep dive" in user_msg
        assert payload["max_tokens"] == 900

@pytest.mark.asyncio
async def test_cache_telemetry(ai_service):
    # Verify that usage data and x-grok-conv-id are handled
    with patch.object(ai_service._client, "post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "grok-4",
                "usage": {
                    "prompt_tokens": 1000,
                    "cached_tokens": 800,
                    "completion_tokens": 50
                }
            }
        )
        
        result = await ai_service.ask(
            prompt="Cached check",
            conversation_id="test-conv-123"
        )
        
        args, kwargs = mock_post.call_args
        headers = kwargs["headers"]
        
        assert headers["x-grok-conv-id"] == "test-conv-123"
        assert result["meta"]["cache"]["hit_rate"] == 80.0
        assert result["meta"]["cache"]["cached_tokens"] == 800
        assert result["meta"]["conversation_id"] == "test-conv-123"
