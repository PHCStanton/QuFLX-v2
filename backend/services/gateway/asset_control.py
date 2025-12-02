from __future__ import annotations

from typing import Any, Dict, Optional, List, Tuple
import time
import json
import sys
from pathlib import Path

# Add project root to path to import capabilities
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

try:
    from v2_Dev_Docs.V1_reference.capabilites.base import (
        Ctx,
        CapResult,
        Capability,
        add_utils_to_syspath,
    )
except ImportError:
    # Fallback if path structure is different
    sys.path.append(str(project_root / "v2_Dev_Docs" / "V1_reference"))
    from capabilities.base import (
        Ctx,
        CapResult,
        Capability,
        add_utils_to_syspath,
    )

add_utils_to_syspath()

try:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    pass

# Import HighPriorityControls
try:
    from selenium.selenium_ui_controls import HighPriorityControls
except ImportError:
    # Try adding project root to path again if needed
    sys.path.append(str(project_root))
    try:
        from selenium.selenium_ui_controls import HighPriorityControls
    except ImportError:
        HighPriorityControls = None

class AssetControl(Capability):
    """
    Control asset and timeframe selection in Pocket Option UI.
    """
    id = "asset_control"
    kind = "control"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        action = inputs.get("action")
        
        if action == "select_asset":
            asset = inputs.get("asset")
            if not asset:
                return CapResult(ok=False, error="Asset name required")
            return self._select_asset(ctx, asset)
            
        elif action == "select_timeframe":
            timeframe = inputs.get("timeframe")
            if not timeframe:
                return CapResult(ok=False, error="Timeframe required")
            return self._select_timeframe(ctx, timeframe)
            
        else:
            return CapResult(ok=False, error=f"Unknown action: {action}")

    def _select_asset(self, ctx: Ctx, asset_name: str) -> CapResult:
        """
        Selects an asset. Tries favorites bar first, then dropdown.
        """
        driver = ctx.driver
        
        # 1. Try Favorites Bar (Fast Path)
        if HighPriorityControls:
            try:
                controls = HighPriorityControls(driver)
                # Reset to left
                controls.scroll_favorites_reset_left()
                
                # Scan and click
                # We iterate pages similar to scan_favorites_for_payout but stop when we find the asset
                found_in_favorites = False
                
                for _ in range(10): # Max 10 pages
                    # Check current page
                    items = driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                    for item in items:
                        try:
                            if not item.is_displayed(): continue
                            label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                            current_asset = (label_el.text or "").strip()
                            
                            # Normalize names for comparison (remove / and spaces)
                            norm_target = asset_name.replace("/", "").replace(" ", "").upper()
                            norm_current = current_asset.replace("/", "").replace(" ", "").upper()
                            
                            if norm_target == norm_current:
                                item.click()
                                return CapResult(ok=True, data={"message": f"Selected asset {asset_name} from favorites"})
                        except Exception:
                            continue
                    
                    # Scroll right
                    if not controls.scroll_favorites_right_scoped():
                        break
                    time.sleep(0.2)
                    
            except Exception as e:
                # Log error but continue to dropdown fallback
                print(f"Favorites selection failed: {e}")

        # 2. Fallback to Dropdown (Slow Path)
        if not self._is_assets_panel_open(ctx):
            self._open_assets_dropdown(ctx)
            time.sleep(0.5)
            
        if not self._is_assets_panel_open(ctx):
             return CapResult(ok=False, error="Failed to open assets panel")

        # Search for asset
        try:
            search_input = WebDriverWait(driver, 2).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[placeholder*='Search']"))
            )
            search_input.clear()
            search_input.send_keys(asset_name)
            time.sleep(0.5)
        except Exception:
            pass

        # Click the asset
        try:
            # XPath to find element containing the text
            xpath = f"//div[contains(@class, 'asset') or contains(@class, 'item')]//*[contains(text(), '{asset_name}')]"
            
            time.sleep(0.5)
            
            elements = driver.find_elements(By.XPATH, xpath)
            target_el = None
            
            for el in elements:
                if el.is_displayed():
                    if asset_name in el.text:
                        target_el = el
                        break
            
            if target_el:
                try:
                    target_el.click()
                except:
                    driver.execute_script("arguments[0].click();", target_el)
                
                return CapResult(ok=True, data={"message": f"Selected asset {asset_name} from dropdown"})
            else:
                return CapResult(ok=False, error=f"Asset {asset_name} not found in list")

        except Exception as e:
            return CapResult(ok=False, error=f"Error selecting asset: {e}")

    def _select_timeframe(self, ctx: Ctx, timeframe: str) -> CapResult:
        """
        Selects a timeframe (e.g., '1m', '5m').
        """
        driver = ctx.driver
        
        # Map '1m' to '1 min' or whatever the UI uses
        tf_map = {
            '1m': '1 min',
            '5m': '5 min',
            '15m': '15 min',
            '1h': '1 hour',
            # Add more as needed
        }
        target_text = tf_map.get(timeframe.lower(), timeframe)

        try:
            # 1. Find Timeframe/Chart Type button
            # This is tricky as it varies. We look for the button that shows current timeframe.
            # Or the button that opens the timeframe menu.
            
            # Strategy: Look for the text of the current timeframe (e.g. "1 min") or "Time"
            # But Pocket Option has "Time" (expiry) and "Timeframe" (chart candle size).
            # User said: "1M Button". This usually refers to Chart Timeframe.
            
            # Try to find the timeframe selector on the chart toolbar
            # Often has class 'items__link--chart-type' or similar
            
            # Let's try to find a button with the target text first (if it's already visible/selected)
            # If not, find the menu button.
            
            # Common selector for chart timeframe menu
            menu_btn = None
            selectors = [
                "a.items__link--chart-type",
                ".chart-type-button",
                "[data-test='chart-timeframe']"
            ]
            
            for sel in selectors:
                try:
                    els = driver.find_elements(By.CSS_SELECTOR, sel)
                    for el in els:
                        if el.is_displayed():
                            menu_btn = el
                            break
                except:
                    continue
                if menu_btn: break
            
            if menu_btn:
                menu_btn.click()
                time.sleep(0.5)
                
                # Now look for the option
                # It might be a list of buttons like "S5", "S10", "M1", "M5" etc.
                # "1m" -> "M1"
                
                short_tf = timeframe.upper().replace("M", "M").replace("H", "H") # 1m -> 1M? No, usually M1
                if timeframe.endswith('m'):
                    short_tf = "M" + timeframe[:-1] # 1m -> M1
                elif timeframe.endswith('h'):
                    short_tf = "H" + timeframe[:-1]
                elif timeframe.endswith('s'):
                    short_tf = "S" + timeframe[:-1]
                    
                # Look for button with text "M1", "1 min", etc.
                options = driver.find_elements(By.CSS_SELECTOR, ".items__list .item")
                for opt in options:
                    txt = opt.text.strip()
                    if txt == short_tf or txt == target_text:
                        opt.click()
                        return CapResult(ok=True, data={"message": f"Selected timeframe {timeframe}"})
                        
                return CapResult(ok=False, error=f"Timeframe option {timeframe} ({short_tf}) not found")
            
            else:
                return CapResult(ok=False, error="Timeframe menu button not found")

        except Exception as e:
            return CapResult(ok=False, error=f"Error selecting timeframe: {e}")

    # Reuse helpers from favorite_star_select.py or similar
    def _is_assets_panel_open(self, ctx: Ctx) -> bool:
        try:
            # Check for star icons (original logic)
            is_open = bool(ctx.driver.execute_script("""
                const inView = (el) => {
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
                };
                const nodes = Array.from(document.querySelectorAll(
                  "i.alist__icon.fa.fa-star-o.add, i.alist__icon.fa.fa-star.del"
                ));
                for (const n of nodes) { if (inView(n)) return true; }
                return false;
            """))
            if is_open: return True
            
            # Fallback: Check for the assets list container
            return bool(ctx.driver.execute_script("""
                const el = document.querySelector('.assets-block__list, .assets-table, .assets-list');
                return el && el.offsetParent !== null;
            """))
        except Exception:
            return False

    def _open_assets_dropdown(self, ctx: Ctx):
        # Improved open logic with retries and multiple selectors
        drv = ctx.driver
        selectors = [
            ".asset-selector", 
            ".asset__selector", 
            ".assets-select",
            ".current-asset",
            ".assets-block",
            "//div[contains(@class, 'current-asset')]",
            "//div[contains(@class, 'asset-selector')]"
        ]
        
        for _ in range(3): # Retry 3 times
            for sel in selectors:
                try:
                    if sel.startswith("//"):
                        els = drv.find_elements(By.XPATH, sel)
                    else:
                        els = drv.find_elements(By.CSS_SELECTOR, sel)
                    
                    for el in els:
                        if el.is_displayed():
                            try:
                                el.click()
                                time.sleep(0.5)
                                if self._is_assets_panel_open(ctx):
                                    return
                            except:
                                drv.execute_script("arguments[0].click();", el)
                                time.sleep(0.5)
                                if self._is_assets_panel_open(ctx):
                                    return
                except:
                    continue
            time.sleep(0.5)

if __name__ == "__main__":
    import argparse
    
    # Attach to existing session
    try:
        import qf # type: ignore
        ok, _ = qf.attach_chrome_session(port=9222)
        ctx = qf.ctx
    except:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        opts = Options()
        opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        driver = webdriver.Chrome(options=opts)
        ctx = Ctx(driver=driver, artifacts_root=".", debug=True, dry_run=False, verbose=True)

    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True, choices=["select_asset", "select_timeframe"])
    parser.add_argument("--asset")
    parser.add_argument("--timeframe")
    args = parser.parse_args()

    cap = AssetControl()
    res = cap.run(ctx, vars(args))
    print(json.dumps({"ok": res.ok, "data": res.data, "error": res.error}))
