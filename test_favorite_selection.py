
import sys
import os
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from capabilities_v2.favorite_star_select import FavoriteStarSelect
from backend.utils.asset_utils import normalize_asset

def test_selection_logic():
    cap = FavoriteStarSelect()
    
    # Mock items from the dropdown
    items = [
        {"label": "EUR/USD", "payout": 92, "is_selected": False},
        {"label": "GBP/USD", "payout": 91, "is_selected": False},
        {"label": "AUD/USD", "payout": 95, "is_selected": True},
        {"label": "USD/JPY", "payout": 85, "is_selected": False},
        {"label": "EUR/JPY", "payout": 92, "is_selected": True},
        {"label": "BTC/USD", "payout": 80, "is_selected": False},
    ]
    
    # Test Case 1: Target asset with lower payout than min_pct
    print("--- Test Case 1: Target asset 'GBP/USD' with 91% payout, min_pct=92 ---")
    to_star, to_unstar, selection = cap._apply_selection_rules(
        items=items,
        min_pct=92,
        unstar_below=True,
        max_assets=5,
        target_assets=["GBP/USD"],
        target_assets_mode="include",
        filter_mode=None
    )
    print(f"To Star: {[i['label'] for i in to_star]}")
    print(f"To Unstar: {[i['label'] for i in to_unstar]}")
    print(f"Selection: {[i['label'] for i in selection]}")
    
    # Test Case 2: Target asset matches but max_assets=5 and many existing favorites
    print("\n--- Test Case 2: Target asset 'EUR/USD', max_assets=5, existing favorites ---")
    to_star, to_unstar, selection = cap._apply_selection_rules(
        items=items,
        min_pct=80,
        unstar_below=True,
        max_assets=5,
        target_assets=["EUR/USD"],
        target_assets_mode="include",
        filter_mode=None
    )
    print(f"To Star: {[i['label'] for i in to_star]}")
    print(f"To Unstar: {[i['label'] for i in to_unstar]}")
    print(f"Selection: {[i['label'] for i in selection]}")

    # Test Case 3: Specific Assets (Optional) is empty
    print("\n--- Test Case 3: No specific assets, max_assets=5, min_pct=92 ---")
    to_star, to_unstar, selection = cap._apply_selection_rules(
        items=items,
        min_pct=92,
        unstar_below=True,
        max_assets=5,
        target_assets=None,
        target_assets_mode="ignore",
        filter_mode=None
    )
    print(f"To Star: {[i['label'] for i in to_star]}")
    print(f"To Unstar: {[i['label'] for i in to_unstar]}")
    print(f"Selection: {[i['label'] for i in selection]}")

if __name__ == "__main__":
    test_selection_logic()
