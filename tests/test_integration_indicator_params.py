import json
import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from capabilities_v2.indicator_calculator import IndicatorCalculator
from capabilities_v2.base import Ctx

def test_calculator_params_sync():
    # 1. Create a dummy CSV for testing with some movement
    csv_path = "test_data.csv"
    import numpy as np
    import pandas as pd
    
    n = 100
    # Use a random walk for more realistic price movement
    np.random.seed(42)
    changes = np.random.normal(0, 1, n)
    close_prices = 100 + np.cumsum(changes)
    data = {
        "timestamp": range(n),
        "open": close_prices - 0.1,
        "high": close_prices + 0.5,
        "low": close_prices - 0.5,
        "close": close_prices
    }
    pd.DataFrame(data).to_csv(csv_path, index=False)

    try:
        # 2. Setup calculator and contexts
        calc = IndicatorCalculator()
        ctx = Ctx(driver=None, artifacts_root=".", debug=True, dry_run=False)
        
        # 3. Run with default params
        inputs_default = {
            "csv_path": csv_path,
            "asset": "TEST_ASSET",
            "timeframe": 1
        }
        result_default = calc.run(ctx, inputs_default)
        assert result_default.ok
        rsi_default = result_default.data["series"]["rsi_14"]

        # 4. Run with custom params
        inputs_custom = {
            "csv_path": csv_path,
            "asset": "TEST_ASSET",
            "timeframe": 1,
            "params": {
                "rsi": {"period": 5},
                "supertrend": {"period": 10, "multiplier": 2.5}
            }
        }
        result_custom = calc.run(ctx, inputs_custom)
        assert result_custom.ok
        rsi_custom = result_custom.data["series"]["rsi_14"]

        # 5. Assertions
        print(f"RSI Default (first 5): {[round(x['value'], 2) for x in rsi_default[:5]]}")
        print(f"RSI Custom (first 5): {[round(x['value'], 2) for x in rsi_custom[:5]]}")
        
        # Values should be different
        assert rsi_default[1]["value"] != rsi_custom[1]["value"], "RSI values should differ with different periods"
        
        # SuperTrend should also differ
        st_default = result_default.data["series"]["supertrend"]
        st_custom = result_custom.data["series"]["supertrend"]
        
        print(f"SuperTrend Default (first 15): {[round(x['value'], 2) for x in st_default[:5]]}")
        print(f"SuperTrend Custom (first 15): {[round(x['value'], 2) for x in st_custom[:5]]}")
        
        # SuperTrend default period is 7, custom is 10. 
        # First values will be at different indices because of rolling mean in ATR.
        assert st_default[0]["time"] == 7, f"Default ST should start at 7 (Period 7), got {st_default[0]['time']}"
        assert st_custom[0]["time"] == 10, f"Custom ST should start at 10 (Period 10), got {st_custom[0]['time']}"

        print("Integration test passed! Parameter sync verified.")

    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)

if __name__ == "__main__":
    test_calculator_params_sync()
