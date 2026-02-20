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
    status: str = "CONFIRMED" # "CONFIRMED" or "DEVELOPING"
    
    @property
    def is_tradeable(self) -> bool:
        """Returns True if this regime has a tradeable signal (Confirmed or Developing)"""
        return self.condition != MarketCondition.NEUTRAL


@dataclass
class VolatilityState:
    """Represents volatility conditions relative to asset behavior."""
    relative_atr_pct: float
    atr_ratio: float
    adx: float
    bb_width: float
    bb_width_ratio: float
    zone: str
    is_tradeable: bool
    reason: str
    warning: Optional[str] = None


def assess_volatility(
    atr_val: float,
    close: float,
    adx_val: float,
    bb_width: float,
    atr_baseline: float,
    bb_width_baseline: float
) -> VolatilityState:
    """
    Assess volatility using Relative ATR (%) and ADX confluence.

    M1 Relative ATR zones (from ATR_ADX_CONFLUENCE_INFO.md):
    - Dead: < 0.02%
    - Low: 0.02% - 0.05%
    - Normal: 0.05% - 0.20%
    - High: 0.20% - 0.40%
    - Extreme: > 0.40%
    """
    relative_atr_pct = (atr_val / close * 100) if close > 0 else 0.0

    atr_ratio = 1.0
    if atr_baseline and atr_baseline > 0:
        atr_ratio = atr_val / atr_baseline

    bb_width_ratio = 1.0
    if bb_width_baseline and bb_width_baseline > 0:
        bb_width_ratio = bb_width / bb_width_baseline

    if relative_atr_pct < 0.02:
        zone = "dead"
    elif relative_atr_pct < 0.05:
        zone = "low"
    elif relative_atr_pct < 0.20:
        zone = "normal"
    elif relative_atr_pct < 0.40:
        zone = "high"
    else:
        zone = "extreme"

    if zone == "dead":
        return VolatilityState(
            relative_atr_pct=relative_atr_pct,
            atr_ratio=atr_ratio,
            adx=adx_val,
            bb_width=bb_width,
            bb_width_ratio=bb_width_ratio,
            zone=zone,
            is_tradeable=False,
            reason="ATR below 0.02% (dead market)",
            warning="low_volatility"
        )

    if zone == "low" and adx_val < 25:
        return VolatilityState(
            relative_atr_pct=relative_atr_pct,
            atr_ratio=atr_ratio,
            adx=adx_val,
            bb_width=bb_width,
            bb_width_ratio=bb_width_ratio,
            zone=zone,
            is_tradeable=False,
            reason="Low ATR (0.02-0.05%) with weak trend (ADX < 25)",
            warning="low_volatility"
        )

    if atr_ratio < 0.5 and adx_val < 25:
        return VolatilityState(
            relative_atr_pct=relative_atr_pct,
            atr_ratio=atr_ratio,
            adx=adx_val,
            bb_width=bb_width,
            bb_width_ratio=bb_width_ratio,
            zone=zone,
            is_tradeable=False,
            reason="ATR below 50% of its baseline with weak trend",
            warning="low_volatility"
        )

    if bb_width_ratio < 0.5 and adx_val < 25:
        return VolatilityState(
            relative_atr_pct=relative_atr_pct,
            atr_ratio=atr_ratio,
            adx=adx_val,
            bb_width=bb_width,
            bb_width_ratio=bb_width_ratio,
            zone=zone,
            is_tradeable=False,
            reason="BB width below 50% of its baseline with weak trend",
            warning="tight_range"
        )

    return VolatilityState(
        relative_atr_pct=relative_atr_pct,
        atr_ratio=atr_ratio,
        adx=adx_val,
        bb_width=bb_width,
        bb_width_ratio=bb_width_ratio,
        zone=zone,
        is_tradeable=True,
        reason="Volatility acceptable",
        warning=None
    )


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
    
    # Initialize and run pipeline ONLY if core indicators are missing
    if 'adx' not in df.columns or 'ema_16' not in df.columns:
        pipeline = TechnicalIndicatorsPipeline()
        result_df = pipeline.calculate_indicators(df)
    else:
        result_df = df.copy()
    
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

    # Volatility baselines for dynamic thresholds
    if 'atr' in result_df.columns:
        result_df['atr_baseline'] = result_df['atr'].rolling(window=20).median()
    if 'bb_wband' in result_df.columns:
        result_df['bb_width_baseline'] = result_df['bb_wband'].rolling(window=20).median()
    
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


