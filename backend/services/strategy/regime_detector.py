"""
Regime Detection Module

Extracted from otc_alert_dispatch.py MarketScanner for shared use between
the Alert Dispatcher and Strategy Lab.

This module provides pure functions for detecting market regimes based on
technical indicators. No side effects, no Redis, no file I/O.
"""

import pandas as pd
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any
from enum import Enum

# Technical Analysis imports
try:
    from ta.trend import ADXIndicator, EMAIndicator, MACD, CCIIndicator
    from ta.volatility import BollingerBands, AverageTrueRange
    from ta.momentum import RSIIndicator, StochasticOscillator
except ImportError:
    raise ImportError("'ta' library required. Install with: pip install ta")

logger = logging.getLogger(__name__)


class MarketCondition(Enum):
    """Market regime classifications"""
    STRONG_MOMENTUM_UP = "Strong Momentum Trending (Bullish)"
    STRONG_MOMENTUM_DOWN = "Strong Momentum Trending (Bearish)"
    PULLBACK_BUY = "Trending Pullback (Buy Dip)"
    PULLBACK_SELL = "Trending Pullback (Sell Rally)"
    RANGING_OVERBOUGHT = "Ranging – Overbought (Sell)"
    RANGING_OVERSOLD = "Ranging – Oversold (Buy)"
    BREAKOUT_UP = "Breakout (Bullish)"
    BREAKOUT_DOWN = "Breakout (Bearish)"
    REVERSAL_BULLISH = "Trend Reversal (Bullish)"
    REVERSAL_BEARISH = "Trend Reversal (Bearish)"
    NEUTRAL = "Neutral"


