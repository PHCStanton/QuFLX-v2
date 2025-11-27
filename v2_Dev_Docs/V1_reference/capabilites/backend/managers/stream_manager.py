import json
import time
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import logging
from pathlib import Path

from backend.context import app_ctx
from backend.extensions import socketio
from backend.chrome_connection import ChromeConnectionManager
from utils.cache_adapter import safe_cache_call
from capabilities.base import Ctx

logger = logging.getLogger(__name__)

class StreamManager:
    """
    Manages the real-time data streaming process, including:
    - Chrome connection monitoring
    - WebSocket data interception
    - Data processing and persistence
    - Socket.IO event emission
    """

    def __init__(self):
        self.root_dir = Path(__file__).parent.parent.parent

    def seed_historical_data(self, asset: str):
        """
        Seed chart with historical data from CSV or WebSocket history.
        """
        historical_candles_to_emit = []
        source_type = 'unknown'

        if app_ctx.is_simulated_mode:
            if hasattr(app_ctx.data_streamer, 'get_historical_candles'):
                simulated_candles = app_ctx.data_streamer.get_historical_candles(asset, count=200)
            else:
                simulated_candles = []
            for candle in simulated_candles:
                timestamp, open_price, close_price, high_price, low_price = candle
                historical_candles_to_emit.append({
                    'asset': asset,
                    'timestamp': timestamp,
                    'open': open_price,
                    'high': high_price,
                    'low': low_price,
                    'close': close_price,
                    'volume': 0,
                    'date': datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat()
                })
            source_type = 'simulated'
            logger.info(f"Generated {len(historical_candles_to_emit)} SIMULATED historical candles")
        else:
            # REAL MODE: Try to load historical candles from CSV files first
            try:
                import pandas as pd
                
                data_collect_dir = self.root_dir / 'data' / 'data_output' / 'assets_data' / 'data_collect' / '1M_candle_data'
                if data_collect_dir.exists():
                    asset_normalized = asset.replace('_', '').lower()
                    matching_files = []
                    
                    for csv_file in data_collect_dir.glob('*.csv'):
                        if asset_normalized in csv_file.stem.lower().replace('_', ''):
                            matching_files.append(csv_file)
                    
                    if matching_files:
                        latest_file = max(matching_files, key=lambda f: f.stat().st_mtime)
                        logger.info(f"Loading historical CSV data from {latest_file.name}")
                        
                        df = pd.read_csv(latest_file)
                        df = df.tail(200)
                        
                        for _, row in df.iterrows():
                            timestamp = int(row['timestamp'])
                            historical_candles_to_emit.append({
                                'asset': asset,
                                'timestamp': timestamp,
                                'open': float(row['open']),
                                'high': float(row['high']),
                                'low': float(row['low']),
                                'close': float(row['close']),
                                'volume': int(row.get('volume', 0) or 0),
                                'date': datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
                            })
                        
                        source_type = 'csv'
                        logger.info(f"Loaded {len(historical_candles_to_emit)} historical candles from CSV")
            except Exception as e:
                logger.error(f"Could not load CSV historical data: {e}")
            
            if not historical_candles_to_emit:
                # Fallback: Try WebSocket historical candles
                historical_candles_ws = app_ctx.data_streamer.get_all_candles(asset) if hasattr(app_ctx.data_streamer, 'get_all_candles') else []
                if historical_candles_ws and len(historical_candles_ws) > 0:
                    for candle in historical_candles_ws:
                        timestamp, open_price, close_price, high_price, low_price = candle
                        historical_candles_to_emit.append({
                            'asset': asset,
                            'timestamp': timestamp,
                            'open': open_price,
                            'high': high_price,
                            'low': low_price,
                            'close': close_price,
                            'volume': 0,
                            'date': datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
                        })
                    source_type = 'websocket'
                    logger.info(f"Emitting {len(historical_candles_to_emit)} WebSocket historical candles")
                else:
                    logger.info(f"No historical data available for {asset}")
        
        if historical_candles_to_emit:
            logger.info(f"Seeding chart with {len(historical_candles_to_emit)} historical candles from {source_type}")
            socketio.emit('historical_candles_loaded', {
                'asset': asset,
                'candles': historical_candles_to_emit,
                'count': len(historical_candles_to_emit),
                'source': source_type,
                'timestamp': datetime.now().isoformat()
            })

    def extract_candle_for_emit(self, asset: str) -> Optional[Dict]:
        """
        Extract latest formed candle and push to Redis.
        Enhanced with Redis integration for real-time streaming.
        """
        if not app_ctx.data_streamer:
            return None
        
        try:
            # Use capability's public API method
            latest_candle = app_ctx.data_streamer.get_latest_candle(asset)
            
            if latest_candle:
                timestamp, open_price, close_price, high_price, low_price = latest_candle
                
                candle_data = {
                    'asset': asset,
                    'timestamp': timestamp,
                    'open': open_price,
                    'high': high_price,
                    'low': low_price,
                    'close': close_price,
                    'volume': 0,
                    'date': datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
                }
                
                # Push to cache for real-time streaming (Redis in local, in-memory in Replit)
                safe_cache_call(app_ctx.redis_integration, 'add_tick_to_buffer', asset, candle_data)
                
                # Publish to Redis Pub/Sub channel
                channel = f"market_data:{asset}"
                safe_cache_call(app_ctx.redis_integration, 'publish', channel, json.dumps(candle_data))
                
                return candle_data
        
        except Exception as e:
            logger.error(f"Error extracting candle: {e}")
        
        return None

    def reset_backend_state(self):
        """
        Reset backend streaming state and clear caches.
        Called on reconnection to ensure clean state.
        """
        app_ctx.state_manager.reset_backend_state()
        
        # Reset capability state
        if app_ctx.data_streamer and hasattr(app_ctx.data_streamer, '_reset_stream_state') and hasattr(app_ctx.data_streamer, 'PERIOD'):
            app_ctx.data_streamer._reset_stream_state(inputs={'period': app_ctx.data_streamer.PERIOD})

    def monitor_chrome_status(self):
        """
        Background thread to monitor Chrome connection status and emit updates to clients.
        Only attempts automatic reconnection when state_manager.chrome_reconnect_enabled is True (Platform mode active).
        """
        last_status = None
        
        while not app_ctx.shutdown_event.is_set():
            try:
                current_status = "connected" if app_ctx.is_chrome_connected() else "not connected"
                
                # Check if Chrome is still responsive
                if app_ctx.is_chrome_connected():
                    try:
                        driver = app_ctx.get_chrome_driver()
                        if driver:
                            _ = driver.current_url
                            app_ctx.state_manager.reset_reconnection_attempts()  # Reset counter on successful check
                    except Exception:
                        logger.warning("Chrome connection lost - marking as disconnected")
                        current_status = "not connected"
                        app_ctx.set_chrome_driver(None)
                
                # Attempt Chrome reconnection ONLY if enabled (max 3 attempts per minute)
                backoff_delay = 5  # Default monitoring interval
                
                if not app_ctx.is_chrome_connected() and app_ctx.state_manager.chrome_reconnect_enabled:
                    should_reconnect = app_ctx.state_manager.should_attempt_reconnection()
                    
                    if should_reconnect:
                        app_ctx.state_manager.record_reconnection_attempt()
                        logger.info(f"Attempting Chrome reconnection (attempt {app_ctx.state_manager.chrome_reconnection_attempts}/3)...")
                        
                        # Use backend Chrome connection manager
                        if not app_ctx.chrome_connection_manager:
                            app_ctx.chrome_connection_manager = ChromeConnectionManager(verbose=False)
                        
                        new_driver = app_ctx.chrome_connection_manager.attach_to_chrome() if not app_ctx.is_simulated_mode else None
                        
                        if new_driver:
                            app_ctx.set_chrome_driver(new_driver)
                            current_status = "connected"
                            app_ctx.state_manager.reset_reconnection_attempts()  # FIX: Reset on successful reconnection
                            logger.info("Chrome reconnected successfully!")
                            
                            # Emit reconnection success event
                            socketio.emit('chrome_reconnected', {
                                'timestamp': datetime.now().isoformat(),
                                'attempt': app_ctx.state_manager.chrome_reconnection_attempts
                            })
                        else:
                            # Exponential backoff for failed attempts: 5s, 10s, 20s
                            backoff_delays = {1: 5, 2: 10, 3: 20}
                            backoff_delay = backoff_delays.get(app_ctx.state_manager.chrome_reconnection_attempts, 5)
                            if backoff_delay > 5:
                                logger.info(f"Waiting {backoff_delay}s before next attempt (exponential backoff)...")
                
                # Emit status update if changed
                if current_status != last_status:
                    socketio.emit('connection_status', {
                        'status': 'connected',
                        'chrome': current_status,
                        'timestamp': datetime.now().isoformat()
                    })
                    last_status = current_status
                
                app_ctx.shutdown_event.wait(backoff_delay)  # Interruptible sleep
                
            except Exception as e:
                logger.error(f"Error in Chrome status monitor: {e}")
                app_ctx.shutdown_event.wait(5)

    def extract_tick_data(self, asset: str, payload: Any) -> Optional[Dict]:
        """Helper to extract standardized tick data from payload"""
        try:
            tick_asset = None
            tick_value = None
            tick_timestamp = None
            
            if isinstance(payload, list) and len(payload) > 0:
                if isinstance(payload[0], list) and len(payload[0]) >= 3:
                    tick_asset = payload[0][0]
                    tick_timestamp = int(float(payload[0][1]))
                    tick_value = payload[0][2]
                else:
                    tick_value = payload[-1] if isinstance(payload[-1], (int, float)) else None
                    tick_timestamp = int(time.time())
                    tick_asset = asset
            elif isinstance(payload, dict):
                tick_asset = payload.get('asset') or payload.get('symbol') or asset
                tick_value = payload.get('quote') or payload.get('price') or payload.get('value')
                tick_timestamp = payload.get('timestamp', int(time.time()))
                if isinstance(tick_timestamp, str):
                    tick_timestamp = int(float(tick_timestamp))
            else:
                tick_value = float(payload) if isinstance(payload, (int, float, str)) else None
                tick_timestamp = int(time.time())
                tick_asset = asset
                
            if tick_asset and tick_value is not None and tick_timestamp:
                return {
                    'asset': tick_asset,
                    'value': float(tick_value),
                    'timestamp': tick_timestamp
                }
        except Exception as e:
            logger.error(f"Error extracting tick data: {e}")
        return None

    def process_persistence_data(self, asset: str, payload: Any):
        """
        Extracted persistence logic for better testability and maintainability.
        Handles tick and candle data persistence based on collection mode.
        """
        if not app_ctx.persistence_manager or app_ctx.collect_stream_mode == 'none':
            return
        
        try:
            tick_data = self.extract_tick_data(asset, payload)
            if not tick_data:
                return
                
            tick_asset = tick_data['asset']
            tick_value = tick_data['value']
            tick_timestamp = tick_data['timestamp']
            
            # Save tick data if enabled
            if app_ctx.collect_stream_mode in ['tick', 'both']:
                timestamp_str = datetime.fromtimestamp(tick_timestamp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                app_ctx.persistence_manager.add_tick(tick_asset, timestamp_str, tick_value)
            
            # Save candle data if enabled
            if tick_asset and app_ctx.collect_stream_mode in ['candle', 'both']:
                candles = app_ctx.data_streamer.get_all_candles(tick_asset) if hasattr(app_ctx.data_streamer, 'get_all_candles') else []
                if candles and len(candles) >= 2:
                    closed_upto = len(candles) - 2
                    last_written = app_ctx.state_manager.get_last_closed_candle_index(tick_asset)
                    
                    if closed_upto > last_written:
                        try:
                            period = getattr(app_ctx.data_streamer, 'PERIOD', 60)
                            tfm = max(1, int(period // 60))
                        except (TypeError, ValueError, AttributeError) as e:
                            logger.warning(f"Invalid PERIOD value, using 1m default: {e}")
                            tfm = 1
                        
                        for i in range(last_written + 1, closed_upto + 1):
                            c = candles[i]
                            app_ctx.persistence_manager.add_candle(
                                asset=tick_asset,
                                timeframe_minutes=tfm,
                                candle_ts=c[0],
                                open_price=c[1],
                                close_price=c[2],
                                high_price=c[3],
                                low_price=c[4]
                            )
                        
                        app_ctx.state_manager.set_last_closed_candle_index(tick_asset, closed_upto)
        
        except Exception as e:
            logger.error(f"Error in persistence processing: {e}")

    def stream_from_chrome(self):
        """
        Background thread to capture WebSocket data from Chrome or generate simulated data.
        Enhanced with proper error handling and thread-safe message processing.
        """
        if not app_ctx.is_simulated_mode and not app_ctx.is_chrome_connected():
            logger.info("Chrome not connected. Attempting to connect...")
            if not app_ctx.chrome_connection_manager:
                app_ctx.chrome_connection_manager = ChromeConnectionManager()
            driver = app_ctx.chrome_connection_manager.attach_to_chrome()
            app_ctx.set_chrome_driver(driver)
            if not driver:
                logger.error("Failed to connect to Chrome. Streaming disabled.")
                return
        
        if not app_ctx.is_simulated_mode:
            app_ctx.capability_ctx = Ctx(
                driver=app_ctx.get_chrome_driver(), 
                artifacts_root=None, 
                debug=False, 
                dry_run=False, 
                verbose=True
            )
            logger.info("Starting WebSocket capture from Chrome...")
        
        while not app_ctx.shutdown_event.is_set():
            if app_ctx.state_manager.streaming_active:
                try:
                    if not app_ctx.is_simulated_mode:
                        driver = app_ctx.get_chrome_driver()
                        if not driver:
                            logger.error("Chrome disconnected during streaming - stopping stream")
                            app_ctx.state_manager.streaming_active = False
                            socketio.emit('stream_error', {
                                'error': 'Chrome disconnected',
                                'timestamp': datetime.now().isoformat()
                            })
                            continue
                        
                        logs = driver.get_log('performance')
                        
                        for log_entry in logs:
                            msg_id = f"{log_entry.get('timestamp', 0)}_{hash(log_entry.get('message', ''))}"
                            
                            # Thread-safe message deduplication
                            if msg_id in app_ctx.processed_messages:
                                continue
                            
                            app_ctx.processed_messages.append(msg_id)
                            
                            message = json.loads(log_entry['message'])['message']
                            response = message.get('params', {}).get('response', {})
                            
                            if response.get('opcode', 0) == 2:
                                payload_data = response.get('payloadData')
                                if payload_data and app_ctx.data_streamer:
                                    if not hasattr(app_ctx.data_streamer, '_decode_and_parse_payload'):
                                        continue
                                    payload = app_ctx.data_streamer._decode_and_parse_payload(payload_data)
                                    
                                    if payload:
                                        if 'updateCharts' in str(payload) or 'chartPeriod' in str(payload):
                                            if hasattr(app_ctx.data_streamer, '_process_chart_settings'):
                                                app_ctx.data_streamer._process_chart_settings(payload, app_ctx.capability_ctx)
                                        
                                        if hasattr(app_ctx.data_streamer, '_process_realtime_update'):
                                            app_ctx.data_streamer._process_realtime_update(payload, app_ctx.capability_ctx)
                                        
                                        # Process persistence in separate function
                                        current_focused_asset = app_ctx.data_streamer.get_current_asset() if hasattr(app_ctx.data_streamer, 'get_current_asset') else None
                                        if current_focused_asset:
                                            # Extract and emit tick update
                                            tick_data = self.extract_tick_data(current_focused_asset, payload)
                                            if tick_data:
                                                socketio.emit('tick_update', tick_data)
                                            
                                            self.process_persistence_data(current_focused_asset, payload)
                                            
                                            # Extract processed candle and emit to frontend
                                            candle_data = self.extract_candle_for_emit(current_focused_asset)
                                            if candle_data:
                                                socketio.emit('candle_update', candle_data)
                                                socketio.emit('redis_update', {"data": candle_data})
                    
                    app_ctx.shutdown_event.wait(0.1)  # Interruptible sleep
                    
                except Exception as e:
                    logger.error(f"Error in streaming: {e}")
                    if "chrome" in str(e).lower() or "driver" in str(e).lower():
                        logger.error("Chrome connection error detected - stopping stream")
                        app_ctx.state_manager.streaming_active = False
                        socketio.emit('stream_error', {
                            'error': f'Chrome error: {str(e)}',
                            'timestamp': datetime.now().isoformat()
                        })
                    app_ctx.shutdown_event.wait(1)
            else:
                app_ctx.shutdown_event.wait(0.5)

# Global stream manager instance
stream_manager = StreamManager()