def detect_regime(df: pd.DataFrame, lab_mode: bool = False) -> Optional[RegimeResult]:
    """
    Detect the current market regime based on technical indicators.
    
    Args:
        df: DataFrame with OHLC data and calculated indicators
        lab_mode: When True, skips the volatility guard (used by detect_regime_series
                  which has enough dataset context to make that judgment itself).
        
    Returns:
        RegimeResult if a tradeable regime is detected, None otherwise
    """
    if len(df) < 30:
        logger.debug(f"Not enough candles for regime detection ({len(df)})")
        return None
    
    # Calculate indicators / map columns / add body analysis
    # ALWAYS call this to ensure mapping and body analysis happens, 
    # even if pipeline ran externally.
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
    status = "CONFIRMED"

    # NEW: Volatility Monitoring (Prevent losses in quiet/choppy markets)
    bb_width = float(current.get('bb_wband', 0))
    atr_baseline = float(current.get('atr_baseline', 0))
    bb_width_baseline = float(current.get('bb_width_baseline', 0))
    volatility_state = assess_volatility(
        atr_val=atr_val,
        close=close,
        adx_val=adx_val,
        bb_width=bb_width,
        atr_baseline=atr_baseline,
        bb_width_baseline=bb_width_baseline
    )

    # 0. LOW VOLATILITY PROTECTION (Block signal if market is too quiet)
    # Skipped in lab_mode — detect_regime_series() handles volatility at the dataset level
    if not lab_mode and not volatility_state.is_tradeable:
        msg = f"Signal Blocked: {volatility_state.reason}"
        logger.info(msg)
        return RegimeResult(
            condition=MarketCondition.NEUTRAL,
            confluence_score=0,
            direction=None,
            suggested_expiry="1m",
            technicals={
                "atr_percent": volatility_state.relative_atr_pct,
                "atr_ratio": volatility_state.atr_ratio,
                "bb_width": bb_width,
                "bb_width_ratio": volatility_state.bb_width_ratio,
                "adx": adx_val,
                "warning": volatility_state.warning or "low_volatility",
                "message": msg,
                "volatility_zone": volatility_state.zone
            }
        )
    
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
            
            if weighted_score >= 70:
                condition = MarketCondition.STRONG_MOMENTUM_UP
                confluence_score = int(weighted_score)
                direction = "CALL"
                suggested_expiry = "3m"
            elif weighted_score >= 50 and adx_val > prev['adx']:
                condition = MarketCondition.STRONG_MOMENTUM_UP
                confluence_score = int(weighted_score)
                direction = "CALL"
                suggested_expiry = "3m"
                status = "DEVELOPING"
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
            
            if weighted_score >= 70:
                condition = MarketCondition.STRONG_MOMENTUM_DOWN
                confluence_score = int(weighted_score)
                direction = "PUT"
                suggested_expiry = "3m"
            elif weighted_score >= 50 and adx_val > prev['adx']:
                condition = MarketCondition.STRONG_MOMENTUM_DOWN
                confluence_score = int(weighted_score)
                direction = "PUT"
                suggested_expiry = "3m"
                status = "DEVELOPING"
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
        # NEW: Require minimum body size (avoid chop/indecision)
        recent_body_ratio = df['body_ratio'].tail(10).mean()
        if recent_body_ratio < 0.4:
            msg = f"Signal Blocked: Chop detected. Avg body ratio {recent_body_ratio:.2f} (need >0.4)"
            logger.info(msg)
            return RegimeResult(
                condition=MarketCondition.NEUTRAL,
                confluence_score=0,
                direction=None,
                suggested_expiry="1m",
                technicals={"body_ratio": recent_body_ratio, "adx": adx_val, "warning": "choppy", "message": msg}
            )
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
        # DEVELOPING SQUEEZE (R6 Lead Time)
        elif adx_val > 20 and adx_val > prev['adx']:
            # Near upper band -> Developing Bullish
            if abs(close - current['bb_high']) / close < 0.002:
                condition = MarketCondition.BREAKOUT_UP
                confluence_score = 50
                direction = "CALL"
                status = "DEVELOPING"
            # Near lower band -> Developing Bearish
            elif abs(close - current['bb_low']) / close < 0.002:
                condition = MarketCondition.BREAKOUT_DOWN
                confluence_score = 50
                direction = "PUT"
                status = "DEVELOPING"

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
        "atr_percent": round(float(volatility_state.relative_atr_pct), 4),
        "atr_ratio": round(float(volatility_state.atr_ratio), 2),
        "volatility_zone": volatility_state.zone,
        "bb_width_ratio": round(float(volatility_state.bb_width_ratio), 2),
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
        technicals=technicals,
        status=status
    )


