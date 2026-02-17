import sys
import os
import json
import logging
import pandas as pd
from typing import Dict, List
from datetime import datetime

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.infrastructure.redis_client import RedisSubscriber, RedisPublisher
from backend.models.market_data import Candle
from backend.models.events import Signal
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
from backend.services.strategy.regime_detector import detect_regime, RegimeResult, MarketCondition
from dataclasses import asdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("StrategyService")

class StrategyService:
    def __init__(self):
        self.redis_sub = RedisSubscriber()
        self.redis_pub = RedisPublisher()
        self.pipeline = TechnicalIndicatorsPipeline()
        
        # Buffer to store recent candles for each asset
        # Format: {asset: pd.DataFrame}
        self.data_buffer: Dict[str, pd.DataFrame] = {}
        self.buffer_size = 200  # Keep enough history for indicators
        
        self.strategy_id = "simple_rsi_strategy_v1"

    def start(self):
        """Start the strategy service"""
        logger.info("Starting Strategy Service...")
        self.redis_sub.subscribe("market_data", self.handle_market_data)
        self.redis_sub.start_listening()
        
        try:
            # Keep main thread alive
            import time
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Stopping Strategy Service...")
            self.redis_sub.stop_listening()

    def handle_market_data(self, data: dict):
        """Process incoming market data"""
        try:
            # We expect Candle data here. If it's a Tick, we might need aggregation (skipping for now as per plan)
            # Assuming the collector publishes Candles or we treat Ticks as updates.
            # For Phase 3, let's assume we receive Candles or convert Ticks to simplified updates.
            
            # Check if it's a candle
            if 'open' in data and 'close' in data:
                candle = Candle(**data)
                self.process_candle(candle)
            else:
                # It might be a Tick, for now ignore or log
                # logger.debug(f"Received non-candle data: {data}")
                pass
                
        except Exception as e:
            logger.error(f"Error handling market data: {e}")

    def process_candle(self, candle: Candle):
        """Update buffer and evaluate strategy"""
        asset = candle.asset
        
        # Initialize buffer if needed
        if asset not in self.data_buffer:
            self.data_buffer[asset] = pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        # Append new candle
        new_row = pd.DataFrame([{
            'timestamp': candle.timestamp,
            'open': candle.open,
            'high': candle.high,
            'low': candle.low,
            'close': candle.close,
            'volume': candle.volume
        }])
        
        # Concatenate and keep last N rows
        df = pd.concat([self.data_buffer[asset], new_row], ignore_index=True)
        if len(df) > self.buffer_size:
            df = df.iloc[-self.buffer_size:]
        
        self.data_buffer[asset] = df
        
        # Calculate indicators
        # We only need to calculate for the last few rows to save time, 
        # but the pipeline calculates for the whole DF. 
        # With buffer_size=200, it's fast enough.
        df_with_indicators = self.pipeline.calculate_indicators(df)
        
        # Detect Market Regime
        regime = detect_regime(df_with_indicators)
        self._publish_regime(asset, regime)
        
        # Evaluate Strategy (Legacy RSI + New Regime)
        self.evaluate_strategy(asset, df_with_indicators)
        
        # If regime is tradeable, emit signal
        if regime and regime.is_tradeable:
            signal = Signal(
                timestamp=datetime.now().timestamp(),
                asset=asset,
                action="BUY" if regime.direction == "CALL" else "SELL",
                confidence=regime.confluence_score / 100.0,
                strategy_id="regime_detector_v1",
                metadata={
                    "condition": regime.condition.value,
                    "expiry": regime.suggested_expiry,
                    "technicals": regime.technicals
                }
            )
            logger.info(f"Regime Signal: {signal}")
            self.redis_pub.publish("trading:signals", signal)

    def _publish_regime(self, asset: str, regime: RegimeResult):
        """Publish regime update"""
        payload = {
            "timestamp": datetime.now().timestamp(),
            "asset": asset,
            "condition": regime.condition.value if regime else "Neutral",
            "confluence_score": regime.confluence_score if regime else 0,
            "direction": regime.direction if regime else None,
            "suggested_expiry": regime.suggested_expiry if regime else None,
            "technicals": regime.technicals if regime else {},
            "is_tradeable": regime.is_tradeable if regime else False
        }
        # Use a custom encoder or simple dict dumping since everything is standard types
        self.redis_pub.publish("strategy:regime", payload)

    def evaluate_strategy(self, asset: str, df: pd.DataFrame):
        """Simple RSI Strategy"""
        if len(df) < 20:
            return

        last_row = df.iloc[-1]
        rsi = last_row.get('rsi_14')
        
        if rsi is None:
            return

        signal = None
        
        # Simple Logic: Buy if RSI < 30, Sell if RSI > 70
        if rsi < 30:
            signal = Signal(
                timestamp=datetime.now().timestamp(),
                asset=asset,
                action="BUY",
                confidence=0.8,
                strategy_id=self.strategy_id,
                metadata={"rsi": rsi, "price": last_row['close']}
            )
        elif rsi > 70:
            signal = Signal(
                timestamp=datetime.now().timestamp(),
                asset=asset,
                action="SELL",
                confidence=0.8,
                strategy_id=self.strategy_id,
                metadata={"rsi": rsi, "price": last_row['close']}
            )
            
        if signal:
            logger.info(f"Generated Signal: {signal}")
            self.redis_pub.publish("trading:signals", signal)

if __name__ == "__main__":
    service = StrategyService()
    service.start()
