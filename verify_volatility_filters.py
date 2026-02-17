import pandas as pd
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from backend.services.strategy.regime_detector import detect_regime, MarketCondition

def test_volatility_filters():
    print("Testing Volatility Filters...")
    
    # 1. Test Low ATR Block
    # Price = 1.0, ATR = 0.001 (0.1% < 0.2%) -> Should block
    df_low_atr = pd.DataFrame({
        'open': [1.0] * 100,
        'high': [1.0005] * 100,
        'low': [0.9995] * 100,
        'close': [1.0] * 100,
        'adx': [35] * 100,
        'atr': [0.001] * 100,
        'bb_wband': [0.02] * 100,
        'ema16': [0.99] * 100,
        'ema89': [0.98] * 100,
        'supertrend': [0.98] * 100,
        'plus_di': [30] * 100,
        'minus_di': [10] * 100,
        'macd_hist': [0.001] * 100,
        'rsi': [60] * 100,
        'body_ratio': [0.5] * 100,
        'large_body': [False] * 100,
        'stoch_k': [50] * 100,
        'stoch_d': [50] * 100,
        'pivot_h': [1.1] * 100,
        'pivot_l': [0.9] * 100
    })
    
    result = detect_regime(df_low_atr)
    if result.condition == MarketCondition.NEUTRAL and result.technicals.get('warning') == 'low_volatility':
        print("✅ Low ATR filter blocked signal correctly.")
    else:
        print(f"❌ Low ATR filter failed. Condition: {result.condition}")

    # 2. Test Tight Range Block
    # BB Width = 0.005 (0.5% < 1%) and ADX < 25 -> Should block
    df_tight_range = df_low_atr.copy()
    df_tight_range['atr'] = 0.01 # high volatility but tight range
    df_tight_range['bb_wband'] = 0.005
    df_tight_range['adx'] = 15
    
    result = detect_regime(df_tight_range)
    if result.condition == MarketCondition.NEUTRAL and result.technicals.get('warning') == 'tight_range':
        print("✅ Tight Range filter blocked signal correctly.")
    else:
        print(f"❌ Tight Range filter failed. Condition: {result.condition}")

    # 3. Test Choppy Range Block
    # Ranging (ADX < 20) but Body Ratio < 0.4 -> Should block
    df_choppy = df_low_atr.copy()
    df_choppy['atr'] = 0.01
    df_choppy['adx'] = 15
    df_choppy['bb_wband'] = 0.03
    df_choppy['body_ratio'] = 0.3
    
    result = detect_regime(df_choppy)
    if result.condition == MarketCondition.NEUTRAL and result.technicals.get('warning') == 'choppy':
        print("✅ Choppy Range filter blocked signal correctly.")
    else:
        print(f"❌ Choppy Range filter failed. Condition: {result.condition}")

if __name__ == "__main__":
    test_volatility_filters()