def detect_regime_series(df: pd.DataFrame, window_size: int = 30) -> Dict[str, Any]:
    """
    Scan the entire dataset for tradeable regimes using a sliding window.

    Unlike detect_regime() which only examines the last candle (live trading),
    this function is designed for Strategy Lab backtesting — it scans the full
    historical dataset to find where tradeable regimes existed.

    Args:
        df: DataFrame with OHLC data (sorted ascending by timestamp)
        window_size: Minimum candles per window for regime detection (default 30)

    Returns:
        Dict with:
            dominant_regime: The most frequently detected non-neutral regime name
            dominant_direction: CALL/PUT for the dominant regime
            dominant_score: Average confluence score for the dominant regime
            is_tradeable: True if any tradeable regime was found
            regime_distribution: Dict of regime_name -> count
            regime_timeline: List of {timestamp, regime, direction, score} for each detected regime
            technicals: Technicals from the best-scoring detection
    """
    if len(df) < window_size:
        logger.debug(f"Not enough candles for series detection ({len(df)} < {window_size})")
        return {
            "dominant_regime": MarketCondition.NEUTRAL.value,
            "dominant_direction": None,
            "dominant_score": 0,
            "is_tradeable": False,
            "regime_distribution": {},
            "regime_timeline": [],
            "technicals": {},
        }

    # Pre-calculate indicators once for the full dataset (efficiency)
    df_with_indicators = calculate_indicators(df.copy())

    regime_counts: Dict[str, int] = {}
    regime_scores: Dict[str, list] = {}
    regime_timeline = []
    best_result: Optional[RegimeResult] = None
    best_score = 0

    # Slide window across dataset — step by 1 candle for full coverage
    # Use step=5 for performance on large datasets (still catches all regime transitions)
    step = max(1, len(df) // 100)  # At most 100 windows for large datasets

    for end_idx in range(window_size, len(df_with_indicators) + 1, step):
        window = df_with_indicators.iloc[:end_idx].copy()

        try:
            # lab_mode=True skips the volatility guard — series function handles this at dataset level
            result = detect_regime(window, lab_mode=True)
        except Exception as e:
            logger.debug(f"Window detection failed at idx {end_idx}: {e}")
            continue

        if result is None or result.condition == MarketCondition.NEUTRAL:
            continue

        regime_name = result.condition.value
        regime_counts[regime_name] = regime_counts.get(regime_name, 0) + 1

        if regime_name not in regime_scores:
            regime_scores[regime_name] = []
        regime_scores[regime_name].append(result.confluence_score)

        # Record timeline entry using the last candle's timestamp
        last_ts = window.iloc[-1].get('timestamp', end_idx)
        regime_timeline.append({
            "timestamp": float(last_ts) if last_ts is not None else end_idx,
            "regime": regime_name,
            "direction": result.direction,
            "score": result.confluence_score,
        })

        # Track best result by score
        if result.confluence_score > best_score:
            best_score = result.confluence_score
            best_result = result

    # Determine dominant regime (most frequent non-neutral)
    if not regime_counts:
        return {
            "dominant_regime": MarketCondition.NEUTRAL.value,
            "dominant_direction": None,
            "dominant_score": 0,
            "is_tradeable": False,
            "regime_distribution": {},
            "regime_timeline": [],
            "technicals": {},
        }

    dominant_regime = max(regime_counts, key=lambda r: regime_counts[r])
    dominant_scores = regime_scores.get(dominant_regime, [0])
    dominant_avg_score = round(sum(dominant_scores) / len(dominant_scores), 1)

    # Get direction for dominant regime from timeline
    dominant_direction = None
    for entry in reversed(regime_timeline):
        if entry["regime"] == dominant_regime:
            dominant_direction = entry["direction"]
            break

    return {
        "dominant_regime": dominant_regime,
        "dominant_direction": dominant_direction,
        "dominant_score": dominant_avg_score,
        "is_tradeable": True,
        "regime_distribution": regime_counts,
        "regime_timeline": regime_timeline[-50:],  # Last 50 entries to keep payload small
        "technicals": best_result.technicals if best_result else {},
    }
