"""
DEPRECATED: This mock voice handler is deprecated as of 2026-01-25.
Use ai_voice.py instead, which provides the real xAI WebSocket relay.

This file is preserved only for reference and testing purposes.
DO NOT register this router in main.py - use ai_voice.router instead.
"""
import logging
import json
import asyncio
import base64
import warnings
from typing import Dict, Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

warnings.warn(
    "voice.py is deprecated. Use ai_voice.py for the real xAI voice relay.",
    DeprecationWarning,
    stacklevel=2
)

# DEPRECATED: Do not use this router - use ai_voice.router instead
router_deprecated = APIRouter()
router = router_deprecated  # Alias for backward compatibility during transition
logger = logging.getLogger('gateway.voice_deprecated')

@router.websocket('/ws')
async def voice_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info('Voice WebSocket connected')

    try:
        # Session state
        session_config: Dict[str, Any] = {}
        
        while True:
            # Receive message from client
            try:
                message = await websocket.receive_text()
            except RuntimeError:
                # Handle cases where connection is already closed
                break
                
            data = None
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                logger.warning('Received invalid JSON over WebSocket')
                continue

            msg_type = data.get('type')
            
            if msg_type == 'session.update':
                # Client configuring the session
                session_config = data.get('session', {})
                logger.debug(f'Session updated: {session_config.get("voice", "default")}')
                
                # Acknowledge update
                await websocket.send_json({
                    'type': 'session.updated',
                    'session': session_config
                })

            elif msg_type == 'input_audio_buffer.append':
                # Client sending audio chunk (base64)
                # For Phase 1/Testing: We just acknowledge receipt
                # In Phase 2: We would forward this to xAI
                pass

            elif msg_type == 'input_audio_buffer.commit':
                # Client finished speaking a phrase
                await websocket.send_json({'type': 'input_audio_buffer.committed'})
                await websocket.send_json({'type': 'input_audio_buffer.speech_stopped'})
                
                # Mock Response for Validation
                # We send the 'done' events but NOT the text deltas,
                # because the frontend is handling dictation via Hybrid Mode.
                # In the future, this would send the actual AI response.
                await websocket.send_json({
                    'type': 'response.created',
                })
                
                # Done
                await websocket.send_json({'type': 'response.done'})

            elif msg_type == 'response.create':
                # Client manually requesting response
                pass

            else:
                logger.debug(f'Unknown message type: {msg_type}')

    except WebSocketDisconnect:
        logger.info('Voice WebSocket disconnected')
    except Exception as e:
        logger.error(f'Voice WebSocket error: {e}', exc_info=True)
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011)
