import logging
import os
import json
import httpx
from typing import Any, Dict, Optional

logger = logging.getLogger("AIService")


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

    async def ask(self, prompt: str, context: Optional[Dict[str, Any]] = None, image: Optional[str] = None) -> Dict[str, Any]:
        """Ask the AI service a question with optional structured context and image.
        
        Uses the xAI/Grok API compatible with OpenAI chat completions format.
        """
        if not self._enabled:
            return {
                "answer": "AI service is currently disabled (missing API Key).",
                "meta": {"ok": False, "error": "missing_api_key"},
            }

        logger.info("AIService.ask called with prompt: %s (image_present: %s)", prompt, bool(image))

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
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}"
                    },
                    json=payload
                )
                
                if response.status_code != 200:
                    logger.error(f"AI API Error: {response.status_code} - {response.text}")
                    return {
                        "answer": f"Error from AI provider: {response.status_code}",
                        "meta": {"ok": False, "status": response.status_code, "raw_error": response.text}
                    }

                data = response.json()
                answer = data['choices'][0]['message']['content']
                
                return {
                    "answer": answer,
                    "meta": {
                        "ok": True,
                        "model": data.get("model", self.model),
                        "usage": data.get("usage", {}),
                        "used_context_keys": list((context or {}).keys()),
                    },
                }

        except Exception as e:
            logger.exception("Exception during AI request")
            return {
                "answer": "An internal error occurred while contacting the AI service.",
                "meta": {"ok": False, "error": str(e)}
            }
