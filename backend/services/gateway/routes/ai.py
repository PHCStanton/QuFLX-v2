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
        # Optimization: Inject backend indicators if missing from frontend
        await _inject_backend_indicators(context, parsed.asset, parsed.timeframe)

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


async def _inject_backend_indicators(context: Dict[str, Any], asset: Optional[str], timeframe: Optional[str]) -> None:
    """
    Attempts to calculate default technical indicators on the backend and inject them 
    into the context if the frontend did not provide any.
    """
    # Skip if we already have indicators, or if asset/timeframe are missing
    existing_snapshots = context.get('indicatorSnapshots')
    if (existing_snapshots and len(existing_snapshots) > 0) or not asset or not timeframe:
        return

    # Determine timeframe in minutes
    try:
        if timeframe.endswith('m'):
            tf_min = int(timeframe[:-1])
        elif timeframe.endswith('h'):
            tf_min = int(timeframe[:-1]) * 60
        elif timeframe.isdigit():
            tf_min = int(timeframe)
        else:
            return  # Unsupported timeframe format for backend calc
    except Exception:
        return

    # Dynamic import to avoid circular issues if any, though likely safe
    import os
    import sys
    import json
    import asyncio
    from backend.utils.history_utils import get_recent_history_file
    from backend.services.gateway.routes.common import parse_script_json

    csv_path = get_recent_history_file(asset, tf_min)
    if not csv_path:
        return

    # Default indicators to inject
    defaults = [
        {"type": "ema", "params": {"period": 20}},
        {"type": "ema", "params": {"period": 50}},
        {"type": "rsi", "params": {"period": 14}},
        {"type": "macd", "params": {}},
        {"type": "bollinger_bands", "params": {}}
    ]

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py")
        )
        
        inputs = {
            "csv_path": str(csv_path),
            "asset": asset,
            "timeframe": tf_min,
            "indicators": defaults,
            "params": {},
            "current_candle": None
        }

        args = [
            sys.executable,
            runner_path,
            "indicator_calculator",
            "--inputs",
            json.dumps(inputs),
        ]

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        stdout, _ = await process.communicate()
        
        if process.returncode == 0:
            out = parse_script_json(stdout.decode().strip())
            if out.get('ok') and 'data' in out and 'indicators' in out['data']:
                # Transform the flat arrays from calculator into 'indicatorSnapshots' format
                # Calculator returns: { indicators: { "ema_20": [...], ... } }
                # Context expects: { "EMA 20": [...], ... }
                backend_data = out['data']['indicators']
                snapshots = {}
                
                for key, series in backend_data.items():
                    if series and isinstance(series, list):
                        # Map technical keys to readable names
                        name = key.replace('_', ' ').upper()
                        # Clean up names slightly
                        if name.startswith('EMA '): name = f"EMA {key.split('_')[-1]}"
                        elif name.startswith('RSI '): name = "RSI 14"
                        elif 'MACD' in name: name = key.replace('_', ' ').title().replace('Macd', 'MACD')
                        elif 'BB' in name: name = key.replace('_', ' ').title().replace('Bb', 'BB')
                        
                        snapshots[name] = series[-50:] # Keep last 50 points

                if snapshots:
                    context['indicatorSnapshots'] = snapshots
                    context['backendDataInjected'] = True
                    logger.info('Injected backend indicators for %s %s:Keys=%s', asset, timeframe, list(snapshots.keys()))

    except Exception as e:
        logger.warning('Failed to inject backend indicators: %s', e)


