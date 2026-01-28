import pytest
import json
import httpx
from unittest.mock import AsyncMock, patch
from backend.services.ai.service import AIService, AIServiceError

@pytest.fixture
def ai_service(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key")
    return AIService()

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

    with patch("httpx.AsyncClient.post") as mock_post:
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
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = AsyncMock(status_code=500)
        
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service.ask(prompt="Hello")
        assert excinfo.value.code == "provider_error"
        assert excinfo.value.status_code == 502

@pytest.mark.asyncio
async def test_ask_timeout(ai_service):
    with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Timeout")):
        with pytest.raises(AIServiceError) as excinfo:
            await ai_service.ask(prompt="Hello")
        assert excinfo.value.code == "timeout"
        assert excinfo.value.status_code == 504

@pytest.mark.asyncio
async def test_prompt_construction(ai_service):
    # Verify that uiMode and responseVerbosity influence the system prompt and max_tokens
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = AsyncMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "model": "test"
            }
        )
        
        # Test Modal + Concise
        await ai_service.ask(
            prompt="Test",
            context={"uiMode": "modal", "responseVerbosity": "concise"}
        )
        
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        system_msg = payload["messages"][0]["content"]
        
        assert "quick Ask AI modal response" in system_msg
        assert "Style: concise" in system_msg
        assert payload["max_tokens"] <= 250

        # Test Insights + Detailed
        await ai_service.ask(
            prompt="Test",
            context={"uiMode": "insights", "responseVerbosity": "detailed"}
        )
        
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        system_msg = payload["messages"][0]["content"]
        
        assert "AI Insights panel" in system_msg
        assert "Style: detailed" in system_msg
        assert payload["max_tokens"] == 900
