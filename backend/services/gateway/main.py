import sys
import os
import csv
import re
import logging
import asyncio
import json
import subprocess
import base64
from contextlib import asynccontextmanager
from typing import List, Dict, Any
from datetime import datetime, timezone
from pathlib import Path
from collections import deque

import pandas as pd
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import socketio
import redis.asyncio as redis
from dotenv import load_dotenv

# Load environment variables
# Try to find .env in project root (3 levels up)
project_root = Path(__file__).resolve().parents[3]
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.models.market_data import Candle, Tick
from backend.models.events import Signal, SystemStatus
from backend.services.ai.service import AIService
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("APIGateway")

def _parse_script_json(stdout: str) -> Dict[str, Any]:
    """Extract JSON payload from capability stdout.

    Some capabilities print a human-friendly line before the JSON
    (e.g. Chrome attach status). This helper finds the actual JSON
    segment so downstream code can rely on structured data.
    """
    if not stdout:
        raise ValueError("Empty script output")

    lines = [ln.strip() for ln in stdout.splitlines() if ln.strip()]

    for line in reversed(lines):
        if line.startswith("{") or line.startswith("["):
            return json.loads(line)

    first_brace = stdout.find("{")
    if first_brace != -1:
        return json.loads(stdout[first_brace:])

    raise ValueError(f"No JSON object found in script output: {stdout!r}")


