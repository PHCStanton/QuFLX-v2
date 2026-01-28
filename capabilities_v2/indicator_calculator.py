from __future__ import annotations
import pandas as pd
import json
import logging
from typing import Dict, Any
from capabilities_v2.base import Ctx, CapResult
from backend.services.strategy.indicators import TechnicalIndicatorsPipeline

logger = logging.getLogger(__name__)

class IndicatorCalculator:
    id = "indicator_calculator"
    kind = "read"
    requires_browser = False

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        """
        Calculate technical indicators from a CSV history file.
        Inputs:
            csv_path (str): Path to the CSV history file
            asset (str): Asset name
            timeframe (int): Timeframe in minutes
            indicators (List[str]): Optional list of indicators to calculate
            params (Dict[str, Dict[str, Any]]): Optional per-indicator parameters
        """
        csv_path = inputs.get("csv_path")
        asset = inputs.get("asset")
        timeframe = inputs.get("timeframe", 1)
        requested_indicators = inputs.get("indicators", [])
        custom_params = inputs.get("params", {})
        current_candle = inputs.get("current_candle")

        if not csv_path:
            return CapResult.fail("csv_path is required")

        try:
            # 1. Load data from CSV
            df = pd.read_csv(csv_path)
            
            # 2. Append current candle if provided (for real-time updates)
            if current_candle:
                # Map frontend keys (time/timestamp) to backend key (timestamp)
                ts = current_candle.get("time") or current_candle.get("timestamp")
                new_row = {
                    "timestamp": float(ts),
                    "open": float(current_candle.get("open")),
                    "high": float(current_candle.get("high")),
                    "low": float(current_candle.get("low")),
                    "close": float(current_candle.get("close")),
                }
                
                # If last row has same timestamp, update it. Otherwise append.
                if not df.empty and float(df.iloc[-1]["timestamp"]) == float(ts):
                    for k, v in new_row.items():
                        df.loc[df.index[-1], k] = v
                else:
                    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

            if df.empty:
                return CapResult.fail(f"History file is empty: {csv_path}")

            # 3. Ensure column names are lowercase (pipeline expects open, high, low, close)
            df.columns = [col.lower() for col in df.columns]

            # 3. Map frontend params to pipeline params
            # Frontend sends params per indicator key (e.g., {"rsi": {"period": 14}})
            # Pipeline expects a flat dict with specific naming conventions (e.g., {"rsi_period": 14})
            pipeline_params = {}
            for ind_key, p in custom_params.items():
                if ind_key == 'rsi':
                    if 'period' in p: pipeline_params['rsi_period'] = p['period']
                elif ind_key == 'cci':
                    if 'period' in p: pipeline_params['cci_period'] = p['period']
                elif ind_key == 'demarker':
                    if 'period' in p: pipeline_params['demarker_period'] = p['period']
                elif ind_key == 'macd_histogram' or ind_key == 'macd':
                    if 'fast' in p: pipeline_params['macd_fast'] = p['fast']
                    if 'slow' in p: pipeline_params['macd_slow'] = p['slow']
                    if 'signal' in p: pipeline_params['macd_signal'] = p['signal']
                elif ind_key == 'supertrend':
                    if 'period' in p: pipeline_params['supertrend_period'] = p['period']
                    if 'multiplier' in p: pipeline_params['supertrend_multiplier'] = p['multiplier']
                elif ind_key == 'ema' or ind_key == 'ema_16':
                    if 'period' in p: pipeline_params['ema_fast'] = p['period']
                elif ind_key == 'adx':
                    if 'period' in p: pipeline_params['adx_period'] = p['period']
                elif ind_key == 'atr' or ind_key == 'atr_14':
                    if 'period' in p: pipeline_params['atr_period'] = p['period']
                elif ind_key == 'atr_21':
                    if 'period' in p: pipeline_params['atr_period_2'] = p['period']
                elif ind_key == 'stc' or ind_key == 'schaff_tc':
                    if 'fast' in p: pipeline_params['schaff_fast'] = p['fast']
                    if 'slow' in p: pipeline_params['schaff_slow'] = p['slow']
                    if 'period' in p: 
                        pipeline_params['schaff_d_macd'] = p['period']
                        pipeline_params['schaff_d_pf'] = p['period']
                elif ind_key == 'bollinger_bands' or ind_key == 'bb_middle':
                    if 'period' in p: pipeline_params['bb_period'] = p['period']
                    if 'stdDev' in p: pipeline_params['bb_std'] = p['stdDev']
                    elif 'std' in p: pipeline_params['bb_std'] = p['std']
                elif ind_key == 'support_resistance':
                    if 'period' in p: pipeline_params['support_resistance_period'] = p['period']
                elif ind_key == 'ema_cross':
                    if 'fast' in p: pipeline_params['ema_cross_fast'] = p['fast']
                    if 'med' in p: pipeline_params['ema_cross_med'] = p['med']
                    if 'slow' in p: pipeline_params['ema_cross_slow'] = p['slow']
                # Add more mappings as needed

            # 4. Calculate indicators
            pipeline = TechnicalIndicatorsPipeline(config={'indicator_params': pipeline_params})
            result_df = pipeline.calculate_indicators(df)

            # 5. Prepare output series for the frontend
            # The frontend expects a dictionary of indicator series
            # We'll convert the relevant columns to the expected format
            series = {}
            
            # Helper to extract a series as {time, value} objects
            def extract_series(col_name):
                if col_name not in result_df.columns:
                    return []
                # Drop NaNs for the series output
                valid = result_df[['timestamp', col_name]].dropna()
                return [
                    {"time": int(float(row['timestamp'])), "value": float(row[col_name])}
                    for _, row in valid.iterrows()
                ]

            # Standard indicators from the pipeline
            indicator_names = [
                'sma_20', 'ema_16', 'ema_165', 'wma_20',
                'rsi_14', 'rsi_21', 'stoch_k', 'stoch_d', 'williams_r', 'roc_10',
                'macd', 'macd_signal', 'macd_histogram',
                'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_percent',
                'atr_14', 'atr_21', 'adx', 'plus_di', 'minus_di', 'schaff_tc', 'demarker', 'cci',
                'supertrend', 'supertrend_direction',
                'support_level', 'resistance_level',
                'ema_21', 'ema_50', 'ema_100'
            ]

            for name in indicator_names:
                if name in result_df.columns:
                    if name == 'supertrend_direction':
                        # Special extraction for string/categorical data
                        valid = result_df[['timestamp', name]].dropna()
                        series[name] = [
                            {"time": int(float(row['timestamp'])), "value": str(row[name])}
                            for _, row in valid.iterrows()
                        ]
                    else:
                        series[name] = extract_series(name)

            return CapResult.success(data={
                "asset": asset,
                "timeframe": timeframe,
                "series": series,
                "count": len(result_df),
                "processed": {
                    "selected_now": [],
                    "already_favorited": []
                }
            })

        except Exception as e:
            logger.error(f"IndicatorCalculator failed: {str(e)}")
            return CapResult.fail(f"Error processing indicators: {str(e)}")
