import sys
import os
import logging
import time
import uuid
import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import json
from logging.handlers import TimedRotatingFileHandler
from contextlib import asynccontextmanager
from typing import Dict, Any
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import socketio
import redis.asyncio as redis
from dotenv import load_dotenv

# Load environment variables
project_root = Path(__file__).resolve().parents[3]
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

# Add project root to path for internal imports
project_root_str = str(project_root)
if project_root_str not in sys.path:
    sys.path.insert(0, project_root_str)

from backend.models.market_data import Candle, Tick
from backend.models.events import SystemStatus
from backend.services.ai.registry import AIProviderRegistry
from backend.services.ai.local_process import LocalAIProcessManager
from backend.services.gateway.routes import assets, timeframe, history, screenshots, indicators, settings, profiles, ai, ai_voice, asset_control, ops, dev_logs, alerts, strategy, trading
from backend.services.gateway.socket_events import register_socket_events

from backend.services.gateway.request_context import ContextFilter, request_id_var

def _normalize_log_level(value: str) -> int:
    v = str(value or '').strip().upper()
    if v == 'DEBUG':
        return logging.DEBUG
    if v == 'WARNING' or v == 'WARN':
        return logging.WARNING
    if v == 'ERROR':
        return logging.ERROR
    if v == 'CRITICAL':
        return logging.CRITICAL
    return logging.INFO


def configure_logging(*, service_name: str = 'gateway') -> None:
    log_level = _normalize_log_level(os.getenv('QFLX_LOG_LEVEL', 'INFO'))
    enable_file_logs = str(os.getenv('QFLX_LOG_TO_FILE', '1')).strip() not in {'0', 'false', 'False', 'no', 'NO'}
    base_dir = os.getenv('QFLX_LOG_DIR')
    if not base_dir:
        base_dir = str(project_root / 'system_LOGS')

    service_dir = Path(base_dir) / service_name
    formatter = logging.Formatter(
        fmt='%(asctime)sZ | %(levelname)s | %(name)s | run=%(run_id)s req=%(request_id)s | %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S'
    )

    root = logging.getLogger()
    root.setLevel(log_level)
    if not any(isinstance(f, ContextFilter) for f in root.filters):
        root.addFilter(ContextFilter())

    already_configured = any(getattr(h, '_qflx_handler', False) for h in root.handlers)
    if already_configured:
        for handler in root.handlers:
            if not getattr(handler, '_qflx_handler', False):
                continue
            if any(isinstance(f, ContextFilter) for f in handler.filters):
                continue
            handler.addFilter(ContextFilter())
        return

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(log_level)
    console.setFormatter(formatter)
    console._qflx_handler = True
    console.addFilter(ContextFilter())
    root.addHandler(console)

    if enable_file_logs:
        service_dir.mkdir(parents=True, exist_ok=True)

        app_path = service_dir / f'{service_name}.log'
        err_path = service_dir / f'{service_name}.error.log'
        access_path = service_dir / f'{service_name}.access.log'

        app_fh = TimedRotatingFileHandler(str(app_path), when='midnight', interval=1, backupCount=14, utc=True, encoding='utf-8')
        app_fh.setLevel(log_level)
        app_fh.setFormatter(formatter)
        app_fh._qflx_handler = True
        app_fh.addFilter(ContextFilter())
        root.addHandler(app_fh)

        err_fh = TimedRotatingFileHandler(str(err_path), when='midnight', interval=1, backupCount=30, utc=True, encoding='utf-8')
        err_fh.setLevel(logging.ERROR)
        err_fh.setFormatter(formatter)
        err_fh._qflx_handler = True
        err_fh.addFilter(ContextFilter())
        root.addHandler(err_fh)

        access_logger = logging.getLogger(f'{service_name}.access')
        access_logger.setLevel(log_level)
        access_logger.propagate = False
        access_logger.addFilter(ContextFilter())
        access_fh = TimedRotatingFileHandler(str(access_path), when='midnight', interval=1, backupCount=14, utc=True, encoding='utf-8')
        access_fh.setLevel(log_level)
        access_fh.setFormatter(formatter)
        access_fh._qflx_handler = True
        access_fh.addFilter(ContextFilter())
        access_logger.addHandler(access_fh)


configure_logging(service_name='gateway')
logger = logging.getLogger('gateway')
access_logger = logging.getLogger('gateway.access')

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# AI Service
local_ai = LocalAIProcessManager()
ai_registry: AIProviderRegistry | None = None

# Global state
redis_client = None
system_state = {
    "collector": "disconnected",
    "stream": "idle"
}

