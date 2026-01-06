import redis
import json
import time

def check_system_status():
    try:
        r = redis.Redis(host='localhost', port=6379, db=0)
        
        # Check system_status channel
        pubsub = r.pubsub()
        pubsub.subscribe('system_status')
        print("Subscribed to system_status. Waiting for heartbeats...")
        
        statuses = {}
        start_time = time.time()
        while time.time() - start_time < 3:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                try:
                    data = json.loads(message['data'].decode('utf-8'))
                    service = data.get('service')
                    if service:
                        statuses[service] = data
                except:
                    pass
        
        print("\nService Statuses from Redis heartbeats:")
        if not statuses:
            print("No heartbeats received.")
        else:
            for service, status in statuses.items():
                print(f"- {service}: {status.get('status')} (last seen: {time.ctime(status.get('timestamp', 0))})")
                
        # Also check common status keys if any
        # (Assuming services might store their status in keys like 'status:collector')
        # Let's just scan for status related keys
        print("\nStatus-related Redis Keys:")
        keys = r.keys("*status*")
        if not keys:
            print("No status keys found.")
        else:
            for key in keys:
                val = r.get(key)
                print(f"- {key.decode('utf-8')}: {val.decode('utf-8') if val else 'None'}")
                
    except Exception as e:
        print(f"Error checking system status: {e}")

if __name__ == "__main__":
    check_system_status()
