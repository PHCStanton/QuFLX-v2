import threading
from collections import deque
from typing import Optional
import logging

from backend.streaming_state import StreamingStateManager
from backend.persistence_manager import StreamPersistenceManager
from backend.chrome_connection import ChromeConnectionManager

logger = logging.getLogger(__name__)

class ApplicationContext:
    """Centralized application state with thread-safe access"""
    
    def __init__(self):
        self._lock = threading.RLock()
        self.chrome_driver = None
        self.chrome_connection_manager = None
        self.data_streamer = None
        self.capability_ctx = None
        self.state_manager = StreamingStateManager()
        self.persistence_manager: Optional[StreamPersistenceManager] = None
        self.redis_integration = None
        self.batch_processor = None
        self.is_simulated_mode = False
        self.collect_stream_mode = "none"
        self.period = 60  # 1 minute candles by default
        
        # Thread-safe message tracking with bounded size
        self.processed_messages = deque(maxlen=5000)
        
        # Thread management
        self.monitor_thread = None
        self.stream_thread = None
        self.shutdown_event = threading.Event()
    
    def set_chrome_driver(self, driver):
        """Thread-safe setter for chrome_driver"""
        with self._lock:
            self.chrome_driver = driver
    
    def get_chrome_driver(self):
        """Thread-safe getter for chrome_driver"""
        with self._lock:
            return self.chrome_driver
    
    def is_chrome_connected(self) -> bool:
        """Thread-safe check for Chrome connection"""
        with self._lock:
            return self.chrome_driver is not None
    
    def reset_on_disconnect(self):
        """Reset state when client disconnects"""
        with self._lock:
            self.state_manager.streaming_active = False
            if self.data_streamer:
                if hasattr(self.data_streamer, 'release_asset_focus'):
                    self.data_streamer.release_asset_focus()
                if hasattr(self.data_streamer, 'unlock_timeframe'):
                    self.data_streamer.unlock_timeframe()
            logger.info("Application context reset on disconnect")

# Global application context
app_ctx = ApplicationContext()
