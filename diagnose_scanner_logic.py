import os
import json
import pandas as pd
from typing import List, Dict, Optional
from pathlib import Path
import sys

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[0]
sys.path.append(str(PROJECT_ROOT))

# Mocking the enum and logger to run standalone
class MarketCondition:
    NEUTRAL = "Neutral"
    STRONG_MOMENTUM_UP = "Strong Momentum Up"
    STRONG_MOMENTUM_DOWN = "Strong Momentum Down"
    PULLBACK_BUY = "Pullback Buy"
    PULLBACK_SELL = "Pullback Sell"
    RANGING_OVERBOUGHT = "Ranging Overbought"
    RANGING_OVERSOLD = "Ranging Oversold"
    BREAKOUT_UP = "Breakout Up"
    BREAKOUT_DOWN = "Breakout Down"
    REVERSAL_BULLISH = "Reversal Bullish"
    REVERSAL_BEARISH = "Reversal Bearish"

def diagnose_asset(csv_path: str):
    print(f"--- Diagnosing {csv_path} ---")
    df = pd.read_csv(csv_path)
    if df.empty:
        print("Empty DF")
        return

    from ta.trend import ADXIndicator, EMAIndicator, MACD, CCIIndicator
    from ta.volatility import BollingerBands, AverageTrueRange
    from ta.momentum import RSIIndicator, StochasticOscillator

    # Ensure types
    for col in ['open', 'high', 'low', 'close']:
        if col in df.columns:
            df[col] = df[col].astype(float)

    # Calculate Indicators (Mirroring MarketScanner)
    df['adx'] = ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=14).adx()
    df['rsi'] = RSIIndicator(close=df['close'], window=14).rsi()
    bb = BollingerBands(close=df['close'], window=20, window_dev=2)
    df['bb_h'] = bb.bollinger_hband()
    df['bb_l'] = bb.bollinger_lband()
    df['bb_w'] = bb.bollinger_wband()
    df['atr'] = AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=14).average_true_range()
    df['ema16'] = EMAIndicator(close=df['close'], window=16).ema_indicator()
    df['ema165'] = EMAIndicator(close=df['close'], window=165).ema_indicator()
    df['macd_hist'] = MACD(close=df['close']).macd_diff()
    stoch = StochasticOscillator(high=df['high'], low=df['low'], close=df['close'], window=14)
    df['stoch_k'] = stoch.stoch()
    df['stoch_d'] = stoch.stoch_signal()
    
    # Body analysis
    df['body_size'] = (df['close'] - df['open']).abs()
    df['total_range'] = (df['high'] - df['low']).abs()
    df['body_ratio'] = df['body_size'] / df['total_range'].replace(0, 0.0001)
    df['large_body'] = df['body_size'] > (df['atr'] * 0.8)

    # Check last 5 candles for any regime
    for i in range(-5, 0):
        curr = df.iloc[i]
        prev = df.iloc[i-1]
        
        print(f"\n[Candle {i}] Price: {curr['close']:.5f} ADX: {curr['adx']:.2f} RSI: {curr['rsi']:.2f} MACD_H: {curr['macd_hist']:.6f}")
        print(f"EMA16: {curr['ema16']:.5f} EMA165: {curr['ema165']:.5f} BB_W: {curr['bb_w']:.4f}")
        
        found = False
        
        # 1. Strong Momentum
        if curr['adx'] > 30:
            if curr['close'] > curr['ema16']:
                score = 0
                if curr['adx'] > 35: score += 1
                if curr['macd_hist'] > prev['macd_hist']: score += 1
                if curr['large_body'] and curr['close'] > curr['open']: score += 1
                if curr['atr'] > prev['atr']: score += 1
                print(f"  > Momentum UP Check: Score {score}/4 (Required 3)")
            elif curr['close'] < curr['ema16']:
                score = 0
                if curr['adx'] > 35: score += 1
                if curr['macd_hist'] < prev['macd_hist']: score += 1
                if curr['large_body'] and curr['close'] < curr['open']: score += 1
                if curr['atr'] > prev['atr']: score += 1
                print(f"  > Momentum DOWN Check: Score {score}/4 (Required 3)")
        
        # 2. Pullback
        elif curr['adx'] > 20:
            dist = abs(curr['close'] - curr['ema16']) / curr['ema16']
            print(f"  > Trend Filter: ADX > 20. Dist to EMA16: {dist:.6f}")
            if dist < 0.002:
                print(f"  > Pullback Check: Price near EMA16. RSI: {curr['rsi']:.2f}")

        # 3. Range
        elif curr['adx'] < 20:
            print(f"  > Range Check: ADX < 20. Price vs BB: {curr['close']:.5f} (H: {curr['bb_h']:.5f}, L: {curr['bb_l']:.5f})")

if __name__ == "__main__":
    assets_dir = Path("data/data_output/history")
    # Find a recent EURUSD file
    eur_dir = assets_dir / "EURUSDOTC"
    if eur_dir.exists():
        files = list(eur_dir.glob("*.csv"))
        if files:
            latest = max(files, key=lambda x: x.stat().st_mtime)
            diagnose_asset(str(latest))
        else:
            print("No files in EURUSDOTC")
    else:
        print("EURUSDOTC dir missing")
