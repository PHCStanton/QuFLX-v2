"""
Backend modules for QuFLX Trading Platform
Handles Chrome connection, state management, and persistence
"""

from backend.chrome_connection import ChromeConnectionManager
from backend.streaming_state import StreamingStateManager
from backend.persistence_manager import StreamPersistenceManager

__all__ = [
    'ChromeConnectionManager',
    'StreamingStateManager',
    'StreamPersistenceManager',
]
