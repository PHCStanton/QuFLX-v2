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
    
    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate all technical indicators for the given DataFrame.
        """
        try:
            if len(df) < 50:  # Minimal data check
                # self.logger.debug(f"Insufficient data for full indicator calculation: {len(df)} candles")
                pass
            
            required_cols = ['open', 'high', 'low', 'close']
            if not all(col in df.columns for col in required_cols):
                raise ValueError(f"DataFrame must contain columns: {required_cols}")
            
            result_df = df.copy()
            
            result_df = self._calculate_trend_indicators(result_df)
            result_df = self._calculate_momentum_indicators(result_df)
            result_df = self._calculate_volatility_indicators(result_df)
            result_df = self._calculate_custom_indicators(result_df)
            
            return result_df
            
        except Exception as e:
            self.logger.error(f"Error calculating indicators: {str(e)}")
            return df
    
    def _calculate_trend_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            df['sma_20'] = df['close'].rolling(window=self.params['sma_period']).mean()
            df['ema_16'] = df['close'].ewm(span=self.params['ema_fast']).mean()
            df['ema_165'] = df['close'].ewm(span=self.params['ema_slow']).mean()
            
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
                    df['bb_width'] = bb_data[f"BBB_{self.params['bb_period']}_{self.params['bb_std']}"]
                    df['bb_percent'] = bb_data[f"BBP_{self.params['bb_period']}_{self.params['bb_std']}"]
            else:
                df['bb_middle'] = df['close'].rolling(window=self.params['bb_period']).mean()
                std_dev = df['close'].rolling(window=self.params['bb_period']).std()
                df['bb_upper'] = df['bb_middle'] + (std_dev * self.params['bb_std'])
                df['bb_lower'] = df['bb_middle'] - (std_dev * self.params['bb_std'])
                bb_range = df['bb_upper'] - df['bb_lower']
                df['bb_width'] = bb_range / df['bb_middle'].replace(0, np.nan)
                df['bb_percent'] = (df['close'] - df['bb_lower']) / bb_range.replace(0, np.nan)
            
        except Exception as e:
            self.logger.error(f"Error calculating trend indicators: {str(e)}")
        
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
        try:
            period = self.params.get('adx_period', 14)
            high_diff = df['high'].diff()
            low_diff = -df['low'].diff()
            plus_dm = high_diff.where((high_diff > low_diff) & (high_diff > 0), 0.0)
            minus_dm = low_diff.where((low_diff > high_diff) & (low_diff > 0), 0.0)

            if 'atr_14' in df.columns:
                atr = df['atr_14']
            else:
                df = self._calculate_volatility_indicators(df)
                atr = df['atr_14']

            plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan))
            minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan))

            denominator = (plus_di + minus_di).replace(0, np.nan)
            dx = 100 * (abs(plus_di - minus_di) / denominator)

            df['adx'] = dx.ewm(span=period, adjust=False).mean()
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
                
                # Use a period-specific ATR for SuperTrend
                st_period = self.params.get('supertrend_period', 7)
                if 'true_range' not in df.columns:
                    # Calculate TR if missing
                    high_low = df['high'] - df['low']
                    high_close_prev = np.abs(df['high'] - df['close'].shift(1))
                    low_close_prev = np.abs(df['low'] - df['close'].shift(1))
                    tr = np.maximum(high_low, np.maximum(high_close_prev, low_close_prev))
                else:
                    tr = df['true_range']
                
                atr = tr.rolling(window=st_period).mean()
                
                multiplier = self.params.get('supertrend_multiplier', 3.0)
                upper_band = hl2 + (multiplier * atr)
                lower_band = hl2 - (multiplier * atr)
                
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
            stoch_macd = stoch_macd.fillna(0)

            pf = stoch_macd.ewm(span=d_macd, adjust=False).mean()

            pf_min = pf.rolling(window=d_pf).min()
            pf_max = pf.rolling(window=d_pf).max()

            pf_range = pf_max - pf_min
            stc = 100 * (pf - pf_min) / pf_range.replace(0, np.nan)
            stc = stc.fillna(0)

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
            demarker = demarker.fillna(0)

            df['demarker'] = demarker
            
        except Exception as e:
            self.logger.error(f"Error calculating DeMarker: {str(e)}")
            df['demarker'] = None
        
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
                ema_165=self._safe_float(df_row.get('ema_165')),
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
                cci=self._safe_float(df_row.get('cci'))
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
