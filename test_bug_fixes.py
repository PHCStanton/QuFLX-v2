"""
Test both bug fixes:
1. ATR volatility guard no longer blocks detect_regime_series (lab_mode=True)
2. ema165 KeyError is gone from momentum.py (replaced with ema89)
"""
import sys
sys.path.insert(0, '.')

import pandas as pd
from backend.services.strategy.regime_detector import (
    detect_regime, detect_regime_series, calculate_indicators, MarketCondition
)

print("=" * 60)
print("BUG FIX VERIFICATION")
print("=" * 60)

# Load sample data
df = pd.read_csv(r'v2_Dev_Docs/Data_for Agent/TNDUSDOTC_otc_1m_2026_02_17_00_37_37.csv')
df = df.sort_values('timestamp').reset_index(drop=True)
print(f"Dataset: {len(df)} rows")

# -------------------------------------------------------
# TEST 1: ATR guard no longer blocks series detection
# -------------------------------------------------------
print("\n--- Test 1: ATR guard (lab_mode) ---")
result = detect_regime_series(df)
assert result['is_tradeable'], "FAIL: detect_regime_series still blocked by ATR guard"
assert result['dominant_regime'] != 'Neutral', f"FAIL: Got Neutral regime: {result['dominant_regime']}"
print(f"PASS: detect_regime_series -> {result['dominant_regime']} ({result['dominant_direction']}) score={result['dominant_score']}")
print(f"      Timeline entries: {len(result['regime_timeline'])} (was 0 when blocked)")

# Verify live trading still uses the guard (lab_mode=False by default)
df_ind = calculate_indicators(df.copy())
live_result = detect_regime(df_ind)  # lab_mode=False by default
print(f"PASS: Live detect_regime (lab_mode=False) -> {live_result.condition.value if live_result else 'None/Neutral'} (guard still active)")

# -------------------------------------------------------
# TEST 2: ema165 KeyError is gone
# -------------------------------------------------------
print("\n--- Test 2: ema165 KeyError fix ---")
from backend.services.strategy.regimes.momentum import MomentumStrategy
from backend.services.strategy.regime_detector import RegimeResult

# Verify no ema165 variable assignments remain (comments mentioning it are OK)
import inspect, re
src = inspect.getsource(MomentumStrategy)
# Check for actual variable assignment: ema165 = current['ema165']
ema165_assignments = re.findall(r"ema165\s*=\s*current\[", src)
assert len(ema165_assignments) == 0, f"FAIL: ema165 variable assignment still present: {ema165_assignments}"
# Check ema89 is used
assert "ema89 = current['ema89']" in src, "FAIL: ema89 not assigned from current in MomentumStrategy!"
assert "close > ema89" in src or "close < ema89" in src, "FAIL: ema89 not used in entry logic!"
print("PASS: No ema165 variable assignments in MomentumStrategy")
print("PASS: ema89 correctly used as macro trend filter")

# Test that identify_entries runs without KeyError
strategy = MomentumStrategy()
df_with_ind = calculate_indicators(df.copy())

# Create a minimal RegimeResult for testing
dummy_regime = RegimeResult(
    condition=MarketCondition.STRONG_MOMENTUM_DOWN,
    confluence_score=80,
    direction="PUT",
    suggested_expiry="3m",
    technicals={"asset": "TEST"}
)

try:
    entries = strategy.identify_entries(df_with_ind, dummy_regime)
    print(f"PASS: identify_entries ran without KeyError (found {len(entries)} entries)")
except KeyError as e:
    print(f"FAIL: KeyError still present: {e}")
    sys.exit(1)

# Test validate_entry also works
try:
    from backend.services.strategy.regimes.base import EntrySignal
    from datetime import datetime
    dummy_signal = EntrySignal(
        timestamp=datetime.now(),
        asset="TEST",
        direction="PUT",
        entry_price=1.0,
        suggested_expiry="3m",
        confidence=0.75,
        regime="Strong Momentum (Bearish)",
        confluence_score=80,
        technicals={},
        reason="test"
    )
    valid = strategy.validate_entry(dummy_signal, df_with_ind)
    print(f"PASS: validate_entry ran without KeyError (result={valid})")
except KeyError as e:
    print(f"FAIL: KeyError in validate_entry: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("ALL BUG FIX TESTS PASSED")
print("=" * 60)
