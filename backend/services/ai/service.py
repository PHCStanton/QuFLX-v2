import json
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

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

        try:
            default_timeout_seconds = float(os.getenv("AI_TIMEOUT_SECONDS", "75"))
        except Exception:
            default_timeout_seconds = 75.0

        try:
            self.timeout_seconds_fast = float(os.getenv("AI_TIMEOUT_SECONDS_FAST", "30"))
        except Exception:
            self.timeout_seconds_fast = 30.0

        try:
            self.timeout_seconds_slow = float(os.getenv("AI_TIMEOUT_SECONDS_SLOW", str(default_timeout_seconds)))
        except Exception:
            self.timeout_seconds_slow = default_timeout_seconds
        
        self._enabled = bool(self.api_key)
        self._client: Optional[httpx.AsyncClient] = None
        
        if self._enabled:
            # Initialize persistent, pooled client
            # max_keepalive_connections=10: keep 10 connections open for reuse
            # max_connections=50: limit concurrency to prevent resource exhaustion
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout_seconds_slow, connect=10.0),
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=50),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                }
            )
        else:
            logger.warning("AI_API_KEY not found in environment. AI Service disabled.")

    async def close(self) -> None:
        """Close the persistent HTTP client. Call during app shutdown."""
        if self._client:
            await self._client.aclose()
            logger.info("AIService HTTP client closed.")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(httpx.TimeoutException),
        reraise=True
    )
    async def _post_with_retry(self, url: str, **kwargs):
        """Internal helper to execute POST with exponential backoff on timeouts."""
        if not self._client:
            raise AIServiceError(
                code='client_not_initialized',
                user_message='AI client is not initialized.',
                status_code=500,
                retryable=False
            )
        return await self._client.post(url, **kwargs)

    async def ask(
        self,
        *,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
        image: Optional[str] = None,
        request_id: str = '-',
        asset: Optional[str] = None,
        timeframe: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ask the AI service a question with optional structured context and image.
        
        Uses the xAI/Grok API compatible with OpenAI chat completions format.
        Leverages prompt caching by keeping the system message stable.
        """
        if not self._enabled:
            raise AIServiceError(
                code='missing_api_key',
                user_message='AI service is disabled (missing API key).',
                status_code=503,
                retryable=False,
            )

        logger.info(
            'AIService.ask request_id=%s model=%s asset=%s timeframe=%s conversation_id=%s image_present=%s prompt_len=%s',
            request_id,
            self.model,
            asset or '-',
            timeframe or '-',
            conversation_id or '-',
            bool(image),
            len(prompt or ''),
        )

        # 1. OPTIMIZATION: SYSTEM PROMPT (Fixed Prefix)
        # Keep this as stable as possible to allow for prefix caching.
        system_content = (
            "You are QuFLX AI, a high-performance trading assistant.\n\n"
            "CORE RULES:\n"
            "- Use ONLY the provided TradingContext (ticks, candles, indicators).\n"
            "- DO NOT use external sources, search, or recall cached prices.\n"
            "- If data is insufficient for a confident analysis, state so clearly.\n"
            "- Adhere to strict risk management and functional simplicity."
        )

        # 2. DYNAMIC CONTENT (User Message)
        # Dynamic instructions and data are moved here so they don't break the system prefix cache.
        verbosity = ''
        ui_mode = ''
        if context:
            verbosity = str(context.get('responseVerbosity') or '').strip().lower()
            ui_mode = str(context.get('uiMode') or '').strip().lower()

        prompt_text = str(prompt or '')
        prompt_len = len(prompt_text)
        has_format_constraints = bool(re.search(r'\b(output\s*format|indicators\s*used|rating\s*:\s*\w|expiry\s*:)\b', prompt_text, flags=re.IGNORECASE))
        has_custom_instructions = context and bool(str(context.get('customInstructions') or '').strip())

        is_complex_request = has_custom_instructions or has_format_constraints or prompt_len >= 500 or bool(image)
        timeout_seconds = self.timeout_seconds_slow if is_complex_request else self.timeout_seconds_fast

        # Construct dynamic user instructions
        instruction_parts = []
        
        # UI Mode instructions
        if ui_mode == 'modal':
            instruction_parts.append("MODE: Quick Response. Be short, actionable, and skimmable.")
        elif ui_mode == 'insights':
            instruction_parts.append("MODE: Deep Analysis. Provide detailed reasoning and structured follow-ups.")
            
        # Verbosity instructions
        if verbosity == 'concise':
            instruction_parts.append("STYLE: Concise. Max 6 bullets. One recommendation (Enter/Wait/Skip), one risk.")
        elif verbosity == 'detailed':
            instruction_parts.append("STYLE: Detailed. Use sections, assumptions, invalidation criteria, and next steps.")
        else:
            instruction_parts.append("STYLE: Balanced. Specific and practical.")

        # Custom instructions
        if has_custom_instructions:
            instr = str(context.get('customInstructions')).strip()
            instruction_parts.append(f"CUSTOM INSTRUCTIONS:\n{instr}")

        # Market Context
        if context:
            dump_ctx = dict(context)
            dump_ctx.pop('customInstructions', None)
            # Use JSON separators and sort_keys for consistent serialization (better for caching if prefix matches)
            context_json = json.dumps(dump_ctx, separators=(',', ':'), sort_keys=True)
            instruction_parts.append(f"TRADING CONTEXT:\n{context_json}")

        # Final User Content Assembly
        user_text = ""
        if instruction_parts:
            user_text = "\n\n".join(instruction_parts) + "\n\n---\n\n"
        user_text += f"USER PROMPT: {prompt_text}"

        user_content = [{"type": "text", "text": user_text}]
        if image:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": image}
            })

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ]

        # 3. TOKEN LIMITS
        max_tokens: int = 500
        if verbosity == 'concise':
            max_tokens = 250
        elif verbosity == 'detailed':
            max_tokens = 900
            
        if ui_mode == 'modal':
            max_tokens = min(max_tokens, 300)

        payload = {
            "messages": messages,
            "model": self.model,
            "stream": False,
            "temperature": 0,
            "max_tokens": max_tokens,
        }

        # 4. API CALL WITH CACHING HEADERS
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
        }
        if conversation_id:
            # Grok-specific header for routing to same cache cluster
            headers['x-grok-conv-id'] = conversation_id

        try:
            logger.info(
                'AIService.ask request_id=%s call complex=%s ui=%s verbosity=%s context_keys=%s',
                request_id,
                is_complex_request,
                ui_mode or '-',
                verbosity or '-',
                list((context or {}).keys()),
            )

            # 4. API CALL WITH POOLED CLIENT AND RETRIES
            # Use per-request timeout override
            response = await self._post_with_retry(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=timeout_seconds,
            )

            if response.status_code != 200:
                retryable = response.status_code >= 500 or response.status_code == 429
                logger.error(
                    'AI provider error request_id=%s status=%s retryable=%s body=%s',
                    request_id,
                    response.status_code,
                    retryable,
                    response.text[:500],
                )
                raise AIServiceError(
                    code='provider_error',
                    user_message='AI provider returned an error.',
                    status_code=502,
                    retryable=retryable,
                    provider_status=response.status_code,
                )

            data = response.json()
            usage = data.get('usage', {})
            
            # 5. TELEMETRY: CACHE MONITORING
            # Grok usage fields: cached_tokens (or prompt_tokens_details.cached_tokens)
            cached_tokens = usage.get('cached_tokens', 0)
            if not cached_tokens and 'prompt_tokens_details' in usage:
                cached_tokens = usage['prompt_tokens_details'].get('cached_tokens', 0)
            
            total_prompt_tokens = usage.get('prompt_tokens', 0)
            hit_rate = (cached_tokens / total_prompt_tokens * 100) if total_prompt_tokens > 0 else 0

            logger.info(
                'AIService metrics request_id=%s cached=%d total_input=%d hit_rate=%.1f%% output=%d',
                request_id,
                cached_tokens,
                total_prompt_tokens,
                hit_rate,
                usage.get('completion_tokens', 0),
            )

            choices = data.get('choices')
            if not isinstance(choices, list) or not choices:
                raise AIServiceError(
                    code='invalid_provider_response',
                    user_message='AI provider response was invalid.',
                    status_code=502,
                    retryable=True,
                )

            message = choices[0].get('message', {})
            content = message.get('content', '')
            
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
                    'usage': usage,
                    'cache': {
                        'hit_rate': hit_rate,
                        'cached_tokens': cached_tokens,
                    },
                    'conversation_id': conversation_id,
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
