from typing import Dict, Optional
import logging
import os
from .providers import build_provider_specs, ProviderSpec
from .service import AIService

logger = logging.getLogger("AIRegistry")


class AIProviderRegistry:
    def __init__(self) -> None:
        self._specs = build_provider_specs()
        self._services: Dict[str, AIService] = {k: AIService(s) for k, s in self._specs.items()}

    @property
    def specs(self) -> Dict[str, ProviderSpec]:
        return self._specs

    def get(self, key: str) -> AIService:
        if key not in self._services:
            raise KeyError(f"Unknown AI provider: {key!r}")
        svc = self._services[key]
        if not svc._enabled:
            raise RuntimeError(f"Provider {key!r} is not enabled (missing credentials or disabled)")
        return svc

    def resolve_default(self, ui_context: str) -> str:
        """Return default provider for a UI context: 'modal' | 'insights' | 'alerts'."""
        return {
            "modal":    "grok-4-fast",
            "insights": "grok-4",
            "alerts":   os.getenv("QFLX_ALERT_AI_MODEL", "grok-4-fast"),
        }.get(ui_context, "grok-4-fast")

    async def probe_all(self) -> Dict[str, bool]:
        import asyncio
        keys = list(self._services.keys())
        results = await asyncio.gather(*[self._services[k].probe() for k in keys], return_exceptions=True)
        return {k: bool(r) if isinstance(r, bool) else False for k, r in zip(keys, results)}

    async def close_all(self) -> None:
        for svc in self._services.values():
            await svc.close()