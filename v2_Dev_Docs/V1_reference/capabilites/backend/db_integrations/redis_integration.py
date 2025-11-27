"""
Redis Integration Module for QuFLX Trading Platform

Handles Redis operations for real-time data streaming, caching,
and batch processing for Supabase persistence.

Simplified version using direct Redis client only (no MCP).
"""

import json
import logging
from typing import Optional, List, Dict, Any

import redis
from config.redis_config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, MAX_TICK_BUFFER_SIZE, TICK_LIST_PATTERN, HISTORICAL_CACHE_PATTERN, HISTORICAL_CACHE_TTL

class RedisIntegration:
    """
    Redis integration class for QuFLX trading platform.
    Handles real-time data streaming, caching, and batch operations using direct Redis client.
    """

    def __init__(self, project_id: str = 'quflx-project'):
        """Initialize Redis connection using direct client."""
        self.logger = logging.getLogger(__name__)
        self.project_id = project_id
        self.redis = None
        self.redis_client = None
        self._connect()

    def _connect(self) -> bool:
        """Establish Redis connection using direct client."""
        try:
            self.redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                socket_timeout=5,
                retry_on_timeout=True,
                decode_responses=False  # We'll handle decoding manually
            )
            # Test connection
            self.redis.ping()
            self.redis_client = self.redis
            self.logger.info("✅ Redis connection established successfully")
            return True
        except redis.ConnectionError as e:
            self.logger.error(f"❌ Failed to connect to Redis: {e}")
            self.redis = None
            self.redis_client = None
            return False
        except Exception as e:
            self.logger.error(f"❌ Unexpected error connecting to Redis: {e}")
            self.redis = None
            self.redis_client = None
            return False

    def reconnect(self) -> bool:
        """Reconnect to Redis if connection is lost."""
        self.logger.info("Attempting to reconnect to Redis...")
        return self._connect()
    
    def is_connected(self) -> bool:
        """Check if Redis connection is active."""
        if not self.redis:
            return False
        try:
            self.redis.ping()
            return True
        except:
            return False

    def add_tick_to_buffer(self, asset: str, tick_data: Dict[str, Any]) -> bool:
        """
        Add tick data to Redis list buffer.
        """
        try:
            key = TICK_LIST_PATTERN.format(asset=asset)
            self.redis.rpush(key, json.dumps(tick_data))
            if self.redis.llen(key) > MAX_TICK_BUFFER_SIZE:
                self.redis.ltrim(key, -MAX_TICK_BUFFER_SIZE, -1)
            return True
        except Exception as e:
            self.logger.error(f"Failed to add tick to buffer for {asset}: {e}")
            return False

    def get_ticks_from_buffer(self, asset: str) -> List[Dict[str, Any]]:
        """
        Get all ticks from buffer and clear it.
        """
        try:
            key = TICK_LIST_PATTERN.format(asset=asset)
            ticks = self.redis.lrange(key, 0, -1)
            self.redis.delete(key)
            return [json.loads(t.decode('utf-8')) for t in ticks]
        except Exception as e:
            self.logger.error(f"Failed to get ticks from buffer for {asset}: {e}")
            return []

    def cache_historical_candles(self, asset: str, timeframe: str, candles: List[Dict[str, Any]]) -> bool:
        """
        Cache historical candle data in Redis.
        """
        try:
            key = HISTORICAL_CACHE_PATTERN.format(asset=asset, timeframe=timeframe)
            value = json.dumps(candles)
            self.redis.setex(key, HISTORICAL_CACHE_TTL, value)
            return True
        except Exception as e:
            self.logger.error(f"Failed to cache historical candles for {asset}:{timeframe}: {e}")
            return False

    def get_cached_historical_candles(self, asset: str, timeframe: str) -> Optional[List[Dict[str, Any]]]:
        """
        Retrieve cached historical candles.
        """
        try:
            key = HISTORICAL_CACHE_PATTERN.format(asset=asset, timeframe=timeframe)
            value = self.redis.get(key)
            if value:
                return json.loads(value.decode('utf-8'))
            return None
        except Exception as e:
            self.logger.error(f"Failed to get cached historical candles for {asset}:{timeframe}: {e}")
            return None

    def clear_cached_historical_candles(self, asset: str, timeframe: str) -> bool:
        """
        Clear cached historical candles for a specific asset and timeframe.
        """
        try:
            key = HISTORICAL_CACHE_PATTERN.format(asset=asset, timeframe=timeframe)
            self.redis.delete(key)
            self.logger.info(f"Cleared cache for {asset}:{timeframe}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to clear cache for {asset}:{timeframe}: {e}")
            return False
    
    def get_buffer_size(self, asset: str) -> int:
        """
        Get current buffer size for an asset.
        """
        try:
            key = TICK_LIST_PATTERN.format(asset=asset)
            return self.redis.llen(key)
        except Exception as e:
            self.logger.error(f"Failed to get buffer size for {asset}: {e}")
            return 0
    
    def clear_asset_data(self, asset: str) -> bool:
        """
        Clear all Redis data for an asset (tick buffer and caches).
        """
        try:
            # Delete tick buffer
            tick_key = TICK_LIST_PATTERN.format(asset=asset)
            self.redis.delete(tick_key)
            
            # Delete historical caches for common timeframes
            for timeframe in ['1m', '5m', '15m', '1h', '4h']:
                cache_key = HISTORICAL_CACHE_PATTERN.format(asset=asset, timeframe=timeframe)
                self.redis.delete(cache_key)
            
            self.logger.info(f"Cleared all data for {asset}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to clear data for {asset}: {e}")
            return False
    
    def publish(self, channel: str, message: str) -> int:
        """
        Publish a message to a Redis channel.
        """
        try:
            return self.redis.publish(channel, message)
        except Exception as e:
            self.logger.error(f"Failed to publish to channel {channel}: {e}")
            return 0

    def subscribe(self, channel: str) -> Optional[redis.client.PubSub]:
        """
        Subscribe to a Redis channel.
        Returns a PubSub object.
        """
        try:
            pubsub = self.redis.pubsub()
            pubsub.subscribe(channel)
            return pubsub
        except Exception as e:
            self.logger.error(f"Failed to subscribe to channel {channel}: {e}")
            return None

    def get_redis_info(self) -> Dict[str, Any]:
        """
        Get Redis server information.
        """
        try:
            return self.redis.info()
        except Exception as e:
            self.logger.error(f"Failed to get Redis info: {e}")
            return {}
    
    def close(self):
        """Close Redis connection."""
        try:
            self.redis.close()
            self.logger.info("Redis connection closed.")
        except Exception as e:
            self.logger.error(f"Failed to close Redis connection: {e}")
        self.redis = None
        self.redis_client = None
        pass
