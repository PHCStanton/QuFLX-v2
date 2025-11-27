"""
Persistence management module for streaming_server.py refactoring
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict


class StreamPersistenceManager:
    """Manages CSV persistence for streaming data"""

    def __init__(self, candle_dir: Path, tick_dir: Path,
                 candle_chunk_size: int = 100, tick_chunk_size: int = 1000):
        self.candle_dir = Path(candle_dir)
        self.tick_dir = Path(tick_dir)
        self.candle_chunk_size = candle_chunk_size
        self.tick_chunk_size = tick_chunk_size

        # Ensure directories exist
        self.candle_dir.mkdir(parents=True, exist_ok=True)
        self.tick_dir.mkdir(parents=True, exist_ok=True)

        # Track current file handles and counters
        self.candle_files: Dict[str, Dict] = {}
        self.tick_files: Dict[str, Dict] = {}

    def add_tick(self, asset: str, timestamp_str: str, value: float):
        """Add a tick to the appropriate CSV file"""
        try:
            current_file = self._get_tick_file(asset)
            if current_file:
                with open(current_file['path'], 'a', encoding='utf-8') as f:
                    f.write(f"{asset},{timestamp_str},{value}\n")

                current_file['count'] += 1

                # Rotate file if chunk size reached
                if current_file['count'] >= self.tick_chunk_size:
                    self._rotate_tick_file(asset)

        except Exception as e:
            print(f"[Persistence] Error saving tick for {asset}: {e}")

    def add_candle(self, asset: str, timeframe_minutes: int,
                   candle_ts: int, open_price: float, close_price: float,
                   high_price: float, low_price: float):
        """Add a candle to the appropriate CSV file"""
        try:
            current_file = self._get_candle_file(asset, timeframe_minutes)
            if current_file:
                timestamp_str = datetime.fromtimestamp(candle_ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

                with open(current_file['path'], 'a', encoding='utf-8') as f:
                    f.write(f"{asset},{timestamp_str},{open_price},{high_price},{low_price},{close_price}\n")

                current_file['count'] += 1

                # Rotate file if chunk size reached
                if current_file['count'] >= self.candle_chunk_size:
                    self._rotate_candle_file(asset, timeframe_minutes)

        except Exception as e:
            print(f"[Persistence] Error saving candle for {asset}: {e}")

    def _get_tick_file(self, asset: str) -> Optional[Dict]:
        """Get or create tick file for asset"""
        if asset not in self.tick_files:
            self._create_tick_file(asset)
        return self.tick_files.get(asset)

    def _get_candle_file(self, asset: str, timeframe_minutes: int) -> Optional[Dict]:
        """Get or create candle file for asset and timeframe"""
        key = f"{asset}_{timeframe_minutes}m"
        if key not in self.candle_files:
            self._create_candle_file(asset, timeframe_minutes)
        return self.candle_files.get(key)

    def _create_tick_file(self, asset: str):
        """Create new tick file for asset"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{asset}_ticks_{timestamp}.csv"
        filepath = self.tick_dir / filename

        # Write header
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write("asset,timestamp,value\n")

        self.tick_files[asset] = {
            'path': filepath,
            'count': 0,
            'created': datetime.now()
        }

    def _create_candle_file(self, asset: str, timeframe_minutes: int):
        """Create new candle file for asset and timeframe"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{asset}_{timeframe_minutes}m_candles_{timestamp}.csv"
        filepath = self.candle_dir / filename

        # Write header
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write("asset,timestamp,open,high,low,close\n")

        key = f"{asset}_{timeframe_minutes}m"
        self.candle_files[key] = {
            'path': filepath,
            'count': 0,
            'created': datetime.now()
        }

    def _rotate_tick_file(self, asset: str):
        """Rotate tick file when chunk size reached"""
        if asset in self.tick_files:
            print(f"[Persistence] Rotating tick file for {asset}")
            del self.tick_files[asset]
            self._create_tick_file(asset)

    def _rotate_candle_file(self, asset: str, timeframe_minutes: int):
        """Rotate candle file when chunk size reached"""
        key = f"{asset}_{timeframe_minutes}m"
        if key in self.candle_files:
            print(f"[Persistence] Rotating candle file for {asset} ({timeframe_minutes}m)")
            del self.candle_files[key]
            self._create_candle_file(asset, timeframe_minutes)