def _persist_history_csv(asset: str, timeframe_min: int, candles: List[Dict[str, Any]]) -> None:
    """Persist candles to CSV so indicator endpoint can reuse the same history.

    Uses the same directory structure as capabilities_v2.history_collector._save_csv:
    data/data_output/history/{asset_clean}/{timeframe}.csv
    """
    if not candles:
        return

    root = Path(__file__).resolve().parents[3]
    asset_clean = re.sub(r"[^\w\-_]", "_", asset)
    save_dir = root / "data" / "data_output" / "history" / asset_clean
    save_dir.mkdir(parents=True, exist_ok=True)
    filepath = save_dir / f"{int(timeframe_min)}.csv"

    file_exists = filepath.exists()
    mode = "a" if file_exists else "w"

    with filepath.open(mode, newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for c in candles:
            try:
                ts = float(c.get("timestamp"))
                ts_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
                open_ = float(c.get("open"))
                high = float(c.get("high"))
                low = float(c.get("low"))
                close = float(c.get("close"))
                volume = float(c.get("volume", 0.0))
            except Exception:
                continue
            writer.writerow([ts_str, open_, high, low, close, volume])


def validate_market_data(data: Dict[str, Any]) -> bool:
    """
    Validates market data payload against Tick or Candle models.
    Returns True if valid, False otherwise.
    """
    try:
        # Try validating as Tick
        Tick(**data)
        return True
    except Exception:
        try:
            # Try validating as Candle
            Candle(**data)
            return True
        except Exception:
            return False

# Redis Configuration
REDIS_URL = "redis://localhost:6379/0"

# AI Service
ai_service = AIService()

# Global state
redis_client = None
system_state = {
    "collector": "disconnected",
    "stream": "idle"
}

SETTINGS_VERSION = 1
SETTINGS_FILE = project_root / "data" / "settings" / "settings.json"


def _default_settings() -> Dict[str, Any]:
    return {
        "version": SETTINGS_VERSION,
        "global": {},
        "userProfile": {},
        "aiAssistant": {},
        "dashboard": {},
        "analysis": {},
        "liveTrading": {},
        "riskManager": {},
        "calendarJournal": {},
        "strategyLab": {}
    }


def load_settings() -> Dict[str, Any]:
    try:
        if not SETTINGS_FILE.exists():
            SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            settings = _default_settings()
            SETTINGS_FILE.write_text(json.dumps(settings), encoding="utf-8")
            return settings
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _default_settings()
        if "version" not in data:
            data["version"] = SETTINGS_VERSION
        return data
    except Exception as exc:
        logger.error("Failed to load settings: %s", exc)
        return _default_settings()


def save_settings(settings: Dict[str, Any]) -> None:
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        if "version" not in settings:
            settings["version"] = SETTINGS_VERSION
        SETTINGS_FILE.write_text(json.dumps(settings), encoding="utf-8")
    except Exception as exc:
        logger.error("Failed to save settings: %s", exc)
        raise

# Lifespan context manager (replaces deprecated on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler for startup/shutdown."""
    global redis_client
    
    # === STARTUP ===
    logger.info("Starting API Gateway...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    asyncio.create_task(redis_listener())
    
    yield  # Application runs here
    
    # === SHUTDOWN ===
    logger.info("Shutting down API Gateway...")
    if redis_client:
        await redis_client.close()

# FastAPI Setup (with lifespan)
app = FastAPI(title="QuFLX v2 API Gateway", lifespan=lifespan)

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
                    # Validate payload contract
                    if not validate_market_data(parsed_data):
                        logger.warning(f"Invalid market_data contract: {parsed_data}")
                        # In strict mode we might drop this, but for now we proceed if 'asset' exists
                        # to avoid total stream breakage during dev.
                    
                    # Broadcast to specific room for the asset
                    if 'asset' in parsed_data:
                        asset = parsed_data['asset']
                        
                        # Update system state
                        system_state["last_tick_ts"] = parsed_data.get('timestamp', 0)
                        system_state["last_tick_asset"] = asset
                        
                        # Emit 'market_data' event to room 'market_data:{asset}'
                        await sio.emit('market_data', parsed_data, room=f'market_data:{asset}')
                    else:
                        # Fallback for non-asset specific data (unlikely for market_data)
                        logger.warning(f"Dropping market_data without asset: {parsed_data}")
                        # await sio.emit('market_data', parsed_data) 
                        
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
async def unsubscribe_asset(sid, asset):
    """Allow client to unsubscribe from specific asset updates"""
    logger.info(f"Client {sid} unsubscribed from {asset}")
    await sio.leave_room(sid, f"market_data:{asset}")

@sio.event
async def star_asset(sid, asset):
    """
    Handle asset starring request via Socket.IO.
    Executes asset_control.py to star asset in browser (add to favorites).
    """
    logger.info(f"Client {sid} requested to star asset: {asset}")
    
    try:
        # Run asset_control.py in a separate thread to avoid blocking event loop
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "asset_control.py"))
        
        def run_script():
            return subprocess.run(
                [sys.executable, script_path, "--action", "star_asset", "--asset", asset],
                capture_output=True,
                text=True,
                timeout=10  # 10 second timeout to prevent hanging
            )
            
        # Use asyncio.to_thread for non-blocking execution (Python 3.9+)
        # Or run_in_executor for older versions
        result = await asyncio.to_thread(run_script)
        
        if result.returncode != 0:
            logger.error(f"Error starring asset: {result.stderr}")
            await sio.emit('asset_star_error', {'error': f"Script failed: {result.stderr}"}, room=sid)
            return

        try:
            output_json = json.loads(result.stdout)
            if not output_json.get("ok"):
                error_msg = output_json.get("error", "Unknown error")
                logger.error(f"Asset starring failed: {error_msg}")
                await sio.emit('asset_star_error', {'error': error_msg}, room=sid)
            else:
                logger.info(f"Successfully starred asset: {asset}")
                await sio.emit('asset_starred', {'asset': asset, 'message': output_json.get("data", {}).get("message", "Asset starred")}, room=sid)
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON output from script: {result.stdout}")
            await sio.emit('asset_star_error', {'error': "Invalid script output"}, room=sid)

    except Exception as e:
        logger.error(f"Exception in star_asset: {e}")
        await sio.emit('asset_star_error', {'error': str(e)}, room=sid)

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
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)  # 1 second timeout
            result = sock.connect_ex(('localhost', 9222))
            sock.close()
            chrome_status = (result == 0)
        except Exception as e:
            logger.warning(f"Chrome debugging port check failed: {e}")
        
        status = {
            'redis_connected': redis_status,
            'socket_io_ready': True,
            'chrome_debugging_available': chrome_status,
            'ready_for_assets': redis_status and chrome_status,
            'system_state': system_state,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"Status check requested by {sid}: {status}")
        await sio.emit('backend_status', status, room=sid)
        
    except Exception as e:
        logger.error(f"Error in check_status: {e}")
        await sio.emit('backend_status', {
            'error': str(e),
            'redis_connected': False,
            'socket_io_ready': False,
            'chrome_debugging_available': False,
            'ready_for_assets': False,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, room=sid)

# REST Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "api-gateway"}

@app.get("/api/v1/status")
async def get_status():
    return system_state


@app.get("/api/v1/settings")
async def get_settings():
    return load_settings()


@app.put("/api/v1/settings")
async def update_settings(payload: Dict[str, Any] = Body(...)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings payload must be an object")
    current = load_settings()
    merged = {**current, **payload}
    save_settings(merged)
    return merged

@app.post("/api/v1/ai/ask")
async def ask_ai(payload: Dict[str, Any] = Body(...)):
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    asset = payload.get("asset")
    timeframe = payload.get("timeframe")

    context: Dict[str, Any] = {}
    if isinstance(asset, str) and asset.strip():
        context["asset"] = asset.strip()
    if isinstance(timeframe, str) and timeframe.strip():
        context["timeframe"] = timeframe.strip()

    image_raw = payload.get("image_base64")
    image: Optional[str] = None
    if isinstance(image_raw, str) and image_raw.strip():
        image = image_raw.strip()

    try:
        result = await ai_service.ask(prompt=prompt, context=context or None, image=image)
        return result
    except Exception as exc:
        logger.error("AI ask failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI request failed")


@app.post("/api/v1/screenshots/chart")
async def save_chart_screenshot(payload: Dict[str, Any] = Body(...)):
    raw_image = payload.get("image_base64")
    if not isinstance(raw_image, str) or not raw_image.strip():
        raise HTTPException(status_code=400, detail="image_base64 (non-empty string) is required")

    annotated = bool(payload.get("annotated", False))
    asset = payload.get("asset") or "chart"
    timeframe = payload.get("timeframe") or "tf"

    if raw_image.startswith("data:"):
        _, _, data_part = raw_image.partition(",")
        if not data_part:
            raise HTTPException(status_code=400, detail="Invalid data URL for image_base64")
        image_payload = data_part
    else:
        image_payload = raw_image

    try:
        image_bytes = base64.b64decode(image_payload)
    except Exception as exc:
        logger.error("Failed to decode screenshot payload: %s", exc)
        raise HTTPException(status_code=400, detail="image_base64 is not valid base64 data")

    project_root = Path(__file__).resolve().parents[3]
    screenshots_dir = project_root / "data" / "screenshots"
    try:
        screenshots_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        logger.error("Failed to create screenshots directory: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to prepare screenshots directory")

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_asset = re.sub(r"[^\w\-]+", "_", str(asset)) or "chart"
    safe_timeframe = re.sub(r"[^\w\-]+", "_", str(timeframe)) or "tf"
    suffix = "_annotated" if annotated else ""
    filename = f"{safe_asset}_{safe_timeframe}_{ts}{suffix}.png"
    file_path = screenshots_dir / filename

    try:
        with file_path.open("wb") as f:
            f.write(image_bytes)
    except Exception as exc:
        logger.error("Failed to write screenshot file: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save screenshot")

    relative_path = str(file_path.relative_to(project_root))
    logger.info("Saved chart screenshot: %s", relative_path)

    return {
        "status": "ok",
        "path": relative_path,
        "filename": filename,
        "annotated": annotated,
    }

@app.get("/api/v1/history/{asset}")
async def get_history(asset: str, timeframe: int = 1, limit: int = 100):
    asset_clean = re.sub(r"[^\w\-_]", "_", asset)
    root = Path(__file__).resolve().parents[3]
    csv_path = root / "data" / "data_output" / "history" / asset_clean / f"{int(timeframe)}.csv"

    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"History not found for {asset} @ {timeframe}m")

    rows: deque[Dict[str, Any]] = deque(maxlen=max(1, int(limit)))
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header is None:
            return {"asset": asset, "timeframe": int(timeframe), "data": []}

        for row in reader:
            if len(row) < 6:
                continue
            try:
                ts = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
                rows.append(
                    {
                        "timestamp": ts,
                        "asset": asset,
                        "timeframe": f"{int(timeframe)}m",
                        "open": float(row[1]),
                        "high": float(row[2]),
                        "low": float(row[3]),
                        "close": float(row[4]),
                        "volume": int(float(row[5])),
                    }
                )
            except Exception:
                continue

    return {"asset": asset, "timeframe": int(timeframe), "count": len(rows), "data": list(rows)}


@app.post("/api/v1/indicators")
async def get_indicators(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="asset required")

    timeframe = payload.get("timeframe", "1m")
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf.endswith("m"):
            try:
                timeframe_min = max(1, int(tf[:-1]))
            except Exception:
                timeframe_min = 1
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))

    indicator_keys = payload.get("indicators") or []
    if not isinstance(indicator_keys, list):
        raise HTTPException(status_code=400, detail="indicators must be a list if provided")

    limit = int(payload.get("limit", 300))
    asset_clean = re.sub(r"[^\w\-_]", "_", asset)
    root = Path(__file__).resolve().parents[3]
    csv_path = root / "data" / "data_output" / "history" / asset_clean / f"{int(timeframe_min)}.csv"

    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"History not found for {asset} @ {timeframe_min}m")

    records: List[Dict[str, Any]] = []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header is None:
            return {
                "asset": asset,
                "timeframe_minutes": timeframe_min,
                "series": {},
                "latest_timestamp": None,
            }

        for row in reader:
            if len(row) < 6:
                continue
            try:
                ts = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
                records.append(
                    {
                        "timestamp": ts,
                        "asset": asset,
                        "open": float(row[1]),
                        "high": float(row[2]),
                        "low": float(row[3]),
                        "close": float(row[4]),
                    }
                )
            except Exception:
                continue

    if not records:
        return {
            "asset": asset,
            "timeframe_minutes": timeframe_min,
            "series": {},
            "latest_timestamp": None,
        }

    if limit > 0 and len(records) > limit:
        records = records[-limit:]

    df = pd.DataFrame.from_records(records)

    if "timestamp" in df.columns:
        df = df.sort_values("timestamp")

    raw_params = payload.get("params") or {}
    indicator_params: Dict[str, Any] = {}

    if isinstance(raw_params, dict):
        for key, params in raw_params.items():
            if not isinstance(params, dict):
                continue

            if key == "rsi_14":
                period = params.get("period")
                try:
                    if period is not None:
                        indicator_params["rsi_period"] = int(period)
                except (ValueError, TypeError):
                    pass

            if key == "macd_histogram":
                fast = params.get("fast")
                slow = params.get("slow")
                signal = params.get("signal")
                try:
                    if fast is not None:
                        indicator_params["macd_fast"] = int(fast)
                except (ValueError, TypeError):
                    pass
                try:
                    if slow is not None:
                        indicator_params["macd_slow"] = int(slow)
                except (ValueError, TypeError):
                    pass
                try:
                    if signal is not None:
                        indicator_params["macd_signal"] = int(signal)
                except (ValueError, TypeError):
                    pass

            if key == "cci":
                period = params.get("period")
                try:
                    if period is not None:
                        indicator_params["cci_period"] = int(period)
                except (ValueError, TypeError):
                    pass

            if key == "demarker":
                period = params.get("period")
                try:
                    if period is not None:
                        indicator_params["demarker_period"] = int(period)
                except (ValueError, TypeError):
                    pass

    config = {"indicator_params": indicator_params} if indicator_params else None
    pipeline = TechnicalIndicatorsPipeline(config=config)
    df_ind = pipeline.calculate_indicators(df)

    if "timestamp" in df_ind.columns:
        df_ind = df_ind.sort_values("timestamp")

    if indicator_keys:
        available_cols = set(df_ind.columns)
        indicator_keys = [k for k in indicator_keys if k in available_cols]

    if not indicator_keys:
        indicator_keys = [
            "rsi_14",
            "macd",
            "macd_signal",
            "macd_histogram",
            "cci",
            "demarker",
        ]

    latest_ts = float(df_ind["timestamp"].iloc[-1]) if "timestamp" in df_ind.columns else float(records[-1]["timestamp"])

    series: Dict[str, List[Dict[str, Any]]] = {}
    for key in indicator_keys:
        if key not in df_ind.columns:
            continue
        series_data: List[Dict[str, Any]] = []
        for _, row in df_ind[["timestamp", key]].iterrows():
            value = row.get(key)
            if pd.isna(value):
                continue
            series_data.append({"time": float(row["timestamp"]), "value": float(value)})
        series[key] = series_data

    return {
        "asset": asset,
        "timeframe_minutes": timeframe_min,
        "series": series,
        "latest_timestamp": latest_ts,
    }

