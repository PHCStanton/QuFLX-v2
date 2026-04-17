import asyncio
import base64
import json
import logging
import re
from functools import lru_cache
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, validator

from backend.services.ai.service import AIService, AIServiceError
from backend.services.ai.registry import AIProviderRegistry
from backend.services.gateway.request_context import request_id_var
from backend.utils.asset_utils import normalize_asset
from backend.utils.indicator_utils import (
    build_indicator_snapshots,
    calculate_indicators_for_asset,
)


router = APIRouter()
logger = logging.getLogger('gateway.ai')


class AiAskRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    context: Dict[str, Any] = Field(default_factory=dict)
    asset: Optional[str] = Field(default=None, max_length=128)
    timeframe: Optional[str] = Field(default=None, max_length=32)
    image_base64: Optional[str] = Field(default=None, max_length=12_000_000)
    image: Optional[str] = Field(default=None, max_length=12_000_000)
    conversation_id: Optional[str] = Field(default=None, alias='conversationId', max_length=128)
    model: Optional[str] = Field(default=None, max_length=64, alias="model")

    @validator("model", pre=True)
    def _validate_model(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in {"grok-4", "grok-4-fast", "gemma-local"}:
            raise ValueError(f"unknown model: {v}")
        return s

    @validator('prompt', pre=True)
    def _normalize_prompt(cls, v: Any) -> str:
        text = '' if v is None else str(v)
        text = text.strip()
        if not text:
            raise ValueError('prompt is required')
        return text

    @validator('asset', 'timeframe', pre=True)
    def _normalize_optional_str(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        text = str(v).strip()
        return text or None

    @validator('context', pre=True)
    def _normalize_context(cls, v: Any) -> Dict[str, Any]:
        if v is None:
            return {}
        if not isinstance(v, dict):
            raise ValueError('context must be an object')

        try:
            raw = json.dumps(v, separators=(',', ':'), ensure_ascii=False)
        except TypeError:
            raise ValueError('context must be JSON-serializable')

        if len(raw.encode('utf-8')) > 150_000:
            raise ValueError('context is too large')

        return v


def _resolve_ai_service(request: Request, model_key: Optional[str]) -> AIService:
    registry: AIProviderRegistry = request.app.state.ai_registry
    key = model_key or registry.resolve_default(ui_context="modal")
    return registry.get(key)


def _normalize_image(image_base64: Optional[str], image: Optional[str]) -> Optional[str]:
    raw = image_base64 or image
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError('image_base64 must be a string')
    raw = raw.strip()
    if not raw:
        return None

    if raw.startswith('data:'):
        header, sep, data_part = raw.partition(',')
        if sep != ',' or not data_part:
            raise ValueError('Invalid data URL for image_base64')

        header_lower = header.lower()
        if ';base64' not in header_lower:
            raise ValueError('image_base64 data URL must be base64 encoded')

        if not header_lower.startswith('data:image/'):
            raise ValueError('image_base64 must be an image data URL')

        data_part = data_part.strip()
        est_bytes = int(len(data_part) * 3 / 4)
        if est_bytes > 2_000_000:
            raise ValueError('image_base64 is too large')

        base64.b64decode(data_part, validate=True)
        return raw

    candidate = re.sub(r'\s+', '', raw)
    if not candidate:
        return None

    if not re.fullmatch(r'[A-Za-z0-9+/=]+', candidate):
        raise ValueError('image_base64 must be a base64 string or a data URL')

    est_bytes = int(len(candidate) * 3 / 4)
    if est_bytes > 2_000_000:
        raise ValueError('image_base64 is too large')

    base64.b64decode(candidate, validate=True)
    return f'data:image/png;base64,{candidate}'


@router.get('/providers')
async def list_providers(request: Request):
    reg: AIProviderRegistry = request.app.state.ai_registry
    available = await reg.probe_all()
    return {
        "providers": [
            {
                "key": s.key,
                "label": s.label,
                "available": available.get(s.key, False),
                "capabilities": {
                    "vision": s.supports_vision,
                    "voice_server": s.supports_voice_server,
                    "is_local": s.is_local,
                    "max_ctx_kb": s.max_ctx_kb,
                },
            }
            for s in reg.specs.values()
        ]
    }


@router.post('/ask')
async def ask_ai(payload: Dict[str, Any] = Body(...), request: Request = None):
    request_id = request_id_var.get('-')
    
    try:
        parsed = AiAskRequest.model_validate(payload)
    except ValidationError as exc:
        # exc.errors() returns Pydantic ErrorDetail objects — convert to plain dicts for JSON safety
        errors_serializable = [
            {k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v for k, v in e.items()}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=400,
            content={
                'ok': False,
                'code': 'invalid_request',
                'detail': 'Invalid AI request payload.',
                'request_id': request_id,
                'retryable': False,
                'errors': errors_serializable,
            },
        )

    context = dict(parsed.context or {})
    if parsed.asset:
        context['asset'] = parsed.asset
    if parsed.timeframe:
        context['timeframe'] = parsed.timeframe

    # Resolve AI service for requested model
    try:
        ai_service = _resolve_ai_service(request, parsed.model)
    except (KeyError, RuntimeError) as exc:
        return JSONResponse(
            status_code=400,
            content={
                'ok': False,
                'code': 'invalid_model',
                'detail': str(exc),
                'request_id': request_id,
                'retryable': False,
            },
        )

    try:
        image = _normalize_image(parsed.image_base64, parsed.image)
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                'ok': False,
                'code': 'invalid_image',
                'detail': str(exc),
                'request_id': request_id,
                'retryable': False,
            },
        )

    # Determine conversation_id: payload > request header > stable fallback
    conv_id = parsed.conversation_id or request.headers.get('X-Grok-Conv-ID')
    if not conv_id:
        # Generate stable ID for the asset/timeframe pool to maximize cache reuse across users/sessions
        import hashlib
        key = f"quflx-v2-{parsed.asset or 'main'}-{parsed.timeframe or '1m'}"
        conv_id = hashlib.sha256(key.encode()).hexdigest()[:24]

    logger.info(
        'AI ask request_id=%s asset=%s timeframe=%s conv_id=%s image_present=%s context_keys=%s',
        request_id,
        parsed.asset or '-',
        parsed.timeframe or '-',
        conv_id,
        bool(image),
        len(context.keys()),
    )

    try:
        # Optimization: Inject backend indicators if missing from frontend
        # (Must happen before context-size check so the guard reflects post-injection size)
        await _inject_backend_indicators(context, parsed.asset, parsed.timeframe)

        # Enforce provider-specific context size limit AFTER injection (Fail Fast — Core Principle #9)
        ctx_bytes = len(json.dumps(context, separators=(',', ':')).encode('utf-8'))
        max_bytes = ai_service.spec.max_ctx_kb * 1024
        if ctx_bytes > max_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    'ok': False,
                    'code': 'context_too_large',
                    'detail': f"Context ({ctx_bytes//1024}KB) exceeds {ai_service.spec.label} limit ({ai_service.spec.max_ctx_kb}KB).",
                    'request_id': request_id,
                    'retryable': False,
                },
            )

        result = await ai_service.ask(
            prompt=parsed.prompt,
            context=context or None,
            image=image,
            request_id=request_id,
            asset=parsed.asset,
            timeframe=parsed.timeframe,
            conversation_id=conv_id,
        )

        return {
            'answer': result['answer'],
            'meta': result.get('meta') or {},
            'request_id': request_id,
        }

    except AIServiceError as exc:
        return JSONResponse(
            status_code=int(exc.status_code),
            content={
                'ok': False,
                'code': exc.code,
                'detail': exc.user_message,
                'request_id': request_id,
                'retryable': bool(exc.retryable),
                'provider_status': exc.provider_status,
            },
        )

    except Exception:
        logger.error('AI ask failed request_id=%s', request_id, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                'ok': False,
                'code': 'internal_error',
                'detail': 'AI request failed',
                'request_id': request_id,
                'retryable': False,
            },
        )


