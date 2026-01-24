import asyncio
import json
import logging
import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import websockets


router = APIRouter()
logger = logging.getLogger('gateway.ai_voice')


def _get_voice_api_key() -> Optional[str]:
    for name in ('XAI_API_KEY', 'AI_API_KEY', 'GROK_API_KEY'):
        value = os.getenv(name)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _get_realtime_url() -> str:
    raw = os.getenv('AI_REALTIME_URL') or os.getenv('XAI_REALTIME_URL')
    if raw and str(raw).strip():
        return str(raw).strip()
    return 'wss://api.x.ai/v1/realtime'


def _is_allowed_event_type(event_type: str) -> bool:
    allowed_prefixes = (
        'session.',
        'input_audio_buffer.',
        'response.',
        'conversation.',
    )
    return any(str(event_type).startswith(prefix) for prefix in allowed_prefixes)


@router.websocket('/ws')
async def voice_ws(websocket: WebSocket):
    request_id = websocket.headers.get('X-Request-ID') or uuid.uuid4().hex[:12]
    await websocket.accept()

    api_key = _get_voice_api_key()
    if not api_key:
        await websocket.send_text(
            json.dumps(
                {
                    'type': 'error',
                    'code': 'missing_api_key',
                    'detail': 'Voice relay is disabled (missing API key).',
                    'request_id': request_id,
                }
            )
        )
        await websocket.close(code=1011)
        return

    upstream_url = _get_realtime_url()
    logger.info('Voice WS connect request_id=%s upstream=%s', request_id, upstream_url)

    upstream_state: dict[str, Any] = {
        'closed': False,
        'code': None,
        'reason': None,
    }

    async def client_to_upstream(upstream):
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps(
                        {
                            'type': 'error',
                            'code': 'invalid_json',
                            'detail': 'Invalid JSON message.',
                            'request_id': request_id,
                        }
                    )
                )
                continue

            if not isinstance(payload, dict):
                continue

            event_type = payload.get('type')
            if not isinstance(event_type, str) or not event_type.strip():
                continue
            if not _is_allowed_event_type(event_type):
                await websocket.send_text(
                    json.dumps(
                        {
                            'type': 'error',
                            'code': 'unsupported_event',
                            'detail': f'Unsupported event type: {event_type}',
                            'request_id': request_id,
                        }
                    )
                )
                continue

            await upstream.send(json.dumps(payload))

    async def upstream_to_client(upstream):
        try:
            async for raw in upstream:
                if websocket.client_state.name != 'CONNECTED':
                    break
                await websocket.send_text(raw)
        finally:
            upstream_state['closed'] = True
            upstream_state['code'] = getattr(upstream, 'close_code', None)
            upstream_state['reason'] = getattr(upstream, 'close_reason', None)

    try:
        async with websockets.connect(
            uri=upstream_url,
            ssl=True,
            additional_headers={'Authorization': f'Bearer {api_key}'},
            ping_interval=20,
            ping_timeout=20,
            max_size=8_000_000,
        ) as upstream:
            t1 = asyncio.create_task(client_to_upstream(upstream))
            t2 = asyncio.create_task(upstream_to_client(upstream))
            done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_EXCEPTION)
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc:
                    raise exc

            if upstream_state.get('closed'):
                logger.info(
                    'Voice WS upstream closed request_id=%s code=%s reason=%s',
                    request_id,
                    upstream_state.get('code'),
                    upstream_state.get('reason'),
                )
                try:
                    await websocket.send_text(
                        json.dumps(
                            {
                                'type': 'error',
                                'code': 'upstream_closed',
                                'detail': f"Upstream closed (code={upstream_state.get('code')} reason={upstream_state.get('reason')})",
                                'request_id': request_id,
                            }
                        )
                    )
                except Exception:
                    pass
    except WebSocketDisconnect:
        logger.info('Voice WS disconnected request_id=%s', request_id)
    except Exception:
        logger.error('Voice WS failed request_id=%s', request_id, exc_info=True)
        try:
            await websocket.send_text(
                json.dumps(
                    {
                        'type': 'error',
                        'code': 'relay_failed',
                        'detail': 'Voice relay failed.',
                        'request_id': request_id,
                    }
                )
            )
        except Exception:
            pass
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