DEBUG_ERRORS = str(os.getenv('QFLX_DEBUG_ERRORS', '0')).strip() in {'1', 'true', 'True', 'yes', 'YES'}

def validate_market_data(data: Dict[str, Any]) -> bool:
    """
    Validates market data payload against Tick or Candle models.
    """
    try:
        Tick(**data)
        return True
    except Exception:
        try:
            Candle(**data)
            return True
        except Exception:
            return False

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler for startup/shutdown."""
    global redis_client, ai_registry
    
    # === STARTUP ===
    logger.info("Starting API Gateway...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    app.state.redis = redis_client
    
    # Start local AI (Gemma) BEFORE registry probes
    await local_ai.start()
    ai_registry = AIProviderRegistry()
    app.state.ai_registry = ai_registry
    
    # Register Socket.IO events (delegated to socket_events.py)
    register_socket_events(sio, redis_client, system_state)
    
    # Start Redis listener task
    asyncio.create_task(redis_listener())
    
    yield  # Application runs here
    
    # === SHUTDOWN ===
    logger.info("Shutting down API Gateway...")
    if ai_registry:
        await ai_registry.close_all()
    await local_ai.stop()
    if redis_client:
        await redis_client.close()
    if trading._shared_client and not trading._shared_client.is_closed:
        await trading._shared_client.aclose()

# FastAPI Setup
app = FastAPI(title="QuFLX v2 API Gateway", lifespan=lifespan)


@app.middleware('http')
async def request_context_middleware(request: Request, call_next):
    incoming_request_id = request.headers.get('X-Request-ID')
    req_id = str(incoming_request_id or uuid.uuid4().hex[:12]).strip() or uuid.uuid4().hex[:12]
    token = request_id_var.set(req_id)

    started = time.monotonic()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        elapsed_ms = (time.monotonic() - started) * 1000.0
        status_code = response.status_code if response is not None else 500
        access_logger.info('%s %s status=%s duration_ms=%.2f', request.method, request.url.path, status_code, elapsed_ms)
        request_id_var.reset(token)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = uuid.uuid4().hex[:12]
    logger.error('GLOBAL ERROR error_id=%s', error_id, exc_info=True)

    payload: Dict[str, Any] = {
        'detail': 'Internal server error',
        'error_id': error_id,
        'request_id': request_id_var.get('-'),
    }

    if DEBUG_ERRORS:
        payload['debug'] = {
            'type': exc.__class__.__name__,
            'message': str(exc),
        }

    return JSONResponse(status_code=500, content=payload)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    payload: Dict[str, Any] = {
        'detail': exc.detail,
        'request_id': request_id_var.get('-'),
    }
    if DEBUG_ERRORS:
        payload['debug'] = {
            'status_code': exc.status_code,
        }
    return JSONResponse(status_code=exc.status_code, content=payload)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# API Routers
logger.debug(f"Registering assets router: {assets.router}")
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Assets"])
app.include_router(timeframe.router, prefix="/api/v1/timeframe", tags=["Timeframe"])
app.include_router(history.router, prefix="/api/v1/history", tags=["History"])
app.include_router(screenshots.router, prefix="/api/v1/screenshots", tags=["Screenshots"])
app.include_router(indicators.router, prefix="/api/v1/indicators", tags=["Indicators"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(profiles.router, prefix="/api/v1/profiles", tags=["Profiles"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(ai_voice.router, prefix="/api/v1/ai/voice", tags=["AI"])  # Check if ai_voice is imported
app.include_router(asset_control.router, prefix="/api/v1/asset-control", tags=["Asset Control"])
app.include_router(ops.router, prefix="/api/v1/ops", tags=["Ops"])
app.include_router(dev_logs.router, prefix="/api/v1/dev/logs", tags=["Dev Logs"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(strategy.router, prefix="/api/v1/strategy", tags=["Strategy Lab"])
app.include_router(trading.router, prefix="/api/v1/trading", tags=["Live Trading"])

_REDIS_CHANNELS = (
    "market_data", "trading:signals", "system_status",
    "alerts:dispatched", "scan:heartbeat", "strategy:regime",
)

async def _process_redis_message(channel: str, data: str) -> None:
    """Process a single Redis pub/sub message and emit to Socket.IO."""
    try:
        parsed_data = json.loads(data)
    except json.JSONDecodeError:
        logger.warning("Received non-JSON message on %s: %s", channel, data)
        return

    try:
        if channel == "market_data":
            if not validate_market_data(parsed_data):
                logger.warning("Invalid market_data contract: %s", parsed_data)
            if 'asset' in parsed_data:
                asset = parsed_data['asset']
                system_state["last_tick_ts"] = parsed_data.get('timestamp', 0)
                system_state["last_tick_asset"] = asset
                await sio.emit('market_data', parsed_data, room=f'market_data:{asset}')
                await sio.emit('market_data', parsed_data, room='monitor')

        elif channel == "trading:signals":
            await sio.emit('trading_signal', parsed_data)

        elif channel == "strategy:regime":
            await sio.emit('regime_update', parsed_data)

        elif channel == "alerts:dispatched":
            await sio.emit('new_alert', parsed_data)

        elif channel == "scan:heartbeat":
            await sio.emit('scan_heartbeat', parsed_data)

        elif channel == "system_status":
            try:
                status_event = SystemStatus(**parsed_data)
                if status_event.service == "collector":
                    system_state["collector"] = status_event.status
                    system_state["stream"] = "streaming" if status_event.status == "connected" else "idle"
                await sio.emit('system_status', status_event.dict())
            except Exception as e:
                logger.error("Invalid system status message: %s", e)

    except Exception as e:
        logger.error("Error emitting Socket.IO event for channel=%s: %s", channel, e)


async def redis_listener():
    """
    Listen to Redis pub/sub channels and broadcast to Socket.IO.
    Auto-reconnects with exponential backoff on connection failure.
    Principle 8: Zero Silent Failures — errors are logged and recovered, never swallowed.
    """
    _RETRY_DELAYS = (1, 2, 5, 10, 30)  # seconds between reconnect attempts
    attempt = 0

    while True:
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(*_REDIS_CHANNELS)
            logger.info("Redis listener subscribed to channels: %s", ", ".join(_REDIS_CHANNELS))
            attempt = 0  # Reset backoff on successful connection

            async for message in pubsub.listen():
                if message['type'] == 'message':
                    await _process_redis_message(message['channel'], message['data'])

        except asyncio.CancelledError:
            logger.info("Redis listener cancelled — shutting down.")
            return
        except Exception as e:
            delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
            logger.error(
                "Redis listener crashed (attempt %d): %s — retrying in %ds",
                attempt + 1, e, delay
            )
            attempt += 1
            await asyncio.sleep(delay)

# Core Endpoints
@app.get("/health")
async def health_check():
    logger.debug("Health check hit")
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/v1/status")
async def get_status():
    return {
        "ok": True,
        "system": system_state,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    import argparse
    import uvicorn
    parser = argparse.ArgumentParser(description='Run QuFLX v2 API Gateway')
    parser.add_argument('--host', default=os.getenv('QFLX_GATEWAY_HOST', '0.0.0.0'))
    parser.add_argument('--port', type=int, default=int(os.getenv('QFLX_GATEWAY_PORT', '8000')))
    parser.add_argument('--reload', action='store_true', default=str(os.getenv('QFLX_GATEWAY_RELOAD', '1')).strip() in {'1', 'true', 'True', 'yes', 'YES'})
    parser.add_argument('--log-level', default=os.getenv('QFLX_LOG_LEVEL', 'INFO'))
    parser.add_argument('--log-dir', default=os.getenv('QFLX_LOG_DIR', str(project_root / 'system_LOGS')))
    parser.add_argument('--log-to-file', action='store_true', default=str(os.getenv('QFLX_LOG_TO_FILE', '1')).strip() not in {'0', 'false', 'False', 'no', 'NO'})
    parser.add_argument('--debug-errors', action='store_true', default=str(os.getenv('QFLX_DEBUG_ERRORS', '0')).strip() in {'1', 'true', 'True', 'yes', 'YES'})
    args = parser.parse_args()

    os.environ['QFLX_LOG_LEVEL'] = str(args.log_level)
    os.environ['QFLX_LOG_DIR'] = str(args.log_dir)
    os.environ['QFLX_LOG_TO_FILE'] = '1' if args.log_to_file else '0'
    os.environ['QFLX_DEBUG_ERRORS'] = '1' if args.debug_errors else '0'

    configure_logging(service_name='gateway')
    # Use loop="none" so uvicorn does NOT create its own event loop and instead
    # inherits the WindowsProactorEventLoopPolicy set at the top of this module.
    # loop="asyncio" would force SelectorEventLoop on Windows, which does not
    # support asyncio.create_subprocess_exec and causes the subprocess fallback.
    target = "backend.services.gateway.main:socket_app" if args.reload else socket_app
    uvicorn.run(target, host=str(args.host), port=int(args.port), reload=bool(args.reload), loop="none", log_level=str(args.log_level).lower())
