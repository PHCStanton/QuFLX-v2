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
        """
        csv_path = inputs.get("csv_path")
        asset = inputs.get("asset")
        timeframe = inputs.get("timeframe", 1)

        if not csv_path:
            return CapResult.fail("csv_path is required")

        try:
            # 1. Load data from CSV
            df = pd.read_csv(csv_path)
            if df.empty:
                return CapResult.fail(f"History file is empty: {csv_path}")

            # 2. Ensure column names are lowercase (pipeline expects open, high, low, close)
            df.columns = [col.lower() for col in df.columns]

            # 3. Calculate indicators
            pipeline = TechnicalIndicatorsPipeline()
            result_df = pipeline.calculate_indicators(df)

            # 4. Prepare output series for the frontend
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
                'supertrend'
            ]

            for name in indicator_names:
                if name in result_df.columns:
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
