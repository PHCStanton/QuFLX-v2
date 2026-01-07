import sys
import os
import logging
import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import json
from contextlib import asynccontextmanager
from typing import Dict, Any
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
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
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.models.market_data import Candle, Tick
from backend.models.events import SystemStatus
from backend.services.ai.service import AIService
from backend.services.gateway.routes import assets, timeframe, history, screenshots, indicators, settings, ai, asset_control
from backend.services.gateway.socket_events import register_socket_events

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("APIGateway")

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# AI Service
ai_service = AIService()

# Global state
redis_client = None
system_state = {
    "collector": "disconnected",
    "stream": "idle"
}

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
    global redis_client
    
    # === STARTUP ===
    logger.info("Starting API Gateway...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    
    # Register Socket.IO events (delegated to socket_events.py)
    register_socket_events(sio, redis_client, system_state)
    
    # Start Redis listener task
    asyncio.create_task(redis_listener())
    
    yield  # Application runs here
    
    # === SHUTDOWN ===
    logger.info("Shutting down API Gateway...")
    if redis_client:
        await redis_client.close()

# FastAPI Setup
app = FastAPI(title="QuFLX v2 API Gateway", lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"GLOBAL ERROR: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Global error: {str(exc)}"}
    )

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
print(f"DEBUG: Registering assets router: {assets.router}")
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Assets"])
app.include_router(timeframe.router, prefix="/api/v1/timeframe", tags=["Timeframe"])
app.include_router(history.router, prefix="/api/v1/history", tags=["History"])
app.include_router(screenshots.router, prefix="/api/v1/screenshots", tags=["Screenshots"])
app.include_router(indicators.router, prefix="/api/v1/indicators", tags=["Indicators"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(asset_control.router, prefix="/api/v1/asset-control", tags=["Asset Control"])

async def redis_listener():
    """Listen to Redis channels and broadcast to Socket.IO"""
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("market_data", "trading:signals", "system_status")
    
    logger.info("Subscribed to Redis channels: market_data, trading:signals, system_status")
    
    async for message in pubsub.listen():
        if message['type'] == 'message':
            channel = message['channel']
            data = message['data']
            
            try:
                parsed_data = json.loads(data)
                
                if channel == "market_data":
                    if not validate_market_data(parsed_data):
                        logger.warning(f"Invalid market_data contract: {parsed_data}")
                    
                    if 'asset' in parsed_data:
                        asset = parsed_data['asset']
                        system_state["last_tick_ts"] = parsed_data.get('timestamp', 0)
                        system_state["last_tick_asset"] = asset
                        await sio.emit('market_data', parsed_data, room=f'market_data:{asset}')
                        
                elif channel == "trading:signals":
                    await sio.emit('trading_signal', parsed_data)

                elif channel == "system_status":
                    try:
                        status_event = SystemStatus(**parsed_data)
                        if status_event.service == "collector":
                            system_state["collector"] = status_event.status
                            system_state["stream"] = "streaming" if status_event.status == "connected" else "idle"
                        await sio.emit('system_status', status_event.dict())
                    except Exception as e:
                        logger.error(f"Invalid system status message: {e}")
                        continue
                    
            except json.JSONDecodeError:
                logger.warning(f"Received non-JSON message on {channel}: {data}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")

# Core Endpoints
@app.get("/health")
async def health_check():
    print("DEBUG: Health check hit")
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/v1/status")
async def get_status():
    return {
        "ok": True,
        "system": system_state,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    # Use loop="asyncio" to ensure it respects the policy set at the top
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True, loop="asyncio")
