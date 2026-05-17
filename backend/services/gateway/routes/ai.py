import asyncio
import base64
import json
import logging
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse
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


def _error_response(
    *,
    status_code: int,
    code: str,
    detail: str,
    request_id: str,
    retryable: bool,
    provider_status: Optional[int] = None,
    errors: Optional[list] = None,
) -> JSONResponse:
    content: Dict[str, Any] = {
        'ok': False,
        'code': code,
        'detail': detail,
        'request_id': request_id,
        'retryable': retryable,
    }
    if provider_status is not None:
        content['provider_status'] = provider_status
    if errors is not None:
        content['errors'] = errors
    return JSONResponse(status_code=status_code, content=content)


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


def _prepare_ai_request(payload: Dict[str, Any], request: Request, request_id: str):
    try:
        parsed = AiAskRequest.model_validate(payload)
    except ValidationError as exc:
        errors_serializable = [
            {k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v for k, v in e.items()}
            for e in exc.errors()
        ]
        return None, _error_response(
            status_code=400,
            code='invalid_request',
            detail='Invalid AI request payload.',
            request_id=request_id,
            retryable=False,
            errors=errors_serializable,
        )

    context = dict(parsed.context or {})
    if parsed.asset:
        context['asset'] = parsed.asset
    if parsed.timeframe:
        context['timeframe'] = parsed.timeframe

    try:
        ai_service = _resolve_ai_service(request, parsed.model)
    except (KeyError, RuntimeError) as exc:
        return None, _error_response(
            status_code=400,
            code='invalid_model',
            detail=str(exc),
            request_id=request_id,
            retryable=False,
        )

    try:
        image = _normalize_image(parsed.image_base64, parsed.image)
    except ValueError as exc:
        return None, _error_response(
            status_code=400,
            code='invalid_image',
            detail=str(exc),
            request_id=request_id,
            retryable=False,
        )

    conv_id = parsed.conversation_id or request.headers.get('X-Grok-Conv-ID')
    if not conv_id:
        import hashlib
        key = f"quflx-v2-{parsed.asset or 'main'}-{parsed.timeframe or '1m'}"
        conv_id = hashlib.sha256(key.encode()).hexdigest()[:24]

    return {
        'parsed': parsed,
        'context': context,
        'ai_service': ai_service,
        'image': image,
        'conversation_id': conv_id,
    }, None


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
    prepared, error_response = _prepare_ai_request(payload, request, request_id)
    if error_response:
        return error_response

    parsed = prepared['parsed']
    context = prepared['context']
    ai_service = prepared['ai_service']
    image = prepared['image']
    conv_id = prepared['conversation_id']

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
        await _inject_backend_indicators(context, parsed.asset, parsed.timeframe, max_ctx_kb=ai_service.spec.max_ctx_kb)

        # Enforce provider-specific context size limit AFTER injection (Fail Fast — Core Principle #9)
        ctx_bytes = len(json.dumps(context, separators=(',', ':')).encode('utf-8'))
        max_bytes = ai_service.spec.max_ctx_kb * 1024
        if ctx_bytes > max_bytes:
            return _error_response(
                status_code=413,
                code='context_too_large',
                detail=f"Context ({ctx_bytes//1024}KB) exceeds {ai_service.spec.label} limit ({ai_service.spec.max_ctx_kb}KB).",
                request_id=request_id,
                retryable=False,
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
        return _error_response(
            status_code=int(exc.status_code),
            code=exc.code,
            detail=exc.user_message,
            request_id=request_id,
            retryable=bool(exc.retryable),
            provider_status=exc.provider_status,
        )

    except Exception:
        logger.error('AI ask failed request_id=%s', request_id, exc_info=True)
        return _error_response(
            status_code=500,
            code='internal_error',
            detail='AI request failed',
            request_id=request_id,
            retryable=False,
        )


@router.post('/ask/stream')
async def ask_ai_stream(payload: Dict[str, Any] = Body(...), request: Request = None):
    request_id = request_id_var.get('-')
    prepared, error_response = _prepare_ai_request(payload, request, request_id)
    if error_response:
        return error_response

    parsed = prepared['parsed']
    context = prepared['context']
    ai_service = prepared['ai_service']
    image = prepared['image']
    conv_id = prepared['conversation_id']

    logger.info(
        'AI ask stream request_id=%s asset=%s timeframe=%s conv_id=%s image_present=%s context_keys=%s',
        request_id,
        parsed.asset or '-',
        parsed.timeframe or '-',
        conv_id,
        bool(image),
        len(context.keys()),
    )

    await _inject_backend_indicators(context, parsed.asset, parsed.timeframe, max_ctx_kb=ai_service.spec.max_ctx_kb)

    ctx_bytes = len(json.dumps(context, separators=(',', ':')).encode('utf-8'))
    max_bytes = ai_service.spec.max_ctx_kb * 1024
    if ctx_bytes > max_bytes:
        return _error_response(
            status_code=413,
            code='context_too_large',
            detail=f"Context ({ctx_bytes//1024}KB) exceeds {ai_service.spec.label} limit ({ai_service.spec.max_ctx_kb}KB).",
            request_id=request_id,
            retryable=False,
        )

    async def event_stream():
        try:
            async for chunk in ai_service.ask_stream(
                prompt=parsed.prompt,
                context=context or None,
                image=image,
                request_id=request_id,
                asset=parsed.asset,
                timeframe=parsed.timeframe,
                conversation_id=conv_id,
            ):
                yield f"data: {json.dumps(chunk, separators=(',', ':'))}\n\n"
        except AIServiceError as exc:
            error_chunk = {
                'type': 'error',
                'code': exc.code,
                'detail': exc.user_message,
                'request_id': request_id,
                'retryable': bool(exc.retryable),
                'provider_status': exc.provider_status,
            }
            yield f"data: {json.dumps(error_chunk, separators=(',', ':'))}\n\n"
        except Exception:
            logger.error('AI ask stream failed request_id=%s', request_id, exc_info=True)
            error_chunk = {
                'type': 'error',
                'code': 'internal_error',
                'detail': 'AI request failed',
                'request_id': request_id,
                'retryable': False,
            }
            yield f"data: {json.dumps(error_chunk, separators=(',', ':'))}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    )


async def _inject_backend_indicators(context: Dict[str, Any], asset: Optional[str], timeframe: Optional[str], max_ctx_kb: Optional[int] = None) -> None:
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
        # Optimize token usage by UI mode and available context size
        tail_count = 5 if ui_mode == 'modal' else 50
        if max_ctx_kb and max_ctx_kb <= 32 and ui_mode != 'modal':
            tail_count = 10
            
        backend_snapshots = build_indicator_snapshots(result_df, tail_count=tail_count)
        if not backend_snapshots:
            logger.warning(
                'Backend indicator injection: pipeline returned no snapshots for %s @ %sm',
                normalized_asset,
                tf_min,
            )
            return

        if ui_mode == 'modal':
            merged_snapshots = {**existing_snapshots, **backend_snapshots}
        else:
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



