import sys
import os
import time
import threading
import subprocess
import json
import redis

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../")))

from backend.infrastructure.redis_client import RedisSubscriber

def run_collector():
    """
    Runs the collector service as a subprocess.
    """
    print("Starting Collector Service...")
    # Adjust path to main.py
    collector_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend/services/collector/main.py"))
    process = subprocess.Popen([sys.executable, collector_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return process

def verify_redis_messages():
    """
    Subscribes to Redis and verifies messages are received.
    """
    print("Connecting to Redis...")
    client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    pubsub = client.pubsub()
    pubsub.subscribe('market_data')
    
    print("Listening for messages on 'market_data' channel...")
    start_time = time.time()
    messages_received = 0
    
    while time.time() - start_time < 30: # Wait up to 30 seconds
        message = pubsub.get_message()
        if message:
            if message['type'] == 'message':
                print(f"Received message: {message['data']}")
                messages_received += 1
                if messages_received >= 3:
                    print("SUCCESS: Received 3 messages from Redis.")
                    return True
        time.sleep(0.1)
        
    print("TIMEOUT: Did not receive enough messages.")
    return False

if __name__ == "__main__":
    # 1. Start Collector
    collector_process = run_collector()
    
    try:
        # 2. Verify Redis
        success = verify_redis_messages()
        
        if success:
            print("Verification PASSED.")
            sys.exit(0)
        else:
            print("Verification FAILED.")
            # Print collector output for debugging
            stdout, stderr = collector_process.communicate(timeout=5)
            print(f"Collector STDOUT:\n{stdout}")
            print(f"Collector STDERR:\n{stderr}")
            sys.exit(1)
            
    finally:
        # 3. Cleanup
        print("Stopping Collector...")
        collector_process.terminate()
        collector_process.wait()
