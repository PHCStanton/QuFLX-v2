import sys
import os
import time
import redis
import json

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
    if verify_redis_messages():
        sys.exit(0)
    else:
        sys.exit(1)
