from __future__ import annotations

import json
import sys
import time
import logging
from pathlib import Path
from typing import Any, Dict

# Add project root to path
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from capabilities_v2.base import Ctx, CapResult, Capability, add_utils_to_syspath

add_utils_to_syspath()

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

logger = logging.getLogger(__name__)

try:
    from selenium_ui_controls import HighPriorityControls
except ImportError:
    # Try adding project root to path again if needed
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    try:
        # Check local_selenium_utils first
        local_utils = project_root / "local_selenium_utils"
        if str(local_utils) not in sys.path:
            sys.path.insert(0, str(local_utils))
        from selenium_ui_controls import HighPriorityControls
    except ImportError:
        try:
            # Fallback for old structure or if in path
            from local_selenium_utils.selenium_ui_controls import HighPriorityControls
        except ImportError:
            HighPriorityControls = None

class AssetControl(Capability):
    """
    Control asset and timeframe selection in Pocket Option UI.
    """
    id = "asset_control"
    kind = "control"
    
    def __init__(self):
        super().__init__()
        self._element_cache = {}  # Cache for frequently accessed elements
        self._wait_timeout = 3  # Reduced from default 10 seconds
        self._implicit_wait = 1  # Reduced from default 2 seconds

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        action = inputs.get("action")
        
        if action == "select_asset":
            asset = inputs.get("asset")
            if not asset:
                return CapResult(ok=False, error="Asset name required")
            return self._select_asset(ctx, asset)
        
        elif action == "star_asset":
            asset = inputs.get("asset")
            if not asset:
                return CapResult(ok=False, error="Asset name required")
            return self._star_asset(ctx, asset)
            
        elif action == "select_timeframe":
            timeframe = inputs.get("timeframe")
            if not timeframe:
                return CapResult(ok=False, error="Timeframe required")
            return self._select_timeframe(ctx, timeframe)
            
        else:
            return CapResult(ok=False, error=f"Unknown action: {action}")

    def _select_asset(self, ctx: Ctx, asset_name: str) -> CapResult:
        """
        Selects an asset in the Pocket Option UI (clicks on it to make it active).
        """
        driver = ctx.driver
        
        # 1. Open assets panel if not already open
        if not self._is_assets_panel_open(ctx):
            self._open_assets_dropdown(ctx)
            # Wait for search input instead of sleep
            try:
                WebDriverWait(driver, 1.0).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[placeholder*='Search']"))
                )
            except Exception:
                time.sleep(0.2) # Fallback
            
        if not self._is_assets_panel_open(ctx):
            return CapResult(ok=False, error="Failed to open assets panel")

        # 2. Search for asset
        try:
            search_input = WebDriverWait(driver, self._wait_timeout).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[placeholder*='Search']"))
            )
            search_input.clear()
            search_input.send_keys(asset_name)
            # Wait for asset list to update/filter
            # We can't easily detect "filtered" state, but we can wait for at least one row to be visible
            try:
                WebDriverWait(driver, 1.0).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, ".assets-table__row, .asset-item, .assets-list__item"))
                )
            except Exception:
                time.sleep(0.1)
        except Exception as e:
            logger.warning(f"Failed to find or interact with search input: {e}")

        # 3. Find and click the asset row
        try:
            asset_rows = driver.find_elements(By.CSS_SELECTOR, ".assets-table__row, .asset-item, .assets-list__item")
            target_row = None
            
            for row in asset_rows:
                if not row.is_displayed():
                    continue
                    
                asset_text = row.text or ""
                norm_target = asset_name.replace("/", "").replace(" ", "").replace("_", "").upper()
                norm_row = asset_text.replace("/", "").replace(" ", "").replace("_", "").upper()
                
                if norm_target in norm_row:
                    target_row = row
                    break
            
            if not target_row:
                return CapResult(ok=False, error=f"Asset {asset_name} not found in list")
            
            # Click the row to select the asset
            try:
                target_row.click()
            except Exception as e:
                logger.warning(f"Row click failed, trying JS click: {e}")
                driver.execute_script("arguments[0].click();", target_row)
            
            # No sleep needed after click if we return immediately
            return CapResult(ok=True, data={"message": f"Selected asset {asset_name}"})
            
        except Exception as e:
            return CapResult(ok=False, error=f"Error selecting asset: {e}")

    def _star_asset(self, ctx: Ctx, asset_name: str) -> CapResult:
        """
        Stars an asset (adds to favorites) without selecting it.
        Opens assets panel if needed, searches for asset, and clicks the star icon.
        """
        driver = ctx.driver
        
        # 1. Open assets panel if not already open
        if not self._is_assets_panel_open(ctx):
            self._open_assets_dropdown(ctx)
            # Wait for search input
            try:
                WebDriverWait(driver, 1.0).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[placeholder*='Search']"))
                )
            except Exception:
                time.sleep(0.2)
            
        if not self._is_assets_panel_open(ctx):
            return CapResult(ok=False, error="Failed to open assets panel")

        # 2. Search for asset
        try:
            search_input = WebDriverWait(driver, self._wait_timeout).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[placeholder*='Search']"))
            )
            search_input.clear()
            search_input.send_keys(asset_name)
            # Wait for list to update
            try:
                WebDriverWait(driver, 1.0).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, ".assets-table__row, .asset-item, .assets-list__item"))
                )
            except Exception:
                time.sleep(0.1)
        except Exception as e:
            logger.warning(f"Failed to find or interact with search input: {e}")

        # 3. Find the asset row and star it
        try:
            # Look for asset rows in the panel
            asset_rows = driver.find_elements(By.CSS_SELECTOR, ".assets-table__row, .asset-item, .assets-list__item")
            target_row = None
            
            for row in asset_rows:
                if not row.is_displayed():
                    continue
                    
                # Check if this row contains our target asset
                asset_text = row.text or ""
                # Normalize for comparison
                norm_target = asset_name.replace("/", "").replace(" ", "").upper()
                norm_row = asset_text.replace("/", "").replace(" ", "").upper()
                
                if norm_target in norm_row:
                    target_row = row
                    break
            
            if not target_row:
                return CapResult(ok=False, error=f"Asset {asset_name} not found in list")
            
            # 4. Find and click the star icon in the target row
            star_selectors = [
                ".fa-star-o",  # Empty star (add to favorites)
                ".fa-star",    # Star (could be filled or empty)
                "i[class*='star']",
                "button[class*='favorite']",
                ".asset-star",
                "[data-action='toggle-favorite']"
            ]
            
            star_element = None
            for selector in star_selectors:
                try:
                    stars = target_row.find_elements(By.CSS_SELECTOR, selector)
                    for star in stars:
                        if star.is_displayed() and star.is_enabled():
                            star_element = star
                            break
                    if star_element:
                        break
                except Exception:
                    continue
            
            if not star_element:
                return CapResult(ok=False, error=f"No star/favorite button found for asset {asset_name}")
            
            # 5. Click the star
            try:
                # Check if already starred (has different class)
                star_classes = star_element.get_attribute("class") or ""
                is_already_starred = "fa-star-o" not in star_classes and "star" in star_classes
                
                if is_already_starred:
                    return CapResult(ok=True, data={"message": f"Asset {asset_name} already starred"})
                
                # Click the star
                star_element.click()
                # time.sleep(0.2)  # Removed for speed
                
                return CapResult(ok=True, data={"message": f"Starred asset {asset_name} successfully"})
                
            except Exception as e:
                logger.warning(f"Star click failed, trying JS click: {e}")
                driver.execute_script("arguments[0].click();", star_element)
                # time.sleep(0.2) # Removed for speed
                
                return CapResult(ok=True, data={"message": f"Starred asset {asset_name} successfully (JS click)"})

        except Exception as e:
            return CapResult(ok=False, error=f"Error starring asset: {e}")

    def _select_timeframe(self, ctx: Ctx, timeframe: str) -> CapResult:
        """
        Selects a timeframe (e.g., '1m', '5m').
        """
        driver = ctx.driver
        
        # Map timeframe keys to common UI labels
        tf_map = {
            '15s': '15 sec',
            '1m': '1 min',
            '5m': '5 min',
            '15m': '15 min',
            '1h': '1 hour',
            '4h': '4 hours',
            '1d': '1 day',
        }
        target_text = tf_map.get(timeframe.lower(), timeframe)

        try:
            # Find Timeframe/Chart Type button
            menu_btn = None
            selectors = [
                "a.items__link--chart-type",
                ".chart-type-button",
                "[data-test='chart-timeframe']",
                "button[class*='timeframe']",
                ".time-frame-selector",
                ".tf-selector"
            ]
            
            tried_selectors = []
            for sel in selectors:
                try:
                    # Use explicit wait for better performance
                    els = WebDriverWait(driver, self._implicit_wait).until(
                        EC.presence_of_all_elements_located((By.CSS_SELECTOR, sel))
                    )
                    tried_selectors.append(f"{sel} (found {len(els)} elements)")
                    for el in els:
                        if el.is_displayed() and el.is_enabled():
                            menu_btn = el
                            logger.info(f"Found timeframe button with selector: {sel}")
                            break
                except Exception as find_err:
                    tried_selectors.append(f"{sel} (error: {str(find_err)[:50]})")
                    continue
                if menu_btn: 
                    break
            
            if not menu_btn:
                error_msg = f"Could not find timeframe menu button. Tried selectors: {' | '.join(tried_selectors)}"
                print(error_msg)
                return CapResult(ok=False, error=error_msg)
            
            # Click menu button
            try:
                menu_btn.click()
            except Exception as e:
                logger.debug(f"Menu click failed, trying JS click: {e}")
                driver.execute_script("arguments[0].click();", menu_btn)
            time.sleep(0.3)  # Reduced from 0.5s
            
            # Build timeframe shortcuts
            if timeframe.endswith('m'):
                short_tf = "M" + timeframe[:-1]  # 1m -> M1, 5m -> M5
            elif timeframe.endswith('h'):
                short_tf = "H" + timeframe[:-1]  # 1h -> H1, 4h -> H4
            elif timeframe.endswith('d'):
                short_tf = "D" + timeframe[:-1]  # 1d -> D1
            elif timeframe.endswith('s'):
                short_tf = "S" + timeframe[:-1]  # 30s -> S30
            else:
                short_tf = timeframe.upper()
            
            # Find and click the timeframe option
            option_selectors = [
                ".items__list .item",
                ".timeframe-options button",
                "[class*='timeframe-option']",
                ".tf-option"
            ]
            
            option_tried = []
            for opt_sel in option_selectors:
                try:
                    # Use explicit wait for better performance
                    options = WebDriverWait(driver, self._implicit_wait).until(
                        EC.presence_of_all_elements_located((By.CSS_SELECTOR, opt_sel))
                    )
                    option_tried.append(f"{opt_sel} (found {len(options)})")
                    for opt in options:
                        txt = opt.text.strip()
                        if txt == short_tf or txt == target_text or txt.upper() == short_tf.upper():
                            try:
                                opt.click()
                            except Exception as click_err:
                                logger.warning(f"Click failed, trying JS click: {click_err}")
                                driver.execute_script("arguments[0].click();", opt)
                            logger.info(f"Selected timeframe {timeframe} (matched: {txt})")
                            return CapResult(ok=True, data={"message": f"Selected timeframe {timeframe}"})
                except Exception as opt_err:
                    option_tried.append(f"{opt_sel} (error: {str(opt_err)[:50]})")
                    continue
            
            # If we get here, we found menu but not the option
            print(f"Available options searched with selectors: {' | '.join(option_tried)}")
            return CapResult(
                ok=False, 
                error=f"Timeframe option '{short_tf}' or '{target_text}' not found in menu. Pocket Option UI may have changed."
            )

        except Exception as e:
            error_detail = f"Exception in _select_timeframe: {type(e).__name__}: {str(e)}"
            print(error_detail)
            return CapResult(ok=False, error=error_detail)

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
        # Optimized open logic with explicit waits and caching
        drv = ctx.driver
        
        # Check cache first
        cache_key = "assets_dropdown"
        if cache_key in self._element_cache:
            try:
                cached_el = self._element_cache[cache_key]
                if cached_el.is_displayed() and cached_el.is_enabled():
                    cached_el.click()
                    time.sleep(0.2)
                    if self._is_assets_panel_open(ctx):
                        return
            except Exception:
                # Cache invalid, clear it
                del self._element_cache[cache_key]
        
        selectors = [
            ".asset-selector", 
            ".asset__selector", 
            ".assets-select",
            ".current-asset",
            ".assets-block",
            "//div[contains(@class, 'current-asset')]",
            "//div[contains(@class, 'asset-selector')]"
        ]
        
        for _ in range(2): # Reduced from 3 to 2 retries
            for sel in selectors:
                try:
                    # Use explicit wait for better performance
                    if sel.startswith("//"):
                        els = WebDriverWait(drv, self._implicit_wait).until(
                            EC.presence_of_all_elements_located((By.XPATH, sel))
                        )
                    else:
                        els = WebDriverWait(drv, self._implicit_wait).until(
                            EC.presence_of_all_elements_located((By.CSS_SELECTOR, sel))
                        )
                    
                    for el in els:
                        if el.is_displayed() and el.is_enabled():
                            try:
                                el.click()
                                # Cache successful element
                                self._element_cache[cache_key] = el
                                time.sleep(0.2)  # Reduced from 0.5s
                                if self._is_assets_panel_open(ctx):
                                    return
                            except Exception as click_err:
                                logger.warning(f"Click failed, trying JS click: {click_err}")
                                drv.execute_script("arguments[0].click();", el)
                                self._element_cache[cache_key] = el
                                time.sleep(0.2)
                                if self._is_assets_panel_open(ctx):
                                    return
                except Exception as e:
                    logger.warning(f"Error interacting with asset selector {sel}: {e}")
                    continue
            time.sleep(0.3)  # Reduced from 0.5s

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
    parser.add_argument("--action", required=True, choices=["select_asset", "star_asset", "select_timeframe"])
    parser.add_argument("--asset")
    parser.add_argument("--timeframe")
    args = parser.parse_args()

    cap = AssetControl()
    res = cap.run(ctx, vars(args))
    print(json.dumps({"ok": res.ok, "data": res.data, "error": res.error}))
