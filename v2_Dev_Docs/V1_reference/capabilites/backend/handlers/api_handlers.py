from flask import Blueprint, jsonify, request, send_file
from datetime import datetime
import logging
from pathlib import Path

from backend.context import app_ctx
from utils.cache_adapter import safe_cache_call

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

# Define root directory relative to this file
# backend/handlers/api_handlers.py -> backend/handlers -> backend -> root
root_dir = Path(__file__).parent.parent.parent

@api_bp.route('/health')
def health():
    chrome_status = "connected" if app_ctx.is_chrome_connected() else "disconnected"
    redis_connected = False
    redis_info = {}
    try:
        if app_ctx.redis_integration and hasattr(app_ctx.redis_integration, 'is_connected'):
            redis_connected = app_ctx.redis_integration.is_connected()
        if redis_connected and hasattr(app_ctx.redis_integration, 'get_redis_info'):
            info = app_ctx.redis_integration.get_redis_info()
            redis_info = {
                "connected_clients": info.get("connected_clients"),
                "used_memory_human": info.get("used_memory_human"),
                "redis_version": info.get("redis_version"),
            }
    except Exception as e:
        logger.warning(f"Redis status unavailable: {e}")
    return jsonify({
        "status": "healthy",
        "chrome": chrome_status,
        "redis": {
            "connected": redis_connected,
            "info": redis_info
        },
        "timestamp": datetime.now().isoformat()
    })

@api_bp.route('/api/available-csv-files')
def get_available_csv_files():
    """Get list of all available CSV files with path traversal protection"""
    try:
        timeframe_filter = request.args.get('timeframe', None)
        
        base_dir = root_dir / 'data' / 'data_output' / 'assets_data'
        
        # Validate base directory exists
        if not base_dir.exists():
            return jsonify({"error": "Data directory not found"}), 404
        
        search_dirs = {
            '1m': [base_dir / 'data_collect' / '1M_candles', base_dir / 'data_collect' / '1M_candles_utc', base_dir / 'realtime_stream' / '1M_candle_data'],
            '5m': [base_dir / 'data_collect' / '5M_candles', base_dir / 'data_collect' / '5M_candles_utc'],
            '15m': [base_dir / 'data_collect' / '15M_candles', base_dir / 'data_collect' / '15M_candles_utc'],
            '1h': [base_dir / 'data_collect' / '1H_candles', base_dir / 'data_collect' / '1H_candles_utc'],
            '4h': [base_dir / 'data_collect' / '4H_candles', base_dir / 'data_collect' / '4H_candles_utc'],
            'tick': [base_dir / 'data_collect' / '0M_candles', base_dir / 'realtime_stream' / '1M_tick_data'],
        }
        
        files_to_search = []
        if timeframe_filter and timeframe_filter in search_dirs:
            files_to_search.extend(search_dirs[timeframe_filter])
        else:
            for dirs in search_dirs.values():
                files_to_search.extend(dirs)
        
        found_files = []
        for dir_path in files_to_search:
            if dir_path.exists() and dir_path.is_dir():
                # Security: Ensure we stay within base_dir
                if not str(dir_path.resolve()).startswith(str(base_dir.resolve())):
                    continue
                
                for filepath in dir_path.glob('*.csv'):
                    try:
                        # Security: Validate file is within allowed directory
                        if not str(filepath.resolve()).startswith(str(base_dir.resolve())):
                            continue
                        
                        file_info = {
                            "filename": filepath.name,
                            "asset": filepath.name.split('_')[0],
                            "timeframe": timeframe_filter if timeframe_filter else "mixed",
                            "path": str(filepath.relative_to(root_dir))  # Use relative path
                        }
                        found_files.append(file_info)
                    except Exception as e:
                        logger.error(f"Error processing file {filepath}: {e}")
        
        return jsonify(found_files)
    
    except Exception as e:
        logger.error(f"Error in get_available_csv_files: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500

@api_bp.route('/api/csv-data/<path:filename>')
def serve_csv_file(filename):
    """Serve CSV file content with path traversal protection"""
    
    # Security: Validate filename doesn't contain path traversal
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': 'Invalid filename'}), 400
    
    base_dir = root_dir / 'data' / 'data_output' / 'assets_data'
    
    search_dirs = [
        base_dir / 'realtime_stream' / '1M_candle_data',
        base_dir / 'realtime_stream' / '1M_tick_data',
        base_dir / 'data_collect' / '1M_candles',
        base_dir / 'data_collect' / '5M_candles',
        base_dir / 'data_collect' / '15M_candles',
        base_dir / 'data_collect' / '1H_candles',
        base_dir / 'data_collect' / '4H_candles',
        base_dir / 'data_collect' / '0M_candles',
        base_dir / 'data_collect' / '1M_candles_utc',
        base_dir / 'data_collect' / '5M_candles_utc',
        base_dir / 'data_collect' / '15M_candles_utc',
    ]
    
    for search_dir in search_dirs:
        filepath = search_dir / filename
        
        # Security: Ensure resolved path is within base_dir
        try:
            if filepath.exists() and str(filepath.resolve()).startswith(str(base_dir.resolve())):
                return send_file(str(filepath), mimetype='text/csv')
        except Exception as e:
            logger.error(f"Error serving file {filename}: {e}")
            continue
    
    return jsonify({'error': 'File not found'}), 404

@api_bp.route('/api/available-assets')
def get_available_assets():
    """Get list of all available assets from Supabase database"""
    try:
        from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
        
        querier = SupabaseDataQueries()
        assets = querier.get_available_assets()
        
        if not assets:
            return jsonify({
                'success': False,
                'assets': [],
                'count': 0,
                'message': 'No assets found in database'
            })
        
        return jsonify({
            'success': True,
            'assets': assets,
            'count': len(assets)
        })
    
    except Exception as e:
        logger.error(f"Error getting available assets: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'assets': [],
            'count': 0
        }), 500

