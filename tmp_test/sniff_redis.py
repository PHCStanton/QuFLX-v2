"""Sniff the Redis market_data channel for 5 seconds and report what arrives."""
import asyncio
import json
import redis.asyncio as redis

async def main():
    r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("market_data", "system_status")
    print("Listening on market_data + system_status for 5 seconds...")
    print("(If nothing appears, the Collector is not publishing ticks)\n")

    count = 0
    deadline = asyncio.get_event_loop().time() + 5.0

    async for message in pubsub.listen():
        if asyncio.get_event_loop().time() > deadline:
            break
        if message["type"] != "message":
            continue
        count += 1
        channel = message["channel"]
        try:
            data = json.loads(message["data"])
            asset = data.get("asset", "?")
            price = data.get("price", "?")
            print(f"  [{channel}]  asset={asset}  price={price}")
        except Exception:
            print(f"  [{channel}]  raw={message['data'][:80]}")
        if count >= 10:
            print("  (10 messages received — stopping early)")
            break

    await pubsub.unsubscribe()
    await r.aclose()

    print(f"\nTotal messages received in 5s: {count}")
    if count == 0:
        print("DIAGNOSIS: No messages on market_data — Collector is NOT publishing.")
        print("  → Start the QuFLX v2 Collector service to get real data flowing.")
        print("  → Command: python backend/services/collector/main.py")
    else:
        print("DIAGNOSIS: Data IS flowing through Redis correctly.")
        print("  → The gateway should be delivering ticks to the frontend.")

asyncio.run(main())
