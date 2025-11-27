"""
Supabase Data Query Module for QuFLX

Provides functions to query and retrieve trading data from Supabase database.
Supports time-series queries, asset filtering, and data aggregation.
"""

import pandas as pd
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import logging
import psycopg2
from psycopg2 import pool
from config.supabase_config import DB_HOST, DB_PORT, DB_NAME, DB_PASSWORD, DB_USER

class SupabaseDataQueries:
    """
    Handles all Supabase interactions for the QuFLX trading platform using a connection pool.
    """

    def __init__(self, min_conn: int = 2, max_conn: int = 10):
        """
        Initializes the Supabase client with a connection pool.
        
        Args:
            min_conn: Minimum number of connections to maintain in pool
            max_conn: Maximum number of connections in pool
        """
        self.logger = logging.getLogger(__name__)
        self.connection_pool = None
        try:
            # Debug logging (remove password from logs)
            self.logger.info(f"Connecting to Supabase: host={DB_HOST}, port={DB_PORT}, user={DB_USER}, dbname={DB_NAME}")
            
            self.connection_pool = pool.ThreadedConnectionPool(
                minconn=min_conn,
                maxconn=max_conn,
                dbname=DB_NAME,
                user=DB_USER,  # Fixed: was hardcoded to "postgres"
                password=DB_PASSWORD,
                host=DB_HOST,
                port=DB_PORT
            )
            self.logger.info("✅ Supabase connection pool initialized successfully.")
        except Exception as e:
            self.logger.error(f"❌ Supabase connection pool initialization failed: {e}")
            raise

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection_pool:
            self.connection_pool.closeall()
            self.logger.info("Connection pool closed")
    
    def get_connection(self):
        """
        Gets a connection from the pool.
        """
        if not self.connection_pool:
            raise Exception("Connection pool not initialized")
        return self.connection_pool.getconn()
    
    def return_connection(self, conn):
        """
        Returns a connection to the pool.
        """
        if self.connection_pool and conn:
            self.connection_pool.putconn(conn)

    def execute_query(self, query: str, params: tuple = None) -> Optional[List[Dict[str, Any]]]:
        """
        Executes a read-only SQL query on the Supabase database using a pooled connection.
        """
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor() as cur:
                cur.execute(query, params)
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    return [dict(zip(columns, row)) for row in cur.fetchall()]
                return None
        except Exception as e:
            self.logger.error(f"Error executing Supabase query: {e}")
            if conn:
                conn.rollback()
            return None
        finally:
            if conn:
                self.return_connection(conn)

    def execute_many(self, query: str, data: List[tuple]):
        """
        Executes a query with multiple data rows using a pooled connection.
        """
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor() as cur:
                cur.executemany(query, data)
            conn.commit()
        except Exception as e:
            self.logger.error(f"Error executing many: {e}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self.return_connection(conn)

    def get_asset_id(self, symbol: str) -> Optional[int]:
        """
        Retrieves the asset ID for a given symbol.
        Note: This method is kept for backward compatibility but may not be needed
        since the candles table uses 'pair' directly instead of asset_id.
        """
        query = "SELECT id FROM assets WHERE symbol = %s"
        result = self.execute_query(query, (symbol,))
        return result[0]['id'] if result else None

    def get_candle_data(self, pair: str, timeframe: str, start_timestamp: int, end_timestamp: int) -> Optional[List[Dict[str, Any]]]:
        """
        Retrieves candle data for a given pair and timeframe.
        
        Args:
            pair: Asset pair symbol (e.g., 'EURUSD_otc')
            timeframe: Candle timeframe (e.g., '1m', '5m', '15m')
            start_timestamp: Start time as Unix timestamp (bigint)
            end_timestamp: End time as Unix timestamp (bigint)
        """
        query = """
        SELECT timestamp, open_price as open, high_price as high, 
               low_price as low, close_price as close, volume
        FROM candles
        WHERE pair = %s AND timeframe = %s
        AND timestamp >= %s AND timestamp <= %s
        ORDER BY timestamp ASC
        """
        return self.execute_query(query, (pair, timeframe, start_timestamp, end_timestamp))

    def get_available_asset_symbols(self) -> List[str]:
        """
        Retrieves a list of all available asset symbols.
        """
        query = "SELECT symbol FROM assets"
        result = self.execute_query(query)
        return [row['symbol'] for row in result] if result else []

    def get_timeframes_for_asset(self, symbol: str) -> List[str]:
        """
        Retrieve available timeframes for a given asset.
        Uses 'pair' column from candles table directly.
        """
        query = """
        SELECT DISTINCT timeframe
        FROM candles
        WHERE pair = %s
        ORDER BY timeframe
        """
        result = self.execute_query(query, (symbol,))
        return [row['timeframe'] for row in result] if result else []

    def get_data_summary(self) -> Dict[str, Any]:
        """
        Retrieves a summary of the data available in the database.
        Uses 'pair' column directly.
        """
        query = """
        SELECT pair as symbol, timeframe, COUNT(id) as candle_count,
               MIN(timestamp) as first_candle, MAX(timestamp) as last_candle
        FROM candles
        GROUP BY pair, timeframe
        ORDER BY pair, timeframe
        """
        result = self.execute_query(query)
        return result if result else {}

    def search_candles(self, asset_symbol: str, timeframe: str, search_query: str) -> List[Dict[str, Any]]:
        """
        Search for candles based on a specific query.
        Uses 'pair' column directly.
        """
        # This is a placeholder for a more advanced search feature.
        # For now, it just returns the latest 100 candles.
        query = """
        SELECT timestamp, open_price as open, high_price as high,
               low_price as low, close_price as close, volume
        FROM candles
        WHERE pair = %s AND timeframe = %s
        ORDER BY timestamp DESC
        LIMIT 100
        """
        result = self.execute_query(query, (asset_symbol, timeframe))
        return result if result else []

    def get_available_assets(self) -> List[Dict[str, Any]]:
        """
        Retrieves a list of all available assets with their metadata.
        Returns list of asset dictionaries with symbol, timeframe info, and data availability.
        Gets unique pairs from both candles and historical_ticks tables.
        """
        query = """
        SELECT DISTINCT pair as symbol
        FROM (
            SELECT DISTINCT pair FROM candles
            UNION
            SELECT DISTINCT pair FROM historical_ticks
        ) combined
        ORDER BY symbol
        """
        result = self.execute_query(query)
        
        if not result:
            return []
        
        assets = []
        for row in result:
            symbol = row['symbol']
            timeframes = self.get_timeframes_for_asset(symbol)
            
            # Check if asset has tick data
            has_ticks_query = "SELECT COUNT(*) as count FROM historical_ticks WHERE pair = %s LIMIT 1"
            tick_result = self.execute_query(has_ticks_query, (symbol,))
            has_ticks = tick_result[0]['count'] > 0 if tick_result else False
            
            asset_info = {
                'symbol': symbol,
                'timeframes': timeframes if timeframes else []
            }
            
            # Add tick availability flag
            if has_ticks:
                asset_info['has_tick_data'] = True
            
            assets.append(asset_info)
        
        return assets

    def get_candles(self, asset_symbol: str, timeframe: str, limit: int = 1000) -> pd.DataFrame:
        """
        Retrieves candle data for a given asset symbol and timeframe.
        Returns a pandas DataFrame with columns: timestamp, open, high, low, close, volume.
        Note: timestamp in DB is bigint (Unix timestamp), converted to datetime for pandas.
        
        Supports automatic timeframe normalization (1h ↔ 60m, 4h ↔ 240m).
        """
        # Import timeframe utilities
        try:
            from utils.timeframe_normalization import normalize_timeframe, get_timeframe_variations
            
            # Normalize the requested timeframe
            canonical_timeframe = normalize_timeframe(timeframe)
            
            # Get all valid variations for this timeframe (e.g., '1h' → ['1h', '1H', '60m', '60M'])
            timeframe_variations = get_timeframe_variations(canonical_timeframe)
            
            self.logger.info(f"Querying for {asset_symbol} @ {timeframe} (canonical: {canonical_timeframe}, trying: {timeframe_variations})")
            
        except (ImportError, ValueError) as e:
            # Fallback: If normalization fails, just try the exact timeframe
            self.logger.warning(f"Timeframe normalization unavailable, using exact match: {e}")
            canonical_timeframe = timeframe
            timeframe_variations = [timeframe]
        
        # Try each variation until we find data
        for tf_variant in timeframe_variations:
            query = """
            SELECT timestamp, open_price as open, high_price as high,
                   low_price as low, close_price as close, volume
            FROM candles
            WHERE pair = %s AND timeframe = %s
            ORDER BY timestamp DESC
            LIMIT %s
            """
            
            result = self.execute_query(query, (asset_symbol, tf_variant, limit))
            
            if result:
                self.logger.info(f"Found {len(result)} candles for {asset_symbol} @ {tf_variant}")
                df = pd.DataFrame(result)
                
                # Convert Unix timestamp (bigint) to datetime
                if 'timestamp' in df.columns:
                    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
                
                df = df.sort_values('timestamp', ascending=True)
                
                return df
        
        # No data found with any variation
        self.logger.warning(f"No candles found for: {asset_symbol} with any timeframe variation of {timeframe}")
        return pd.DataFrame()

    def get_ticks(self, pair: str, limit: int = 10000, 
                  start_time: Optional[int] = None, 
                  end_time: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Retrieves tick data for a given asset pair.
        Returns tick records in chronological order (oldest first).
        
        Args:
            pair: Asset pair symbol (e.g., 'EURUSD_otc')
            limit: Maximum number of ticks to return (default: 10000)
            start_time: Optional Unix timestamp for range start
            end_time: Optional Unix timestamp for range end
        
        Returns:
            List of tick dicts: [{'timestamp': 1234567890, 'price': 1.0825, 'pair': 'EURUSD_otc'}, ...]
        """
        # Build query with optional time range filters
        query = """
        SELECT timestamp, price, pair
        FROM historical_ticks
        WHERE pair = %s
        """
        params = [pair]
        
        if start_time is not None:
            query += " AND timestamp >= %s"
            params.append(start_time)
        
        if end_time is not None:
            query += " AND timestamp <= %s"
            params.append(end_time)
        
        query += """
        ORDER BY timestamp ASC
        LIMIT %s
        """
        params.append(limit)
        
        result = self.execute_query(query, tuple(params))
        
        if result:
            self.logger.info(f"Found {len(result)} ticks for {pair}")
            return result
        
        self.logger.warning(f"No ticks found for: {pair}")
        return []