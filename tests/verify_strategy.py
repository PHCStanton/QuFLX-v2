import sys
import os
import time
import json
import threading
import random
from datetime import datetime

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.infrastructure.redis_client import RedisSubscriber, RedisPublisher
from backend.models.market_data import Candle
from backend.models.events import Signal

def run_verification():
    print("🚀 Starting Strategy Verification Test...")
    
    # 1. Setup Listener for Signals
    subscriber = RedisSubscriber()
    signals_received = []
    
    def on_signal(data):
        print(f"✅ RECEIVED SIGNAL: {data}")
        signals_received.append(data)
    
    subscriber.subscribe("trading:signals", on_signal)
    subscriber.start_listening()
    print("👂 Listening for signals on 'trading:signals'...")
    
    # 2. Setup Publisher for Market Data
    publisher = RedisPublisher()
    asset = "EURUSD_TEST"
    
    print(f"📤 Publishing mock candle data for {asset}...")
    
    # Generate data to trigger RSI < 30 (Oversold -> Buy Signal)
    # Start high, drop fast
    price = 1.1000
    
    # We need enough data to calculate RSI (14 periods)
    # We'll send 30 candles
    for i in range(30):
        # Simulate a price drop
        if i < 10:
            change = random.uniform(-0.0001, 0.0001) # Sideways
        else:
            change = random.uniform(-0.0020, -0.0005) # Drop
            
        price += change
        
        candle = Candle(
            timestamp=datetime.now().timestamp(),
            asset=asset,
            open=price + 0.0001,
            high=price + 0.0002,
            low=price - 0.0002,
            close=price,
            volume=100,
            timeframe="1m",
            is_closed=True
        )
        
        publisher.publish("market_data", candle)
        # print(f"   Sent candle {i+1}: Close={price:.5f}")
        time.sleep(0.1) # Fast forward
        
    # Wait for processing
    print("⏳ Waiting for signals...")
    time.sleep(2)
    
    subscriber.stop_listening()
    
    if len(signals_received) > 0:
        print(f"🎉 SUCCESS: Received {len(signals_received)} signals!")
        for s in signals_received:
            print(f"   - {s}")
    else:
        print("❌ FAILURE: No signals received.")

if __name__ == "__main__":
    run_verification()
