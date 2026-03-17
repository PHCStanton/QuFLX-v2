#!/usr/bin/env python3
"""
Technical Indicators Pipeline
Calculates technical indicators for candle data.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import logging

# Suppress pandas-ta compatibility warning for Python 3.11
import warnings
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=UserWarning)
warnings.filterwarnings('ignore', message='.*pandas-ta not available.*', category=Warning)

# Technical Analysis Libraries with safe fallbacks
try:
    import pandas_ta as ta
    PANDAS_TA_AVAILABLE = True
except ImportError:
    PANDAS_TA_AVAILABLE = False
    ta = None

try:
    import talib
    TALIB_AVAILABLE = True
except ImportError:
    TALIB_AVAILABLE = False
    talib = None

@dataclass
class IndicatorSet:
    """Complete set of technical indicators for a candle"""
    timestamp: float
    asset: str
    
    # Price-based indicators
    open: float
    high: float
    low: float
    close: float
    
    # Trend Indicators
    sma_20: Optional[float] = None
    ema_16: Optional[float] = None
    ema_89: Optional[float] = None  # Fibonacci period, works with 100-candle payloads
    ema_21: Optional[float] = None
    ema_50: Optional[float] = None
    ema_100: Optional[float] = None
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
    adx: Optional[float] = None
    plus_di: Optional[float] = None
    minus_di: Optional[float] = None
    
    # Custom Indicators
    supertrend: Optional[float] = None
    supertrend_direction: Optional[str] = None
    
    # New Indicators
    schaff_tc: Optional[float] = None
    demarker: Optional[float] = None
    cci: Optional[float] = None

    # Support / Resistance Enhancements
    resistance_level: Optional[float] = None
    support_level: Optional[float] = None
    dist_to_resistance: Optional[float] = None   # % distance from close to nearest resistance
    dist_to_support: Optional[float] = None       # % distance from close to nearest support
    resistance_touch_count: Optional[int] = None  # times price tested resistance without breaking
    support_touch_count: Optional[int] = None     # times price tested support without breaking
    sr_flip: Optional[bool] = None                # True when a level was just broken (flip event)
    sr_flip_price: Optional[float] = None         # price of the flipped level
    resistance_zone_upper: Optional[float] = None # high of fractal candle (resistance zone top)
    resistance_zone_lower: Optional[float] = None # body lower bound of fractal candle
    support_zone_upper: Optional[float] = None    # body upper bound of fractal candle
    support_zone_lower: Optional[float] = None    # low of fractal candle (support zone bottom)
    resistance_freshness: Optional[str] = None    # 'fresh' | 'tested' | 'stale'
    support_freshness: Optional[str] = None       # 'fresh' | 'tested' | 'stale'

class TechnicalIndicatorsPipeline:
    """
    Comprehensive technical indicators calculation pipeline.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
        # Indicator parameters
        self.params: Dict[str, Any] = {
            'rsi_period': 14,
            'rsi_period_2': 21,
            'sma_period': 20,
            'ema_fast': 16,
            'ema_slow': 89,  # Fibonacci period for 100-candle payloads
            'ema_cross_fast': 21,
            'ema_cross_med': 50,
            'ema_cross_slow': 100,
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
            'supertrend_period': 7,
            'supertrend_multiplier': 3.0,
            'schaff_fast': 10,
            'schaff_slow': 20,
            'schaff_d_macd': 3,
            'schaff_d_pf': 3,
            'demarker_period': 10,
            'cci_period': 14,
            'adx_period': 14
        }
        
        if 'indicator_params' in self.config:
            self.params.update(self.config['indicator_params'])
    
    def resample_to_grid(self, df: pd.DataFrame, timeframe: str = '1min') -> pd.DataFrame:
        """
        Ensures the DataFrame has a continuous time index at the specified interval.
        Missing candles are forward-filled (pausing indicators).
        """
        if df.empty:
            return df
            
        try:
            # Use 'time' or 'timestamp' as index
            time_col = 'time' if 'time' in df.columns else 'timestamp' if 'timestamp' in df.columns else None
            
            if not time_col:
                return df
                
            # Convert to datetime index
            df_resampled = df.copy()
            df_resampled[time_col] = pd.to_datetime(df_resampled[time_col], unit='s')
            df_resampled = df_resampled.set_index(time_col)
            
            # Resample to 1 minute grid (1T)
            # Use 'min' as 1T is deprecated in some versions or just for clarity
            df_resampled = df_resampled.resample(timeframe).asfreq()
            
            # Count gaps before filling for logging
            gaps = df_resampled['close'].isna().sum()
            if gaps > 0:
                self.logger.info(f"Time-Series Alignment: Found {gaps} missing candles. Forward-filling...")
            
            # Forward fill the 'close' price and other columns
            # 'open', 'high', 'low' should also be filled with 'close' of previous candle 
            # to simulate a flat price action during 'dead space'
            df_resampled['close'] = df_resampled['close'].ffill()
            df_resampled['open'] = df_resampled['open'].fillna(df_resampled['close'])
            df_resampled['high'] = df_resampled['high'].fillna(df_resampled['close'])
            df_resampled['low'] = df_resampled['low'].fillna(df_resampled['close'])
            
            # Volume 0 for missing candles
            if 'volume' in df_resampled.columns:
                df_resampled['volume'] = df_resampled['volume'].fillna(0)
            
            # Reset index and convert back to unix timestamps
            df_final = df_resampled.reset_index()
            df_final[time_col] = df_final[time_col].astype('int64') // 10**9
            
            return df_final
            
        except Exception as e:
            self.logger.error(f"Resampling failed: {e}")
            return df
    
    def calculate_indicators(self, df: pd.DataFrame, timeframe_min: int = 1) -> pd.DataFrame:
        """
        Calculate all technical indicators for the given DataFrame.

        Args:
            df: OHLCV DataFrame with columns [open, high, low, close, timestamp].
            timeframe_min: Candle interval in minutes (default 1). Used to build
                the correct resampling grid so indicators are computed on the right
                time scale (e.g. 5min for 5m data, not the hardcoded 1min).
                Fix 2: previously hardcoded to '1min', now uses the actual timeframe.
        """
        try:
            if len(df) < 50:  # Minimal data check
                # self.logger.debug(f"Insufficient data for full indicator calculation: {len(df)} candles")
                pass
            
            required_cols = ['open', 'high', 'low', 'close']
            if not all(col in df.columns for col in required_cols):
                raise ValueError(f"DataFrame must contain columns: {required_cols}")
            
            # 0. Defensive: Handle infinity/NaN in input data
            df = df.replace([np.inf, -np.inf], np.nan)
            
            # 0.1 Time-Series Alignment: Fill gaps to prevent indicator distortion.
            # Fix 2: Use the actual requested timeframe instead of hardcoded '1min'.
            # For 5m data this produces a 5min grid; for 1m data it stays at 1min.
            pandas_alias = f'{max(1, int(timeframe_min))}min'
            df = self.resample_to_grid(df, timeframe=pandas_alias)
            
            result_df = df.copy()
            
            result_df = self._calculate_trend_indicators(result_df)
            result_df = self._calculate_momentum_indicators(result_df)
            result_df = self._calculate_volatility_indicators(result_df)
            result_df = self._calculate_custom_indicators(result_df)
            result_df = self._calculate_ema_crossover(result_df)
            result_df = self._calculate_support_resistance(result_df)
            
            return result_df
            
        except Exception as e:
            self.logger.error(f"Error calculating indicators: {str(e)}")
            return df
    
    def _calculate_trend_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            df['sma_20'] = df['close'].rolling(window=self.params['sma_period']).mean()
            df['ema_16'] = df['close'].ewm(span=self.params['ema_fast']).mean()
            df['ema_89'] = df['close'].ewm(span=self.params['ema_slow']).mean()  # Fibonacci period
            
            # WMA
            weights = np.arange(1, self.params['wma_period'] + 1)
            df['wma_20'] = df['close'].rolling(window=self.params['wma_period']).apply(
                lambda x: np.dot(x, weights) / weights.sum(), raw=True
            )
            
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
            else:
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
                    # bb_width is in RATIO form [0, 1] (not percentage).
                    # E.g., 0.04 = 4% bandwidth. Regime detector uses < 0.04 for squeeze detection.
                    df['bb_width'] = bb_data[f"BBB_{self.params['bb_period']}_{self.params['bb_std']}"] / 100
                    df['bb_percent'] = bb_data[f"BBP_{self.params['bb_period']}_{self.params['bb_std']}"]
            else:
                df['bb_middle'] = df['close'].rolling(window=self.params['bb_period']).mean()
                std_dev = df['close'].rolling(window=self.params['bb_period']).std()
                df['bb_upper'] = df['bb_middle'] + (std_dev * self.params['bb_std'])
                df['bb_lower'] = df['bb_middle'] - (std_dev * self.params['bb_std'])
                bb_range = df['bb_upper'] - df['bb_lower']
                # bb_width is in RATIO form [0, 1] (not percentage). Same scale as pandas_ta path.
                df['bb_width'] = bb_range / df['bb_middle'].replace(0, np.nan)
                df['bb_percent'] = (df['close'] - df['bb_lower']) / bb_range.replace(0, np.nan)
            
        except Exception as e:
            self.logger.error(f"Error calculating trend indicators: {str(e)}", exc_info=True)
            # MIN-1: Explicitly NaN-fill expected columns so downstream code does not silently
            # receive a partially-populated DataFrame (Core Principle #8: Zero Silent Failures).
            for col in [
                'sma_20', 'ema_16', 'ema_89', 'wma_20',
                'macd', 'macd_signal', 'macd_histogram',
                'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_percent',
            ]:
                if col not in df.columns:
                    df[col] = np.nan

        return df
    
    def _calculate_momentum_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            # RSI
            if PANDAS_TA_AVAILABLE:
                df['rsi_14'] = ta.rsi(df['close'], length=self.params['rsi_period'])
                df['rsi_21'] = ta.rsi(df['close'], length=self.params['rsi_period_2'])
            else:
                delta = df['close'].diff()
                gain = (delta.where(delta > 0, 0)).fillna(0)
                loss = (-delta.where(delta < 0, 0)).fillna(0)
                
                avg_gain_14 = gain.ewm(alpha=1/self.params['rsi_period'], adjust=False).mean()
                avg_loss_14 = loss.ewm(alpha=1/self.params['rsi_period'], adjust=False).mean()
                rs_14 = avg_gain_14 / avg_loss_14.replace(0, np.nan)
                df['rsi_14'] = 100 - (100 / (1 + rs_14))
                
                avg_gain_21 = gain.ewm(alpha=1/self.params['rsi_period_2'], adjust=False).mean()
                avg_loss_21 = loss.ewm(alpha=1/self.params['rsi_period_2'], adjust=False).mean()
                rs_21 = avg_gain_21 / avg_loss_21.replace(0, np.nan)
                df['rsi_21'] = 100 - (100 / (1 + rs_21))
            
            # Stochastic
            if PANDAS_TA_AVAILABLE:
                stoch_data = ta.stoch(df['high'], df['low'], df['close'],
                                    k=self.params['stoch_k'],
                                    d=self.params['stoch_d'])
                if stoch_data is not None and not stoch_data.empty:
                    df['stoch_k'] = stoch_data[f"STOCHk_{self.params['stoch_k']}_{self.params['stoch_d']}_3"]
                    df['stoch_d'] = stoch_data[f"STOCHd_{self.params['stoch_k']}_{self.params['stoch_d']}_3"]
            else:
                lowest_low = df['low'].rolling(window=self.params['stoch_k']).min()
                highest_high = df['high'].rolling(window=self.params['stoch_k']).max()
                df['stoch_k'] = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low).replace(0, np.nan))
                df['stoch_d'] = df['stoch_k'].rolling(window=self.params['stoch_d']).mean()
            
            # Williams %R
            if PANDAS_TA_AVAILABLE:
                df['williams_r'] = ta.willr(df['high'], df['low'], df['close'], 
                                          length=self.params['williams_period'])
            else:
                highest_high = df['high'].rolling(window=self.params['williams_period']).max()
                lowest_low = df['low'].rolling(window=self.params['williams_period']).min()
                df['williams_r'] = -100 * ((highest_high - df['close']) / (highest_high - lowest_low).replace(0, np.nan))
            
            # ROC
            if PANDAS_TA_AVAILABLE:
                df['roc_10'] = ta.roc(df['close'], length=self.params['roc_period'])
            else:
                df['roc_10'] = df['close'].pct_change(periods=self.params['roc_period']) * 100
            
            # Schaff Trend Cycle
            df = self._calculate_schaff_trend_cycle(df)
            
            # DeMarker
            df = self._calculate_demarker(df)
            
            # CCI
            df = self._calculate_cci(df)
            
            # ADX
            df = self._calculate_adx(df)
            
        except Exception as e:
            self.logger.error(f"Error calculating momentum indicators: {str(e)}")
        
        return df

    def _calculate_adx(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates ADX using Wilder's smoothing (alpha = 1/period).
        Standard platforms (TradingView, MetaTrader, Pocket Option) all use
        Wilder's smoothing — NOT the standard EMA (span=period).
        Using ewm(span=period) produces alpha=2/(period+1) which is ~2x faster
        and yields systematically higher ADX values than the industry standard.
        """
        try:
            period = self.params.get('adx_period', 14)

            # Use pandas_ta if available — it implements Wilder's correctly
            if PANDAS_TA_AVAILABLE:
                adx_data = ta.adx(df['high'], df['low'], df['close'], length=period)
                if adx_data is not None and not adx_data.empty:
                    adx_col = f'ADX_{period}'
                    dmp_col = f'DMP_{period}'
                    dmn_col = f'DMN_{period}'
                    if adx_col in adx_data.columns:
                        df['adx'] = adx_data[adx_col]
                        df['plus_di'] = adx_data.get(dmp_col, np.nan)
                        df['minus_di'] = adx_data.get(dmn_col, np.nan)
                        return df

            # Fallback: manual Wilder's smoothing (alpha = 1/period)
            alpha = 1.0 / period
            high_diff = df['high'].diff()
            low_diff = -df['low'].diff()
            plus_dm = high_diff.where((high_diff > low_diff) & (high_diff > 0), 0.0)
            minus_dm = low_diff.where((low_diff > high_diff) & (low_diff > 0), 0.0)

            if 'atr_14' in df.columns:
                atr = df['atr_14']
            else:
                df = self._calculate_volatility_indicators(df)
                atr = df['atr_14']

            # Wilder's smoothing: ewm(alpha=1/period) — matches industry standard
            plus_di = 100 * (plus_dm.ewm(alpha=alpha, adjust=False).mean() / atr.replace(0, np.nan))
            minus_di = 100 * (minus_dm.ewm(alpha=alpha, adjust=False).mean() / atr.replace(0, np.nan))

            denominator = (plus_di + minus_di).replace(0, np.nan)
            dx = 100 * (abs(plus_di - minus_di) / denominator)

            df['adx'] = dx.ewm(alpha=alpha, adjust=False).mean()
            df['plus_di'] = plus_di
            df['minus_di'] = minus_di

        except Exception as e:
            self.logger.error(f"Error calculating ADX: {str(e)}")
            df['adx'] = np.nan
            df['plus_di'] = np.nan
            df['minus_di'] = np.nan

        return df
    
    def _calculate_volatility_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            # True Range
            high_low = df['high'] - df['low']
            high_close_prev = np.abs(df['high'] - df['close'].shift(1))
            low_close_prev = np.abs(df['low'] - df['close'].shift(1))
            df['true_range'] = np.maximum(high_low, np.maximum(high_close_prev, low_close_prev))
            
            # ATR
            if PANDAS_TA_AVAILABLE:
                df['atr_14'] = ta.atr(df['high'], df['low'], df['close'], length=self.params['atr_period'])
                df['atr_21'] = ta.atr(df['high'], df['low'], df['close'], length=self.params['atr_period_2'])
            else:
                df['atr_14'] = df['true_range'].rolling(window=self.params['atr_period']).mean()
                df['atr_21'] = df['true_range'].rolling(window=self.params['atr_period_2']).mean()
            
        except Exception as e:
            self.logger.error(f"Error calculating volatility indicators: {str(e)}")
        
        return df
    
    def _calculate_custom_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            # SuperTrend
            if PANDAS_TA_AVAILABLE:
                supertrend_data = ta.supertrend(df['high'], df['low'], df['close'],
                                              length=self.params['supertrend_period'],
                                              multiplier=self.params['supertrend_multiplier'])
                if supertrend_data is not None and not supertrend_data.empty:
                    df['supertrend'] = supertrend_data[f"SUPERT_{self.params['supertrend_period']}_{self.params['supertrend_multiplier']}"]
                    df['supertrend_direction'] = supertrend_data[f"SUPERTd_{self.params['supertrend_period']}_{self.params['supertrend_multiplier']}"].map({1: 'up', -1: 'down'})
            else:
                hl2 = (df['high'] + df['low']) / 2
                st_period = self.params.get('supertrend_period', 7)
                multiplier = self.params.get('supertrend_multiplier', 3.0)
                
                if 'true_range' not in df.columns:
                    high_low = df['high'] - df['low']
                    high_close_prev = np.abs(df['high'] - df['close'].shift(1))
                    low_close_prev = np.abs(df['low'] - df['close'].shift(1))
                    tr = np.maximum(high_low, np.maximum(high_close_prev, low_close_prev))
                else:
                    tr = df['true_range']
                
                atr = tr.rolling(window=st_period).mean()
                
                basic_ub = hl2 + (multiplier * atr)
                basic_lb = hl2 - (multiplier * atr)
                
                final_ub = pd.Series(index=df.index, dtype=float)
                final_lb = pd.Series(index=df.index, dtype=float)
                supertrend = pd.Series(index=df.index, dtype=float)
                direction = pd.Series(index=df.index, dtype=str)
                
                # First candle initialization
                start_idx = st_period
                if len(df) > start_idx:
                    final_ub.iloc[start_idx] = basic_ub.iloc[start_idx]
                    final_lb.iloc[start_idx] = basic_lb.iloc[start_idx]
                    direction.iloc[start_idx] = 'up'
                    supertrend.iloc[start_idx] = final_lb.iloc[start_idx]
                    
                    for i in range(start_idx + 1, len(df)):
                        # Final Upper Band
                        if basic_ub.iloc[i] < final_ub.iloc[i-1] or df['close'].iloc[i-1] > final_ub.iloc[i-1]:
                            final_ub.iloc[i] = basic_ub.iloc[i]
                        else:
                            final_ub.iloc[i] = final_ub.iloc[i-1]
                            
                        # Final Lower Band
                        if basic_lb.iloc[i] > final_lb.iloc[i-1] or df['close'].iloc[i-1] < final_lb.iloc[i-1]:
                            final_lb.iloc[i] = basic_lb.iloc[i]
                        else:
                            final_lb.iloc[i] = final_lb.iloc[i-1]
                            
                        # Trend and SuperTrend value
                        if direction.iloc[i-1] == 'up':
                            if df['close'].iloc[i] < final_lb.iloc[i]:
                                direction.iloc[i] = 'down'
                                supertrend.iloc[i] = final_ub.iloc[i]
                            else:
                                direction.iloc[i] = 'up'
                                supertrend.iloc[i] = final_lb.iloc[i]
                        else: # previous direction was 'down'
                            if df['close'].iloc[i] > final_ub.iloc[i]:
                                direction.iloc[i] = 'up'
                                supertrend.iloc[i] = final_lb.iloc[i]
                            else:
                                direction.iloc[i] = 'down'
                                supertrend.iloc[i] = final_ub.iloc[i]
                
                df['supertrend'] = supertrend
                df['supertrend_direction'] = direction
                
        except Exception as e:
            self.logger.error(f"Error calculating custom indicators: {str(e)}")
        
        return df
    
    def _calculate_schaff_trend_cycle(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            fast = self.params['schaff_fast']
            slow = self.params['schaff_slow']
            d_macd = self.params['schaff_d_macd']
            d_pf = self.params['schaff_d_pf']
            
            ema_fast = df['close'].ewm(span=fast, adjust=False).mean()
            ema_slow = df['close'].ewm(span=slow, adjust=False).mean()
            macd = ema_fast - ema_slow
            
            macd_min = macd.rolling(window=d_macd).min()
            macd_max = macd.rolling(window=d_macd).max()

            macd_range = macd_max - macd_min
            stoch_macd = 100 * (macd - macd_min) / macd_range.replace(0, np.nan)

            pf = stoch_macd.ewm(span=d_macd, adjust=False).mean()

            pf_min = pf.rolling(window=d_pf).min()
            pf_max = pf.rolling(window=d_pf).max()

            pf_range = pf_max - pf_min
            stc = 100 * (pf - pf_min) / pf_range.replace(0, 1e-12)
            stc = stc.clip(lower=0, upper=100)

            df['schaff_tc'] = stc.ewm(span=d_pf, adjust=False).mean()
            
        except Exception as e:
            self.logger.error(f"Error calculating Schaff Trend Cycle: {str(e)}")
            df['schaff_tc'] = None
        
        return df
    
    def _calculate_demarker(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            period = self.params['demarker_period']
            
            high_diff = df['high'].diff()
            low_diff = df['low'].diff()

            demax = high_diff.clip(lower=0).fillna(0)
            demin = (-low_diff).clip(lower=0).fillna(0)

            demax_sma = demax.rolling(window=period).mean()
            demin_sma = demin.rolling(window=period).mean()

            denominator = demax_sma + demin_sma
            demarker = demax_sma / denominator.replace(0, np.nan)

            df['demarker'] = demarker
            
        except Exception as e:
            self.logger.error(f"Error calculating DeMarker: {str(e)}")
            df['demarker'] = None
        
        return df
    
    def _calculate_ema_crossover(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            fast = self.params.get('ema_cross_fast', 21)
            med = self.params.get('ema_cross_med', 50)
            slow = self.params.get('ema_cross_slow', 100)
            
            df['ema_21'] = df['close'].ewm(span=fast, adjust=False).mean()
            df['ema_50'] = df['close'].ewm(span=med, adjust=False).mean()
            df['ema_100'] = df['close'].ewm(span=slow, adjust=False).mean()
            
        except Exception as e:
            self.logger.error(f"Error calculating EMA Cross-Over: {str(e)}")
            df['ema_21'] = np.nan
            df['ema_50'] = np.nan
            df['ema_100'] = np.nan
        
        return df

    def _calculate_support_resistance(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates Support/Resistance levels using fractal pivots with confirmation lag.

        Enhancements (Phases 1-5):
        - Phase 1: dist_to_resistance, dist_to_support (% distance from close)
        - Phase 2: resistance_touch_count, support_touch_count, freshness classification
        - Phase 3: sr_flip, sr_flip_price (broken level detection)
        - Phase 4: zone bounds (resistance_zone_upper/lower, support_zone_upper/lower)
        """
        try:
            n = self.params.get('support_resistance_period', 5)
            window = 2 * n + 1

            # ── 1. Identify fractal pivots (vectorized, center=True for full-window look) ──
            rolling_max = df['high'].rolling(window=window, center=True).max()
            is_pivot_high = (df['high'] == rolling_max)

            rolling_min = df['low'].rolling(window=window, center=True).min()
            is_pivot_low = (df['low'] == rolling_min)

            # Shift signal by n so live bar only sees pivot confirmed n bars ago (no repainting)
            confirmed_highs = df['high'].where(is_pivot_high).shift(n)
            confirmed_lows  = df['low'].where(is_pivot_low).shift(n)

            df['resistance_level'] = confirmed_highs.ffill()
            df['support_level']    = confirmed_lows.ffill()

            # ── Phase 4: Zone bounds (fractal candle body gives zone thickness) ──
            # Capture the OHLC of each fractal candle to define the supply/demand zone
            res_zone_upper = df['high'].where(is_pivot_high).shift(n).ffill()
            res_zone_lower = df[['open', 'close']].min(axis=1).where(is_pivot_high).shift(n).ffill()
            sup_zone_upper = df[['open', 'close']].max(axis=1).where(is_pivot_low).shift(n).ffill()
            sup_zone_lower = df['low'].where(is_pivot_low).shift(n).ffill()

            df['resistance_zone_upper'] = res_zone_upper
            df['resistance_zone_lower'] = res_zone_lower
            df['support_zone_upper']    = sup_zone_upper
            df['support_zone_lower']    = sup_zone_lower

            # ── Phase 1: Distance metrics (% distance from close to level) ──
            df['dist_to_resistance'] = np.where(
                df['resistance_level'].notna() & (df['close'] > 0),
                (df['resistance_level'] - df['close']) / df['close'] * 100,
                np.nan
            )
            df['dist_to_support'] = np.where(
                df['support_level'].notna() & (df['close'] > 0),
                (df['close'] - df['support_level']) / df['close'] * 100,
                np.nan
            )

            # ── Phase 2: Touch count ──
            # A "touch" occurs when price comes within 0.5×ATR of the level
            # without closing through it (body close stays on the correct side).
            atr = df.get('atr_14', df['high'] - df['low'])  # fallback if ATR not yet computed
            touch_band = atr * 0.5

            # For each bar, check proximity to the CURRENT active level
            near_resistance = (
                (df['high'] >= df['resistance_level'] - touch_band) &
                (df['close'] < df['resistance_level'])  # body stayed below = touch not break
            )
            near_support = (
                (df['low'] <= df['support_level'] + touch_band) &
                (df['close'] > df['support_level'])   # body stayed above = touch not break
            )

            # Count cumulative touches per unique level — reset counter when level changes
            res_level_id  = (df['resistance_level'] != df['resistance_level'].shift(1)).cumsum()
            sup_level_id  = (df['support_level'] != df['support_level'].shift(1)).cumsum()

            df['resistance_touch_count'] = (
                near_resistance.astype(int)
                .groupby(res_level_id)
                .cumsum()
                .astype('Int64')
            )
            df['support_touch_count'] = (
                near_support.astype(int)
                .groupby(sup_level_id)
                .cumsum()
                .astype('Int64')
            )

            # ── Phase 5: Freshness classification ──
            def _freshness(tc: pd.Series) -> pd.Series:
                return tc.map(lambda v: (
                    'fresh'  if pd.isna(v) or v <= 1 else
                    'tested' if v <= 3 else
                    'stale'
                ))

            df['resistance_freshness'] = _freshness(df['resistance_touch_count'])
            df['support_freshness']    = _freshness(df['support_touch_count'])

            # ── Phase 3: S/R Flip detection ──
            # A flip is when price CLOSES through the active level (body break, not just wick).
            prev_res = df['resistance_level'].shift(1)
            prev_sup = df['support_level'].shift(1)

            resistance_broken = (df['close'] > prev_res) & prev_res.notna()
            support_broken    = (df['close'] < prev_sup) & prev_sup.notna()

            df['sr_flip']       = resistance_broken | support_broken
            df['sr_flip_price'] = np.where(
                resistance_broken, prev_res,
                np.where(support_broken, prev_sup, np.nan)
            )

        except Exception as e:
            self.logger.error(f"Error calculating Support/Resistance: {str(e)}")
            for col in [
                'resistance_level', 'support_level',
                'dist_to_resistance', 'dist_to_support',
                'resistance_touch_count', 'support_touch_count',
                'resistance_freshness', 'support_freshness',
                'sr_flip', 'sr_flip_price',
                'resistance_zone_upper', 'resistance_zone_lower',
                'support_zone_upper', 'support_zone_lower',
            ]:
                df[col] = np.nan

        return df

    def _calculate_cci(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            period = self.params.get('cci_period', 14)
            typical_price = (df['high'] + df['low'] + df['close']) / 3
            sma_tp = typical_price.rolling(window=period).mean()

            mean_dev = typical_price.rolling(window=period).apply(
                lambda x: np.mean(np.abs(x - x.mean())),
                raw=True,
            )

            denominator = (0.015 * mean_dev).replace(0, np.nan)
            cci = (typical_price - sma_tp) / denominator

            df['cci'] = cci
            
        except Exception as e:
            self.logger.error(f"Error calculating CCI: {str(e)}")
            df['cci'] = np.nan
        
        return df
    
    def create_indicator_set(self, df_row: pd.Series) -> Optional[IndicatorSet]:
        """Create IndicatorSet from DataFrame row"""
        try:
            return IndicatorSet(
                timestamp=float(df_row.get('timestamp', 0.0)),
                asset=str(df_row.get('asset', '')),
                open=float(df_row.get('open', 0.0)),
                high=float(df_row.get('high', 0.0)),
                low=float(df_row.get('low', 0.0)),
                close=float(df_row.get('close', 0.0)),

                sma_20=self._safe_float(df_row.get('sma_20')),
                ema_16=self._safe_float(df_row.get('ema_16')),
                ema_89=self._safe_float(df_row.get('ema_89')),
                ema_21=self._safe_float(df_row.get('ema_21')),
                ema_50=self._safe_float(df_row.get('ema_50')),
                ema_100=self._safe_float(df_row.get('ema_100')),
                wma_20=self._safe_float(df_row.get('wma_20')),

                rsi_14=self._safe_float(df_row.get('rsi_14')),
                rsi_21=self._safe_float(df_row.get('rsi_21')),
                stoch_k=self._safe_float(df_row.get('stoch_k')),
                stoch_d=self._safe_float(df_row.get('stoch_d')),
                williams_r=self._safe_float(df_row.get('williams_r')),
                roc_10=self._safe_float(df_row.get('roc_10')),

                macd=self._safe_float(df_row.get('macd')),
                macd_signal=self._safe_float(df_row.get('macd_signal')),
                macd_histogram=self._safe_float(df_row.get('macd_histogram')),

                bb_upper=self._safe_float(df_row.get('bb_upper')),
                bb_middle=self._safe_float(df_row.get('bb_middle')),
                bb_lower=self._safe_float(df_row.get('bb_lower')),
                bb_width=self._safe_float(df_row.get('bb_width')),
                bb_percent=self._safe_float(df_row.get('bb_percent')),

                atr_14=self._safe_float(df_row.get('atr_14')),
                atr_21=self._safe_float(df_row.get('atr_21')),
                true_range=self._safe_float(df_row.get('true_range')),
                adx=self._safe_float(df_row.get('adx')),
                plus_di=self._safe_float(df_row.get('plus_di')),
                minus_di=self._safe_float(df_row.get('minus_di')),

                supertrend=self._safe_float(df_row.get('supertrend')),
                supertrend_direction=str(df_row.get('supertrend_direction', '')),

                schaff_tc=self._safe_float(df_row.get('schaff_tc')),
                demarker=self._safe_float(df_row.get('demarker')),
                cci=self._safe_float(df_row.get('cci')),

                # S/R Enhancements (Phases 1–5)
                resistance_level=self._safe_float(df_row.get('resistance_level')),
                support_level=self._safe_float(df_row.get('support_level')),
                dist_to_resistance=self._safe_float(df_row.get('dist_to_resistance')),
                dist_to_support=self._safe_float(df_row.get('dist_to_support')),
                resistance_touch_count=self._safe_int(df_row.get('resistance_touch_count')),
                support_touch_count=self._safe_int(df_row.get('support_touch_count')),
                resistance_freshness=str(df_row.get('resistance_freshness', 'fresh')) if df_row.get('resistance_freshness') else None,
                support_freshness=str(df_row.get('support_freshness', 'fresh')) if df_row.get('support_freshness') else None,
                sr_flip=bool(df_row.get('sr_flip', False)) if df_row.get('sr_flip') is not None else None,
                sr_flip_price=self._safe_float(df_row.get('sr_flip_price')),
                resistance_zone_upper=self._safe_float(df_row.get('resistance_zone_upper')),
                resistance_zone_lower=self._safe_float(df_row.get('resistance_zone_lower')),
                support_zone_upper=self._safe_float(df_row.get('support_zone_upper')),
                support_zone_lower=self._safe_float(df_row.get('support_zone_lower')),
            )
        except Exception as e:
            self.logger.error(f"Error creating indicator set: {str(e)}")
            return None
    
    def _safe_float(self, value) -> Optional[float]:
        try:
            if pd.isna(value) or value is None:
                return None
            return float(value)
        except (ValueError, TypeError):
            return None

    def _safe_int(self, value) -> Optional[int]:
        try:
            if value is None or (hasattr(pd, 'isna') and pd.isna(value)):
                return None
            return int(value)
        except (ValueError, TypeError):
            return None