@app.post("/api/v1/refresh-assets")
async def refresh_assets(payload: Dict[str, Any] = Body(...)):
    """
    Executes V2 capability: RefreshAssets with configurable parameters
    """
    try:
        # Extract parameters with defaults
        min_pct = int(payload.get("min_pct", 92))
        max_assets = payload.get("max_assets")  # NEW: Optional limit on number of assets to star
        target_assets = payload.get("target_assets")  # NEW: Optional specific assets to target
        sweep_all = bool(payload.get("sweep_all", True))
        unstar_below = bool(payload.get("unstar_below", True))
        filter_mode = payload.get("filter_mode")

        if filter_mode not in ("otc", "fx"):
            filter_mode = None
        
        # Build inputs for capability
        inputs = {
            "min_pct": min_pct,
            "sweep_all": sweep_all,
            "unstar_below": unstar_below,
            "filter_mode": filter_mode,
            "max_assets": max_assets,  # NEW
            "target_assets": target_assets,  # NEW
        }
        
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))
        
        # Run the runner script with UTF-8 encoding
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        
        result = subprocess.run(
            [sys.executable, runner_path, "refresh_assets", "--inputs", json.dumps(inputs)],
            capture_output=True,
            text=True,
            env=env
        )
        
        if result.returncode != 0:
            logger.error(f"Error refreshing assets: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")
            
        try:
            output_json = _parse_script_json(result.stdout)
            if not output_json.get("ok"):
                raise HTTPException(status_code=500, detail=f"Script returned error: {output_json.get('error')}")

            data = output_json.get("data", {})
            processed = data.get("processed", {})
            selected_now = processed.get("selected_now", []) if isinstance(processed, dict) else []
            already_favorited = processed.get("already_favorited", []) if isinstance(processed, dict) else []
            eligible = [a for a in (selected_now + already_favorited) if isinstance(a, str)]
            assets = sorted({a for a in eligible})

            return {
                "assets": assets,
                "metadata": {
                    "total_processed": processed.get("counts", {}).get("rows_seen", 0),
                    "starred_now": len(selected_now),
                    "already_favorited": len(already_favorited),
                    "skipped_max_limit": processed.get("counts", {}).get("skipped_max_limit", 0),
                    "max_assets_limit": max_assets,
                    "target_assets_specified": bool(target_assets),
                    "filter_mode": filter_mode,
                },
            }

        except Exception as e:
            logger.error(f"Invalid JSON output from refresh_assets: {e} | raw={result.stdout}")
            raise HTTPException(status_code=500, detail="Invalid script output")
            
    except Exception as e:
        logger.error(f"Refresh assets failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/bootstrap-history")
