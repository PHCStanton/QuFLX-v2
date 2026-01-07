from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure project root (v2) is in sys.path before any other imports
project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import argparse
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("CapabilityRunner")

project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from capabilities_v2.base import Ctx
from capabilities_v2.history_collector import HistoryCollector
from capabilities_v2.favorites_bar import FavoritesBar
from capabilities_v2.timeframe_menu import TimeframeMenu
from capabilities_v2.favorite_star_select import FavoriteStarSelect
from capabilities_v2.collect_history_loop import CollectHistoryLoop
from capabilities_v2.topdown_select_test_2 import TopdownSelectTest2
from capabilities_v2.timeframe_select_sync import TimeframeSelectSync
from capabilities_v2.favorites_walk_select import FavoritesWalkSelect
from capabilities_v2.indicator_calculator import IndicatorCalculator
from backend.services.gateway.asset_control import AssetControl

CAPABILITY_MAP = {
    "history_collector": HistoryCollector,
    "asset_control": AssetControl,
    "favorites_bar": FavoritesBar,
    "timeframe_menu": TimeframeMenu,
    "favorite_star_select": FavoriteStarSelect,
    "collect_history": CollectHistoryLoop,
    "refresh_assets": FavoriteStarSelect,
    "topdown_select_test_2": TopdownSelectTest2,
    "timeframe_select_sync": TimeframeSelectSync,
    "favorites_walk_select": FavoritesWalkSelect,
    "indicator_calculator": IndicatorCalculator,
}

def main():
    parser = argparse.ArgumentParser(description="V2 Capability Runner")
    parser.add_argument("capability", help="Name of the capability to run")
    parser.add_argument("--inputs", help="JSON string of inputs", default="{}")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    
    args = parser.parse_args()
    
    cap_class = CAPABILITY_MAP.get(args.capability)
    if not cap_class:
        error_msg = f"Unknown capability: {args.capability}. Available: {list(CAPABILITY_MAP.keys())}"
        logger.error(error_msg)
        print(json.dumps({
            "ok": False, 
            "error": error_msg
        }))
        sys.exit(1)
        
    inputs = {}
    if args.inputs and args.inputs.strip():
        try:
            maybe_inputs = json.loads(args.inputs)
            if isinstance(maybe_inputs, dict):
                inputs = maybe_inputs
        except json.JSONDecodeError:
            inputs = {}
        
    requires_browser = getattr(cap_class, "requires_browser", True)
    ctx = None

    if requires_browser:
        try:
            import qf  # type: ignore
            ok, _ = qf.attach_chrome_session(port=9222)
            ctx = qf.ctx
            ctx.debug = args.debug or ctx.debug
            ctx.verbose = args.verbose or ctx.verbose
        except Exception:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            
            opts = Options()
            opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
            try:
                driver = webdriver.Chrome(options=opts)
                artifacts_root = os.path.join(str(project_root), "data", "artifacts")
                ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=args.debug, dry_run=False, verbose=args.verbose)
            except Exception as e:
                print(json.dumps({"ok": False, "error": f"Failed to connect to Chrome: {str(e)}"}))
                sys.exit(1)
    else:
        # For non-browser capabilities, create a minimal context
        artifacts_root = os.path.join(str(project_root), "data", "artifacts")
        ctx = Ctx(driver=None, artifacts_root=artifacts_root, debug=args.debug, dry_run=False, verbose=args.verbose)
            
    try:
        cap = cap_class()
        result = cap.run(ctx, inputs)
        output = {
            "ok": result.ok,
            "data": result.data,
            "error": result.error,
            "artifacts": result.artifacts
        }
        print(json.dumps(output))
        
    except Exception as e:
        error_msg = f"Execution failed: {str(e)}"
        logger.error(error_msg)
        print(json.dumps({"ok": False, "error": error_msg}))
        sys.exit(1)

if __name__ == "__main__":
    main()
