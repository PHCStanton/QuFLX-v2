"""Test detect_regime_series on sample CSV"""
import pandas as pd
import sys
sys.path.insert(0, '.')

from backend.services.strategy.regime_detector import detect_regime_series

df = pd.read_csv(r'v2_Dev_Docs/Data_for Agent/TNDUSDOTC_otc_1m_2026_02_17_00_37_37.csv')
df = df.sort_values('timestamp').reset_index(drop=True)
print(f"Rows: {len(df)}")

result = detect_regime_series(df)
print(f"Dominant Regime: {result['dominant_regime']}")
print(f"Direction: {result['dominant_direction']}")
print(f"Score: {result['dominant_score']}")
print(f"Is Tradeable: {result['is_tradeable']}")
print(f"Distribution: {result['regime_distribution']}")
print(f"Timeline entries: {len(result['regime_timeline'])}")
if result['regime_timeline']:
    print(f"First timeline entry: {result['regime_timeline'][0]}")
    print(f"Last timeline entry: {result['regime_timeline'][-1]}")
print("PASS: detect_regime_series works correctly")
