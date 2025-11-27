# Redis Configuration for QuFLX
import os

# Redis connection settings
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)

# Redis key patterns
TICK_LIST_PATTERN = "ticks:{asset}"  # e.g., ticks:EURUSD_otc
PUBSUB_CHANNEL_PATTERN = "updates:{asset}"  # e.g., updates:EURUSD_otc
HISTORICAL_CACHE_PATTERN = "historical:{asset}:{timeframe}"  # e.g., historical:EURUSD_otc:1M

# Redis settings
MAX_TICK_BUFFER_SIZE = 1000
HISTORICAL_CACHE_TTL = 3600  # 1 hour in seconds
BATCH_PROCESSING_INTERVAL = 30  # seconds
HISTORICAL_CACHE_SIZE = 200  # candles

# Performance settings
CONNECTION_POOL_SIZE = 10
SOCKET_TIMEOUT = 5  # seconds
RETRY_ATTEMPTS = 3
RETRY_DELAY = 1  # seconds