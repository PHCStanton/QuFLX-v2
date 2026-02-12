"""
Momentum Strategy Module

Identifies entry signals for strong momentum trending markets (bullish/bearish).
Focuses on continuation entries along the established trend.
"""

import pandas as pd
from typing import List
from datetime import datetime
from .base import BaseStrategy, EntrySignal


class MomentumStrategy(BaseStrategy):
    """
    Strategy for Strong Momentum Trending markets.
    
    Entry Logic:
    - Bullish: Pullbacks to EMA16 in strong uptrends (ADX > 30)
    - Bearish: Rallies to EMA16 in strong downtrends (ADX > 30)
    - Confirmation: MACD momentum, large body candles, ATR expansion
    """
    
    def __init__(self, config=None):
        default_config = {
            "min_adx": 30,
            "strong_adx": 35,
            "min_confluence": 2,
            "pullback_tolerance": 0.003,  # 0.3% from EMA16
            "expiry": "3m"
        }
        super().__init__({**default_config, **(config or {})})
    
    def identify_entries(self, df: pd.DataFrame, regime_result) -> List[EntrySignal]:
        """
        Identify momentum continuation entries.
        
        Looks for:
        1. Price pullback to EMA16 in trending market
        2. Confluence from MACD, candle structure, ATR
        3. Supertrend alignment
        """
        entries = []
        
        if len(df) < 30:
            return entries
        
        current = df.iloc[-1]
        prev = df.iloc[-2]
        
        # Extract values
        close = current['close']
        ema16 = current['ema16']
        ema165 = current['ema165']
        st_val = current['supertrend']
        adx_val = current.get('adx', 0)
        macd_hist = current['macd_hist']
        prev_macd_hist = prev['macd_hist']
        atr_val = current.get('atr', 0)
        prev_atr = prev.get('atr', 0)
        
        # Only process if ADX confirms trend strength
        if adx_val < self.config['min_adx']:
            return entries
        
        # Bullish Momentum Entry
        if close > ema165 and close > st_val:
            # Check for pullback to EMA16
            dist_to_ema16 = abs(close - ema16) / ema16
            
            if dist_to_ema16 < self.config['pullback_tolerance']:
                score = 0
                reasons = []
                
                if adx_val > self.config['strong_adx']:
                    score += 1
                    reasons.append(f"Strong ADX ({adx_val:.1f})")
                
                if macd_hist > prev_macd_hist:
                    score += 1
                    reasons.append("MACD momentum increasing")
                
                if current['large_body'] and current['close'] > current['open']:
                    score += 1
                    reasons.append("Bullish momentum candle")
                
                if atr_val > prev_atr:
                    score += 1
                    reasons.append("ATR expansion")
                
                if score >= self.config['min_confluence']:
                    confidence = 0.65 + (score * 0.05)
                    
                    entries.append(EntrySignal(
                        timestamp=datetime.now(),
                        asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                        direction="CALL",
                        entry_price=float(close),
                        suggested_expiry=self.config['expiry'],
                        confidence=confidence,
                        regime="Strong Momentum (Bullish)",
                        confluence_score=65 + (score * 5),
                        technicals=regime_result.technicals,
                        reason=f"Bullish momentum pullback entry: {', '.join(reasons)}"
                    ))
        
        # Bearish Momentum Entry
        elif close < ema165 and close < st_val:
            dist_to_ema16 = abs(close - ema16) / ema16
            
            if dist_to_ema16 < self.config['pullback_tolerance']:
                score = 0
                reasons = []
                
                if adx_val > self.config['strong_adx']:
                    score += 1
                    reasons.append(f"Strong ADX ({adx_val:.1f})")
                
                if macd_hist < prev_macd_hist:
                    score += 1
                    reasons.append("MACD momentum decreasing")
                
                if current['large_body'] and current['close'] < current['open']:
                    score += 1
                    reasons.append("Bearish momentum candle")
                
                if atr_val > prev_atr:
                    score += 1
                    reasons.append("ATR expansion")
                
                if score >= self.config['min_confluence']:
                    confidence = 0.65 + (score * 0.05)
                    
                    entries.append(EntrySignal(
                        timestamp=datetime.now(),
                        asset=regime_result.technicals.get('asset', 'UNKNOWN'),
                        direction="PUT",
                        entry_price=float(close),
                        suggested_expiry=self.config['expiry'],
                        confidence=confidence,
                        regime="Strong Momentum (Bearish)",
                        confluence_score=65 + (score * 5),
                        technicals=regime_result.technicals,
                        reason=f"Bearish momentum pullback entry: {', '.join(reasons)}"
                    ))
        
        return entries
    
    def validate_entry(self, signal: EntrySignal, df: pd.DataFrame) -> bool:
        """
        Validate momentum entry signal.
        
        Checks:
        - ADX still above threshold
        - Trend alignment (EMA16 vs EMA165)
        - Supertrend confirmation
        """
        if len(df) < 2:
            return False
        
        current = df.iloc[-1]
        close = current['close']
        adx_val = current.get('adx', 0)
        ema16 = current['ema16']
        ema165 = current['ema165']
        st_val = current['supertrend']
        
        # ADX must still show trend strength
        if adx_val < self.config['min_adx']:
            return False
        
        # Validate trend alignment
        if signal.direction == "CALL":
            if not (close > ema165 and close > st_val):
                return False
        elif signal.direction == "PUT":
            if not (close < ema165 and close < st_val):
                return False
        
        return True
