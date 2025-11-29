import sys
import os
import logging
import asyncio
import json
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import socketio
import redis.asyncio as redis

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.models.market_data import Candle
from backend.models.events import Signal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("APIGateway")

# FastAPI Setup
app = FastAPI(title="QuFLX v2 API Gateway")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Redis Configuration
REDIS_URL = "redis://localhost:6379/0"

# Global state
redis_client = None

@app.on_event("startup")
async def startup_event():
    logger.info("Starting API Gateway...")
    global redis_client
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    
    # Start Redis Listener Task
    asyncio.create_task(redis_listener())

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down API Gateway...")
    if redis_client:
        await redis_client.close()

async def redis_listener():
    """Listen to Redis channels and broadcast to Socket.IO"""
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("market_data", "trading:signals")
    
    logger.info("Subscribed to Redis channels: market_data, trading:signals")
    
    async for message in pubsub.listen():
        if message['type'] == 'message':
            channel = message['channel']
            data = message['data']
            
            try:
                # Parse data to ensure it's valid JSON
                parsed_data = json.loads(data)
                
                if channel == "market_data":
                    # Broadcast to 'market_data' event
                    # We can also emit to specific rooms based on asset if needed
                    # For now, broadcast to all
                    await sio.emit('market_data', parsed_data)
                    
                    # If it's a candle, we might want to emit to a specific asset room
                    if 'asset' in parsed_data:
                        asset = parsed_data['asset']
                        await sio.emit(f'market_data:{asset}', parsed_data)
                        
                elif channel == "trading:signals":
                    await sio.emit('trading_signal', parsed_data)
                    
            except json.JSONDecodeError:
                logger.warning(f"Received non-JSON message on {channel}: {data}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")

# Socket.IO Events
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

# REST Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "api-gateway"}

@app.get("/api/v1/history/{asset}")
async def get_history(asset: str, limit: int = 100):
    """
    Fetch historical data for an asset.
    For now, this is a placeholder. In a real implementation, 
    we would query a database or a Redis Stream/TimeSeries.
    """
    # Mock response
    return {
        "asset": asset,
        "data": [],
        "message": "Historical data storage not yet implemented"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
