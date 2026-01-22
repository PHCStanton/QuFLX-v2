import json
import logging
import os
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("AIService")


class AIServiceError(Exception):
    def __init__(
        self,
        *,
        code: str,
        user_message: str,
        status_code: int,
        retryable: bool,
        provider_status: Optional[int] = None,
    ) -> None:
        super().__init__(user_message)
        self.code = str(code)
        self.user_message = str(user_message)
        self.status_code = int(status_code)
        self.retryable = bool(retryable)
        self.provider_status = provider_status


class AIService:
    """Wrapper around the company AI API (xAI/Grok)."""

    def __init__(self) -> None:
        # Load configuration from environment
        # Support both standard AI_API_KEY and provider-specific GROK_API_KEY
        self.api_key = os.getenv("AI_API_KEY") or os.getenv("GROK_API_KEY")
        
        # Handle model selection with smart defaults/mapping
        raw_model = os.getenv("AI_MODEL", "grok-4-latest")
        if raw_model == "Grok 4.1 Fast":
            self.model = "grok-4-latest"  # Map display name to API ID
        else:
            self.model = raw_model

        self.base_url = os.getenv("AI_BASE_URL", "https://api.x.ai/v1/chat/completions")
        
        self._enabled = bool(self.api_key)
        if not self._enabled:
            logger.warning("AI_API_KEY not found in environment. AI Service disabled.")

    async def ask(
        self,
        *,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
        image: Optional[str] = None,
        request_id: str = '-',
        asset: Optional[str] = None,
        timeframe: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ask the AI service a question with optional structured context and image.
        
        Uses the xAI/Grok API compatible with OpenAI chat completions format.
        """
        if not self._enabled:
            raise AIServiceError(
                code='missing_api_key',
                user_message='AI service is disabled (missing API key).',
                status_code=503,
                retryable=False,
            )

        logger.info(
            'AIService.ask request_id=%s model=%s asset=%s timeframe=%s image_present=%s prompt_len=%s',
            request_id,
            self.model,
            asset or '-',
            timeframe or '-',
            bool(image),
            len(prompt or ''),
        )

        # Prepare system message based on context
        system_content = "You are a helpful trading assistant for QuFLX."
        if context:
            # Format context into a readable string for the system prompt
            context_str = json.dumps(context, indent=2)
            system_content += f"\n\nCurrent Market Context:\n{context_str}"

        # Prepare user message content
        user_content = []
        user_content.append({"type": "text", "text": prompt})

        if image:
            # Append image for vision models
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": image
                }
            })
            # If we have an image, we might want to ensure we're using a vision model?
            # For now, we assume the default model (or user config) handles it.
            # Grok-4 series usually handles multimodal.

        messages = [
            {
                "role": "system",
                "content": system_content
            },
            {
                "role": "user",
                "content": user_content
            }
        ]

        payload = {
            "messages": messages,
            "model": self.model,
            "stream": False,
            "temperature": 0
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {self.api_key}',
                    },
                    json=payload,
                )

            if response.status_code != 200:
                retryable = response.status_code >= 500 or response.status_code == 429
                logger.error(
                    'AI provider error request_id=%s status=%s retryable=%s',
                    request_id,
                    response.status_code,
                    retryable,
                )
                raise AIServiceError(
                    code='provider_error',
                    user_message='AI provider returned an error.',
                    status_code=502,
                    retryable=retryable,
                    provider_status=response.status_code,
                )

            data = response.json()
            choices = data.get('choices')
            if not isinstance(choices, list) or not choices:
                raise AIServiceError(
                    code='invalid_provider_response',
                    user_message='AI provider response was invalid.',
                    status_code=502,
                    retryable=True,
                )

            message = choices[0].get('message') if isinstance(choices[0], dict) else None
            content = message.get('content') if isinstance(message, dict) else None
            if not isinstance(content, str) or not content.strip():
                raise AIServiceError(
                    code='invalid_provider_response',
                    user_message='AI provider response was missing content.',
                    status_code=502,
                    retryable=True,
                )

            return {
                'answer': content,
                'meta': {
                    'ok': True,
                    'model': data.get('model', self.model),
                    'usage': data.get('usage', {}),
                    'used_context_keys': list((context or {}).keys()),
                },
            }

        except AIServiceError:
            raise

        except httpx.TimeoutException:
            logger.error('AI provider timeout request_id=%s', request_id)
            raise AIServiceError(
                code='timeout',
                user_message='AI provider timed out.',
                status_code=504,
                retryable=True,
            )

        except httpx.RequestError:
            logger.error('AI provider unreachable request_id=%s', request_id, exc_info=True)
            raise AIServiceError(
                code='provider_unreachable',
                user_message='AI provider is unreachable.',
                status_code=502,
                retryable=True,
            )

        except Exception:
            logger.error('AI request failed request_id=%s', request_id, exc_info=True)
            raise AIServiceError(
                code='internal_error',
                user_message='An internal error occurred while contacting the AI service.',
                status_code=500,
                retryable=False,
            )
