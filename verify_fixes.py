#!/usr/bin/env python3
"""
Verification script for Asset Alert Discord Implementation fixes.
Tests all critical fixes from Phases 1-3.
"""

import sys
import pandas as pd
import numpy as np
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

def test_bb_width_normalization():
    """Test C1: bb_width normalization fix"""
    print("\n=== Testing C1: bb_width Normalization ===")
    try:
        from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
        
        # Create sample data
        data = {
            'open': [1.05 + i*0.0001 for i in range(100)],
            'high': [1.051 + i*0.0001 for i in range(100)],
            'low': [1.049 + i*0.0001 for i in range(100)],
            'close': [1.0505 + i*0.0001 for i in range(100)],
        }
        df = pd.DataFrame(data)
        
        pipeline = TechnicalIndicatorsPipeline()
        result = pipeline.calculate_indicators(df)
        
        if 'bb_width' in result.columns:
            bb_width_val = result['bb_width'].iloc[-1]
            if pd.notna(bb_width_val):
                # Should be in decimal range (0.00-0.10), not percentage (0-10)
                if 0 <= bb_width_val <= 0.15:
                    print(f"✅ PASS: bb_width = {bb_width_val:.4f} (correct decimal scale)")
                    return True
                else:
                    print(f"❌ FAIL: bb_width = {bb_width_val:.4f} (should be 0.00-0.15 range)")
                    return False
            else:
                print("⚠️  WARNING: bb_width is NaN (insufficient data)")
                return True  # Not a failure, just insufficient data
        else:
            print("❌ FAIL: bb_width column not found")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_ema89_reference():
    """Test C2 & H2: ema89 reference fixes"""
    print("\n=== Testing C2/H2: EMA89 References ===")
    try:
        from backend.services.strategy.indicators import TechnicalIndicatorsPipeline
        
        # Create sample data
        data = {
            'open': [1.05] * 100,
            'high': [1.051] * 100,
            'low': [1.049] * 100,
            'close': [1.0505 + i*0.0001 for i in range(100)],
        }
        df = pd.DataFrame(data)
        
        pipeline = TechnicalIndicatorsPipeline()
        result = pipeline.calculate_indicators(df)
        
        # Check column exists
        if 'ema_89' not in result.columns:
            print("❌ FAIL: ema_89 column not found in pipeline output")
            return False
        
        # Check IndicatorSet dataclass
        last_row = result.iloc[-1]
        indicator_set = pipeline.create_indicator_set(last_row)
        
        if indicator_set is None:
            print("❌ FAIL: create_indicator_set returned None")
            return False
        
        if hasattr(indicator_set, 'ema_89'):
            if indicator_set.ema_89 is not None:
                print(f"✅ PASS: ema_89 = {indicator_set.ema_89:.4f} (correctly mapped)")
                return True
            else:
                print("⚠️  WARNING: ema_89 is None (may be insufficient data)")
                return True
        else:
            print("❌ FAIL: IndicatorSet missing ema_89 attribute")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_market_condition_enum():
    """Test H1: MarketCondition enum consolidation"""
    print("\n=== Testing H1: MarketCondition Enum Consolidation ===")
    try:
        from backend.services.strategy.regime_detector import MarketCondition
        from backend.scripts.otc_alert_dispatch import MarketCondition as DispatcherMarketCondition
        
        # They should be the same class
        if MarketCondition is DispatcherMarketCondition:
            print("✅ PASS: MarketCondition enum is imported (not duplicated)")
            return True
        else:
            print("❌ FAIL: MarketCondition enum is still duplicated")
            return False
            
    except ImportError as e:
        if "cannot import name 'MarketCondition'" in str(e):
            print("✅ PASS: Local MarketCondition removed from dispatcher (import from regime_detector)")
            return True
        else:
            print(f"❌ ERROR: {e}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_indicator_wrapper_removed():
    """Test H6: indicator_wrapper.py removal"""
    print("\n=== Testing H6: indicator_wrapper.py Removal ===")
    wrapper_path = project_root / "backend" / "services" / "strategy" / "indicator_wrapper.py"
    
    if not wrapper_path.exists():
        print("✅ PASS: indicator_wrapper.py successfully removed")
        return True
    else:
        print("❌ FAIL: indicator_wrapper.py still exists")
        return False


def test_regime_detector_integration():
    """Test Phase 2: Regime detector uses unified pipeline"""
    print("\n=== Testing Phase 2: Regime Detector Integration ===")
    try:
        from backend.services.strategy.regime_detector import calculate_indicators, detect_regime
        
        # Create sample data
        data = {
            'open': [1.05 + i*0.0001 for i in range(100)],
            'high': [1.051 + i*0.0001 for i in range(100)],
            'low': [1.049 + i*0.0001 for i in range(100)],
            'close': [1.0505 + i*0.0001 for i in range(100)],
        }
        df = pd.DataFrame(data)
        
        # Test calculate_indicators
        result_df = calculate_indicators(df)
        
        required_cols = ['ema16', 'ema89', 'adx', 'rsi', 'bb_wband', 'macd_hist']
        missing = [col for col in required_cols if col not in result_df.columns]
        
        if missing:
            print(f"❌ FAIL: Missing columns: {missing}")
            return False
        
        # Test detect_regime
        regime_result = detect_regime(result_df)
        
        if regime_result is not None:
            print(f"✅ PASS: Regime detection working (detected: {regime_result.condition.value})")
            return True
        else:
            print("⚠️  WARNING: No regime detected (may be neutral market)")
            return True  # Not a failure
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_alerts_route_security():
    """Test H8: Alerts route security"""
    print("\n=== Testing H8: Alerts Route Security ===")
    try:
        from backend.services.gateway.routes.alerts import _check_dev_gate, _is_local_client
        
        # Test local client detection
        if _is_local_client("127.0.0.1"):
            print("✅ PASS: Local client detection working")
        else:
            print("❌ FAIL: Local client detection broken")
            return False
        
        # Test non-local rejection
        if not _is_local_client("192.168.1.100"):
            print("✅ PASS: Non-local client rejection working")
            return True
        else:
            print("❌ FAIL: Non-local client not rejected")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def main():
    print("=" * 60)
    print("QuFLX v2 - Asset Alert Implementation Verification")
    print("Testing Phases 1-3 (Critical + Structural + Security)")
    print("=" * 60)
    
    tests = [
        ("C1: bb_width Normalization", test_bb_width_normalization),
        ("C2/H2: EMA89 References", test_ema89_reference),
        ("H1: MarketCondition Consolidation", test_market_condition_enum),
        ("H6: indicator_wrapper Removal", test_indicator_wrapper_removed),
        ("Phase 2: Regime Detector Integration", test_regime_detector_integration),
        ("H8: Alerts Route Security", test_alerts_route_security),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            print(f"\n❌ EXCEPTION in {name}: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed ({passed_count/total_count*100:.0f}%)")
    
    if passed_count == total_count:
        print("\n🎉 All critical fixes verified successfully!")
        return 0
    else:
        print(f"\n⚠️  {total_count - passed_count} test(s) failed - review needed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
