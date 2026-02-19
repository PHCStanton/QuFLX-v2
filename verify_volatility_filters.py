import pandas as pd
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from backend.services.strategy.regime_detector import assess_volatility

def test_volatility_filters():
    print("Testing Volatility Filters...")

    def check_case(label, atr_val, close, adx_val, bb_width, atr_baseline, bb_baseline, expect_tradeable):
        result = assess_volatility(
            atr_val=atr_val,
            close=close,
            adx_val=adx_val,
            bb_width=bb_width,
            atr_baseline=atr_baseline,
            bb_width_baseline=bb_baseline
        )
        status = "✅" if result.is_tradeable == expect_tradeable else "❌"
        print(
            f"{status} {label}: tradeable={result.is_tradeable} | zone={result.zone} | "
            f"rel_atr={result.relative_atr_pct:.3f}% | atr_ratio={result.atr_ratio:.2f} | "
            f"bb_ratio={result.bb_width_ratio:.2f} | reason={result.reason}"
        )

    # Dead zone: 0.015% relative ATR -> blocked
    check_case(
        "Dead zone",
        atr_val=0.015,
        close=100.0,
        adx_val=20.0,
        bb_width=0.02,
        atr_baseline=0.03,
        bb_baseline=0.03,
        expect_tradeable=False
    )

    # Low zone with weak ADX -> blocked
    check_case(
        "Low ATR + weak ADX",
        atr_val=0.03,
        close=100.0,
        adx_val=20.0,
        bb_width=0.02,
        atr_baseline=0.05,
        bb_baseline=0.03,
        expect_tradeable=False
    )

    # Low zone with strong ADX -> allowed
    check_case(
        "Low ATR + strong ADX",
        atr_val=0.03,
        close=100.0,
        adx_val=30.0,
        bb_width=0.02,
        atr_baseline=0.05,
        bb_baseline=0.03,
        expect_tradeable=True
    )

    # Normal zone -> allowed
    check_case(
        "Normal zone",
        atr_val=0.10,
        close=100.0,
        adx_val=20.0,
        bb_width=0.02,
        atr_baseline=0.08,
        bb_baseline=0.03,
        expect_tradeable=True
    )

    # ATR ratio too low with weak ADX -> blocked
    check_case(
        "ATR ratio low + weak ADX",
        atr_val=0.04,
        close=100.0,
        adx_val=20.0,
        bb_width=0.02,
        atr_baseline=0.10,
        bb_baseline=0.03,
        expect_tradeable=False
    )

    # BB width ratio too low with weak ADX -> blocked
    check_case(
        "BB width ratio low + weak ADX",
        atr_val=0.08,
        close=100.0,
        adx_val=20.0,
        bb_width=0.01,
        atr_baseline=0.08,
        bb_baseline=0.03,
        expect_tradeable=False
    )

if __name__ == "__main__":
    test_volatility_filters()
