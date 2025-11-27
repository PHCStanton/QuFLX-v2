"""
Streaming state management module for streaming_server.py refactoring
"""

from datetime import datetime
from typing import Dict, Optional


class StreamingStateManager:
    """Manages global streaming state instead of using module-level variables"""

    def __init__(self):
        self._streaming_active = False
        self._current_asset = "EURUSD_OTC"
        self._chrome_reconnection_attempts = 0
        self._last_reconnection_time = None
        self._backend_initialized = False
        self._chrome_reconnect_enabled = False
        self._last_closed_candle_index: Dict[str, int] = {}

    @property
    def streaming_active(self) -> bool:
        return self._streaming_active

    @streaming_active.setter
    def streaming_active(self, value: bool):
        self._streaming_active = value

    @property
    def current_asset(self) -> str:
        return self._current_asset

    @current_asset.setter
    def current_asset(self, value: str):
        self._current_asset = value

    @property
    def chrome_reconnection_attempts(self) -> int:
        return self._chrome_reconnection_attempts

    @chrome_reconnection_attempts.setter
    def chrome_reconnection_attempts(self, value: int):
        self._chrome_reconnection_attempts = value

    @property
    def last_reconnection_time(self) -> Optional[datetime]:
        return self._last_reconnection_time

    @last_reconnection_time.setter
    def last_reconnection_time(self, value: Optional[datetime]):
        self._last_reconnection_time = value

    @property
    def backend_initialized(self) -> bool:
        return self._backend_initialized

    @backend_initialized.setter
    def backend_initialized(self, value: bool):
        self._backend_initialized = value

    @property
    def chrome_reconnect_enabled(self) -> bool:
        return self._chrome_reconnect_enabled

    @chrome_reconnect_enabled.setter
    def chrome_reconnect_enabled(self, value: bool):
        self._chrome_reconnect_enabled = value

    def get_last_closed_candle_index(self, asset: str) -> int:
        return self._last_closed_candle_index.get(asset, -1)

    def set_last_closed_candle_index(self, asset: str, index: int):
        self._last_closed_candle_index[asset] = index

    def reset_backend_state(self):
        """Reset backend streaming state and clear caches"""
        print("[Reconnection] Resetting backend state and clearing caches...")

        self.streaming_active = False
        self._last_closed_candle_index.clear()

        print("[Reconnection] ✓ Backend state reset complete")

    def should_attempt_reconnection(self) -> bool:
        """Check if reconnection should be attempted based on rate limiting"""
        if self._last_reconnection_time is None:
            return True

        time_since_last = (datetime.now() - self._last_reconnection_time).total_seconds()
        if time_since_last > 60:
            # Reset attempts after 1 minute
            self._chrome_reconnection_attempts = 0
            return True

        return self._chrome_reconnection_attempts < 3

    def record_reconnection_attempt(self):
        """Record a reconnection attempt"""
        self._chrome_reconnection_attempts += 1
        self._last_reconnection_time = datetime.now()

    def reset_reconnection_attempts(self):
        """Reset reconnection attempts counter"""
        self._chrome_reconnection_attempts = 0
        self._last_reconnection_time = None