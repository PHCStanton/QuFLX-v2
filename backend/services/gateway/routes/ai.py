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
from backend.services.gateway.request_context import request_id_var


router = APIRouter()
logger = logging.getLogger('gateway.ai')


class AiAskRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    context: Dict[str, Any] = Field(default_factory=dict)
    asset: Optional[str] = Field(default=None, max_length=128)
    timeframe: Optional[str] = Field(default=None, max_length=32)
    image_base64: Optional[str] = Field(default=None, max_length=12_000_000)
    image: Optional[str] = Field(default=None, max_length=12_000_000)

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


@lru_cache(maxsize=1)
def _get_ai_service() -> AIService:
    return AIService()


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


@router.post('/ask')
async def ask_ai(payload: Dict[str, Any] = Body(...), request: Request = None, ai_service: AIService = Depends(_get_ai_service)):
    request_id = request_id_var.get('-')

    try:
        parsed = AiAskRequest.parse_obj(payload)
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content={
                'ok': False,
                'code': 'invalid_request',
                'detail': 'Invalid AI request payload.',
                'request_id': request_id,
                'retryable': False,
                'errors': exc.errors(),
            },
        )

    context = dict(parsed.context or {})
    if parsed.asset:
        context['asset'] = parsed.asset
    if parsed.timeframe:
        context['timeframe'] = parsed.timeframe

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

    logger.info(
        'AI ask request_id=%s asset=%s timeframe=%s image_present=%s context_keys=%s',
        request_id,
        parsed.asset or '-',
        parsed.timeframe or '-',
        bool(image),
        len(context.keys()),
    )

    try:
        result = await ai_service.ask(
            prompt=parsed.prompt,
            context=context or None,
            image=image,
            request_id=request_id,
            asset=parsed.asset,
            timeframe=parsed.timeframe,
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
