"""Quick debug script to test regime detection on sample CSV"""
import pandas as pd
import sys
sys.path.insert(0, '.')

from backend.services.strategy.regime_detector import detect_regime, calculate_indicators

df = pd.read_csv(r'v2_Dev_Docs/Data_for Agent/TNDUSDOTC_otc_1m_2026_02_17_00_37_37.csv')
df = df.sort_values('timestamp').reset_index(drop=True)
print(f"Rows: {len(df)}")

df = calculate_indicators(df)
print(f"Columns after calc: {list(df.columns[:20])}...")

last = df.iloc[-1]
close = float(last['close'])
atr = float(last.get('atr', 0))
bb_wband = float(last.get('bb_wband', 0))
adx = float(last.get('adx', 0))

print(f"ADX: {adx:.2f}")
print(f"RSI: {float(last.get('rsi', 0)):.2f}")
print(f"ATR: {atr:.6f}")
print(f"Close: {close:.5f}")
print(f"ATR%: {atr / close if close > 0 else 0:.6f}")
print(f"BB Width: {bb_wband:.6f}")
print(f"EMA16: {float(last.get('ema16', 0)):.5f}")
print(f"SuperTrend: {float(last.get('supertrend', 0)):.5f}")

# Check the volatility filters
MIN_ATR_PERCENT = 0.002
MIN_BB_WIDTH = 0.01
atr_percent = atr / close if close > 0 else 0
print(f"\n--- Volatility Filter Check ---")
print(f"ATR% ({atr_percent:.6f}) < MIN_ATR ({MIN_ATR_PERCENT})? {atr_percent < MIN_ATR_PERCENT}")
print(f"BB Width ({bb_wband:.6f}) < MIN_BB ({MIN_BB_WIDTH}) AND ADX ({adx:.1f}) < 25? {bb_wband < MIN_BB_WIDTH and adx < 25}")

result = detect_regime(df)
if result:
    print(f"\nRegime: {result.condition.value}")
    print(f"Score: {result.confluence_score}")
    print(f"Direction: {result.direction}")
    print(f"Tradeable: {result.is_tradeable}")
    print(f"Technicals: {result.technicals}")
else:
    print("\nRegime: None (returned None = Neutral)")
    print("This means detect_regime returned None - condition stayed NEUTRAL through all checks")
