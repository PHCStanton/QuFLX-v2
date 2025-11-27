#!/usr/bin/env python3
"""
Technical Indicators Pipeline for OTC Currency Pairs
Phase 1 - Task 1.3: Technical Indicator Pipeline
Calculates 20+ technical indicators for 1-minute candle data.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple, TYPE_CHECKING
from dataclasses import dataclass, asdict
import logging
from pathlib import Path

# Suppress pandas-ta compatibility warning for Python 3.11
import warnings
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=UserWarning)
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=Warning)

# Technical Analysis Libraries with safe fallbacks for type checking
try:
    import pandas_ta as ta  # type: ignore[import-untyped]
    PANDAS_TA_AVAILABLE = True
except ImportError:
    PANDAS_TA_AVAILABLE = False
    ta: Any = None  # Safe fallback for LSP
    # Warning suppressed - pandas-ta not available for Python 3.11

try:
    import talib  # type: ignore[import-untyped]
    TALIB_AVAILABLE = True
except ImportError:
    TALIB_AVAILABLE = False
    talib: Any = None  # Safe fallback for LSP
    print("Warning: TA-Lib not available. Some indicators will use pandas-ta alternatives.")

@dataclass
class IndicatorSet:
    """Complete set of technical indicators for a candle"""
    timestamp: str
    pair: str
    
    # Price-based indicators
    open: float
    high: float
    low: float
    close: float
    
    # Trend Indicators
    sma_20: Optional[float] = None
    ema_16: Optional[float] = None
    ema_165: Optional[float] = None
    wma_20: Optional[float] = None
    
    # Momentum Indicators
    rsi_14: Optional[float] = None
    rsi_21: Optional[float] = None
    stoch_k: Optional[float] = None
    stoch_d: Optional[float] = None
    williams_r: Optional[float] = None
    roc_10: Optional[float] = None
    
    # MACD Family
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    
    # Bollinger Bands
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    bb_width: Optional[float] = None
    bb_percent: Optional[float] = None
    
    # Volatility Indicators
    atr_14: Optional[float] = None
    atr_21: Optional[float] = None
    true_range: Optional[float] = None
    
    # Volume-based (when available)
    volume: Optional[int] = None
    volume_sma: Optional[float] = None
    
    # Custom Indicators
    supertrend: Optional[float] = None
    supertrend_direction: Optional[str] = None
    pivot_point: Optional[float] = None
    support_1: Optional[float] = None
    resistance_1: Optional[float] = None
    
    # New Indicators (Phase 7.2)
    schaff_tc: Optional[float] = None
    demarker: Optional[float] = None
    cci: Optional[float] = None
    
    # Pattern Recognition
    doji: Optional[bool] = None
    hammer: Optional[bool] = None
    shooting_star: Optional[bool] = None
    engulfing_bullish: Optional[bool] = None
    engulfing_bearish: Optional[bool] = None

class TechnicalIndicatorsPipeline:
    """
    Comprehensive technical indicators calculation pipeline.
    Implements Phase 1 - Task 1.3 of the Signals Development Plan.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
        # Indicator parameters
        self.params: Dict[str, Any] = {
            'rsi_period': 14,
            'rsi_period_2': 21,
            'sma_period': 20,
            'ema_fast': 16,
            'ema_slow': 165,
            'wma_period': 20,
            'macd_fast': 12,
            'macd_slow': 26,
            'macd_signal': 9,
            'bb_period': 20,
            'bb_std': 2,
            'atr_period': 14,
            'atr_period_2': 21,
            'stoch_k': 14,
            'stoch_d': 3,
            'williams_period': 14,
            'roc_period': 10,
            'supertrend_period': 10,
            'supertrend_multiplier': 3.0,
            # New indicators (Phase 7.2)
            'schaff_fast': 10,
            'schaff_slow': 20,
            'schaff_d_macd': 3,
            'schaff_d_pf': 3,
            'demarker_period': 10,
            'cci_period': 20
        }
        
        # Update with user config
        if 'indicator_params' in self.config:
            self.params.update(self.config['indicator_params'])
    
    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate all technical indicators for the given DataFrame.
        
        Args:
            df: DataFrame with OHLC data (columns: timestamp, open, high, low, close, volume)
            
        Returns:
            DataFrame with all technical indicators added
        """
        try:
            if len(df) < 200:  # Need sufficient data for all indicators
                self.logger.warning(f"Insufficient data for full indicator calculation: {len(df)} candles")
            
            # Ensure required columns exist
            required_cols = ['open', 'high', 'low', 'close']
            if not all(col in df.columns for col in required_cols):
                raise ValueError(f"DataFrame must contain columns: {required_cols}")
            
            # Create a copy to avoid modifying original
            result_df = df.copy()
            
            # Calculate each category of indicators
            result_df = self._calculate_trend_indicators(result_df)
            result_df = self._calculate_momentum_indicators(result_df)
            result_df = self._calculate_volatility_indicators(result_df)
            result_df = self._calculate_volume_indicators(result_df)
            result_df = self._calculate_custom_indicators(result_df)
            result_df = self._calculate_pattern_recognition(result_df)
            
            self.logger.info(f"Calculated indicators for {len(result_df)} candles")
            return result_df
            
        except Exception as e:
            self.logger.error(f"Error calculating indicators: {str(e)}")
            return df
    
    def _calculate_trend_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate trend-following indicators"""
        try:
            # Simple Moving Average
            df['sma_20'] = df['close'].rolling(window=self.params['sma_period']).mean()
            
            # Exponential Moving Averages
            df['ema_16'] = df['close'].ewm(span=self.params['ema_fast']).mean()
            df['ema_165'] = df['close'].ewm(span=self.params['ema_slow']).mean()
            
            # Weighted Moving Average (type: ignore for Series inference)
            close_series: pd.Series = df['close']  # type: ignore[assignment]
            df['wma_20'] = self._calculate_wma(close_series, self.params['wma_period'])
            
            # MACD
            if PANDAS_TA_AVAILABLE:
                macd_data = ta.macd(df['close'], 
                                  fast=self.params['macd_fast'],
                                  slow=self.params['macd_slow'],
                                  signal=self.params['macd_signal'])
                if macd_data is not None and not macd_data.empty:
                    df['macd'] = macd_data[f"MACD_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"]
                    df['macd_signal'] = macd_data[f"MACDs_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"]
                    df['macd_histogram'] = macd_data[f"MACDh_{self.params['macd_fast']}_{self.params['macd_slow']}_{self.params['macd_signal']}"]
            elif TALIB_AVAILABLE:
                df['macd'], df['macd_signal'], df['macd_histogram'] = talib.MACD(
                    df['close'], 
                    fastperiod=self.params['macd_fast'],
                    slowperiod=self.params['macd_slow'],
                    signalperiod=self.params['macd_signal']
                )
            else:
                # Manual MACD calculation
                ema_fast = df['close'].ewm(span=self.params['macd_fast'], adjust=False).mean()
                ema_slow = df['close'].ewm(span=self.params['macd_slow'], adjust=False).mean()
                df['macd'] = ema_fast - ema_slow
                df['macd_signal'] = df['macd'].ewm(span=self.params['macd_signal'], adjust=False).mean()
                df['macd_histogram'] = df['macd'] - df['macd_signal']
            
            # Bollinger Bands
            if PANDAS_TA_AVAILABLE:
                bb_data = ta.bbands(df['close'], 
                                  length=self.params['bb_period'],
                                  std=self.params['bb_std'])
                if bb_data is not None and not bb_data.empty:
                    df['bb_lower'] = bb_data[f"BBL_{self.params['bb_period']}_{self.params['bb_std']}"]
                    df['bb_middle'] = bb_data[f"BBM_{self.params['bb_period']}_{self.params['bb_std']}"]
                    df['bb_upper'] = bb_data[f"BBU_{self.params['bb_period']}_{self.params['bb_std']}"]
                    df['bb_width'] = bb_data[f"BBB_{self.params['bb_period']}_{self.params['bb_std']}"]
                    df['bb_percent'] = bb_data[f"BBP_{self.params['bb_period']}_{self.params['bb_std']}"]
            elif TALIB_AVAILABLE:
                df['bb_upper'], df['bb_middle'], df['bb_lower'] = talib.BBANDS(
                    df['close'],
                    timeperiod=self.params['bb_period'],
                    nbdevup=self.params['bb_std'],
                    nbdevdn=self.params['bb_std']
                )
                df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
                df['bb_percent'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
            else:
                # Manual Bollinger Bands calculation
                df['bb_middle'] = df['close'].rolling(window=self.params['bb_period']).mean()
                std_dev = df['close'].rolling(window=self.params['bb_period']).std()
                df['bb_upper'] = df['bb_middle'] + (std_dev * self.params['bb_std'])
                df['bb_lower'] = df['bb_middle'] - (std_dev * self.params['bb_std'])
                
                # Avoid division by zero
                bb_range = df['bb_upper'] - df['bb_lower']
                df['bb_width'] = bb_range / df['bb_middle'].replace(0, np.nan)
                df['bb_percent'] = (df['close'] - df['bb_lower']) / bb_range.replace(0, np.nan)
            
        except Exception as e:
            self.logger.error(f"Error calculating trend indicators: {str(e)}")
        
        return df
    
    def _calculate_momentum_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate momentum oscillators"""
        try:
            # RSI
            if PANDAS_TA_AVAILABLE:
                df['rsi_14'] = ta.rsi(df['close'], length=self.params['rsi_period'])
                df['rsi_21'] = ta.rsi(df['close'], length=self.params['rsi_period_2'])
            elif TALIB_AVAILABLE:
                df['rsi_14'] = talib.RSI(df['close'], timeperiod=self.params['rsi_period'])
                df['rsi_21'] = talib.RSI(df['close'], timeperiod=self.params['rsi_period_2'])
            else:
                # Manual RSI calculation
                delta = df['close'].diff()
                gain = (delta.where(delta > 0, 0)).fillna(0)
                loss = (-delta.where(delta < 0, 0)).fillna(0)
                
                # Calculate RSI 14
                avg_gain_14 = gain.ewm(alpha=1/self.params['rsi_period'], adjust=False).mean()
                avg_loss_14 = loss.ewm(alpha=1/self.params['rsi_period'], adjust=False).mean()
                rs_14 = avg_gain_14 / avg_loss_14.replace(0, np.nan)
                df['rsi_14'] = 100 - (100 / (1 + rs_14))
                
                # Calculate RSI 21
                avg_gain_21 = gain.ewm(alpha=1/self.params['rsi_period_2'], adjust=False).mean()
                avg_loss_21 = loss.ewm(alpha=1/self.params['rsi_period_2'], adjust=False).mean()
                rs_21 = avg_gain_21 / avg_loss_21.replace(0, np.nan)
                df['rsi_21'] = 100 - (100 / (1 + rs_21))
            
            # Stochastic Oscillator
            if PANDAS_TA_AVAILABLE:
                stoch_data = ta.stoch(df['high'], df['low'], df['close'],
                                    k=self.params['stoch_k'],
                                    d=self.params['stoch_d'])
                if stoch_data is not None and not stoch_data.empty:
                    df['stoch_k'] = stoch_data[f"STOCHk_{self.params['stoch_k']}_{self.params['stoch_d']}_3"]
                    df['stoch_d'] = stoch_data[f"STOCHd_{self.params['stoch_k']}_{self.params['stoch_d']}_3"]
            elif TALIB_AVAILABLE:
                df['stoch_k'], df['stoch_d'] = talib.STOCH(
                    df['high'], df['low'], df['close'],
                    fastk_period=self.params['stoch_k'],
                    slowk_period=self.params['stoch_d'],
                    slowd_period=3
                )
            else:
                # Manual Stochastic calculation
                lowest_low = df['low'].rolling(window=self.params['stoch_k']).min()
                highest_high = df['high'].rolling(window=self.params['stoch_k']).max()
                
                # Fast %K
                df['stoch_k'] = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low).replace(0, np.nan))
                # Slow %D (SMA of %K)
                df['stoch_d'] = df['stoch_k'].rolling(window=self.params['stoch_d']).mean()
            
            # Williams %R
            if PANDAS_TA_AVAILABLE:
                df['williams_r'] = ta.willr(df['high'], df['low'], df['close'], 
                                          length=self.params['williams_period'])
            elif TALIB_AVAILABLE:
                df['williams_r'] = talib.WILLR(df['high'], df['low'], df['close'],
                                             timeperiod=self.params['williams_period'])
            else:
                # Manual Williams %R calculation
                highest_high = df['high'].rolling(window=self.params['williams_period']).max()
                lowest_low = df['low'].rolling(window=self.params['williams_period']).min()
                df['williams_r'] = -100 * ((highest_high - df['close']) / (highest_high - lowest_low).replace(0, np.nan))
            
            # Rate of Change
            if PANDAS_TA_AVAILABLE:
                df['roc_10'] = ta.roc(df['close'], length=self.params['roc_period'])
            elif TALIB_AVAILABLE:
                df['roc_10'] = talib.ROC(df['close'], timeperiod=self.params['roc_period'])
            else:
                # Manual ROC calculation
                df['roc_10'] = df['close'].pct_change(periods=self.params['roc_period']) * 100
            
            # Schaff Trend Cycle
            df = self._calculate_schaff_trend_cycle(df)
            
            # DeMarker
            df = self._calculate_demarker(df)
            
            # CCI (Commodity Channel Index)
            df = self._calculate_cci(df)
            
        except Exception as e:
            self.logger.error(f"Error calculating momentum indicators: {str(e)}")
        
        return df
    
    def _calculate_volatility_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate volatility indicators"""
        try:
            # True Range
            df['true_range'] = self._calculate_true_range(df)
            
            # Average True Range
            if PANDAS_TA_AVAILABLE:
                df['atr_14'] = ta.atr(df['high'], df['low'], df['close'], 
                                    length=self.params['atr_period'])
                df['atr_21'] = ta.atr(df['high'], df['low'], df['close'], 
                                    length=self.params['atr_period_2'])
            elif TALIB_AVAILABLE:
                df['atr_14'] = talib.ATR(df['high'], df['low'], df['close'],
                                       timeperiod=self.params['atr_period'])
                df['atr_21'] = talib.ATR(df['high'], df['low'], df['close'],
                                       timeperiod=self.params['atr_period_2'])
            else:
                # Manual ATR calculation
                df['atr_14'] = df['true_range'].rolling(window=self.params['atr_period']).mean()
                df['atr_21'] = df['true_range'].rolling(window=self.params['atr_period_2']).mean()
            
        except Exception as e:
            self.logger.error(f"Error calculating volatility indicators: {str(e)}")
        
        return df
    
    def _calculate_volume_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate volume-based indicators (when volume data is available)"""
        try:
            # Check if volume column exists and has any non-null values
            if 'volume' in df.columns and bool(df['volume'].notna().any()):
                # Volume SMA
                df['volume_sma'] = df['volume'].rolling(window=20).mean()
                
                # Volume-based indicators can be added here
                # Note: OTC pairs may not have reliable volume data
            
        except Exception as e:
            self.logger.error(f"Error calculating volume indicators: {str(e)}")
        
        return df
    
    def _calculate_custom_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate custom indicators"""
        try:
            # SuperTrend
            df = self._calculate_supertrend(df)
            
            # Pivot Points
            df = self._calculate_pivot_points(df)
            
        except Exception as e:
            self.logger.error(f"Error calculating custom indicators: {str(e)}")
        
        return df
    
    def _calculate_pattern_recognition(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate candlestick pattern recognition"""
        try:
            # Doji pattern
            df['doji'] = self._is_doji(df)
            
            # Hammer pattern
            df['hammer'] = self._is_hammer(df)
            
            # Shooting Star pattern
            df['shooting_star'] = self._is_shooting_star(df)
            
            # Engulfing patterns
            df['engulfing_bullish'] = self._is_bullish_engulfing(df)
            df['engulfing_bearish'] = self._is_bearish_engulfing(df)
            
        except Exception as e:
            self.logger.error(f"Error calculating pattern recognition: {str(e)}")
        
        return df
    
    def _calculate_wma(self, series: pd.Series, period: int) -> pd.Series:
        """Calculate Weighted Moving Average"""
        weights = np.arange(1, period + 1)
        result = series.rolling(window=period).apply(
            lambda x: np.dot(x, weights) / weights.sum(), raw=True
        )
        return result  # type: ignore[return-value]
    
    def _calculate_true_range(self, df: pd.DataFrame) -> pd.Series:
        """Calculate True Range"""
        high_low = df['high'] - df['low']
        high_close_prev = np.abs(df['high'] - df['close'].shift(1))
        low_close_prev = np.abs(df['low'] - df['close'].shift(1))
        
        return np.maximum(high_low, np.maximum(high_close_prev, low_close_prev))
    
    def _calculate_supertrend(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate SuperTrend indicator"""
        try:
            if PANDAS_TA_AVAILABLE:
                supertrend_data = ta.supertrend(df['high'], df['low'], df['close'],
                                              length=self.params['supertrend_period'],
                                              multiplier=self.params['supertrend_multiplier'])
                if supertrend_data is not None and not supertrend_data.empty:
                    df['supertrend'] = supertrend_data[f"SUPERT_{self.params['supertrend_period']}_{self.params['supertrend_multiplier']}"]
                    df['supertrend_direction'] = supertrend_data[f"SUPERTd_{self.params['supertrend_period']}_{self.params['supertrend_multiplier']}"].map({1: 'up', -1: 'down'})
            else:
                # Manual SuperTrend calculation
                hl2 = (df['high'] + df['low']) / 2
                if 'atr_14' in df.columns:
                    atr = df['atr_14']
                else:
                    atr = df['true_range'].rolling(window=self.params['supertrend_period']).mean()
                
                upper_band = hl2 + (self.params['supertrend_multiplier'] * atr)
                lower_band = hl2 - (self.params['supertrend_multiplier'] * atr)
                
                # SuperTrend calculation logic
                supertrend = pd.Series(index=df.index, dtype=float)
                direction = pd.Series(index=df.index, dtype=str)
                
                for i in range(1, len(df)):
                    if df['close'].iloc[i] <= lower_band.iloc[i]:
                        supertrend.iloc[i] = lower_band.iloc[i]
                        direction.iloc[i] = 'down'
                    elif df['close'].iloc[i] >= upper_band.iloc[i]:
                        supertrend.iloc[i] = upper_band.iloc[i]
                        direction.iloc[i] = 'up'
                    else:
                        supertrend.iloc[i] = supertrend.iloc[i-1] if not pd.isna(supertrend.iloc[i-1]) else lower_band.iloc[i]
                        direction.iloc[i] = direction.iloc[i-1] if not pd.isna(direction.iloc[i-1]) else 'up'
                
                df['supertrend'] = supertrend
                df['supertrend_direction'] = direction
                
        except Exception as e:
            self.logger.error(f"Error calculating SuperTrend: {str(e)}")
        
        return df
    
    def _calculate_pivot_points(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate Pivot Points"""
        try:
            # Daily pivot points (using previous day's data)
            df['pivot_point'] = (df['high'].shift(1) + df['low'].shift(1) + df['close'].shift(1)) / 3
            df['resistance_1'] = 2 * df['pivot_point'] - df['low'].shift(1)
            df['support_1'] = 2 * df['pivot_point'] - df['high'].shift(1)
            
        except Exception as e:
            self.logger.error(f"Error calculating pivot points: {str(e)}")
        
        return df
    
    def _is_doji(self, df: pd.DataFrame) -> pd.Series:
        """Identify Doji candlestick pattern"""
        body_size = np.abs(df['close'] - df['open'])
        candle_range = df['high'] - df['low']
        return (body_size / candle_range) < 0.1  # Body is less than 10% of total range
    
    def _is_hammer(self, df: pd.DataFrame) -> pd.Series:
        """Identify Hammer candlestick pattern"""
        body_size = np.abs(df['close'] - df['open'])
        lower_shadow = np.minimum(df['open'], df['close']) - df['low']
        upper_shadow = df['high'] - np.maximum(df['open'], df['close'])
        
        return (lower_shadow > 2 * body_size) & (upper_shadow < body_size)
    
    def _is_shooting_star(self, df: pd.DataFrame) -> pd.Series:
        """Identify Shooting Star candlestick pattern"""
        body_size = np.abs(df['close'] - df['open'])
        lower_shadow = np.minimum(df['open'], df['close']) - df['low']
        upper_shadow = df['high'] - np.maximum(df['open'], df['close'])
        
        return (upper_shadow > 2 * body_size) & (lower_shadow < body_size)
    
    def _is_bullish_engulfing(self, df: pd.DataFrame) -> pd.Series:
        """Identify Bullish Engulfing pattern"""
        prev_bearish = df['close'].shift(1) < df['open'].shift(1)
        curr_bullish = df['close'] > df['open']
        engulfs = (df['open'] < df['close'].shift(1)) & (df['close'] > df['open'].shift(1))
        
        return prev_bearish & curr_bullish & engulfs
    
    def _is_bearish_engulfing(self, df: pd.DataFrame) -> pd.Series:
        """Identify Bearish Engulfing pattern"""
        prev_bullish = df['close'].shift(1) > df['open'].shift(1)
        curr_bearish = df['close'] < df['open']
        engulfs = (df['open'] > df['close'].shift(1)) & (df['close'] < df['open'].shift(1))
        
        return prev_bullish & curr_bearish & engulfs
    
    def create_indicator_set(self, df_row: pd.Series) -> Optional[IndicatorSet]:
        """Create IndicatorSet from DataFrame row"""
        try:
            return IndicatorSet(
                timestamp=str(df_row.get('timestamp', '')),
                pair=str(df_row.get('pair', '')),
                open=float(df_row.get('open', 0)) if df_row.get('open') is not None else 0.0,  # type: ignore[arg-type]
                high=float(df_row.get('high', 0)) if df_row.get('high') is not None else 0.0,  # type: ignore[arg-type]
                low=float(df_row.get('low', 0)) if df_row.get('low') is not None else 0.0,  # type: ignore[arg-type]
                close=float(df_row.get('close', 0)) if df_row.get('close') is not None else 0.0,  # type: ignore[arg-type]
                
                # Trend indicators
                sma_20=self._safe_float(df_row.get('sma_20')),
                ema_16=self._safe_float(df_row.get('ema_16')),
                ema_165=self._safe_float(df_row.get('ema_165')),
                wma_20=self._safe_float(df_row.get('wma_20')),
                
                # Momentum indicators
                rsi_14=self._safe_float(df_row.get('rsi_14')),
                rsi_21=self._safe_float(df_row.get('rsi_21')),
                stoch_k=self._safe_float(df_row.get('stoch_k')),
                stoch_d=self._safe_float(df_row.get('stoch_d')),
                williams_r=self._safe_float(df_row.get('williams_r')),
                roc_10=self._safe_float(df_row.get('roc_10')),
                
                # MACD
                macd=self._safe_float(df_row.get('macd')),
                macd_signal=self._safe_float(df_row.get('macd_signal')),
                macd_histogram=self._safe_float(df_row.get('macd_histogram')),
                
                # Bollinger Bands
                bb_upper=self._safe_float(df_row.get('bb_upper')),
                bb_middle=self._safe_float(df_row.get('bb_middle')),
                bb_lower=self._safe_float(df_row.get('bb_lower')),
                bb_width=self._safe_float(df_row.get('bb_width')),
                bb_percent=self._safe_float(df_row.get('bb_percent')),
                
                # Volatility
                atr_14=self._safe_float(df_row.get('atr_14')),
                atr_21=self._safe_float(df_row.get('atr_21')),
                true_range=self._safe_float(df_row.get('true_range')),
                
                # Volume
                volume=self._safe_int(df_row.get('volume')),
                volume_sma=self._safe_float(df_row.get('volume_sma')),
                
                # Custom
                supertrend=self._safe_float(df_row.get('supertrend')),
                supertrend_direction=str(df_row.get('supertrend_direction', '')),
                pivot_point=self._safe_float(df_row.get('pivot_point')),
                support_1=self._safe_float(df_row.get('support_1')),
                resistance_1=self._safe_float(df_row.get('resistance_1')),
                
                # New indicators (Phase 7.2)
                schaff_tc=self._safe_float(df_row.get('schaff_tc')),
                demarker=self._safe_float(df_row.get('demarker')),
                cci=self._safe_float(df_row.get('cci')),
                
                # Patterns
                doji=self._safe_bool(df_row.get('doji')),
                hammer=self._safe_bool(df_row.get('hammer')),
                shooting_star=self._safe_bool(df_row.get('shooting_star')),
                engulfing_bullish=self._safe_bool(df_row.get('engulfing_bullish')),
                engulfing_bearish=self._safe_bool(df_row.get('engulfing_bearish'))
            )
        except Exception as e:
            self.logger.error(f"Error creating indicator set: {str(e)}")
            return None
    
    def _safe_float(self, value) -> Optional[float]:
        """Safely convert value to float"""
        try:
            if pd.isna(value) or value is None:
                return None
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _safe_int(self, value) -> Optional[int]:
        """Safely convert value to int"""
        try:
            if pd.isna(value) or value is None:
                return None
            return int(value)
        except (ValueError, TypeError):
            return None
    
    def _safe_bool(self, value) -> Optional[bool]:
        """Safely convert value to bool"""
        try:
            if pd.isna(value) or value is None:
                return None
            return bool(value)
        except (ValueError, TypeError):
            return None
    
    def _calculate_schaff_trend_cycle(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate Schaff Trend Cycle (STC) indicator.
        
        The STC is a cyclical indicator that combines MACD and Stochastic oscillator concepts.
        It helps identify trend changes and overbought/oversold conditions.
        
        Parameters from config:
        - schaff_fast: Fast period (default: 10)
        - schaff_slow: Slow period (default: 20)
        - schaff_d_macd: MACD smoothing period (default: 3)
        - schaff_d_pf: PF smoothing period (default: 3)
        """
        try:
            fast = self.params['schaff_fast']
            slow = self.params['schaff_slow']
            d_macd = self.params['schaff_d_macd']
            d_pf = self.params['schaff_d_pf']
            
            # Calculate MACD
            ema_fast = df['close'].ewm(span=fast, adjust=False).mean()
            ema_slow = df['close'].ewm(span=slow, adjust=False).mean()
            macd = ema_fast - ema_slow
            
            # Calculate Stochastic of MACD
            macd_min = macd.rolling(window=d_macd).min()
            macd_max = macd.rolling(window=d_macd).max()
            
            stoch_macd = pd.Series(index=df.index, dtype=float)
            for i in range(len(df)):
                if macd_max.iloc[i] - macd_min.iloc[i] != 0:
                    stoch_macd.iloc[i] = 100 * (macd.iloc[i] - macd_min.iloc[i]) / (macd_max.iloc[i] - macd_min.iloc[i])
                else:
                    stoch_macd.iloc[i] = 0
            
            # Calculate PF (Percentage Factor)
            pf = stoch_macd.ewm(span=d_macd, adjust=False).mean()
            
            # Calculate Stochastic of PF
            pf_min = pf.rolling(window=d_pf).min()
            pf_max = pf.rolling(window=d_pf).max()
            
            stc = pd.Series(index=df.index, dtype=float)
            for i in range(len(df)):
                if pf_max.iloc[i] - pf_min.iloc[i] != 0:
                    stc.iloc[i] = 100 * (pf.iloc[i] - pf_min.iloc[i]) / (pf_max.iloc[i] - pf_min.iloc[i])
                else:
                    stc.iloc[i] = 0
            
            df['schaff_tc'] = stc.ewm(span=d_pf, adjust=False).mean()
            
        except Exception as e:
            self.logger.error(f"Error calculating Schaff Trend Cycle: {str(e)}")
            df['schaff_tc'] = None
        
        return df
    
    def _calculate_demarker(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate DeMarker (DeM) indicator.
        
        The DeMarker indicator identifies potential price exhaustion points
        by comparing recent highs and lows.
        
        Parameters from config:
        - demarker_period: Calculation period (default: 10)
        
        Returns values between 0-1:
        - Above 0.7: Overbought (potential reversal down)
        - Below 0.3: Oversold (potential reversal up)
        """
        try:
            period = self.params['demarker_period']
            
            # Calculate DeMax (DeMarker High)
            demax = pd.Series(index=df.index, dtype=float)
            for i in range(1, len(df)):
                if df['high'].iloc[i] > df['high'].iloc[i-1]:
                    demax.iloc[i] = df['high'].iloc[i] - df['high'].iloc[i-1]
                else:
                    demax.iloc[i] = 0
            
            # Calculate DeMin (DeMarker Low)
            demin = pd.Series(index=df.index, dtype=float)
            for i in range(1, len(df)):
                if df['low'].iloc[i] < df['low'].iloc[i-1]:
                    demin.iloc[i] = df['low'].iloc[i-1] - df['low'].iloc[i]
                else:
                    demin.iloc[i] = 0
            
            # Calculate SMA of DeMax and DeMin
            demax_sma = demax.rolling(window=period).mean()
            demin_sma = demin.rolling(window=period).mean()
            
            # Calculate DeMarker
            demarker = pd.Series(index=df.index, dtype=float)
            for i in range(len(df)):
                denominator = demax_sma.iloc[i] + demin_sma.iloc[i]  # type: ignore[union-attr]
                if denominator != 0:
                    demarker.iloc[i] = demax_sma.iloc[i] / denominator  # type: ignore[union-attr]
                else:
                    demarker.iloc[i] = 0
            
            df['demarker'] = demarker
            
        except Exception as e:
            self.logger.error(f"Error calculating DeMarker: {str(e)}")
            df['demarker'] = None
        
        return df
    
    def _calculate_cci(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate CCI (Commodity Channel Index) indicator.
        
        CCI measures the difference between current price and its average over a period.
        It's useful for identifying cyclical trends and overbought/oversold conditions.
        
        Parameters from config:
        - cci_period: Calculation period (default: 20)
        
        Common thresholds:
        - Above +100: Overbought
        - Below -100: Oversold
        """
        try:
            period = self.params['cci_period']
            
            # Calculate Typical Price
            typical_price = (df['high'] + df['low'] + df['close']) / 3
            
            # Calculate SMA of Typical Price
            sma_tp = typical_price.rolling(window=period).mean()
            
            # Calculate Mean Deviation
            mean_dev = pd.Series(index=df.index, dtype=float)
            for i in range(period - 1, len(df)):
                deviations = []
                for j in range(i - period + 1, i + 1):
                    deviations.append(abs(typical_price.iloc[j] - sma_tp.iloc[i]))
                mean_dev.iloc[i] = np.mean(deviations)
            
            # Calculate CCI
            cci = pd.Series(index=df.index, dtype=float)
            for i in range(len(df)):
                if mean_dev.iloc[i] != 0:
                    cci.iloc[i] = (typical_price.iloc[i] - sma_tp.iloc[i]) / (0.015 * mean_dev.iloc[i])
                else:
                    cci.iloc[i] = 0
            
            df['cci'] = cci
            
        except Exception as e:
            self.logger.error(f"Error calculating CCI: {str(e)}")
            df['cci'] = None
        
        return df
    
    def get_indicator_summary(self) -> Dict[str, Any]:
        """Get summary of available indicators"""
        return {
            "total_indicators": 35,
            "categories": {
                "trend": ["sma_20", "ema_16", "ema_165", "wma_20", "macd", "macd_signal", "macd_histogram"],
                "momentum": ["rsi_14", "rsi_21", "stoch_k", "stoch_d", "williams_r", "roc_10"],
                "volatility": ["atr_14", "atr_21", "true_range"],
                "bollinger": ["bb_upper", "bb_middle", "bb_lower", "bb_width", "bb_percent"],
                "volume": ["volume", "volume_sma"],
                "custom": ["supertrend", "supertrend_direction", "pivot_point", "support_1", "resistance_1"],
                "patterns": ["doji", "hammer", "shooting_star", "engulfing_bullish", "engulfing_bearish"]
            },
            "libraries_available": {
                "pandas_ta": PANDAS_TA_AVAILABLE,
                "talib": TALIB_AVAILABLE
            },
            "parameters": self.params
        }


# Example usage and testing
if __name__ == "__main__":
    # Create sample data for testing
    dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
    np.random.seed(42)
    
    # Generate realistic OHLC data
    base_price = 1.0850
    returns = np.random.normal(0, 0.0001, 1000)
    prices = base_price * np.exp(np.cumsum(returns))
    
    sample_data = pd.DataFrame({
        'timestamp': dates,
        'pair': 'EURUSD_otc',
        'open': prices,
        'high': prices * (1 + np.random.uniform(0, 0.001, 1000)),
        'low': prices * (1 - np.random.uniform(0, 0.001, 1000)),
        'close': prices * (1 + np.random.uniform(-0.0005, 0.0005, 1000)),
        'volume': np.random.randint(100, 1000, 1000)
    })
    
    # Ensure high >= low and contains open/close
    sample_data['high'] = np.maximum(sample_data['high'], 
                                   np.maximum(sample_data['open'], sample_data['close']))
    sample_data['low'] = np.minimum(sample_data['low'], 
                                  np.minimum(sample_data['open'], sample_data['close']))
    
    # Test the pipeline
    pipeline = TechnicalIndicatorsPipeline()
    
    print("🔧 Testing Technical Indicators Pipeline...")
    print(f"📊 Sample data shape: {sample_data.shape}")
    
    # Calculate indicators
    result = pipeline.calculate_indicators(sample_data)
    
    print(f"✅ Indicators calculated successfully")
    print(f"📈 Result shape: {result.shape}")
    print(f"🎯 Columns added: {len(result.columns) - len(sample_data.columns)}")
    
    # Show summary
    summary = pipeline.get_indicator_summary()
    print(f"\n📋 Indicator Summary:")
    print(f"   Total indicators: {summary['total_indicators']}")
    print(f"   pandas-ta available: {summary['libraries_available']['pandas_ta']}")
    print(f"   TA-Lib available: {summary['libraries_available']['talib']}")
    
    # Show sample of calculated indicators
    print(f"\n📊 Sample indicators (last 5 rows):")
    indicator_cols = [col for col in result.columns if col not in ['timestamp', 'pair', 'open', 'high', 'low', 'close', 'volume']]
    print(result[indicator_cols].tail().to_string())
    
    # Test creating indicator set
    if len(result) > 0:
        last_row = result.iloc[-1]
        indicator_set = pipeline.create_indicator_set(last_row)
        if indicator_set:
            print(f"\n✅ IndicatorSet created successfully")
            print(f"   RSI(14): {indicator_set.rsi_14}")
            print(f"   MACD: {indicator_set.macd}")
            print(f"   BB Upper: {indicator_set.bb_upper}")
            print(f"   SuperTrend: {indicator_set.supertrend} ({indicator_set.supertrend_direction})")
