from datetime import datetime
import logging
from flask_socketio import emit

from backend.context import app_ctx
from backend.extensions import socketio
from backend.managers.stream_manager import stream_manager
from strategies.indicator_adapter import get_indicator_adapter
from utils.data_loader import DataLoader, BacktestEngine
from strategies.quantum_flux_strategy import QuantumFluxStrategy
from capabilities.favorite_star_select import FavoriteStarSelect
from capabilities.base import Ctx

logger = logging.getLogger(__name__)

def socket_error_boundary(error_event: str = 'socket_error'):
    """
    Decorator to add error boundaries around Socket.IO handlers.
    Ensures errors never corrupt WebSocket connections.
    
    Args:
        error_event: Event name to emit on error (default: 'socket_error')
    
    Usage:
        @socketio.on('my_event')
        @socket_error_boundary('my_event_error')
        def handle_my_event(data):
            # Handler code
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in Socket.IO handler '{func.__name__}': {e}")
                import traceback
                traceback.print_exc()
                
                emit(error_event, {
                    'error': str(e),
                    'handler': func.__name__,
                    'timestamp': datetime.now().isoformat()
                })
        
        wrapper.__name__ = func.__name__
        return wrapper
    return decorator

@socketio.on('connect')
def handle_connect():
    """Handle client connection and detect reconnections"""
    chrome_status = "connected" if app_ctx.is_chrome_connected() else "not connected"
    
    # Detect if this is a reconnection
    is_reconnection = app_ctx.state_manager.backend_initialized
    
    if is_reconnection:
        logger.info(f"Client reconnected. Chrome: {chrome_status}")
        stream_manager.reset_backend_state()
        emit('backend_reconnected', {
            'timestamp': datetime.now().isoformat(),
            'chrome_status': chrome_status
        })
    else:
        logger.info(f"Client connected. Chrome: {chrome_status}")
        app_ctx.state_manager.backend_initialized = True
    
    emit('connection_status', {
        'status': 'connected',
        'chrome': chrome_status,
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection with proper cleanup"""
    logger.info("Client disconnected")
    
    # Stop streaming and cleanup resources
    app_ctx.reset_on_disconnect()
    
    # Note: We don't reset backend_initialized here to detect reconnections

@socketio.on('start_stream')
def handle_start_stream(data):
    """Start streaming real-time data (real or simulated based on mode)"""
    if not app_ctx.data_streamer:
        emit('stream_error', {
            'error': 'Data streamer not initialized',
            'timestamp': datetime.now().isoformat()
        })
        return
    
    if data and 'asset' in data:
        app_ctx.state_manager.current_asset = data['asset']
        if app_ctx.is_simulated_mode:
            if hasattr(app_ctx.data_streamer, 'start_streaming'):
                app_ctx.data_streamer.start_streaming([app_ctx.state_manager.current_asset])
        else:
            app_ctx.state_manager.chrome_reconnect_enabled = True
            if not app_ctx.is_chrome_connected():
                emit('stream_error', {
                    'error': 'Chrome not connected',
                    'timestamp': datetime.now().isoformat()
                })
                return  # FIX: Early return to prevent inconsistent state
            if hasattr(app_ctx.data_streamer, 'set_asset_focus'):
                app_ctx.data_streamer.set_asset_focus(app_ctx.state_manager.current_asset)
            if hasattr(app_ctx.data_streamer, 'set_timeframe'):
                app_ctx.data_streamer.set_timeframe(minutes=1, lock=True)
    
    app_ctx.state_manager.streaming_active = True
    
    logger.info(f"Stream started for {app_ctx.state_manager.current_asset}")
    emit('stream_started', {
        'asset': app_ctx.state_manager.current_asset,
        'timestamp': datetime.now().isoformat()
    })
    
    # Seed chart with historical data
    stream_manager.seed_historical_data(app_ctx.state_manager.current_asset)

@socketio.on('stop_stream')
def handle_stop_stream():
    """Stop streaming data (real or simulated)"""
    app_ctx.state_manager.streaming_active = False
    logger.info("Stream stopped")
    emit('stream_stopped', {'timestamp': datetime.now().isoformat()})
    
    # Release resources
    if app_ctx.data_streamer:
        if app_ctx.is_simulated_mode:
            if hasattr(app_ctx.data_streamer, 'stop_streaming'):
                app_ctx.data_streamer.stop_streaming(app_ctx.state_manager.current_asset)
        else:
            if hasattr(app_ctx.data_streamer, 'release_asset_focus'):
                app_ctx.data_streamer.release_asset_focus()
            if hasattr(app_ctx.data_streamer, 'unlock_timeframe'):
                app_ctx.data_streamer.unlock_timeframe()

