from dataclasses import dataclass
from typing import Dict, Optional
import os


@dataclass(frozen=True)
class ProviderSpec:
    key: str
    label: str
    base_url: str  # e.g. "https://api.x.ai/v1"
    api_key_env: Optional[str]  # None = no auth (local)
    model: str
    reasoning_effort: str = "low"  # Grok 4.3 specific: "none" | "low" | "medium" | "high"
    supports_voice_server: bool  # xAI Realtime compatible
    supports_vision: bool
    max_ctx_kb: int  # safety cap on serialized context
    is_local: bool


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def build_provider_specs() -> Dict[str, ProviderSpec]:
    return {
        "grok-4": ProviderSpec(
            key="grok-4",
            label="Grok 4.3 (Reasoning)",
            base_url=_env("XAI_BASE_URL", "https://api.x.ai/v1"),
            api_key_env="GROK_API_KEY",
            model="grok-4.3",
            reasoning_effort="low",
            supports_voice_server=True,
            supports_vision=True,
            max_ctx_kb=150,
            is_local=False,
        ),
        "grok-4-fast": ProviderSpec(
            key="grok-4-fast",
            label="Grok 4.3 Fast (No Reasoning)",
            base_url=_env("XAI_BASE_URL", "https://api.x.ai/v1"),
            api_key_env="GROK_API_KEY",
            model="grok-4.3",
            reasoning_effort="none",
            supports_voice_server=True,
            supports_vision=True,
            max_ctx_kb=150,
            is_local=False,
        ),
        "gemma-local": ProviderSpec(
            key="gemma-local",
            label="Gemma 4 E2B (Local)",
            base_url=_env("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1"),
            api_key_env=None,
            model=_env("LOCAL_AI_MODEL", "gemma-4-2b-it-Q4_0"),
            reasoning_effort="none",
            supports_voice_server=False,
            supports_vision=True,
            max_ctx_kb=24,
            is_local=True,
        ),
    }