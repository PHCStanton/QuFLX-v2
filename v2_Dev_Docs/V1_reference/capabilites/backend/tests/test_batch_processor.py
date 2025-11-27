import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from datetime import datetime, timedelta
import time
from db_integrations.redis_integration import RedisIntegration
from db_integrations.supabase_data_queries import SupabaseDataQueries
from db_integrations.redis_batch_processor import RedisBatchProcessor

@pytest.fixture(scope="module")
def redis_client():
    client = RedisIntegration()
    yield client
    client.close()

@pytest.fixture(scope="module")
def supabase_client():
    client = SupabaseDataQueries()
    yield client
    client.conn.close()


def test_batch_processor(redis_client, supabase_client):
    pair = "EURUSD_otc"
    # Clear old data
    redis_client.redis.delete(f"ticks:{pair}")
    supabase_client.execute_query(f"DELETE FROM historical_ticks WHERE pair = '{pair}'")
    supabase_client.execute_query(f"DELETE FROM candles WHERE pair = '{pair}'")

    # Add test ticks
    ticks = []
    start_time = datetime.utcnow().replace(second=0, microsecond=0)
    for i in range(10):
        # 5 unique, 5 duplicates
        timestamp = start_time + timedelta(seconds=i % 5)
        ticks.append({
            'timestamp': timestamp.isoformat(),
            'price': 1.12345 + i * 0.00001,
            'pair': pair
        })
    
    for tick in ticks:
        redis_client.add_tick_to_buffer(pair, tick['price'], tick['timestamp'])

    # Run batch processor
    batch_processor = RedisBatchProcessor(redis_client, supabase_client)
    batch_processor.process_all_pairs()

    # Verify data in Supabase
    ticks_in_db = supabase_client.execute_query(f"SELECT * FROM historical_ticks WHERE pair = '{pair}' ORDER BY timestamp")
    assert len(ticks_in_db) == 5

    candles_in_db = supabase_client.execute_query(f"SELECT * FROM candles WHERE pair = '{pair}' AND timeframe = '1m'")
    assert len(candles_in_db) == 1
    assert candles_in_db[0]['open_price'] == pytest.approx(1.12345)
    assert candles_in_db[0]['high_price'] == pytest.approx(1.12349)
    assert candles_in_db[0]['low_price'] == pytest.approx(1.12345)
    assert candles_in_db[0]['close_price'] == pytest.approx(1.12349)