@socketio.on('change_asset')
def handle_change_asset(data):
    """Change the streaming asset"""
    if data and 'asset' in data:
        app_ctx.state_manager.current_asset = data['asset']
        # Use API method to change asset focus
        if app_ctx.data_streamer and hasattr(app_ctx.data_streamer, 'set_asset_focus'):
            app_ctx.data_streamer.set_asset_focus(app_ctx.state_manager.current_asset)
        
        logger.info(f"Asset changed to {app_ctx.state_manager.current_asset}")
        emit('asset_changed', {
            'asset': app_ctx.state_manager.current_asset,
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('detect_asset')
def handle_detect_asset(data=None):
    """Detect current asset from PocketOption via capability"""
    # Enable Chrome reconnection since Platform mode is active
    app_ctx.state_manager.chrome_reconnect_enabled = True
    
    if not app_ctx.is_chrome_connected():
        logger.info("Chrome not connected for asset detection")
        emit('asset_detection_failed', {
            'error': 'Chrome not connected',
            'timestamp': datetime.now().isoformat()
        })
        return
    
    if not app_ctx.data_streamer or not hasattr(app_ctx.data_streamer, 'detect_asset_from_ui'):
        emit('asset_detection_failed', {
            'error': 'Data streamer not initialized',
            'timestamp': datetime.now().isoformat()
        })
        return
    
    try:
        # Actively detect asset from PocketOption UI
        detected_asset = app_ctx.data_streamer.detect_asset_from_ui(app_ctx.get_chrome_driver())
        
        if detected_asset:
            logger.info(f"Detected asset: {detected_asset}")
            emit('asset_detected', {
                'asset': detected_asset,
                'timestamp': datetime.now().isoformat()
            })
        else:
            logger.info("No asset currently selected in PocketOption")
            emit('asset_detection_failed', {
                'error': 'No asset selected in PocketOption. Please click on an asset in the trading platform.',
                'timestamp': datetime.now().isoformat()
            })
    except Exception as e:
        logger.error(f"Error detecting asset: {e}")
        emit('asset_detection_failed', {
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('store_csv_candles')
def handle_store_csv_candles(data):
    """
    Store CSV candle data in backend for indicator calculation.
    Converts frontend candle format to backend storage format.
    """
    try:
        asset = data.get('asset')
        candles_data = data.get('candles', [])
        
        if not asset:
            emit('csv_storage_error', {'error': 'No asset specified'})
            return
        
        if not candles_data:
            emit('csv_storage_error', {'error': 'No candle data provided'})
            return
        
        # Convert frontend format to backend format
        backend_candles = []
        for candle in candles_data:
            backend_candles.append([
                candle['timestamp'],
                candle['open'],
                candle['close'],
                candle['high'],
                candle['low']
            ])
        
        # Store in backend
        if app_ctx.data_streamer and hasattr(app_ctx.data_streamer, 'CANDLES'):
            app_ctx.data_streamer.CANDLES[asset] = backend_candles
            logger.info(f"Stored {len(backend_candles)} candles for {asset}")
        else:
            raise Exception("Data streamer not initialized or missing CANDLES attribute")
        
        emit('csv_storage_success', {
            'asset': asset,
            'candle_count': len(backend_candles),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"CSV Storage Exception: {e}")
        emit('csv_storage_error', {
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('calculate_indicators')
@socket_error_boundary('indicators_error')
def handle_calculate_indicators(data):
    """Calculate technical indicators for given asset and configuration"""
    try:
        asset = data.get('asset')
        instances = data.get('instances')
        
        if not asset:
            emit('indicators_error', {
                'error': 'No asset specified',
                'timestamp': datetime.now().isoformat()
            })
            return
        
        # Get candles from data_streamer
        if not app_ctx.data_streamer:
            emit('indicators_error', {
                'error': 'Data streamer not initialized',
                'timestamp': datetime.now().isoformat()
            })
            return
        
        candles = app_ctx.data_streamer.get_all_candles(asset) if hasattr(app_ctx.data_streamer, 'get_all_candles') else []

        if not candles:
            emit('indicators_error', {
                'error': f'No candle data available for {asset}',
                'timestamp': datetime.now().isoformat()
            })
            return
        
        # Handle empty instances
        if not instances:
            empty_result = {
                "asset": asset,
                "indicators": {},
                "series": {},
                "signals": {},
                "timestamp": datetime.now().isoformat()
            }
            logger.info(f"No indicators specified for {asset} - sending empty result")
            emit('indicators_calculated', empty_result)
            return
        
        # Use IndicatorAdapter for modular calculation
        logger.info(f"Processing {len(instances)} indicator instances for {asset}")
        
        # Get timeframe period
        timeframe_seconds = app_ctx.data_streamer.PERIOD if hasattr(app_ctx.data_streamer, 'PERIOD') and app_ctx.data_streamer.PERIOD else 60
        
        adapter = get_indicator_adapter()
        result = adapter.calculate_indicators_for_instances(asset, candles, instances, timeframe_seconds)
        
        if 'error' in result:
            logger.error(f"Indicators Error: {result['error']}")
            emit('indicators_error', result)
        else:
            logger.info(f"Calculated {len(result.get('indicators', {}))} indicator instances for {asset}")
            emit('indicators_calculated', result)
            
    except Exception as e:
        logger.error(f"Indicators Exception: {e}")
        import traceback
        traceback.print_exc()
        emit('indicators_error', {
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('run_backtest')
def handle_run_backtest(data):
    """Run strategy backtest on historical data"""
    try:
        file_path = data.get('file_path')
        strategy_type = data.get('strategy', 'quantum_flux')
        
        if not file_path:
            emit('backtest_error', {'error': 'No file path provided'})
            return
        
        loader = DataLoader()
        df = loader.load_csv(file_path)
        candles = loader.df_to_candles(df)
        
        if strategy_type == 'quantum_flux':
            strategy = QuantumFluxStrategy()
        else:
            emit('backtest_error', {'error': f'Unknown strategy: {strategy_type}'})
            return
        
        engine = BacktestEngine(strategy)
        results = engine.run_backtest(candles)
        
        emit('backtest_complete', {
            'results': results,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        emit('backtest_error', {'error': str(e)})

@socketio.on('select_favorites')
def handle_select_favorites(data=None):
    try:
        min_pct = 92
        if isinstance(data, dict) and 'min_pct' in data:
            try:
                min_pct = int(data.get('min_pct') or 92)
            except Exception:
                min_pct = 92
        if not app_ctx.is_chrome_connected() and not app_ctx.is_simulated_mode:
            emit('favorites_updated', {
                'assets': [],
                'min_pct': min_pct,
                'timestamp': datetime.now().isoformat(),
                'error': 'Chrome not connected'
            })
            return
        cap = FavoriteStarSelect()
        ctx = app_ctx.capability_ctx if app_ctx.capability_ctx else Ctx(driver=app_ctx.get_chrome_driver(), artifacts_root=None, debug=False, dry_run=False, verbose=False)
        res = cap.run(ctx, {
            'min_pct': min_pct,
            'sweep_all': True,
            'unstar_below': True,
            'limit_to_visible': True,
            'dry_run': False,
            'close_after': True
        })
        assets = []
        try:
            processed = res.data.get('processed', {}) if hasattr(res, 'data') else {}
            selected_now = processed.get('selected_now') or []
            already_favorited = processed.get('already_favorited') or []
            assets = list({a for a in selected_now + already_favorited if isinstance(a, str)})
        except Exception:
            assets = []
        emit('favorites_updated', {
            'assets': assets,
            'min_pct': min_pct,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        emit('favorites_updated', {
            'assets': [],
            'min_pct': 92,
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        })

@socketio.on('subscribe_redis_updates')
def handle_subscribe_redis_updates(data):
    try:
        asset = data.get('asset') if isinstance(data, dict) else None
        connected = False
        if app_ctx.redis_integration and hasattr(app_ctx.redis_integration, 'is_connected'):
            connected = app_ctx.redis_integration.is_connected()
        emit('redis_subscribed', {
            'asset': asset,
            'connected': connected,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        emit('redis_error', {
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('unsubscribe_redis_updates')
def handle_unsubscribe_redis_updates(data):
    try:
        asset = data.get('asset') if isinstance(data, dict) else None
        emit('redis_unsubscribed', {
            'asset': asset,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        emit('redis_error', {
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('get_redis_status')
def handle_get_redis_status():
    try:
        connected = False
        info = {}
        if app_ctx.redis_integration and hasattr(app_ctx.redis_integration, 'is_connected'):
            connected = app_ctx.redis_integration.is_connected()
        if connected and hasattr(app_ctx.redis_integration, 'get_redis_info'):
            raw = app_ctx.redis_integration.get_redis_info()
            info = {
                'connected_clients': raw.get('connected_clients'),
                'used_memory_human': raw.get('used_memory_human'),
                'redis_version': raw.get('redis_version')
            }
        emit('redis_status', {
            'connected': connected,
            'info': info,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        emit('redis_status', {
            'connected': False,
            'error': {'message': str(e)},
            'timestamp': datetime.now().isoformat()
        })
