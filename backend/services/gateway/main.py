import sys
import os
import logging
import asyncio
import json
import subprocess
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import socketio
import redis.asyncio as redis

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.models.market_data import Candle
from backend.models.events import Signal, SystemStatus

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
system_state = {
    "collector": "disconnected",
    "stream": "idle"
}

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
    await pubsub.subscribe("market_data", "trading:signals", "system_status")
    
    logger.info("Subscribed to Redis channels: market_data, trading:signals, system_status")
    
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

                elif channel == "system_status":
                    # Validate with Pydantic
                    try:
                        status_event = SystemStatus(**parsed_data)
                        
                        # Update internal state
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

@sio.event
async def select_asset(sid, asset):
    """
    Handle asset selection request via Socket.IO.
    Executes asset_control.py to switch asset in browser.
    """
    logger.info(f"Client {sid} requested to select asset: {asset}")
    
    try:
        # Run asset_control.py in a separate thread to avoid blocking event loop
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "asset_control.py"))
        
        def run_script():
            return subprocess.run(
                [sys.executable, script_path, "--action", "select_asset", "--asset", asset],
                capture_output=True,
                text=True
            )
            
        # Use asyncio.to_thread for non-blocking execution (Python 3.9+)
        # Or run_in_executor for older versions
        result = await asyncio.to_thread(run_script)
        
        if result.returncode != 0:
            logger.error(f"Error selecting asset: {result.stderr}")
            await sio.emit('asset_selection_error', {'error': f"Script failed: {result.stderr}"}, room=sid)
            return

        try:
            output_json = json.loads(result.stdout)
            if not output_json.get("ok"):
                error_msg = output_json.get("error", "Unknown error")
                logger.error(f"Asset selection failed: {error_msg}")
                await sio.emit('asset_selection_error', {'error': error_msg}, room=sid)
            else:
                logger.info(f"Successfully selected asset: {asset}")
                await sio.emit('asset_selected', {'asset': asset}, room=sid)
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON output from script: {result.stdout}")
            await sio.emit('asset_selection_error', {'error': "Invalid script output"}, room=sid)

    except Exception as e:
        logger.error(f"Exception in select_asset: {e}")
        await sio.emit('asset_selection_error', {'error': str(e)}, room=sid)

# REST Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "api-gateway"}

@app.get("/api/v1/status")
async def get_status():
    """
    Returns the current status of services.
    """
    return system_state

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

@app.post("/api/v1/refresh-assets")
async def refresh_assets():
    """
    Executes favorite_star_select.py to refresh the list of 92% payout assets.
    """
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/favorite_star_select.py"))
        
        # Run the script
        result = subprocess.run(
            [sys.executable, script_path, "--min-pct", "92", "--sweep-all", "--unstar-below"],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.error(f"Error refreshing assets: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")
            
        # Parse output
        try:
            output_json = json.loads(result.stdout)
            if not output_json.get("ok"):
                raise HTTPException(status_code=500, detail=f"Script returned error: {output_json.get('error')}")
                
            data = output_json.get("data", {})
            processed = data.get("processed", {})
            
            # Combine selected_now and already_favorited
            assets = list(set(processed.get("selected_now", []) + processed.get("already_favorited", [])))
            
            return {"assets": assets}
            
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON output from script: {result.stdout}")
            raise HTTPException(status_code=500, detail="Invalid output from asset refresh script")
            
    except Exception as e:
        logger.error(f"Refresh assets failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/select-asset")
async def select_asset(payload: Dict[str, str] = Body(...)):
    """
    Selects an asset in the Pocket Option UI using Selenium.
    """
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="Asset name required")
        
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "asset_control.py"))
        
        result = subprocess.run(
            [sys.executable, script_path, "--action", "select_asset", "--asset", asset],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            logger.error(f"Error selecting asset: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")
            
        output_json = json.loads(result.stdout)
        if not output_json.get("ok"):
             raise HTTPException(status_code=500, detail=f"Selection failed: {output_json.get('error')}")
             
        return {"status": "success", "message": f"Selected {asset}"}
        
    except Exception as e:
        logger.error(f"Select asset failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/select-timeframe")
async def select_timeframe(payload: Dict[str, str] = Body(...)):
    """
    Selects a timeframe in the Pocket Option UI using Selenium.
    """
    timeframe = payload.get("timeframe")
    if not timeframe:
        raise HTTPException(status_code=400, detail="Timeframe required")
    
    # Validate timeframe format
    valid_timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    if timeframe not in valid_timeframes:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid timeframe: {timeframe}. Must be one of: {', '.join(valid_timeframes)}"
        )
        
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "asset_control.py"))
        
        logger.info(f"Executing timeframe selection: {timeframe}")
        result = subprocess.run(
            [sys.executable, script_path, "--action", "select_timeframe", "--timeframe", timeframe],
            capture_output=True,
            text=True,
            timeout=10  # 10 second timeout
        )
        
        if result.returncode != 0:
            error_msg = result.stderr.strip()
            logger.error(f"Timeframe script failed (exit code {result.returncode}): {error_msg}")
            raise HTTPException(
                status_code=422,  # Unprocessable Entity - UI element not found
                detail=f"UI selector failed. Pocket Option UI may have changed. Error: {error_msg}"
            )
        
        # Try to parse output
        try:
            output_json = json.loads(result.stdout)
        except json.JSONDecodeError as je:
            logger.error(f"Invalid JSON from timeframe script: {result.stdout}")
            raise HTTPException(
                status_code=502,  # Bad Gateway - invalid script output
                detail=f"Script output parsing failed: {str(je)}"
            )
        
        if not output_json.get("ok"):
            error_msg = output_json.get("error", "Unknown error")
            logger.warning(f"Timeframe selection returned error: {error_msg}")
            raise HTTPException(
                status_code=422,
                detail=f"Timeframe selection failed: {error_msg}"
            )
        
        logger.info(f"Successfully selected timeframe: {timeframe}")
        return {"status": "success", "message": f"Selected {timeframe}"}
        
    except HTTPException:
        # Re-raise HTTP exceptions (already formatted)
        raise
    except subprocess.TimeoutExpired:
        logger.error(f"Timeframe selection timeout after 10s")
        raise HTTPException(
            status_code=504,  # Gateway Timeout
            detail="UI interaction timed out. Pocket Option may be unresponsive."
        )
    except Exception as e:
        logger.error(f"Unexpected error in select_timeframe: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {type(e).__name__}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
