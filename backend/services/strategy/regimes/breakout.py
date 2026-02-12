"""
Breakout Strategy Module

Identifies entry signals for breakout conditions.
Focuses on Bollinger Band squeezes with volume/ATR confirmation.
"""

import pandas as pd
from typing import List
from datetime import datetime
from .base import BaseStrategy, EntrySignal


class BreakoutStrategy(BaseStrategy):
    """
    Strategy for Breakout markets (Bollinger squeeze breakouts).
    
    Entry Logic:
    - Bullish: Price breaks above BB upper band during squeeze
    - Bearish: Price breaks below BB lower band during squeeze
    - Confirmation: ATR spike, large body candle, ADX rising
    """
    
    def __init__(self, config=None):
        default_config = {
            "bb_squeeze_threshold": 0.04,  # BB width threshold for squeeze
            "min_adx": 25,
            "atr_spike_multiplier": 1.2,
            "min_confluence": 2,
            "expiry": "1m"  # Shorter expiry for breakouts
        }
        super().__init__({**default_config, **(config or {})})
    
    def identify_entries(self, df: pd.DataFrame, regime_result) -> List[EntrySignal]:
        """
        Identify breakout entries during Bollinger squeeze.
        """
        entries = []
        
        if len(df) < 30:
            return entries
        
        current = df.iloc[-1]
        prev = df.iloc[-2]
        
        # Extract values
        close = current['close']
        bb_high = current['bb_high']
        bb_low = current['bb_low']
        bb_width = current['bb_wband']
        adx_val = current.get('adx', 0)
        prev_adx = prev.get('adx', 0)
        atr_val = current.get('atr', 0)
        prev_atr = prev.get('atr', 0)
        
        # Only process if BB is in squeeze
        if bb_width >= self.config['bb_squeeze_threshold']:
            return entries
        
        # Check for ATR spike
        is_atr_spike = atr_val > (prev_atr * self.config['atr_spike_multiplier'])
        
        # Bullish Breakout
        if close > bb_high and adx_val > self.config['min_adx']:
            score = 0
            reasons = []
            
            if is_atr_spike:
                score += 1
                reasons.append("ATR expansion (volatility spike)")
            
            if current['large_body']:
                score += 1
                reasons.append("Strong breakout candle")
            
            if adx_val > prev_adx:
                score += 1
                reasons.append(f"ADX rising ({adx_val:.1f})")
            
            if score >= self.config['min_confluence']:
                confidence = 0.65 + (score * 0.05)
                
                entries.append(EntrySignal(
                    timestamp=datetime.now(),
                    asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                    direction="CALL",
                    entry_price=float(close),
                    suggested_expiry=self.config['expiry'],
                    confidence=confidence,
                    regime="Breakout (Bullish)",
                    confluence_score=65 + (score * 5),
                    technicals=regime_result.technicals,
                    reason=f"Bullish breakout from squeeze: {', '.join(reasons)}"
                ))
        
        # Bearish Breakout
        elif close < bb_low and adx_val > self.config['min_adx']:
            score = 0
            reasons = []
            
            if is_atr_spike:
                score += 1
                reasons.append("ATR expansion (volatility spike)")
            
            if current['large_body']:
                score += 1
                reasons.append("Strong breakdown candle")
            
            if adx_val > prev_adx:
                score += 1
                reasons.append(f"ADX rising ({adx_val:.1f})")
            
            if score >= self.config['min_confluence']:
                confidence = 0.65 + (score * 0.05)
                
                entries.append(EntrySignal(
                    timestamp=datetime.now(),
                    asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                    direction="PUT",
                    entry_price=float(close),
                    suggested_expiry=self.config['expiry'],
                    confidence=confidence,
                    regime="Breakout (Bearish)",
                    confluence_score=65 + (score * 5),
                    technicals=regime_result.technicals,
                    reason=f"Bearish breakout from squeeze: {', '.join(reasons)}"
                ))
        
        return entries
    
    def validate_entry(self, signal: EntrySignal, df: pd.DataFrame) -> bool:
        """
        Validate breakout entry signal.
        
        Checks:
        - Price still beyond Bollinger Band
        - ADX still above threshold
        - Momentum continuing
        """
        if len(df) < 2:
            return False
        
        current = df.iloc[-1]
        close = current['close']
        adx_val = current.get('adx', 0)
        bb_high = current['bb_high']
        bb_low = current['bb_low']
        
        # ADX must still show strength
        if adx_val < self.config['min_adx']:
            return False
        
        # Validate breakout continuation
        if signal.direction == "CALL":
            if close < bb_high * 0.995:  # Price fell back below band
                return False
        elif signal.direction == "PUT":
            if close > bb_low * 1.005:  # Price rallied back above band
                return False
        
        return True