@api_bp.route('/api/historical-data/<asset>')
def get_historical_data(asset):
    """
    Get historical candle data for a specific asset
    Checks Redis cache first, falls back to Supabase
    """
    try:
        from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
        
        timeframe = request.args.get('timeframe', '1m')
        limit = int(request.args.get('limit', 1000))
        
        data_source = 'supabase'
        
        # Step 1: Check cache first (Redis in local, in-memory in Replit)
        cached_data = safe_cache_call(app_ctx.redis_integration, 'get_cached_historical_candles', asset, timeframe)
        if cached_data:
            data_source = 'cache'
            logger.info(f"Cache hit for {asset} {timeframe}")
        
        # Step 2: If cache hit, return cached data
        if cached_data:
            return jsonify({
                'success': True,
                'asset': asset,
                'timeframe': timeframe,
                'data': cached_data,
                'count': len(cached_data),
                'source': data_source,
                'cache_hit': True
            })
        
        # Step 3: Cache miss - query Supabase
        logger.info(f"Cache miss for {asset} {timeframe} - querying Supabase")
        querier = SupabaseDataQueries()
        df = querier.get_candles(asset, timeframe, limit=limit)
        
        if df.empty:
            return jsonify({
                'success': True,
                'asset': asset,
                'timeframe': timeframe,
                'data': [],
                'count': 0,
                'source': 'supabase',
                'cache_hit': False,
                'message': f'No historical data found for {asset}'
            })
        
        # Convert DataFrame to JSON format
        candles = []
        for _, row in df.iterrows():
            candles.append({
                'timestamp': int(row['timestamp'].timestamp()),
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': int(row.get('volume', 0)),
                'date': row['timestamp'].isoformat()
            })
        
        # Step 4: Cache the result (Redis in local, in-memory in Replit)
        if safe_cache_call(app_ctx.redis_integration, 'cache_historical_candles', asset, timeframe, candles):
            logger.info(f"Cached {len(candles)} candles for {asset} {timeframe}")
        
        return jsonify({
            'success': True,
            'asset': asset,
            'timeframe': timeframe,
            'data': candles,
            'count': len(candles),
            'source': data_source,
            'cache_hit': False
        })
    
    except Exception as e:
        logger.error(f"Error getting historical data: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'asset': asset,
            'data': [],
            'count': 0
        }), 500

