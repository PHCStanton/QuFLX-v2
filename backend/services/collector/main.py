import time
import logging
import signal
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from backend.services.collector.connection import ChromeConnectionManager
from backend.services.collector.interceptor import WebSocketInterceptor
from backend.infrastructure.redis_client import RedisPublisher

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
        while self.running:
            try:
                # Fetch new ticks
                ticks = self.interceptor.fetch_ticks()
                
                if ticks:
                    logger.info(f"Collected {len(ticks)} ticks.")
                    
                    # Publish to Redis
                    for tick in ticks:
                        self.publisher.publish(self.channel, tick)
                        # logger.debug(f"Published tick: {tick}")
                
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
        self.running = False
        self.connection_manager.disconnect()
        logger.info("Collector Service stopped.")

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
