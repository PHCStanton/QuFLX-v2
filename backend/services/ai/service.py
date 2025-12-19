import logging
from typing import Any, Dict, Optional


logger = logging.getLogger("AIService")


class AIService:
    """Thin wrapper around a company AI API.

    This is a scaffold only. It defines the interface the gateway will use
    without binding to a specific provider. The concrete API call can be
    implemented later.
    """

    def __init__(self) -> None:
        # In a real implementation, API keys and base URLs would be loaded
        # from environment variables or a secure configuration source.
        self._enabled = True

    async def ask(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Ask the AI service a question with optional structured context.

        For now this returns a stubbed response so the rest of the
        application can be wired end-to-end without external dependencies.
        """
        if not self._enabled:
            return {
                "answer": "AI service is currently disabled.",
                "meta": {"ok": False},
            }

        logger.info("AIService.ask called with prompt: %s", prompt)

        return {
            "answer": "This is a placeholder AI response. The real company API can be wired here.",
            "meta": {
                "ok": True,
                "used_context_keys": list((context or {}).keys()),
            },
        }

