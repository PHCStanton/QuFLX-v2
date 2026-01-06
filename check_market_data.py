import redis
import json
import time

def check_redis_market_data():
    try:
        r = redis.Redis(host='localhost', port=6379, db=0)
        pubsub = r.pubsub()
        pubsub.subscribe('market_data')
        print("Subscribed to market_data. Waiting for ticks...")
        
        count = 0
        start_time = time.time()
        while time.time() - start_time < 5:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                print(f"Received tick: {message['data'].decode('utf-8')[:100]}...")
                count += 1
                if count >= 3:
                    break
        
        if count == 0:
            print("No market data received in 5 seconds.")
        else:
            print(f"Successfully received {count} ticks.")
            
    except Exception as e:
        print(f"Error connecting to Redis or receiving data: {e}")

if __name__ == "__main__":
    check_redis_market_data()