async def _inject_backend_indicators(context: Dict[str, Any], asset: Optional[str], timeframe: Optional[str]) -> None:
    """
    Supplement frontend snapshots with backend-computed indicators.
    Frontend values keep precedence when the same display key already exists.
    """
    if context.get('skipBackendIndicators'):
        logger.info('Skipping backend indicator injection: disabled by context flag')
        return

    if not asset or not timeframe:
        logger.info(
            'Skipping backend indicator injection: asset_present=%s timeframe_present=%s',
            bool(asset),
            bool(timeframe),
        )
        return

    tf_min = _parse_timeframe_to_minutes(timeframe)
    if tf_min is None:
        logger.warning('Backend indicator injection: unsupported timeframe format: %s', timeframe)
        return

    existing_snapshots = context.get('indicatorSnapshots') or {}
    if not isinstance(existing_snapshots, dict):
        logger.warning('Backend indicator injection: indicatorSnapshots is not an object, resetting it')
        existing_snapshots = {}

    # Extract UI mode for optimization
    ui_mode = str(context.get('uiMode') or '').strip().lower()
    
    try:
        normalized_asset = normalize_asset(asset)
        result_df, row_count = await asyncio.to_thread(
            calculate_indicators_for_asset,
            normalized_asset,
            tf_min,
        )
        # Optimize token usage by UI mode
        tail_count = 5 if ui_mode == 'modal' else 50
            
        backend_snapshots = build_indicator_snapshots(result_df, tail_count=tail_count)
        if not backend_snapshots:
            logger.warning(
                'Backend indicator injection: pipeline returned no snapshots for %s @ %sm',
                normalized_asset,
                tf_min,
            )
            return

        merged_snapshots = {**backend_snapshots, **existing_snapshots}
        context['indicatorSnapshots'] = merged_snapshots
        context['backendDataInjected'] = True

        logger.info(
            'Injected backend indicators for %s %s: total=%d backend_added=%d frontend_kept=%d rows=%d',
            normalized_asset,
            timeframe,
            len(merged_snapshots),
            len(set(backend_snapshots) - set(existing_snapshots)),
            len(existing_snapshots),
            row_count,
        )
    except FileNotFoundError:
        logger.info('Backend indicator injection: no history file found for %s @ %sm', asset, tf_min)
    except Exception as exc:
        logger.warning('Failed to inject backend indicators: %s', exc, exc_info=True)


def _parse_timeframe_to_minutes(timeframe: str) -> Optional[int]:
    try:
        tf = str(timeframe).strip().lower()
        if tf.endswith('m'):
            return max(1, int(tf[:-1]))
        if tf.endswith('h'):
            return max(1, int(tf[:-1]) * 60)
        if tf.endswith('d'):
            return max(1, int(tf[:-1]) * 1440)
        if tf.isdigit():
            return max(1, int(tf))
    except Exception as exc:
        logger.debug('Failed to parse timeframe %r into minutes: %s', timeframe, exc)
        return None
    return None



