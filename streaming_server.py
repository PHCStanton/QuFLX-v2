#!/usr/bin/env python3
"""
Real-time Trading Data Streaming Server for GUI
Connects to Chrome (port 9222) to intercept PocketOption WebSocket data
and streams it to the React frontend via Socket.IO
Enhanced with Redis integration for high-performance data streaming and caching.

REFACTORED: Modular architecture with handlers and managers.
"""

from pathlib import Path
from flask import Flask
import threading
import logging
from flask_cors import CORS

# Suppress pandas-ta compatibility warning for Python 3.11
import warnings
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=UserWarning)
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=Warning)

# Backend module imports
from backend.context import app_ctx
from backend.extensions import socketio
from backend.managers.stream_manager import stream_manager
from backend.handlers.api_handlers import api_bp
import backend.handlers.socketio_handlers  # Register SocketIO handlers

# Database integration imports
from backend.db_integrations.redis_batch_processor import RedisBatchProcessor

# Cache adapter for environment-agnostic caching (Redis in local, in-memory in Replit)
from utils.cache_adapter import create_cache_adapter, safe_cache_call

# Import Chrome interception logic from capabilities
from capabilities.data_streaming import RealtimeDataStreaming

# Import persistence manager
from backend.persistence_manager import StreamPersistenceManager

# Import simulated streaming capability
from capabilities.simulated_streaming import SimulatedStreamingCapability
from backend.chrome_connection import ChromeConnectionManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Define root directory
root_dir = Path(__file__).parent

# Flask app setup
app = Flask(__name__)

# Enable CORS for all routes
CORS(app)


# Initialize SocketIO with app
socketio.init_app(
    app, 
    cors_allowed_origins="*", 
    async_mode='gevent',
    ping_timeout=60,  # Increased for Replit network latency
    ping_interval=25,  # Increased for better stability
    logger=True,
    engineio_logger=True,
    always_connect=True
)

# Register API Blueprint
app.register_blueprint(api_bp)

# ========================================
# Main Entry Point
# ========================================

def initialize_cache():
    """
    Initialize cache adapter (Redis in local, in-memory in Replit).
    Environment-aware initialization with automatic fallback.
    """
    try:
        # Create environment-appropriate cache adapter
        app_ctx.redis_integration = create_cache_adapter()
        
        cache_info = safe_cache_call(app_ctx.redis_integration, 'get_cache_info')
        logger.info(f"✅ Cache adapter initialized: {cache_info.get('type', 'unknown')}")
        
        # Only initialize batch processor if using Redis (has RedisBatchProcessor dependency)
        if cache_info.get('type') == 'redis':
            try:
                from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
                supabase_queries = SupabaseDataQueries()
                
                # RedisBatchProcessor expects RedisIntegration, so we need the underlying instance
                if hasattr(app_ctx.redis_integration, 'redis_integration'):
                    app_ctx.batch_processor = RedisBatchProcessor(
                        redis_integration=app_ctx.redis_integration.redis_integration,
                        supabase_queries=supabase_queries
                    )
                    app_ctx.batch_processor.start_processing()
                    logger.info("✅ Redis batch processor started")
            except Exception as e:
                logger.warning(f"⚠️ Batch processor initialization skipped: {e}")
        else:
            logger.info("ℹ️ In-memory cache mode - batch processor not needed")
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to initialize cache: {e}")
        app_ctx.redis_integration = None
        return False