async def bootstrap_history(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    if not asset:
        raise HTTPException(status_code=400, detail="asset required")

    timeframe = payload.get("timeframe", "1m")
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf.endswith("m"):
            try:
                timeframe_min = max(1, int(tf[:-1]))
            except Exception:
                timeframe_min = 1
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))

    duration_s = int(payload.get("duration", 0))

    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))
        result = subprocess.run(
            [
                sys.executable,
                runner_path,
                "history_collector",
                "--inputs",
                json.dumps({"action": "collect", "asset": asset, "timeframe": timeframe_min, "duration": duration_s}),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            logger.error(f"Bootstrap history failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")

        try:
            out = _parse_script_json(result.stdout)
        except Exception as e:
            logger.error(f"Invalid bootstrap history output: {e} | raw={result.stdout}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error")))

        data = out.get("data", {})
        candles = data.get("candles") or []

        try:
            _persist_history_csv(asset, timeframe_min, candles)
        except Exception as e:
            logger.error(f"Failed to persist bootstrap history CSV: {e}")

        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe_min,
            "count": data.get("count", 0),
            "candles": candles,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bootstrap history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/ai/ask")
async def ai_ask(payload: Dict[str, Any] = Body(...)):
    """AI Ask endpoint scaffold.

    Accepts a user prompt and optional structured context, forwards it to the
    AIService, and returns a normalized response.
    """
    prompt = payload.get("prompt")
    if not prompt or not isinstance(prompt, str):
        raise HTTPException(status_code=400, detail="prompt (string) is required")

    context = payload.get("context")
    if context is not None and not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="context must be an object if provided")

    image = payload.get("image")
    if image is not None and not isinstance(image, str):
        raise HTTPException(status_code=400, detail="image must be a string (base64) if provided")

    try:
        result = await ai_service.ask(prompt=prompt, context=context or {}, image=image)
        answer = result.get("answer", "")
        meta = result.get("meta", {})
        return {"answer": answer, "meta": meta}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI ask failed: {e}")
        raise HTTPException(status_code=500, detail="AI service error")

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
            
        output_json = _parse_script_json(result.stdout)
        if not output_json.get("ok"):
             raise HTTPException(status_code=500, detail=f"Selection failed: {output_json.get('error')}")
             
        return {"status": "success", "message": f"Selected {asset}"}
        
    except Exception as e:
        logger.error(f"Select asset failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/collect-history")