@api_bp.route('/api/tick-data/<asset>')
def get_tick_data(asset):
    """
    Get tick data for a specific asset.
    Optionally convert to candles if timeframe parameter is provided.
    
    Query params:
        - limit: Maximum number of ticks (default: 10000)
        - start_time: Start Unix timestamp (optional)
        - end_time: End Unix timestamp (optional)
        - convert_to_candles: If 'true', convert ticks to candles
        - timeframe: Target timeframe if converting to candles (e.g., '1m', '5m')
    """
    try:
        from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
        from utils.tick_to_candle_converter import TickToCandleConverter
        
        limit = int(request.args.get('limit', 10000))
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        convert_to_candles = request.args.get('convert_to_candles', 'false').lower() == 'true'
        timeframe = request.args.get('timeframe', '1m')
        
        # Convert time parameters to int if provided
        start_time_int = int(start_time) if start_time else None
        end_time_int = int(end_time) if end_time else None
        
        # Query tick data from Supabase
        querier = SupabaseDataQueries()
        ticks = querier.get_ticks(asset, limit=limit, start_time=start_time_int, end_time=end_time_int)
        
        if not ticks:
            return jsonify({
                'success': True,
                'asset': asset,
                'data': [],
                'count': 0,
                'message': f'No tick data found for {asset}'
            })
        
        # Convert to candles if requested
        if convert_to_candles:
            try:
                converter = TickToCandleConverter()
                candles = converter.convert_ticks_to_candles(ticks, timeframe, pair=asset)
                
                return jsonify({
                    'success': True,
                    'asset': asset,
                    'timeframe': timeframe,
                    'data': candles,
                    'count': len(candles),
                    'source': 'tick_conversion',
                    'tick_count': len(ticks),
                    'converted': True
                })
            except Exception as convert_error:
                logger.error(f"Error converting ticks to candles: {convert_error}")
                return jsonify({
                    'success': False,
                    'error': f"Conversion failed: {str(convert_error)}",
                    'asset': asset
                }), 500
        
        # Return raw tick data
        return jsonify({
            'success': True,
            'asset': asset,
            'data': ticks,
            'count': len(ticks),
            'source': 'supabase',
            'converted': False
        })
    
    except Exception as e:
        logger.error(f"Error getting tick data: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'asset': asset,
            'data': [],
            'count': 0
        }), 500

@api_bp.route('/api/candles/range')
def get_candles_by_range():
    """
    Get historical candle data filtered by date/time range.
    Query params:
        - pair: Asset pair (e.g., EURUSD_otc)
        - timeframe: Candle timeframe (e.g., 1m, 5m, 15m)
        - start: Start timestamp (Unix seconds) or ISO date
        - end: End timestamp (Unix seconds) or ISO date
    """
    try:
        from backend.db_integrations.supabase_data_queries import SupabaseDataQueries
        from datetime import datetime
        
        # Get required parameters
        pair = request.args.get('pair')
        timeframe = request.args.get('timeframe', '1m')
        start_param = request.args.get('start')
        end_param = request.args.get('end')
        
        # Validation
        if not pair:
            return jsonify({
                'success': False,
                'error': 'Missing required parameter: pair'
            }), 400
        
        if not start_param or not end_param:
            return jsonify({
                'success': False,
                'error': 'Missing required parameters: start and end timestamps'
            }), 400
        
        # Convert start/end to Unix timestamps
        try:
            # Try parsing as integer (Unix timestamp)
            start_ts = int(start_param)
        except ValueError:
            # Try parsing as ISO date string
            try:
                start_dt = datetime.fromisoformat(start_param.replace('Z', '+00:00'))
                start_ts = int(start_dt.timestamp())
            except:
                return jsonify({
                    'success': False,
                    'error': 'Invalid start timestamp format. Use Unix seconds or ISO date'
                }), 400
        
        try:
            end_ts = int(end_param)
        except ValueError:
            try:
                end_dt = datetime.fromisoformat(end_param.replace('Z', '+00:00'))
                end_ts = int(end_dt.timestamp())
            except:
                return jsonify({
                    'success': False,
                    'error': 'Invalid end timestamp format. Use Unix seconds or ISO date'
                }), 400
        
        # Query database
        querier = SupabaseDataQueries()
        candles_data = querier.get_candle_data(pair, timeframe, start_ts, end_ts)
        
        if not candles_data:
            return jsonify({
                'success': True,
                'pair': pair,
                'timeframe': timeframe,
                'data': [],
                'count': 0,
                'message': f'No data found for {pair} @ {timeframe} in specified range'
            })
        
        # Convert timestamps to ISO dates for frontend
        for candle in candles_data:
            candle['date'] = datetime.fromtimestamp(candle['timestamp']).isoformat()
        
        return jsonify({
            'success': True,
            'pair': pair,
            'timeframe': timeframe,
            'start': start_ts,
            'end': end_ts,
            'data': candles_data,
            'count': len(candles_data)
        })
    
    except Exception as e:
        logger.error(f"Error getting candles by range: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'data': [],
            'count': 0
        }), 500
