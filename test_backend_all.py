"""Comprehensive backend test for Strategy Lab fixes"""
import sys
sys.path.insert(0, '.')

# Test 1: Import check
from backend.services.strategy.regime_detector import detect_regime, detect_regime_series, calculate_indicators, MarketCondition
print('PASS: All imports work')

# Test 2: detect_regime_series on sample data
import pandas as pd
df = pd.read_csv(r'v2_Dev_Docs/Data_for Agent/TNDUSDOTC_otc_1m_2026_02_17_00_37_37.csv')
df = df.sort_values('timestamp').reset_index(drop=True)

result = detect_regime_series(df)
assert result['is_tradeable'] == True, 'Expected is_tradeable=True'
assert result['dominant_regime'] != 'Neutral', f'Expected non-Neutral regime, got: {result["dominant_regime"]}'
assert result['dominant_direction'] in ['CALL', 'PUT'], f'Expected CALL or PUT, got: {result["dominant_direction"]}'
print(f'PASS: detect_regime_series -> {result["dominant_regime"]} ({result["dominant_direction"]}) score={result["dominant_score"]}')
print(f'      Distribution: {result["regime_distribution"]}')
print(f'      Timeline entries: {len(result["regime_timeline"])}')

# Test 3: Backward compat - detect_regime still works
df_ind = calculate_indicators(df)
result2 = detect_regime(df_ind)
regime_name = result2.condition.value if result2 else 'None/Neutral'
print(f'PASS: detect_regime (single candle) -> {regime_name} (backward compat OK)')

# Test 4: MarketCondition enum values
for c in MarketCondition:
    assert c.value, f'Empty value for {c}'
print(f'PASS: All {len(list(MarketCondition))} MarketCondition values valid')

# Test 5: Strategy route import check
from backend.services.gateway.routes.strategy import router
print('PASS: strategy.py routes import OK')

# Test 6: Verify detect_regime_series is exported from strategy.py
import backend.services.gateway.routes.strategy as strat_module
import inspect
src = inspect.getsource(strat_module)
assert 'detect_regime_series' in src, 'detect_regime_series not found in strategy.py'
print('PASS: detect_regime_series used in strategy.py routes')

print()
print('ALL BACKEND TESTS PASSED')