async def collect_history(payload: Dict[str, Any] = Body(default_factory=dict)):
    """
    Executes V2 capability: CollectHistory
    Iterates through high-payout assets to allow data collection.
    """
    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py"))

        duration = int(payload.get("duration", 10))
        timeframe = payload.get("timeframe", "1m")

        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/data_output/logs"))
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, f"collect_history_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log")

        log_f = open(log_path, "w", encoding="utf-8")
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        proc = subprocess.Popen(
            [
                sys.executable,
                runner_path,
                "collect_history",
                "--verbose",
                "--inputs",
                json.dumps({"duration": duration, "timeframe": timeframe}),
            ],
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env=env,
        )

        return {"status": "started", "message": "History collection started in background", "pid": proc.pid, "log_path": log_path}

    except Exception as e:
        logger.error(f"Collect history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/get-assets")
async def get_assets(payload: Dict[str, Any] = Body(...)):
    min_pct = int(payload.get("min_pct", 92))
    sweep_all = bool(payload.get("sweep_all", True))
    unstar_below = bool(payload.get("unstar_below", True))
    dry_run = bool(payload.get("dry_run", False))
    close_after = bool(payload.get("close_after", True))
    filter_mode = payload.get("filter_mode")

    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/favorite_star_select.py"))
        args = [sys.executable, script_path, "--min-pct", str(min_pct)]
        if sweep_all:
            args.append("--sweep-all")
        else:
            args.append("--no-sweep")
        if unstar_below:
            args.append("--unstar-below")
        else:
            args.append("--no-unstar")
        if dry_run:
            args.append("--dry-run")
        if not close_after:
            args.append("--no-close")
        if filter_mode == "otc":
            args.append("--star-otc")
        elif filter_mode == "fx":
            args.append("--star-fx")

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        result = subprocess.run(args, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")

        try:
            out = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error")))

        data = out.get("data", {})
        processed = data.get("processed", {})
        eligible = processed.get("selected_now", []) + processed.get("already_favorited", [])
        return {"ok": True, "data": data, "assets": list({a for a in eligible if isinstance(a, str)})}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/select-timeframe")
async def select_timeframe(payload: Dict[str, str] = Body(...)):
    timeframe = payload.get("timeframe")
    if not timeframe:
        raise HTTPException(status_code=400, detail="Timeframe required")

    normalized = timeframe.strip().lower()

    supported = [
        "ticks",
        "15s",
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
    ]

    if normalized not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe: {timeframe}. Must be one of: {', '.join(supported)}",
        )

    interval_seconds_map = {
        "ticks": 0,
        "15s": 15,
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "30m": 1800,
        "1h": 3600,
    }

    interval_seconds = interval_seconds_map.get(normalized, 0)

    logger.info(f"Timeframe updated: {normalized} (interval_seconds={interval_seconds})")

    return {
        "status": "success",
        "timeframe": normalized,
        "interval_seconds": interval_seconds,
    }


