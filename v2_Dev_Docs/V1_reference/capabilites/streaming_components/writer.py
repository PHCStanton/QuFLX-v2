import csv
import os
from pathlib import Path

class CsvWriter:
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def write_candles(self, asset, timeframe_minutes, candles):
        if not candles:
            return

        filename = self.output_dir / f"{asset}_{timeframe_minutes}m_candles.csv"
        
        file_exists = filename.exists()
        with open(filename, 'a', newline='') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["timestamp", "open", "close", "high", "low", "volume"])
            
            for candle in candles:
                writer.writerow(candle)

    def write_ticks(self, asset, ticks):
        if not ticks:
            return

        filename = self.output_dir / f"{asset}_ticks.csv"
        
        file_exists = filename.exists()
        with open(filename, 'a', newline='') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["timestamp", "price"])

            for tick in ticks:
                writer.writerow(tick)