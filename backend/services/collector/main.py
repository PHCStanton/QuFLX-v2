import time
import logging
import signal
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from backend.services.collector.connection import ChromeConnectionManager
from backend.services.collector.interceptor import WebSocketInterceptor
from backend.infrastructure.redis_client import RedisPublisher
from backend.utils.history_utils import persist_history_csv
from backend.utils.asset_utils import normalize_asset

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("CollectorService")

class CollectorService:
    def __init__(self):
        self.running = False
        self.connection_manager = ChromeConnectionManager()
        self.interceptor = None
        self.publisher = RedisPublisher()
        self.channel = "market_data" # Redis channel for ticks
        self.status_channel = "system_status" # Redis channel for service status
        self.seen_assets = set()

    def start(self):
        """
        Starts the collector service.
        """
        logger.info("Starting Collector Service...")
        
        try:
            # 1. Connect to Chrome
            driver = self.connection_manager.connect()
            self.interceptor = WebSocketInterceptor(driver)
            self.running = True
            
            # Publish status: Connected
            self.publisher.publish(self.status_channel, {
                "service": "collector",
                "status": "connected",
                "timestamp": time.time()
            })
            
            logger.info("Collector Service started successfully.")
            
            # 2. Main Loop
            self._run_loop()
            
        except Exception as e:
            logger.error(f"Failed to start Collector Service: {e}")
            self.stop()

    def _run_loop(self):
        """
        Main data collection loop.
        """
        last_heartbeat = 0
        heartbeat_interval = 5 # seconds
        
        while self.running:
            try:
                # Periodic Heartbeat
                now = time.time()
                if now - last_heartbeat > heartbeat_interval:
                    self.publisher.publish(self.status_channel, {
                        "service": "collector",
                        "status": "connected",
                        "timestamp": now
                    })
                    last_heartbeat = now
                
                # Fetch new ticks
                ticks = self.interceptor.fetch_ticks()
                
                if ticks:
                    assets = sorted({getattr(t, "asset", None) for t in ticks if getattr(t, "asset", None)})
                    if assets:
                        logger.info(f"Collected {len(ticks)} ticks from assets: {', '.join(assets)}")
                        new_assets = [a for a in assets if a not in self.seen_assets]
                        if new_assets:
                            self.seen_assets.update(new_assets)
                            logger.info(f"Discovered assets this session: {', '.join(sorted(self.seen_assets))}")
                    else:
                        logger.info(f"Collected {len(ticks)} ticks.")

                    for tick in ticks:
                        self.publisher.publish(self.channel, tick)
                self._process_history_events()
                
                # Sleep briefly to avoid hammering CPU
                time.sleep(0.1)
                
            except KeyboardInterrupt:
                logger.info("Stopping loop...")
                self.stop()
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(1) # Wait a bit before retrying

    def stop(self):
        """
        Stops the service and cleans up resources.
        """
        logger.info("Stopping Collector Service...")
        
        # Publish status: Disconnected
        try:
            self.publisher.publish(self.status_channel, {
                "service": "collector",
                "status": "disconnected",
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Failed to publish disconnect status: {e}")

        self.running = False
        self.connection_manager.disconnect()
        logger.info("Collector Service stopped.")

    def _process_history_events(self):
        if not self.interceptor:
            return
        try:
            events = self.interceptor.fetch_history_events()
        except Exception as e:
            logger.error(f"Error fetching history events: {e}")
            return
        for ev in events:
            asset = ev.get("asset")
            if not asset and "candles" in ev and ev["candles"]:
                first = ev["candles"][0]
                if isinstance(first, dict):
                    asset = first.get("asset")
            if not asset:
                continue
            timeframe_min = 1
            candles_out = []
            raw_candles = ev.get("candles")
            if isinstance(raw_candles, list) and raw_candles:
                for c in raw_candles:
                    if not isinstance(c, dict):
                        continue
                    try:
                        ts = float(c.get("timestamp"))
                        o = float(c.get("open"))
                        h = float(c.get("high"))
                        l = float(c.get("low"))
                        cl = float(c.get("close"))
                        v = float(c.get("volume", 0.0))
                    except Exception:
                        continue
                    candles_out.append({
                        "timestamp": ts,
                        "open": o,
                        "high": h,
                        "low": l,
                        "close": cl,
                        "volume": v,
                    })
            elif "history" in ev and isinstance(ev["history"], list) and ev["history"]:
                points = ev["history"]
                bucket_s = timeframe_min * 60
                buckets = {}
                for item in points:
                    if not isinstance(item, (list, tuple)) or len(item) < 2:
                        continue
                    try:
                        ts = float(item[0])
                        price = float(item[1])
                    except Exception:
                        continue
                    bucket_start = int(ts // bucket_s) * bucket_s
                    c = buckets.get(bucket_start)
                    if c is None:
                        buckets[bucket_start] = {
                            "timestamp": float(bucket_start),
                            "open": price,
                            "high": price,
                            "low": price,
                            "close": price,
                            "volume": 1.0,
                        }
                        continue
                    c["high"] = max(c["high"], price)
                    c["low"] = min(c["low"], price)
                    c["close"] = price
                    c["volume"] += 1.0
                candles_out = list(buckets.values())
            if not candles_out:
                continue
            try:
                persist_history_csv(asset, timeframe_min, candles_out)
            except Exception as e:
                logger.error(f"Failed to persist history for {asset}: {e}")

def signal_handler(sig, frame):
    logger.info("Received shutdown signal.")
    service.stop()
    sys.exit(0)

if __name__ == "__main__":
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    service = CollectorService()
    service.start()
