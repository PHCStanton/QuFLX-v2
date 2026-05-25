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

from backend.utils.asset_utils import normalize_asset

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
            # Wait for modern asset panel/search DOM instead of relying on fixed sleeps.
            try:
                WebDriverWait(driver, 2.0).until(
                    EC.visibility_of_element_located((
                        By.CSS_SELECTOR,
                        "input[type='text'], input[type='search'], input[placeholder*='Search'], input[placeholder*='Asset'], input[placeholder*='Pair']"
                    ))
                )
            except Exception:
                logger.debug("Asset search input did not become visible immediately after dropdown click")
                time.sleep(0.4)
            
        if not self._is_assets_panel_open(ctx):
            return CapResult(ok=False, error="Failed to open assets panel")

        # 2. Search for asset
        try:
            search_input = WebDriverWait(driver, self._wait_timeout).until(
                EC.visibility_of_element_located((
                    By.CSS_SELECTOR,
                    "input[type='text'], input[type='search'], input[placeholder*='Search'], input[placeholder*='Asset'], input[placeholder*='Pair']"
                ))
            )
            search_input.clear()
            search_input.send_keys(asset_name)
            # Wait for asset list to update/filter
            # We can't easily detect "filtered" state, but we can wait for at least one row to be visible
            try:
                WebDriverWait(driver, 2.0).until(
                    EC.visibility_of_element_located((
                        By.CSS_SELECTOR,
                        ".assets-table__row, .asset-item, .assets-list__item, [class*='asset'][class*='row'], [class*='asset'][class*='item'], [class*='pair'][class*='item']"
                    ))
                )
            except Exception:
                logger.debug("Asset rows did not become visible immediately after filtering for %s", asset_name)
                time.sleep(0.2)
        except Exception as e:
            logger.warning(f"Failed to find or interact with search input: {e}")

        # 3. Find and click the asset row
        try:
            row_selector = ".assets-table__row, .asset-item, .assets-list__item, [class*='asset'][class*='row'], [class*='asset'][class*='item'], [class*='pair'][class*='item']"
            asset_rows = driver.find_elements(By.CSS_SELECTOR, row_selector)
            logger.info("Asset search for %s found %s candidate row(s)", asset_name, len(asset_rows))
            target_row = None
            inspected_rows = []
            
            for row in asset_rows:
                if not row.is_displayed():
                    continue
                    
                asset_text = row.text or ""
                if asset_text:
                    inspected_rows.append(asset_text.replace("\n", " ")[:80])
                norm_target = normalize_asset(asset_name)
                norm_row = normalize_asset(asset_text)
                
                if norm_target in norm_row:
                    target_row = row
                    break
            
            if not target_row:
                logger.warning("Asset %s not found. Visible candidate rows: %s", asset_name, inspected_rows[:10])
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
                logger.error(error_msg)
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
            msg = f"Available options searched with selectors: {' | '.join(option_tried)}"
            logger.warning(msg)
            return CapResult(
                ok=False, 
                error=f"Timeframe option '{short_tf}' or '{target_text}' not found in menu. Pocket Option UI may have changed."
            )

        except Exception as e:
            error_detail = f"Exception in _select_timeframe: {type(e).__name__}: {str(e)}"
            logger.error(error_detail)
            return CapResult(ok=False, error=error_detail)

    def _is_assets_panel_open(self, ctx: Ctx) -> bool:
        try:
            return bool(ctx.driver.execute_script("""
                const isVisible = (el) => {
                  if (!el) return false;
                  const style = window.getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && rect.width > 0
                    && rect.height > 0;
                };

                const searchSelectors = [
                  "input[type='search']",
                  "input[placeholder*='Search']",
                  "input[placeholder*='search']",
                  "input[placeholder*='Asset']",
                  "input[placeholder*='asset']",
                  "input[placeholder*='Pair']",
                  "input[placeholder*='pair']"
                ];
                if (searchSelectors.some((sel) => Array.from(document.querySelectorAll(sel)).some(isVisible))) {
                  return true;
                }

                const panelSelectors = [
                  ".assets-block__list",
                  ".assets-table",
                  ".assets-list",
                  ".assets-list__item",
                  ".assets-table__row",
                  ".asset-item",
                  ".sidebar-assets",
                  ".assets-category",
                  "[class*='assets'][class*='list']",
                  "[class*='assets'][class*='table']",
                  "[class*='asset'][class*='list']",
                  "[class*='asset'][class*='item']",
                  "[class*='pair'][class*='list']",
                  "[class*='pair'][class*='item']"
                ];
                return panelSelectors.some((sel) => Array.from(document.querySelectorAll(sel)).some(isVisible));
            """))
        except Exception as exc:
            logger.debug("Failed to inspect asset panel open state: %s", exc)
            return False

    def _open_assets_dropdown(self, ctx: Ctx) -> bool:
        # Robust open logic with explicit waits, stale-cache handling, and diagnostics.
        drv = ctx.driver
        diagnostics = []
        
        # Check cache first
        cache_key = "assets_dropdown"
        if cache_key in self._element_cache:
            try:
                cached_el = self._element_cache[cache_key]
                if cached_el.is_displayed() and cached_el.is_enabled():
                    cached_el.click()
                    time.sleep(0.4)
                    if self._is_assets_panel_open(ctx):
                        logger.info("Opened assets panel using cached selector element")
                        return True
            except Exception as exc:
                # Cache invalid, clear it
                diagnostics.append(f"cached element failed: {str(exc)[:120]}")
                del self._element_cache[cache_key]
        
        selectors = [
            (By.CSS_SELECTOR, ".asset-selector"),
            (By.CSS_SELECTOR, ".asset__selector"),
            (By.CSS_SELECTOR, ".assets-select"),
            (By.CSS_SELECTOR, ".assets__select"),
            (By.CSS_SELECTOR, ".asset-dropdown"),
            (By.CSS_SELECTOR, ".current-asset"),
            (By.CSS_SELECTOR, ".chart-asset-name"),
            (By.CSS_SELECTOR, ".pair-title"),
            (By.CSS_SELECTOR, ".pair-selector"),
            (By.CSS_SELECTOR, ".assets-block"),
            (By.CSS_SELECTOR, "[data-test*='asset']"),
            (By.CSS_SELECTOR, "[data-testid*='asset']"),
            (By.CSS_SELECTOR, "[class*='asset'][class*='selector']"),
            (By.CSS_SELECTOR, "[class*='asset'][class*='dropdown']"),
            (By.CSS_SELECTOR, "[class*='pair'][class*='selector']"),
            (By.CSS_SELECTOR, "[class*='current'][class*='asset']"),
            (By.XPATH, "//div[contains(@class, 'current-asset')]"),
            (By.XPATH, "//div[contains(@class, 'asset-selector')]"),
            (By.XPATH, "//button[contains(normalize-space(.),'/')]"),
            (By.XPATH, "//div[contains(normalize-space(.),'/') and (contains(normalize-space(.),'OTC') or contains(normalize-space(.),'%'))]")
        ]
        
        for attempt in range(1, 4):
            if attempt > 1:
                self._element_cache.pop(cache_key, None)

            for by, sel in selectors:
                try:
                    els = WebDriverWait(drv, self._implicit_wait).until(
                        EC.presence_of_all_elements_located((by, sel))
                    )
                    diagnostics.append(f"attempt {attempt}: {sel} found {len(els)}")
                    
                    for el in els:
                        if not el.is_displayed() or not el.is_enabled():
                            diagnostics.append(f"attempt {attempt}: {sel} element hidden/disabled")
                            continue

                        try:
                            el.click()
                            # Cache successful element
                            self._element_cache[cache_key] = el
                            time.sleep(0.5)
                            if self._is_assets_panel_open(ctx):
                                logger.info("Opened assets panel using selector %s on attempt %s", sel, attempt)
                                return True
                            diagnostics.append(f"attempt {attempt}: {sel} clicked but panel not detected")
                        except Exception as click_err:
                            diagnostics.append(f"attempt {attempt}: {sel} normal click failed: {str(click_err)[:120]}")
                            try:
                                drv.execute_script("arguments[0].click();", el)
                                self._element_cache[cache_key] = el
                                time.sleep(0.5)
                                if self._is_assets_panel_open(ctx):
                                    logger.info("Opened assets panel using JS click selector %s on attempt %s", sel, attempt)
                                    return True
                                diagnostics.append(f"attempt {attempt}: {sel} JS clicked but panel not detected")
                            except Exception as js_click_err:
                                diagnostics.append(f"attempt {attempt}: {sel} JS click failed: {str(js_click_err)[:120]}")
                except Exception as e:
                    diagnostics.append(f"attempt {attempt}: {sel} lookup failed: {str(e)[:120]}")
                    continue
            time.sleep(0.5)

        logger.error("Failed to open assets panel. Selector diagnostics: %s", " | ".join(diagnostics[-30:]))
        return False

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
    # Keep this print for CLI/Gateway consumption
    print(json.dumps({"ok": res.ok, "data": res.data, "error": res.error}))
