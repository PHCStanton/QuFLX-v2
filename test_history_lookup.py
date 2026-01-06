
import sys
import os
from pathlib import Path

# Add root to sys.path
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root))

from backend.utils.history_utils import get_recent_history_file
from backend.utils.asset_utils import normalize_asset, safe_filename

def test_lookup():
    asset = "AED/CNY (OTC)"
    asset_clean = normalize_asset(asset)
    print(f"Asset: {asset}")
    print(f"Asset Clean (normalized): {asset_clean}")
    
    timeframe_min = 1
    
    # 1. Test Unified Format
    test_dir = root / "data" / "data_output" / "history" / asset_clean
    test_dir.mkdir(parents=True, exist_ok=True)
    
    asset_base = normalize_asset(asset.split("(")[0])
    asset_type = "otc" if "otc" in asset.lower() else "fx"
    now_ts = "2026_01_05_15_00_00"
    unified_filename = f"{asset_base}_{asset_type}_{int(timeframe_min)}m_{now_ts}.csv"
    unified_file = test_dir / unified_filename
    unified_file.write_text("timestamp,open,close,high,low\n1704466800,1.0,1.1,1.2,0.9")
    
    print(f"Searching with unified file present...")
    found = get_recent_history_file(asset, timeframe_min)
    print(f"Found: {found.name if found else 'None'}")

    # 2. Test Legacy Format (same dir)
    legacy_file = test_dir / f"{int(timeframe_min)}.csv"
    legacy_file.write_text("timestamp,open,close,high,low\n1704466800,1.0,1.1,1.2,0.9")
    print(f"Searching with both unified and legacy present (should prefer unified)...")
    found = get_recent_history_file(asset, timeframe_min)
    print(f"Found: {found.name if found else 'None'}")

    # 3. Test Legacy Dir Fallback
    # Remove files from normalized dir
    for f in test_dir.glob("*.csv"): f.unlink()
    
    legacy_dir_name = safe_filename(asset)
    legacy_dir = root / "data" / "data_output" / "history" / legacy_dir_name
    legacy_dir.mkdir(parents=True, exist_ok=True)
    legacy_file_old = legacy_dir / f"{int(timeframe_min)}.csv"
    legacy_file_old.write_text("timestamp,open,close,high,low\n1704466800,1.0,1.1,1.2,0.9")
    
    print(f"Searching with only legacy dir fallback...")
    found = get_recent_history_file(asset, timeframe_min)
    print(f"Found: {found.name if found else 'None'}")

if __name__ == "__main__":
    test_lookup()
