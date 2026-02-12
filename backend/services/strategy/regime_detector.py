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
    
    Args:
        df: DataFrame with columns: open, high, low, close, volume (optional)
        
    Returns:
        DataFrame with all indicators added as columns
    """
    # Ensure required columns are float
    df['close'] = df['close'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['open'] = df['open'].astype(float)
    
    # 1. Trend & Momentum
    adx_ind = ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=14)
    df['adx'] = adx_ind.adx()
    
    rsi_ind = RSIIndicator(close=df['close'], window=14)
    df['rsi'] = rsi_ind.rsi()

    # 2. Volatility (Bollinger + ATR for Normalization)
    bb_ind = BollingerBands(close=df['close'], window=20, window_dev=2)
    df['bb_wband'] = bb_ind.bollinger_wband()
    df['bb_high'] = bb_ind.bollinger_hband()
    df['bb_low'] = bb_ind.bollinger_lband()
    
    atr_ind = AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=14)
    df['atr'] = atr_ind.average_true_range()

    # 3. KB EMAs (16 & 165)
    df['ema16'] = EMAIndicator(close=df['close'], window=16).ema_indicator()
    df['ema165'] = EMAIndicator(close=df['close'], window=165).ema_indicator()
    
    # 4. Momentum & Oscillators
    macd = MACD(close=df['close'], window_slow=26, window_fast=12, window_sign=9)
    df['macd_hist'] = macd.macd_diff()
    df['macd'] = macd.macd()
    
    stoch = StochasticOscillator(high=df['high'], low=df['low'], close=df['close'], window=14, smooth_window=3)
    df['stoch_k'] = stoch.stoch()
    df['stoch_d'] = stoch.stoch_signal()
    
    df['cci'] = CCIIndicator(high=df['high'], low=df['low'], close=df['close'], window=14).cci()
    
    # 5. Supertrend (7, 3) Implementation
    period = 7
    multiplier = 3
    df['hl2'] = (df['high'] + df['low']) / 2
    df['atr_st'] = AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=period).average_true_range()
    
    df['basic_ub'] = df['hl2'] + (multiplier * df['atr_st'])
    df['basic_lb'] = df['hl2'] - (multiplier * df['atr_st'])
    
    df['final_ub'] = 0.0
    df['final_lb'] = 0.0
    for i in range(1, len(df)):
        # Upper Band
        if (df.index[i-1] in df.index):
            prev_ub = df.iloc[i-1]['final_ub']
            prev_close = df.iloc[i-1]['close']
            if df.iloc[i]['basic_ub'] < prev_ub or prev_close > prev_ub:
                df.at[df.index[i], 'final_ub'] = df.iloc[i]['basic_ub']
            else:
                df.at[df.index[i], 'final_ub'] = prev_ub
        
        # Lower Band
        if (df.index[i-1] in df.index):
            prev_lb = df.iloc[i-1]['final_lb']
            prev_close = df.iloc[i-1]['close']
            if df.iloc[i]['basic_lb'] > prev_lb or prev_close < prev_lb:
                df.at[df.index[i], 'final_lb'] = df.iloc[i]['basic_lb']
            else:
                df.at[df.index[i], 'final_lb'] = prev_lb
    
    df['supertrend'] = 0.0
    state = True  # True = Up
    for i in range(1, len(df)):
        prev_st = df.iloc[i-1]['supertrend']
        curr_ub = df.iloc[i]['final_ub']
        curr_lb = df.iloc[i]['final_lb']
        curr_close = df.iloc[i]['close']
        
        if state:
            if curr_close < curr_lb:
                state = False
                df.at[df.index[i], 'supertrend'] = curr_ub
            else:
                df.at[df.index[i], 'supertrend'] = curr_lb
        else:
            if curr_close > curr_ub:
                state = True
                df.at[df.index[i], 'supertrend'] = curr_lb
            else:
                df.at[df.index[i], 'supertrend'] = curr_ub
    
    # 6. Candle Body Analysis (Volume Proxy)
    df['body_size'] = (df['close'] - df['open']).abs()
    df['total_range'] = (df['high'] - df['low']).abs()
    df['body_ratio'] = df['body_size'] / df['total_range'].replace(0, 0.0001)
    df['atr_14'] = AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=14).average_true_range()
    df['large_body'] = df['body_size'] > (df['atr_14'] * 0.8)  # Heuristic for "Large"
    
    # 7. Support / Resistance (Fractal Pivots)
    window = 5
    df['pivot_h'] = df['high'].rolling(window=window, center=True).max()
    df['pivot_l'] = df['low'].rolling(window=window, center=True).min()
    
    return df


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
    rsi_val = current.get('rsi', 0)
    atr_val = current.get('atr', 0)
    prev_atr = prev.get('atr', 0)
    is_atr_spike = atr_val > (prev_atr * 1.2)
    
    ema16 = current['ema16']
    ema165 = current['ema165']
    st_val = current['supertrend']
    stoch_k = current['stoch_k']
    stoch_d = current['stoch_d']
    macd_hist = current['macd_hist']
    prev_macd_hist = prev['macd_hist']
    
    # --- KB Regime Detection Engine ---
    condition = MarketCondition.NEUTRAL
    confluence_score = 0
    direction = None  # "CALL" or "PUT"
    suggested_expiry = "1m"  # Default
    
    # 1. STRONG MOMENTUM TRENDING
    if adx_val > 30:
        # Bullish
        if close > ema16 and close > st_val:
            score = 0
            if adx_val > 35: score += 1
            if macd_hist > prev_macd_hist: score += 1
            if current['large_body'] and current['close'] > current['open']: score += 1
            if atr_val > prev_atr: score += 1
            
            if score >= 2:
                condition = MarketCondition.STRONG_MOMENTUM_UP
                confluence_score = 65 + (score * 5)
                direction = "CALL"
                suggested_expiry = "3m"
            else:
                logger.debug(f"Momentum UP ignored (Score {score}/4)")
        # Bearish
        elif close < ema16 and close < st_val:
            score = 0
            if adx_val > 35: score += 1
            if macd_hist < prev_macd_hist: score += 1
            if current['large_body'] and current['close'] < current['open']: score += 1
            if atr_val > prev_atr: score += 1
            
            if score >= 2:
                condition = MarketCondition.STRONG_MOMENTUM_DOWN
                confluence_score = 65 + (score * 5)
                direction = "PUT"
                suggested_expiry = "3m"
            else:
                logger.debug(f"Momentum DOWN ignored (Score {score}/4)")

    # 2. TRENDING WITH PULLBACKS (If not strong momentum)
    if condition == MarketCondition.NEUTRAL and adx_val > 20:
        dist_ema16 = abs(close - ema16) / ema16
        # Bullish Pullback
        if close > ema165 and dist_ema16 < 0.005:
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
        elif close < ema165 and dist_ema16 < 0.005:
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
            if rsi_val > 70: score += 1
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
        "ema165": round(float(ema165), 2),
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
