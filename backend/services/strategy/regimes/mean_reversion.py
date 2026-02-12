"""
Mean Reversion Strategy Module

Identifies entry signals for ranging/sideways markets.
Focuses on Bollinger Band bounces and RSI extremes.
"""

import pandas as pd
from typing import List
from datetime import datetime
from .base import BaseStrategy, EntrySignal


class MeanReversionStrategy(BaseStrategy):
    """
    Strategy for Ranging/Sideways markets.
    
    Entry Logic:
    - Buy: Price at lower Bollinger Band + RSI oversold
    - Sell: Price at upper Bollinger Band + RSI overbought
    - Confirmation: Stochastic crossovers, small body candles
    """
    
    def __init__(self, config=None):
        default_config = {
            "max_adx": 20,  # Ranging market threshold
            "rsi_oversold": 35,
            "rsi_overbought": 70,
            "bb_touch_tolerance": 1.005,  # 0.5% tolerance
            "min_confluence": 2,
            "expiry": "3m"
        }
        super().__init__({**default_config, **(config or {})})
    
    def identify_entries(self, df: pd.DataFrame, regime_result) -> List[EntrySignal]:
        """
        Identify mean reversion entries at Bollinger Band extremes.
        """
        entries = []
        
        if len(df) < 30:
            return entries
        
        current = df.iloc[-1]
        
        # Extract values
        close = current['close']
        bb_high = current['bb_high']
        bb_low = current['bb_low']
        adx_val = current.get('adx', 0)
        rsi_val = current.get('rsi', 0)
        stoch_k = current['stoch_k']
        stoch_d = current['stoch_d']
        
        # Only process if ADX confirms ranging market
        if adx_val >= self.config['max_adx']:
            return entries
        
        # Oversold (Buy) Entry
        if close <= bb_low * self.config['bb_touch_tolerance']:
            score = 0
            reasons = []
            
            if rsi_val < self.config['rsi_oversold']:
                score += 1
                reasons.append(f"RSI oversold ({rsi_val:.1f})")
            
            if stoch_k < 20 and stoch_k > stoch_d:
                score += 1
                reasons.append("Stochastic bullish cross")
            
            if not current['large_body']:
                score += 1
                reasons.append("Indecision candle (potential reversal)")
            
            if score >= self.config['min_confluence']:
                confidence = 0.60 + (score * 0.05)
                
                entries.append(EntrySignal(
                    timestamp=datetime.now(),
                    asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                    direction="CALL",
                    entry_price=float(close),
                    suggested_expiry=self.config['expiry'],
                    confidence=confidence,
                    regime="Ranging - Oversold",
                    confluence_score=60 + (score * 5),
                    technicals=regime_result.technicals,
                    reason=f"Mean reversion buy: {', '.join(reasons)}"
                ))
        
        # Overbought (Sell) Entry
        elif close >= bb_high * (2 - self.config['bb_touch_tolerance']):  # Inverse tolerance
            score = 0
            reasons = []
            
            if rsi_val > self.config['rsi_overbought']:
                score += 1
                reasons.append(f"RSI overbought ({rsi_val:.1f})")
            
            if stoch_k > 80 and stoch_k < stoch_d:
                score += 1
                reasons.append("Stochastic bearish cross")
            
            if not current['large_body']:
                score += 1
                reasons.append("Indecision candle (potential reversal)")
            
            if score >= self.config['min_confluence']:
                confidence = 0.60 + (score * 0.05)
                
                entries.append(EntrySignal(
                    timestamp=datetime.now(),
                    asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                    direction="PUT",
                    entry_price=float(close),
                    suggested_expiry=self.config['expiry'],
                    confidence=confidence,
                    regime="Ranging - Overbought",
                    confluence_score=60 + (score * 5),
                    technicals=regime_result.technicals,
                    reason=f"Mean reversion sell: {', '.join(reasons)}"
                ))
        
        return entries
    
    def validate_entry(self, signal: EntrySignal, df: pd.DataFrame) -> bool:
        """
        Validate mean reversion entry signal.
        
        Checks:
        - ADX still shows ranging market
        - Price still near Bollinger Band
        - RSI still in extreme zone
        """
        if len(df) < 2:
            return False
        
        current = df.iloc[-1]
        close = current['close']
        adx_val = current.get('adx', 0)
        rsi_val = current.get('rsi', 0)
        bb_high = current['bb_high']
        bb_low = current['bb_low']
        
        # ADX must still show ranging
        if adx_val >= self.config['max_adx']:
            return False
        
        # Validate price still near band
        if signal.direction == "CALL":
            if close > bb_low * 1.02:  # Price moved too far from lower band
                return False
            if rsi_val > 50:  # RSI no longer oversold
                return False
        elif signal.direction == "PUT":
            if close < bb_high * 0.98:  # Price moved too far from upper band
                return False
            if rsi_val < 50:  # RSI no longer overbought
                return False
        
        return True
