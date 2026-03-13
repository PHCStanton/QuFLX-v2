from __future__ import annotations
import pandas as pd
import numpy as np
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
            indicators (List[str]): Accepted for API compatibility — does NOT filter calculation.
                                    All indicators are always computed (see INC-2 note).
            params (Dict[str, Dict[str, Any]]): Optional per-indicator parameters
        """
        csv_path = inputs.get("csv_path")
        asset = inputs.get("asset")
        timeframe = inputs.get("timeframe", 1)
        # INC-2: requested_indicators is accepted but not used to filter the pipeline.
        # The full pipeline always runs — selective calculation is a future OPT-1 concern.
        requested_indicators = inputs.get("indicators", [])  # noqa: F841
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

            # 4. Map frontend params to pipeline params
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

            # 5. Calculate indicators
            pipeline = TechnicalIndicatorsPipeline(config={'indicator_params': pipeline_params})
            result_df = pipeline.calculate_indicators(df)

            # 6. Prepare output series for the frontend
            series = {}

            # ── OPT-2: Vectorized series extraction (replaces slow iterrows()) ──────────
            def extract_series_numeric(col_name: str) -> list:
                """Fast numeric extraction using vectorized numpy ops (~5-10x vs iterrows)."""
                if col_name not in result_df.columns:
                    return []
                valid = result_df[['timestamp', col_name]].dropna()
                if valid.empty:
                    return []
                times = valid['timestamp'].values.astype('float64').astype('int64')
                values = valid[col_name].values.astype('float64')
                return [{"time": int(t), "value": float(v)} for t, v in zip(times, values)]

            def extract_series_string(col_name: str) -> list:
                """Extraction for categorical/string columns (e.g. freshness, direction)."""
                if col_name not in result_df.columns:
                    return []
                valid = result_df[['timestamp', col_name]].dropna()
                if valid.empty:
                    return []
                return [
                    {"time": int(float(row['timestamp'])), "value": str(row[col_name])}
                    for _, row in valid.iterrows()
                ]

            def extract_series_bool(col_name: str) -> list:
                """Extraction for boolean columns (e.g. sr_flip)."""
                if col_name not in result_df.columns:
                    return []
                valid = result_df[['timestamp', col_name]].dropna()
                if valid.empty:
                    return []
                times = valid['timestamp'].values.astype('float64').astype('int64')
                values = valid[col_name].values
                return [{"time": int(t), "value": bool(v)} for t, v in zip(times, values)]

            def extract_series_int(col_name: str) -> list:
                """Extraction for integer columns (e.g. touch_count)."""
                if col_name not in result_df.columns:
                    return []
                valid = result_df[['timestamp', col_name]].dropna()
                if valid.empty:
                    return []
                times = valid['timestamp'].values.astype('float64').astype('int64')
                values = valid[col_name].values
                return [{"time": int(t), "value": int(v)} for t, v in zip(times, values)]

            # ── Numeric indicators ──────────────────────────────────────────────────────
            # INC-1: ema_89 added. INC-4: all S/R enhancement columns added.
            numeric_indicator_names = [
                'sma_20', 'ema_16', 'ema_89', 'wma_20',
                'rsi_14', 'rsi_21', 'stoch_k', 'stoch_d', 'williams_r', 'roc_10',
                'macd', 'macd_signal', 'macd_histogram',
                'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_percent',
                'atr_14', 'atr_21', 'adx', 'plus_di', 'minus_di',
                'schaff_tc', 'demarker', 'cci',
                'supertrend',
                'support_level', 'resistance_level',
                'ema_21', 'ema_50', 'ema_100',
                # INC-4: S/R Enhancement columns (Phases 1-5)
                'resistance_zone_upper', 'resistance_zone_lower',
                'support_zone_upper', 'support_zone_lower',
                'dist_to_resistance', 'dist_to_support',
                'sr_flip_price',
            ]

            # ── String indicators ───────────────────────────────────────────────────────
            string_indicator_names = [
                'supertrend_direction',
                'resistance_freshness',
                'support_freshness',
            ]

            # ── Boolean indicators ──────────────────────────────────────────────────────
            bool_indicator_names = [
                'sr_flip',
            ]

            # ── Integer indicators ──────────────────────────────────────────────────────
            int_indicator_names = [
                'resistance_touch_count',
                'support_touch_count',
            ]

            for name in numeric_indicator_names:
                series[name] = extract_series_numeric(name)

            for name in string_indicator_names:
                series[name] = extract_series_string(name)

            for name in bool_indicator_names:
                series[name] = extract_series_bool(name)

            for name in int_indicator_names:
                series[name] = extract_series_int(name)

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
            logger.error(f"IndicatorCalculator failed: {str(e)}", exc_info=True)
            return CapResult.fail(f"Error processing indicators: {str(e)}")
