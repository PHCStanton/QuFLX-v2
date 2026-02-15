"""
Diagnostic script: Tests the unified indicator pipeline with real candle data
to identify column name mismatches that break regime detection.
"""
import sys
import pandas as pd
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
from backend.services.strategy.regime_detector import calculate_indicators, detect_regime

# Find a real data file to test with
data_dir = PROJECT_ROOT / "data" / "ticks"
csv_files = list(data_dir.rglob("*.csv"))
if not csv_files:
    print("❌ No CSV files found in data/ticks")
    sys.exit(1)

test_file = csv_files[0]
print(f"📂 Using test file: {test_file.relative_to(PROJECT_ROOT)}")

# Load and prep data
df = pd.read_csv(test_file)
print(f"📊 Loaded {len(df)} rows, columns: {list(df.columns)}")

# Normalize column names if needed
col_map = {}
for col in df.columns:
    lower = col.lower().strip()
    if lower != col:
        col_map[col] = lower
if col_map:
    df = df.rename(columns=col_map)

# Ensure required OHLC columns exist
required = ['open', 'high', 'low', 'close']
missing = [c for c in required if c not in df.columns]
if missing:
    print(f"⚠️  CSV missing columns: {missing}")
    print(f"   Available: {list(df.columns)}")
    # Try to find them
    for col in df.columns:
        print(f"   - '{col}'")
    sys.exit(1)

# Convert to float
for col in required:
    df[col] = pd.to_numeric(df[col], errors='coerce')

print(f"\n{'='*60}")
print("TEST 1: TechnicalIndicatorsPipeline (Pipeline B) columns")
print(f"{'='*60}")

pipeline = TechnicalIndicatorsPipeline()
try:
    pipeline_df = pipeline.calculate_indicators(df.copy())
    pipeline_cols = sorted(pipeline_df.columns.tolist())
    print(f"✅ Pipeline B produced {len(pipeline_cols)} columns:")
    for col in pipeline_cols:
        if col not in df.columns:
            print(f"   + {col}")
except Exception as e:
    print(f"❌ Pipeline B FAILED: {e}")
    import traceback
    traceback.print_exc()
    pipeline_df = None

print(f"\n{'='*60}")
print("TEST 2: Regime Detector calculate_indicators() mapping")
print(f"{'='*60}")

# These are the columns regime_detector.detect_regime() expects
REQUIRED_BY_REGIME = [
    'adx', 'rsi', 'atr', 'ema16', 'ema89', 'supertrend',
    'stoch_k', 'stoch_d', 'macd_hist', 'bb_wband', 'bb_high', 'bb_low',
    'body_ratio', 'large_body', 'pivot_h', 'pivot_l',
    'plus_di', 'minus_di',  # R5
    'cci'
]

try:
    result_df = calculate_indicators(df.copy())
    print(f"✅ calculate_indicators() succeeded")
    
    missing_cols = []
    present_cols = []
    for col in REQUIRED_BY_REGIME:
        if col in result_df.columns:
            val = result_df[col].iloc[-1]
            present_cols.append(col)
            print(f"   ✅ {col:15s} = {val}")
        else:
            missing_cols.append(col)
            print(f"   ❌ {col:15s} = MISSING!")
    
    if missing_cols:
        print(f"\n⚠️  PROBLEM: {len(missing_cols)} columns missing: {missing_cols}")
        print(f"   These will cause KeyError in detect_regime()")
    else:
        print(f"\n✅ All {len(REQUIRED_BY_REGIME)} required columns present!")
        
except Exception as e:
    print(f"❌ calculate_indicators() FAILED: {e}")
    import traceback
    traceback.print_exc()
    result_df = None

print(f"\n{'='*60}")
print("TEST 3: detect_regime() end-to-end")
print(f"{'='*60}")

if result_df is not None:
    try:
        regime = detect_regime(result_df)
        if regime:
            print(f"✅ Regime detected: {regime.condition.value}")
            print(f"   Direction:  {regime.direction}")
            print(f"   Score:      {regime.confluence_score}")
            print(f"   Expiry:     {regime.suggested_expiry}")
        else:
            print(f"ℹ️  No tradeable regime detected (NEUTRAL) — this is normal for some data")
    except Exception as e:
        print(f"❌ detect_regime() FAILED: {e}")
        import traceback
        traceback.print_exc()
