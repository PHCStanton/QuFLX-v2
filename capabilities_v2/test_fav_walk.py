from __future__ import annotations
import json
import sys
import os
from pathlib import Path

# Setup project root and paths
project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

selenium_dir = project_root / "local_selenium_utils"
if str(selenium_dir) not in sys.path:
    sys.path.insert(0, str(selenium_dir))

# Manual attach to avoid 'qf' dependencies if env is restricted
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from capabilities_v2.base import Ctx
from capabilities_v2.favorites_walk_select import FavoritesWalkSelect

def run_test():
    print("Testing FavoritesWalkSelect implementation (Direct Selenium)...")
    
    # 1. Attach to Chrome directly
    opts = Options()
    opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    try:
        driver = webdriver.Chrome(options=opts)
        artifacts_root = os.path.join(str(project_root), "data", "artifacts")
        ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=True, dry_run=False, verbose=True)
    except Exception as e:
        print(f"Failed to connect to Chrome: {str(e)}")
        return

    # 2. Instantiate and run
    fws = FavoritesWalkSelect()
    
    inputs = {
        "assets": ["EUR/USD OTC"],
        "min_pct": 0,
        "click_delay_ms": 1000,
        "step_delay_ms": 200
    }
    
    print(f"Running session with inputs: {inputs}")
    try:
        result = fws.run(ctx, inputs)
        print("\n--- RESULT ---")
        print(f"Success: {result.ok}")
        print(f"Error: {result.error}")
        print(f"Data: {json.dumps(result.data, indent=2)}")
    except Exception as e:
        print(f"Execution failed: {str(e)}")

if __name__ == "__main__":
    run_test()
