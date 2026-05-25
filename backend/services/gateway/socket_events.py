import os
import sys
import json
import logging
import asyncio
import subprocess
import socket as _socket
from datetime import datetime, timezone
from typing import Dict, Any

logger = logging.getLogger("gateway.socket")

def register_socket_events(sio, redis_client, system_state):
    @sio.event
    async def connect(sid, environ):
        logger.info(f"Client connected: {sid}")

    @sio.event
    async def disconnect(sid):
        logger.info(f"Client disconnected: {sid}")

    @sio.event
    async def subscribe_asset(sid, asset):
        """Allow client to subscribe to specific asset updates"""
        logger.info(f"Client {sid} subscribed to {asset}")
        await sio.enter_room(sid, f"market_data:{asset}")

    @sio.event
    async def unsubscribe_asset(sid, asset):
        """Allow client to unsubscribe from specific asset updates"""
        logger.info(f"Client {sid} unsubscribed from {asset}")
        await sio.leave_room(sid, f"market_data:{asset}")

    @sio.event
    async def subscribe_monitor(sid):
        """Join the global monitor room to receive ALL market_data events."""
        logger.info(f"Client {sid} joined monitor room")
        await sio.enter_room(sid, "monitor")

    @sio.event
    async def unsubscribe_monitor(sid):
        """Leave the global monitor room."""
        logger.info(f"Client {sid} left monitor room")
        await sio.leave_room(sid, "monitor")

    @sio.event
    async def update_active_ticker(sid, assets):
        """Phase 3: Update global active ticker list in Redis for Dispatcher Sync"""
        if not redis_client:
            logger.error("Redis client not available for ticker sync")
            return
            
        try:
            # Validate list of strings
            if isinstance(assets, list) and all(isinstance(a, str) for a in assets):
                await redis_client.publish('ticker:active', json.dumps(assets))
                logger.info(f"Updated ticker:active -> {assets}")
            else:
                logger.warning(f"Invalid format for update_active_ticker: {assets}")
        except Exception as e:
            logger.error(f"Error publishing ticker update: {e}")

    @sio.event
    async def check_status(sid):
        """Provide comprehensive backend status to frontend"""
        try:
            # Check Redis connection
            redis_status = False
            try:
                if redis_client:
                    await redis_client.ping()
                    redis_status = True
            except Exception as e:
                logger.warning(f"Redis health check failed: {e}")
            
            # Check Chrome debugging port availability
            chrome_status = False
            try:
                sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
                sock.settimeout(0.5)  # Fast timeout
                # Use 127.0.0.1 explicitly to avoid IPv6 issues on Windows
                result = sock.connect_ex(('127.0.0.1', 9222))
                sock.close()
                chrome_status = (result == 0)
            except Exception as e:
                logger.warning(f"Chrome debugging port check failed: {e}")

            # Check SSID service port availability
            ssid_service_available = False
            try:
                ssid_port = int(os.getenv("QFLX_SSID_SERVICE_PORT", "8001"))
                sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
                sock.settimeout(0.5)
                result = sock.connect_ex(('127.0.0.1', ssid_port))
                sock.close()
                ssid_service_available = (result == 0)
            except Exception as e:
                logger.warning(f"SSID service port check failed: {e}")
            
            # Use actual collector status if available in system_state
            collector_connected = system_state.get("collector") == "connected"
            
            status = {
                'redis_connected': redis_status,
                'socket_io_ready': True,
                'chrome_debugging_available': chrome_status or collector_connected,
                'ssid_service_available': ssid_service_available,
                'ready_for_assets': redis_status and (chrome_status or collector_connected),
                'system_state': system_state,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            await sio.emit('backend_status', status, room=sid)
        except Exception as e:
            logger.error(f"Error in check_status: {e}")
            await sio.emit('backend_status_error', {'error': str(e)}, room=sid)