if __name__ == '__main__':
    import argparse
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='QuantumFlux Trading Platform - GUI Backend Server')
    parser.add_argument(
        '--collect-stream',
        choices=['tick', 'candle', 'both', 'none'],
        default='none',
        help='Enable optional data collection (default: none)'
    )
    parser.add_argument(
        '--candle-chunk-size',
        type=int,
        default=100,
        help='Number of candles per CSV file chunk (default: 100)'
    )
    parser.add_argument(
        '--tick-chunk-size',
        type=int,
        default=1000,
        help='Number of ticks per CSV file chunk (default: 1000)'
    )
    parser.add_argument(
        '--simulated-mode',
        action='store_true',
        help='Enable simulated data streaming for testing'
    )
    
    args = parser.parse_args()
    app_ctx.collect_stream_mode = args.collect_stream
    app_ctx.is_simulated_mode = args.simulated_mode

    logger.info("=" * 60)
    logger.info("QuantumFlux Trading Platform - GUI Backend Server")
    logger.info("=" * 60)

    # Initialize data_streamer based on mode
    if app_ctx.is_simulated_mode:
        logger.info("\n" + "="*80)
        logger.info("⚠️  SIMULATED DATA MODE ENABLED")
        logger.info("   Using simulated data stream for testing - NO real market connection")
        logger.info("="*80 + "\n")
        app_ctx.data_streamer = SimulatedStreamingCapability(period_seconds=60)
    else:
        logger.info("\n" + "="*80)
        logger.info("✅ REAL DATA MODE ENABLED")
        logger.info("   Using real market data - requires Chrome connection to PocketOption")
        logger.info("="*80 + "\n")
        app_ctx.data_streamer = RealtimeDataStreaming()
    
    # Initialize persistence manager if collection is enabled
    if app_ctx.collect_stream_mode != 'none':
        candle_dir = root_dir / "data" / "data_output" / "assets_data" / "realtime_stream" / "1M_candle_data"
        tick_dir = root_dir / "data" / "data_output" / "assets_data" / "realtime_stream" / "1M_tick_data"
        
        app_ctx.persistence_manager = StreamPersistenceManager(
            candle_dir=candle_dir,
            tick_dir=tick_dir,
            candle_chunk_size=args.candle_chunk_size,
            tick_chunk_size=args.tick_chunk_size,
        )
        logger.info(f"\nStream collection enabled: {app_ctx.collect_stream_mode}")
        logger.info(f"  Candle output: {candle_dir}")
        logger.info(f"  Tick output: {tick_dir}")
        logger.info(f"  Chunk sizes: candles={args.candle_chunk_size}, ticks={args.tick_chunk_size}")
    else:
        logger.info("\nStream collection disabled (use --collect-stream to enable)")
    
    # Initialize cache adapter (Redis in local, in-memory in Replit)
    if not initialize_cache():
        logger.warning("⚠️ Cache initialization failed - continuing without cache")
    
    # Startup mode handling
    if app_ctx.is_simulated_mode:
        logger.info("\n🎲 SIMULATED MODE - skipping Chrome connection")
        logger.info("Simulated data will be generated for testing")
        app_ctx.stream_thread = threading.Thread(target=stream_manager.stream_from_chrome, daemon=True)
        app_ctx.stream_thread.start()
        logger.info("Simulated streaming thread started")
    else:
        logger.info("\nAttempting to connect to Chrome...")
        app_ctx.chrome_connection_manager = ChromeConnectionManager(verbose=True)
        driver = app_ctx.chrome_connection_manager.attach_to_chrome()
        app_ctx.set_chrome_driver(driver)
        
        app_ctx.monitor_thread = threading.Thread(target=stream_manager.monitor_chrome_status, daemon=True)
        app_ctx.monitor_thread.start()
        logger.info("Chrome status monitor started")
        
        if driver:
            logger.info("Chrome connected successfully")
            app_ctx.stream_thread = threading.Thread(target=stream_manager.stream_from_chrome, daemon=True)
            app_ctx.stream_thread.start()
            logger.info("WebSocket streaming thread started")
        else:
            logger.warning("Chrome not connected. Live streaming will be unavailable.")
            logger.info("To enable: Start Chrome with --remote-debugging-port=9222")
    
    logger.info(f"\nStarting server on http://0.0.0.0:3001")
    logger.info("=" * 60)
    
    # Use gevent WSGI server for production-like stability
    # from gevent import pywsgi
    # from geventwebsocket.handler import WebSocketHandler
    
    # server = pywsgi.WSGIServer(('0.0.0.0', 3001), app, handler_class=WebSocketHandler)
    # server.serve_forever()
    try:
        socketio.run(app, host='0.0.0.0', port=3001)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
