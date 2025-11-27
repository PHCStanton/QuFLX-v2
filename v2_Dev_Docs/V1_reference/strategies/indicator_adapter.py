#!/usr/bin/env python3
"""
Indicator Adapter Module
Bridges TechnicalIndicatorsPipeline with streaming server frontend format.
Handles format conversion and instance-based indicator requests.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path
import sys

# Add paths for imports
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

from strategies.technical_indicators import TechnicalIndicatorsPipeline


class IndicatorAdapter:
    """
    Adapter to convert between streaming server format and TechnicalIndicatorsPipeline.
    
    Handles:
    - Candle array format → DataFrame conversion
    - Instance-based indicator configuration
    - Result transformation → frontend format
    """
    
    def __init__(self):
        """Initialize the adapter (TechnicalIndicatorsPipeline created per request to avoid parameter bleed)."""
        pass  # Pipeline instantiated per request for isolation
    
    def calculate_indicators_for_instances(
        self, 
        asset: str, 
        candles: List[List], 
        instances: Dict[str, Dict[str, Any]],
        timeframe_seconds: int = 60
    ) -> Dict[str, Any]:
        """
        Calculate indicators for multiple instances.
        
        Args:
            asset: Asset name (e.g., 'EURUSD_OTC')
            candles: List of candles in format [timestamp, open, close, high, low]
            instances: Dict of instance configs, e.g.:
                {
                    'SMA-20': {'type': 'sma', 'params': {'period': 20}},
                    'RSI-14': {'type': 'rsi', 'params': {'period': 14}}
                }
            timeframe_seconds: Candle period in seconds (default: 60 for 1-minute candles)
        
        Returns:
            Dict with format:
            {
                'asset': str,
                'indicators': {instance_name: {value, params, signal}, ...},
                'series': {instance_name: [{time, value}, ...], ...},
                'signals': {instance_name: signal, ...},
                'timestamp': str
            }
        """
        try:
            # Convert candles to DataFrame
            df = self._candles_to_dataframe(candles)
            
            if df.empty or len(df) < 20:
                return {
                    "error": f"Insufficient data points for {asset}: {len(df)} (minimum 20 required)",
                    "timestamp": datetime.now().isoformat()
                }
            
            # Extract metadata for backward compatibility
            timestamps = [c[0] for c in candles]
            closes = [c[2] for c in candles]  # Note: candles format is [timestamp, open, close, high, low]
            
            # Initialize result structure with all required metadata fields
            result = {
                "asset": asset,
                "timeframe_minutes": timeframe_seconds // 60,  # Convert seconds to minutes
                "data_points": len(candles),
                "latest_timestamp": timestamps[-1] if timestamps else None,
                "latest_price": closes[-1] if closes else None,
                "indicators": {},
                "series": {},
                "signals": {},
                "timestamp": datetime.now().isoformat()
            }
            
            # Calculate each indicator instance
            for instance_name, instance_config in instances.items():
                indicator_type = instance_config.get('type')
                params = instance_config.get('params', {})
                
                # Skip if no indicator type specified
                if not indicator_type:
                    continue
                
                # Create fresh pipeline instance for this indicator to prevent parameter bleed
                pipeline = TechnicalIndicatorsPipeline()
                
                # Configure pipeline for this specific indicator
                self._configure_pipeline_for_indicator(pipeline, indicator_type, params)
                
                # Calculate indicators
                df_with_indicators = pipeline.calculate_indicators(df.copy())
                
                # Extract and format results for this instance
                instance_result = self._extract_indicator_data(
                    df_with_indicators,
                    indicator_type,
                    instance_name,
                    params
                )
                
                if instance_result:
                    result['indicators'][instance_name] = instance_result['indicator']
                    result['series'][instance_name] = instance_result['series']
                    if 'signal' in instance_result:
                        result['signals'][instance_name] = instance_result['signal']
            
            return result
            
        except Exception as e:
            return {
                "error": f"Error calculating indicators: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
    
    def _candles_to_dataframe(self, candles: List[List]) -> pd.DataFrame:
        """
        Convert candle array format to pandas DataFrame.
        
        Args:
            candles: List of [timestamp, open, close, high, low]
        
        Returns:
            DataFrame with columns: timestamp, open, high, low, close
        """
        if not candles:
            return pd.DataFrame()
        
        # Extract OHLC data (note: candles format is [timestamp, open, close, high, low])
        data = {
            'timestamp': [c[0] for c in candles],
            'open': [c[1] for c in candles],
            'close': [c[2] for c in candles],  # Note: close is index 2
            'high': [c[3] for c in candles],
            'low': [c[4] for c in candles],
            'volume': [0] * len(candles)  # OTC pairs don't have volume
        }
        
        df = pd.DataFrame(data)
        
        # Remove duplicate timestamps, keeping the last occurrence
        df = df.drop_duplicates(subset=['timestamp'], keep='last')
        
        # Sort by timestamp to ensure ascending order
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        return df
    
    def _configure_pipeline_for_indicator(self, pipeline: TechnicalIndicatorsPipeline, indicator_type: str, params: Dict[str, Any]):
        """
        Configure the pipeline parameters for a specific indicator.
        
        Args:
            pipeline: TechnicalIndicatorsPipeline instance to configure
            indicator_type: Type of indicator (sma, ema, rsi, etc.)
            params: Parameters for the indicator
        """
        # Map frontend indicator types to pipeline parameter names
        param_mapping = {
            'sma': {'period': 'sma_period'},
            'ema': {'period': 'ema_fast'},
            'wma': {'period': 'wma_period'},
            'rsi': {'period': 'rsi_period'},
            'macd': {'fast': 'macd_fast', 'slow': 'macd_slow', 'signal': 'macd_signal'},
            'bollinger': {'period': 'bb_period', 'std_dev': 'bb_std'},
            'stochastic': {'k': 'stoch_k', 'd': 'stoch_d'},
            'williams_r': {'period': 'williams_period'},
            'roc': {'period': 'roc_period'},
            'schaff_tc': {
                'fast': 'schaff_fast',
                'slow': 'schaff_slow',
                'd_macd': 'schaff_d_macd',
                'd_pf': 'schaff_d_pf'
            },
            'demarker': {'period': 'demarker_period'},
            'cci': {'period': 'cci_period'},
            'atr': {'period': 'atr_period'},
            'supertrend': {'period': 'supertrend_period', 'multiplier': 'supertrend_multiplier'}
        }
        
        # Update pipeline params (each pipeline instance is fresh, so no bleed)
        if indicator_type in param_mapping:
            for param_key, pipeline_key in param_mapping[indicator_type].items():
                if param_key in params:
                    pipeline.params[pipeline_key] = params[param_key]
    
    def _find_indicator_columns(self, df: pd.DataFrame, indicator_type: str):
        """
        Dynamically find DataFrame columns for a given indicator type.
        
        Args:
            df: DataFrame with calculated indicators
            indicator_type: Type of indicator
        
        Returns:
            Single column name (str) or list of column names for multi-column indicators
        """
        df_columns = set(df.columns)
        
        # Single-column indicators - find by prefix
        if indicator_type in ['sma', 'ema', 'wma', 'rsi', 'williams_r', 'roc', 'schaff_tc', 'demarker', 'cci', 'atr', 'supertrend']:
            prefix_map = {
                'sma': 'sma_',
                'ema': 'ema_',
                'wma': 'wma_',
                'rsi': 'rsi_',
                'williams_r': 'williams_r',
                'roc': 'roc_',
                'schaff_tc': 'schaff_tc',
                'demarker': 'demarker',
                'cci': 'cci',
                'atr': 'atr_',
                'supertrend': 'supertrend'
            }
            
            prefix = prefix_map[indicator_type]
            # Find first column matching the prefix (case-insensitive for pandas_ta/talib compatibility)
            for col in df.columns:
                if col.lower().startswith(prefix.lower()):
                    return col
            return None
        
        # Multi-column indicators
        elif indicator_type == 'macd':
            # Look for MACD columns (could be from pandas_ta or manual calculation)
            macd_cols = [col for col in df_columns if 'macd' in col.lower()]
            if 'macd' in df_columns and 'macd_signal' in df_columns and 'macd_histogram' in df_columns:
                return ['macd', 'macd_signal', 'macd_histogram']
            # Try pandas_ta format
            macd_main = [col for col in macd_cols if col.startswith('MACD_')]
            macd_signal = [col for col in macd_cols if col.startswith('MACDs_')]
            macd_hist = [col for col in macd_cols if col.startswith('MACDh_')]
            if macd_main and macd_signal and macd_hist:
                return [macd_main[0], macd_signal[0], macd_hist[0]]
            return None
        
        elif indicator_type == 'bollinger':
            # Bollinger Bands columns
            if 'bb_upper' in df_columns and 'bb_middle' in df_columns and 'bb_lower' in df_columns:
                return ['bb_upper', 'bb_middle', 'bb_lower']
            # Try pandas_ta format
            bb_cols = [col for col in df_columns if col.startswith('BB')]
            bb_lower = [col for col in bb_cols if col.startswith('BBL_')]
            bb_middle = [col for col in bb_cols if col.startswith('BBM_')]
            bb_upper = [col for col in bb_cols if col.startswith('BBU_')]
            if bb_lower and bb_middle and bb_upper:
                return [bb_upper[0], bb_middle[0], bb_lower[0]]
            return None
        
        elif indicator_type == 'stochastic':
            # Stochastic columns
            if 'stoch_k' in df_columns and 'stoch_d' in df_columns:
                return ['stoch_k', 'stoch_d']
            # Try pandas_ta format
            stoch_cols = [col for col in df_columns if 'STOCH' in col]
            stoch_k = [col for col in stoch_cols if col.startswith('STOCHk_')]
            stoch_d = [col for col in stoch_cols if col.startswith('STOCHd_')]
            if stoch_k and stoch_d:
                return [stoch_k[0], stoch_d[0]]
            return None
        
        return None
    
    def _extract_indicator_data(
        self, 
        df: pd.DataFrame, 
        indicator_type: str,
        instance_name: str,
        params: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Extract indicator data from calculated DataFrame and format for frontend.
        Dynamically detects column names based on indicator type and DataFrame columns.
        
        Args:
            df: DataFrame with calculated indicators
            indicator_type: Type of indicator
            instance_name: Name of this instance
            params: Parameters used
        
        Returns:
            Dict with 'indicator', 'series', and optionally 'signal'
        """
        # Dynamically find columns based on indicator type prefix/pattern
        columns = self._find_indicator_columns(df, indicator_type)
        
        if not columns:
            return None
        
        # Handle single-column indicators
        if isinstance(columns, str):
            if columns not in df.columns:
                return None
            
            series_data = self._create_series(df, columns)
            latest_value = df[columns].iloc[-1] if not pd.isna(df[columns].iloc[-1]) else None
            
            result = {
                'indicator': {
                    'value': float(latest_value) if latest_value is not None else None,
                    'type': indicator_type,
                    **params
                },
                'series': series_data
            }
            
            # Add signal for momentum indicators
            if indicator_type in ['rsi', 'williams_r', 'roc', 'schaff_tc', 'demarker', 'cci']:
                result['signal'] = self._generate_signal(indicator_type, latest_value)
            
            return result
        
        # Handle multi-column indicators (MACD, Bollinger, Stochastic)
        elif isinstance(columns, list):
            return self._extract_multi_column_indicator(df, indicator_type, columns, params)
        
        return None
    
    def _create_series(self, df: pd.DataFrame, column: str) -> List[Dict[str, float]]:
        """
        Create time series data for a single indicator column.
        
        Args:
            df: DataFrame with indicator data
            column: Column name to extract
        
        Returns:
            List of {time: timestamp, value: float}
        """
        series_data = []
        for idx, row in df.iterrows():
            value = row[column]
            # Check for valid value (pd.notna works for both scalar and Series)
            if pd.notna(value):  # type: ignore[arg-type]
                series_data.append({
                    'time': int(row['timestamp']),
                    'value': float(value)
                })
        return series_data
    
    def _extract_multi_column_indicator(
        self,
        df: pd.DataFrame,
        indicator_type: str,
        columns: List[str],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract data for multi-column indicators like MACD, Bollinger Bands, Stochastic."""
        
        if indicator_type == 'macd':
            # MACD has three lines: macd, signal, histogram
            macd_col, signal_col, histogram_col = columns
            
            return {
                'indicator': {
                    'macd': float(df[macd_col].iloc[-1]) if not pd.isna(df[macd_col].iloc[-1]) else None,
                    'signal': float(df[signal_col].iloc[-1]) if not pd.isna(df[signal_col].iloc[-1]) else None,
                    'histogram': float(df[histogram_col].iloc[-1]) if not pd.isna(df[histogram_col].iloc[-1]) else None,
                    'type': 'macd',
                    **params
                },
                'series': {
                    'macd': self._create_series(df, macd_col),
                    'signal': self._create_series(df, signal_col),
                    'histogram': self._create_series(df, histogram_col)
                },
                'signal': 'BUY' if df[histogram_col].iloc[-1] > 0 else 'SELL'
            }
        
        elif indicator_type == 'bollinger':
            # Bollinger Bands: upper, middle, lower
            upper_col, middle_col, lower_col = columns
            
            return {
                'indicator': {
                    'upper': float(df[upper_col].iloc[-1]) if not pd.isna(df[upper_col].iloc[-1]) else None,
                    'middle': float(df[middle_col].iloc[-1]) if not pd.isna(df[middle_col].iloc[-1]) else None,
                    'lower': float(df[lower_col].iloc[-1]) if not pd.isna(df[lower_col].iloc[-1]) else None,
                    'type': 'bollinger',
                    **params
                },
                'series': {
                    'upper': self._create_series(df, upper_col),
                    'middle': self._create_series(df, middle_col),
                    'lower': self._create_series(df, lower_col)
                }
            }
        
        elif indicator_type == 'stochastic':
            # Stochastic: %K and %D lines
            k_col, d_col = columns
            
            return {
                'indicator': {
                    'k': float(df[k_col].iloc[-1]) if not pd.isna(df[k_col].iloc[-1]) else None,
                    'd': float(df[d_col].iloc[-1]) if not pd.isna(df[d_col].iloc[-1]) else None,
                    'type': 'stochastic',
                    **params
                },
                'series': {
                    'k': self._create_series(df, k_col),
                    'd': self._create_series(df, d_col)
                },
                'signal': self._generate_stochastic_signal(df[k_col].iloc[-1], df[d_col].iloc[-1])
            }
        
        return {}
    
    def _generate_signal(self, indicator_type: str, value: Optional[float]) -> str:
        """
        Generate BUY/SELL signal based on indicator value and type.
        
        Args:
            indicator_type: Type of indicator
            value: Current indicator value
        
        Returns:
            'BUY', 'SELL', or 'NEUTRAL'
        """
        if value is None:
            return 'NEUTRAL'
        
        if indicator_type == 'rsi':
            if value < 30:
                return 'BUY'  # Oversold
            elif value > 70:
                return 'SELL'  # Overbought
            return 'NEUTRAL'
        
        elif indicator_type == 'williams_r':
            if value < -80:
                return 'BUY'  # Oversold
            elif value > -20:
                return 'SELL'  # Overbought
            return 'NEUTRAL'
        
        elif indicator_type == 'schaff_tc':
            if value < 25:
                return 'BUY'
            elif value > 75:
                return 'SELL'
            return 'NEUTRAL'
        
        elif indicator_type == 'demarker':
            if value < 0.3:
                return 'BUY'
            elif value > 0.7:
                return 'SELL'
            return 'NEUTRAL'
        
        elif indicator_type == 'cci':
            if value < -100:
                return 'BUY'
            elif value > 100:
                return 'SELL'
            return 'NEUTRAL'
        
        elif indicator_type == 'roc':
            if value < 0:
                return 'SELL'
            elif value > 0:
                return 'BUY'
            return 'NEUTRAL'
        
        return 'NEUTRAL'
    
    def _generate_stochastic_signal(self, k_value: Optional[float], d_value: Optional[float]) -> str:
        """Generate signal for Stochastic Oscillator."""
        if k_value is None or d_value is None:
            return 'NEUTRAL'
        
        # Oversold/Overbought levels
        if k_value < 20 and d_value < 20:
            return 'BUY'  # Oversold
        elif k_value > 80 and d_value > 80:
            return 'SELL'  # Overbought
        
        return 'NEUTRAL'


# Singleton instance for reuse
_adapter_instance = None

def get_indicator_adapter() -> IndicatorAdapter:
    """Get or create the singleton IndicatorAdapter instance."""
    global _adapter_instance
    if _adapter_instance is None:
        _adapter_instance = IndicatorAdapter()
    return _adapter_instance
