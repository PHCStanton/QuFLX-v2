import sys
import os
import time
import json
import socketio
import threading
from datetime import datetime

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.infrastructure.redis_client import RedisPublisher
from backend.models.market_data import Candle

# Socket.IO Client
sio = socketio.Client()
received_events = []

@sio.event
def connect():
    print("✅ Connected to API Gateway via Socket.IO")

@sio.event
def connect_error(data):
    print(f"❌ Connection failed: {data}")

@sio.event
def disconnect():
    print("❌ Disconnected from API Gateway")

@sio.on('market_data')
def on_market_data(data):
    print(f"📩 Received market_data: {data}")
    received_events.append(('market_data', data))

@sio.on('trading_signal')
def on_trading_signal(data):
    print(f"📩 Received trading_signal: {data}")
    received_events.append(('trading_signal', data))

def run_verification():
    print("🚀 Starting API Gateway Verification Test...")
    
    # 1. Connect to Gateway
    try:
        sio.connect('http://localhost:8000')
    except Exception as e:
        print(f"❌ Failed to connect to Gateway: {e}")
        print("   Make sure the Gateway is running: python backend/services/gateway/main.py")
        return

    # 2. Publish Mock Data to Redis
    publisher = RedisPublisher()
    asset = "EURUSD_GATEWAY_TEST"
    
    print(f"📤 Publishing mock candle data for {asset} to Redis...")
    
    candle = Candle(
        timestamp=datetime.now().timestamp(),
        asset=asset,
        open=1.0500,
        high=1.0510,
        low=1.0490,
        close=1.0505,
        volume=100,
        timeframe="1m",
        is_closed=True
    )
    
    publisher.publish("market_data", candle)
    
    # 3. Wait for reception
    print("⏳ Waiting for Socket.IO events...")
    time.sleep(2)
    
    sio.disconnect()
    
    # 4. Verify
    if len(received_events) > 0:
        print(f"🎉 SUCCESS: Received {len(received_events)} events via Socket.IO!")
    else:
        print("❌ FAILURE: No events received.")

if __name__ == "__main__":
    run_verification()