@app.post("/api/v1/sync-timeframe-ui")
async def sync_timeframe_ui(payload: Dict[str, Any] = Body(...)):
    timeframe = payload.get("timeframe")
    if not timeframe:
        raise HTTPException(status_code=400, detail="Timeframe required")

    normalized = str(timeframe).strip().lower()

    supported = [
        "ticks",
        "15s",
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
    ]

    if normalized not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe: {timeframe}. Must be one of: {', '.join(supported)}",
        )

    if normalized == "ticks":
        raise HTTPException(status_code=400, detail="UI sync for 'ticks' timeframe is not supported")

    label_map = {
        "15s": "15s",
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "1h",
    }

    label = label_map.get(normalized)
    if not label:
        raise HTTPException(status_code=400, detail=f"UI sync not configured for timeframe: {normalized}")

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py")
        )

        inputs = {"action": "select_timeframe", "label": label}

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        result = subprocess.run(
            [
                sys.executable,
                runner_path,
                "timeframe_menu",
                "--inputs",
                json.dumps(inputs),
            ],
            capture_output=True,
            text=True,
            env=env,
        )

        if result.returncode != 0:
            logger.error(f"Sync timeframe UI failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")

        try:
            out = _parse_script_json(result.stdout)
        except Exception as e:
            logger.error(f"Invalid sync timeframe UI output: {e} | raw={result.stdout}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raw_error = str(out.get("error") or "timeframe sync failed")
            if raw_error == "open failed":
                detail = (
                    "Failed to open timeframe menu in Pocket Option UI. "
                    "Ensure the trading chart is visible in the attached Chrome session "
                    "and try again."
                )
            else:
                detail = raw_error
            raise HTTPException(status_code=500, detail=detail)

        data = out.get("data", {})

        return {
            "status": "success",
            "timeframe": normalized,
            "label": label,
            "data": data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync timeframe UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/sync-asset-ui")
async def sync_asset_ui(payload: Dict[str, Any] = Body(...)):
    asset = payload.get("asset")
    if not asset or not isinstance(asset, str):
        raise HTTPException(status_code=400, detail="Asset required")

    min_pct = payload.get("min_pct", 92)
    try:
        min_pct_int = int(min_pct)
    except Exception:
        raise HTTPException(status_code=400, detail="min_pct must be an integer")

    try:
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../capabilities_v2/runner.py")
        )

        inputs = {
            "assets": [asset],
            "min_pct": min_pct_int,
            "all": False,
        }

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        result = subprocess.run(
            [
                sys.executable,
                runner_path,
                "favorites_walk_select",
                "--inputs",
                json.dumps(inputs),
                "--verbose",
            ],
            capture_output=True,
            text=True,
            env=env,
        )

        if result.returncode != 0:
            logger.error(f"Sync asset UI failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {result.stderr}")

        try:
            out = _parse_script_json(result.stdout)
        except Exception as e:
            logger.error(f"Invalid sync asset UI output: {e} | raw={result.stdout}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            detail = str(out.get("error") or "asset sync failed")
            raise HTTPException(status_code=500, detail=detail)

        data = out.get("data", {})

        return {
            "status": "success",
            "asset": asset,
            "min_pct": min_pct_int,
            "data": data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync asset UI failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