@dataclass
class RegimeResult:
    """Result of regime detection analysis"""
    condition: MarketCondition
    confluence_score: int
    direction: Optional[str]  # "CALL" or "PUT"
    suggested_expiry: str
    technicals: Dict[str, Any]
    
    @property
    def is_tradeable(self) -> bool:
        """Returns True if this regime has a tradeable signal"""
        return self.condition != MarketCondition.NEUTRAL


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate all technical indicators needed for regime detection.
    
    **NOW USES UNIFIED PIPELINE** from indicators.py to eliminate duplication.
    
    Args:
        df: DataFrame with columns: open, high, low, close, volume (optional)
        
    Returns:
        DataFrame with all indicators added as columns (mapped to regime detector naming)
    """
    # Import unified pipeline
    from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
    
    # Initialize and run pipeline
    pipeline = TechnicalIndicatorsPipeline()
    result_df = pipeline.calculate_indicators(df)
    
    # Map Pipeline B column names to regime detector's expected names
    # Pipeline B uses underscored names (ema_16), regime detector uses non-underscored (ema16)
    if 'ema_16' in result_df.columns:
        result_df['ema16'] = result_df['ema_16']
    if 'ema_89' in result_df.columns:
        result_df['ema89'] = result_df['ema_89']
    if 'macd_histogram' in result_df.columns:
        result_df['macd_hist'] = result_df['macd_histogram']
    if 'bb_upper' in result_df.columns:
        result_df['bb_high'] = result_df['bb_upper']
    if 'bb_lower' in result_df.columns:
        result_df['bb_low'] = result_df['bb_lower']
    if 'bb_width' in result_df.columns:
        result_df['bb_wband'] = result_df['bb_width']
    if 'atr_14' in result_df.columns:
        result_df['atr'] = result_df['atr_14']
    if 'rsi_14' in result_df.columns:
        result_df['rsi'] = result_df['rsi_14']
    
    # Add regime-specific columns not calculated by the unified pipeline
    # These are specific to regime detection logic
    
    # Candle Body Analysis (Volume Proxy)
    result_df['body_size'] = (result_df['close'] - result_df['open']).abs()
    result_df['total_range'] = (result_df['high'] - result_df['low']).abs()
    result_df['body_ratio'] = result_df['body_size'] / result_df['total_range'].replace(0, 0.0001)
    
    # Large body flag (Body Ratio > 0.7 AND ATR expansion)
    if 'atr' in result_df.columns:
        atr_median = result_df['atr'].rolling(window=14).median()
        result_df['large_body'] = (result_df['body_ratio'] > 0.7) & (result_df['atr'] > atr_median * 1.1)
    else:
        result_df['large_body'] = result_df['body_ratio'] > 0.7
    
    if 'resistance_level' in result_df.columns:
        result_df['pivot_h'] = result_df['resistance_level']
    if 'support_level' in result_df.columns:
        result_df['pivot_l'] = result_df['support_level']
    
    return result_df


def calculate_weighted_score(signals: Dict[str, bool], weights: Dict[str, float]) -> float:
    """
    Calculate weighted confluence score from binary signals.
    
    Replaces the old "2 out of 3-4" binary counting with a weighted model
    where stronger signals (ADX, MACD) contribute more than weaker ones (oscillators).
    
    Args:
        signals: Dict of signal_name -> bool (True if signal is present)
        weights: Dict of signal_name -> weight (0.0 to 1.0, should sum to 1.0)
        
    Returns:
        Weighted score from 0-100
    """
    total_score = 0.0
    for signal_name, is_present in signals.items():
        if is_present and signal_name in weights:
            total_score += weights[signal_name] * 100  # Convert to 0-100 scale
    
    return round(total_score, 1)


def detect_regime(df: pd.DataFrame) -> Optional[RegimeResult]:
    """
    Detect the current market regime based on technical indicators.
    
    Args:
        df: DataFrame with OHLC data and calculated indicators
        
    Returns:
        RegimeResult if a tradeable regime is detected, None otherwise
    """
    if len(df) < 30:
        logger.debug(f"Not enough candles for regime detection ({len(df)})")
        return None
    
    # Calculate indicators if not already present
    if 'adx' not in df.columns:
        df = calculate_indicators(df)
    
    current = df.iloc[-1]
    prev = df.iloc[-2]
    
    # Extract S/R levels
    current_resistance = df[df['high'] == df['pivot_h']]['high'].iloc[-1] if not df[df['high'] == df['pivot_h']].empty else None
    current_support = df[df['low'] == df['pivot_l']]['low'].iloc[-1] if not df[df['low'] == df['pivot_l']].empty else None
    
    # Extract key values
    price = float(current['close'])
    close = current['close']
    adx_val = current.get('adx', 0)
    plus_di = current.get('plus_di', 0)   # R5: Directional Movement Indicator
    minus_di = current.get('minus_di', 0)  # R5: Directional Movement Indicator
    rsi_val = current.get('rsi', 0)
    atr_val = current.get('atr', 0)
    prev_atr = prev.get('atr', 0)
    is_atr_spike = atr_val > (prev_atr * 1.2)
    
    ema16 = current['ema16']
    ema89 = current['ema89']  # Fibonacci period, works with 100-candle payloads
    st_val = current['supertrend']
    stoch_k = current['stoch_k']
    stoch_d = current['stoch_d']
    macd_hist = current['macd_hist']
    prev_macd_hist = prev['macd_hist']
    
    # R4: Weighted Confluence Model
    # ADX 25%, MACD 20%, Body/Volume 20%, Supertrend 15%, Oscillator 10%, ATR 10%
    WEIGHTS = {
        'adx': 0.25,
        'macd': 0.20,
        'body_volume': 0.20,
        'supertrend': 0.15,
        'oscillator': 0.10,
        'atr': 0.10
    }
    
    # --- KB Regime Detection Engine ---
    condition = MarketCondition.NEUTRAL
    confluence_score = 0
    direction = None  # "CALL" or "PUT"
    suggested_expiry = "1m"  # Default
    
    # 1. STRONG MOMENTUM TRENDING (R4 + R5: Weighted Scoring + Directional Confirmation)
    if adx_val > 30:
        # Bullish
        if close > ema16 and close > st_val:
            signals = {
                'adx': adx_val > 35,  # 25% weight
                'macd': macd_hist > prev_macd_hist,  # 20% weight
                'body_volume': current['large_body'] and current['close'] > current['open'],  # 20% weight
                'supertrend': close > st_val,  # 15% weight (already checked above)
                'oscillator': plus_di > minus_di,  # R5: +DI > -DI (10% weight)
                'atr': atr_val > prev_atr  # 10% weight
            }
            
            weighted_score = calculate_weighted_score(signals, WEIGHTS)
            
            # R4: Raised threshold from 60-65 → 70
            if weighted_score >= 70:
                condition = MarketCondition.STRONG_MOMENTUM_UP
                confluence_score = int(weighted_score)
                direction = "CALL"
                suggested_expiry = "3m"
            else:
                logger.debug(f"Momentum UP ignored (Weighted Score {weighted_score:.1f}/100, need ≥70)")
        # Bearish
        elif close < ema16 and close < st_val:
            signals = {
                'adx': adx_val > 35,  # 25% weight
                'macd': macd_hist < prev_macd_hist,  # 20% weight
                'body_volume': current['large_body'] and current['close'] < current['open'],  # 20% weight
                'supertrend': close < st_val,  # 15% weight (already checked above)
                'oscillator': minus_di > plus_di,  # R5: -DI > +DI (10% weight)
                'atr': atr_val > prev_atr  # 10% weight
            }
            
            weighted_score = calculate_weighted_score(signals, WEIGHTS)
            
            # R4: Raised threshold from 60-65 → 70
            if weighted_score >= 70:
                condition = MarketCondition.STRONG_MOMENTUM_DOWN
                confluence_score = int(weighted_score)
                direction = "PUT"
                suggested_expiry = "3m"
            else:
                logger.debug(f"Momentum DOWN ignored (Weighted Score {weighted_score:.1f}/100, need ≥70)")

    # 2. TRENDING WITH PULLBACKS (If not strong momentum)
    if condition == MarketCondition.NEUTRAL and adx_val > 20:
        # R6: ATR-Normalized Pullback Distance (replaces fixed 0.005)
        # Multiplier of 2.0 allows for reasonable pullback depth across volatility regimes
        atr_normalized_threshold = (atr_val * 2.0) / close if close > 0 else 0.005
        dist_ema16 = abs(close - ema16) / ema16
        
        # Bullish Pullback
        if close > ema89 and dist_ema16 < atr_normalized_threshold:  # Macro uptrend bias (EMA-89)
            score = 0
            if 40 <= rsi_val <= 55: score += 1
            if close <= current['bb_low'] * 1.001: score += 1
            if atr_val >= prev_atr: score += 1
            
            if score >= 2:
                condition = MarketCondition.PULLBACK_BUY
                confluence_score = 65 + (score * 5)
                direction = "CALL"
                suggested_expiry = "5m"
        # Bearish Pullback
        elif close < ema89 and dist_ema16 < atr_normalized_threshold:  # Macro downtrend bias (EMA-89)
            score = 0
            if 45 <= rsi_val <= 60: score += 1
            if close >= current['bb_high'] * 0.999: score += 1
            if atr_val >= prev_atr: score += 1
            
            if score >= 2:
                condition = MarketCondition.PULLBACK_SELL
                confluence_score = 65 + (score * 5)
                direction = "PUT"
                suggested_expiry = "5m"

    # 3. RANGING / SIDEWAYS
    if condition == MarketCondition.NEUTRAL and adx_val < 20:
        # Overbought (Sell)
        if close >= current['bb_high'] * 0.998:
            score = 0
            if rsi_val > 75: score += 1  # OTC-tuned: 35/75 (binary options push further than Forex)
            if stoch_k > 80 and stoch_k < stoch_d: score += 1
            if not current['large_body']: score += 1
            
            if score >= 2:
                condition = MarketCondition.RANGING_OVERBOUGHT
                confluence_score = 60 + (score * 5)
                direction = "PUT"
                suggested_expiry = "3m"
        # Oversold (Buy)
        elif close <= current['bb_low'] * 1.005:
            score = 0
            if rsi_val < 35: score += 1
            if stoch_k < 20 and stoch_k > stoch_d: score += 1
            if not current['large_body']: score += 1
            
            if score >= 2:
                condition = MarketCondition.RANGING_OVERSOLD
                confluence_score = 60 + (score * 5)
                direction = "CALL"
                suggested_expiry = "3m"

    # 4. BREAKOUT CONDITIONS
    if condition == MarketCondition.NEUTRAL and current['bb_wband'] < 0.04:  # Squeeze
        # Bullish Breakout
        if close > current['bb_high'] and adx_val > 25:
            score = 0
            if is_atr_spike: score += 1
            if current['large_body']: score += 1
            if adx_val > prev['adx']: score += 1
            
            if score >= 2:
                condition = MarketCondition.BREAKOUT_UP
                confluence_score = 65 + (score * 5)
                direction = "CALL"
                suggested_expiry = "1m"
        # Bearish Breakout
        elif close < current['bb_low'] and adx_val > 25:
            score = 0
            if is_atr_spike: score += 1
            if current['large_body']: score += 1
            if adx_val > prev['adx']: score += 1
            
            if score >= 2:
                condition = MarketCondition.BREAKOUT_DOWN
                confluence_score = 65 + (score * 5)
                direction = "PUT"
                suggested_expiry = "1m"

    # 5. TREND REVERSAL (Lowest priority/highest risk)
    if condition == MarketCondition.NEUTRAL:
        # Bullish Reversal
        if rsi_val < 30 and macd_hist > prev_macd_hist:
            if current_support and abs(close - current_support) / current_support < 0.001:
                condition = MarketCondition.REVERSAL_BULLISH
                confluence_score = 55
                direction = "CALL"
                suggested_expiry = "5m"
        # Bearish Reversal
        elif rsi_val > 70 and macd_hist < prev_macd_hist:
            if current_resistance and abs(close - current_resistance) / current_resistance < 0.001:
                condition = MarketCondition.REVERSAL_BEARISH
                confluence_score = 55
                direction = "PUT"
                suggested_expiry = "5m"

    if condition == MarketCondition.NEUTRAL:
        return None

    # Build technicals dict
    technicals = {
        "price": price,
        "adx": round(float(adx_val), 2),
        "rsi": round(float(rsi_val), 2),
        "bb_width": round(float(current['bb_wband']), 4),
        "macd_hist": round(float(macd_hist), 4),
        "stoch_k": round(float(stoch_k), 2),
        "cci": round(float(current['cci']), 2),
        "ema16": round(float(ema16), 2),
        "ema89": round(float(ema89), 2),
        "supertrend": round(float(st_val), 2),
        "atr": round(float(atr_val), 4),
        "body_ratio": round(float(current['body_ratio']), 2),
        "large_body": bool(current['large_body']),
        "near_sr": "Support" if current_support and abs(close - current_support)/close < 0.001 else "Resistance" if current_resistance and abs(close - current_resistance)/close < 0.001 else "None",
        "confluence_score": confluence_score
    }
    
    return RegimeResult(
        condition=condition,
        confluence_score=confluence_score,
        direction=direction,
        suggested_expiry=suggested_expiry,
        technicals=technicals
    )
