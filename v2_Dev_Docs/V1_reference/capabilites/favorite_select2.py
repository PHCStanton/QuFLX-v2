from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple, List

import os
import sys
import time

# Add parent directory to sys.path for direct execution
_parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from capabilities.base import Ctx, CapResult, Capability, add_utils_to_syspath, save_json, take_screenshot_if, timestamp

# Ensure we can import from API-test-space/utils
add_utils_to_syspath()
try:
    from selenium.webdriver.common.by import By
    from selenium.common.exceptions import StaleElementReferenceException
except Exception:
    # Defer import errors; orchestrator will report if Selenium is missing
    By = None  # type: ignore
    StaleElementReferenceException = Exception  # type: ignore

try:
    # Local UI helpers
    from selenium_ui_controls import HighPriorityControls
except Exception:
    HighPriorityControls = None  # type: ignore


class FavoriteSelect(Capability):
    """
    Capability: Scan favorites bar; return assets with payout ≥ min_pct; optional selection.
    Interface: run(ctx, {"min_pct": int=92, "select": "first"|"last"|"all"|None})
    Outputs: {"eligible": [labels...], "selected": label|[labels...]|None}
    Kind: "read"
    """
    id = "favorite_select"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        min_pct = int(inputs.get("min_pct", 92))
        select_pref = inputs.get("select", None)  # "first"|"last"|"all"|None
        dry_run = inputs.get("dry_run", False)

        result: Dict[str, Any] = {
            "eligible": [],
            "selected": None,
            "min_pct": min_pct,
            "select_pref": select_pref,
            "dry_run": dry_run,
        }
        artifacts: List[str] = []

        if HighPriorityControls is None or By is None:
            return CapResult(
                ok=False,
                data=result,
                error="Selenium or helpers not available",
                artifacts=tuple(artifacts),
            )

        hpc = HighPriorityControls(ctx.driver)

        # Optional pre-shot
        pre_shot = take_screenshot_if(ctx, f"screenshots/favorites_pre_{timestamp()}.png")
        if pre_shot:
            artifacts.append(pre_shot)

        # Scan favorites for eligible assets (this method already handles scrolling)
        try:
            eligible = hpc.scan_favorites_for_payout(min_pct=min_pct) or []
        except Exception as e:
            eligible = []
            result["scan_error"] = str(e)

        labels = [e.get("asset") for e in eligible if e.get("asset")]
        result["eligible"] = labels

        selected_items: List[str] = []
        # If selection requested, attempt to click eligible items
        if labels and select_pref and not dry_run:
            if select_pref == "all":
                # Click all eligible favorites with 2-second delays
                for i, label in enumerate(labels):
                    if i > 0:
                        time.sleep(2.0)  # 2-second delay between clicks to avoid overwhelming UI
                    try:
                        if self._click_favorite_simple(ctx, label):  # Use simplified clicking without verification
                            selected_items.append(label)
                            if ctx.verbose:
                                print(f"✅ Successfully selected: {label}")
                        else:
                            if ctx.verbose:
                                print(f"❌ Failed to select: {label}")
                    except Exception as e:
                        if ctx.verbose:
                            print(f"⚠️ Error selecting {label}: {e}")
                        # Continue with next asset even if this one fails
            elif select_pref in ("first", "last"):
                # Existing logic for first/last selection
                pick_label = labels[0] if select_pref == "first" else labels[-1]
                if self._click_favorite_by_label(ctx, pick_label):
                    selected_items.append(pick_label)

        # Set result based on selection preference
        if select_pref == "all":
            result["selected"] = selected_items
        else:
            result["selected"] = selected_items[0] if selected_items else None

        # Optional post-shot
        post_shot = take_screenshot_if(ctx, f"screenshots/favorites_post_{timestamp()}.png")
        if post_shot:
            artifacts.append(post_shot)

        # Save debug JSON if requested
        if ctx.debug:
            try:
                ts = timestamp()
                path = save_json(ctx, f"favorites_scan_{ts}.json", {
                    "inputs": {"min_pct": min_pct, "select": select_pref},
                    "eligible_records": eligible,
                    "result": result,
                }, subfolder="favorite_scan")
                artifacts.append(path)
            except Exception:
                pass

        ok = True  # Scan succeeding is not strictly tied to making a selection
        return CapResult(ok=ok, data=result, error=None, artifacts=tuple(artifacts))

    def _click_favorite_by_label(self, ctx: Ctx, label: str) -> bool:
        """
        Try to click a favorites item by its label text. Robust to small DOM changes.
        Verifies that the asset actually changed by checking for a different pattern.
        """
        # Get current asset name before click for verification
        current_asset_before = self._get_current_selected_asset(ctx)
        if ctx.verbose and current_asset_before:
            print(f"Debug: Current asset before click: {current_asset_before}")

        try:
            items = ctx.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
        except Exception:
            items = []

        # First pass: exact match inside known label element
        for item in items:
            try:
                label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                text = (label_el.text or "").strip()
                if text == label:
                    self._scroll_into_view(ctx, label_el)
                    try:
                        label_el.click()
                        # Verify the asset actually changed
                        if self._verify_asset_changed(ctx, current_asset_before, label):
                            return True
                    except Exception:
                        # Fallback to clicking container
                        try:
                            item.click()
                            # Verify the asset actually changed
                            if self._verify_asset_changed(ctx, current_asset_before, label):
                                return True
                        except Exception:
                            continue
            except StaleElementReferenceException:
                continue
            except Exception:
                continue

        # Second pass: contains match
        lower_needle = label.lower()
        for item in items:
            try:
                label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                text = (label_el.text or "").strip()
                if lower_needle in text.lower():
                    self._scroll_into_view(ctx, label_el)
                    try:
                        label_el.click()
                        # Verify the asset actually changed
                        if self._verify_asset_changed(ctx, current_asset_before, label):
                            return True
                    except Exception:
                        try:
                            item.click()
                            # Verify the asset actually changed
                            if self._verify_asset_changed(ctx, current_asset_before, label):
                                return True
                        except Exception:
                            continue
            except StaleElementReferenceException:
                continue
            except Exception:
                continue

        # Final fallback: global search by text
        try:
            nodes = ctx.driver.find_elements(By.XPATH, "//*[contains(@class,'assets-favorites-item__label')]")
        except Exception:
            nodes = []
        for n in nodes:
            try:
                text = (n.text or "").strip()
                if text == label or label.lower() in text.lower():
                    self._scroll_into_view(ctx, n)
                    try:
                        n.click()
                        # Verify the asset actually changed
                        if self._verify_asset_changed(ctx, current_asset_before, label):
                            return True
                    except Exception:
                        # Click closest clickable ancestor
                        try:
                            anc = n.find_element(By.XPATH, "ancestor::*[(self::div or self::a or self::button)][1]")
                            anc.click()
                            # Verify the asset actually changed
                            if self._verify_asset_changed(ctx, current_asset_before, label):
                                return True
                        except Exception:
                            continue
            except Exception:
                continue

        return False

    def _get_current_selected_asset(self, ctx: Ctx) -> Optional[str]:
        """Get the currently selected asset name."""
        try:
            # Try various selectors for selected asset
            strategies = [
                ("css", ".asset-current, .current-asset, .selected-asset"),
                ("xpath", "//*[contains(@class,'current') or contains(@class,'selected')]//*[contains(@class,'asset') or contains(@class,'name')]"),
                ("xpath", "//*[contains(translate(normalize-space(.),'OTC','')) and contains(@class,'asset')]"),
            ]

            for strat, sel in strategies:
                try:
                    elements = ctx.driver.find_elements(By.CSS_SELECTOR, sel) if strat == "css" else ctx.driver.find_elements(By.XPATH, sel)
                    for el in elements:
                        try:
                            if el.is_displayed():
                                text = (el.text or "").strip()
                                if text and len(text) > 2:  # Minimum asset name length
                                    return text
                        except Exception:
                            continue
                except Exception:
                    continue

        except Exception:
            pass
        return None

    def _verify_asset_changed(self, ctx: Ctx, original_asset: Optional[str], expected_asset: str = None, timeout: float = 5.0) -> bool:
        """
        Verify that the asset actually changed after clicking by checking current asset periodically.
        """
        import time

        end_time = time.time() + timeout
        while time.time() < end_time:
            current_asset = self._get_current_selected_asset(ctx)
            if current_asset and current_asset != original_asset:
                if ctx.verbose:
                    print(f"Debug: Asset verification successful - changed from {original_asset} to {current_asset}")
                return True
            time.sleep(0.1)  # Small sleep to prevent CPU hogging

        if ctx.verbose:
            print(f"Debug: Asset verification failed - still on {original_asset}, expected change")
        return False

    def _click_favorite_simple(self, ctx: Ctx, label: str) -> bool:
        """
        Simple click without verification - just try to click the favorite item.
        Used for bulk selection where verification isn't needed/reliable.
        Enhanced with paging support to find items across multiple pages.
        """
        hpc = HighPriorityControls(ctx.driver)

        # First try: search current page
        if self._click_favorite_on_current_page(ctx, label):
            return True

        # Second try: page through favorites to find the item
        max_paging_steps = 20  # Reasonable limit to avoid infinite loops
        for _ in range(max_paging_steps):
            if hpc.scroll_favorites_right_scoped():
                time.sleep(0.15)  # Wait for page update
                if self._click_favorite_on_current_page(ctx, label):
                    return True
            else:
                # No more pages to the right
                break

        # Optional: reset to leftmost position after searching
        # (commented out to avoid interfering with UI state)
        # hpc.scroll_favorites_reset_left()

        return False

    def _click_favorite_on_current_page(self, ctx: Ctx, label: str) -> bool:
        """Helper to click a favorite item on the current page only."""
        try:
            items = ctx.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
        except Exception:
            items = []

        # First pass: exact match inside known label element
        for item in items:
            try:
                label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                text = (label_el.text or "").strip()
                if text == label:
                    self._scroll_into_view(ctx, label_el)
                    try:
                        label_el.click()
                        return True
                    except Exception:
                        # Fallback to clicking container
                        try:
                            item.click()
                            return True
                        except Exception:
                            continue
            except StaleElementReferenceException:
                continue
            except Exception:
                continue

        # Second pass: contains match
        lower_needle = label.lower()
        for item in items:
            try:
                label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                text = (label_el.text or "").strip()
                if lower_needle in text.lower():
                    self._scroll_into_view(ctx, label_el)
                    try:
                        label_el.click()
                        return True
                    except Exception:
                        try:
                            item.click()
                            return True
                        except Exception:
                            continue
            except StaleElementReferenceException:
                continue
            except Exception:
                continue

        # Final fallback: global search by text
        try:
            nodes = ctx.driver.find_elements(By.XPATH, "//*[contains(@class,'assets-favorites-item__label')]")
        except Exception:
            nodes = []
        for n in nodes:
            try:
                text = (n.text or "").strip()
                if text == label or label.lower() in text.lower():
                    self._scroll_into_view(ctx, n)
                    try:
                        n.click()
                        return True
                    except Exception:
                        # Click closest clickable ancestor
                        try:
                            anc = n.find_element(By.XPATH, "ancestor::*[(self::div or self::a or self::button)][1]")
                            anc.click()
                            return True
                        except Exception:
                            continue
            except Exception:
                continue

        return False

    def _scroll_into_view(self, ctx: Ctx, el: Any):
        try:
            ctx.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        except Exception:
            pass


# Factory for orchestrator
def build() -> Capability:
    return FavoriteSelect()


if __name__ == "__main__":
    import argparse
    import json as _json
    import sys
    from pathlib import Path

    # Try to attach using qf if available (shares global ctx/driver)
    ctx = None
    driver = None
    try:
        import qf  # type: ignore
        ok, _res = qf.attach_chrome_session(port=9222, verbose=True)
        if ok:
            ctx = qf.ctx
            driver = qf.driver
    except Exception:
        pass

    # Fallback direct attach
    if ctx is None:
        try:
            from selenium import webdriver  # type: ignore
            from selenium.webdriver.chrome.options import Options  # type: ignore
            opts = Options()
            opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
            opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            driver = webdriver.Chrome(options=opts)
            artifacts_root = str(Path(__file__).resolve().parents[1] / "Historical_Data" / "cli_artifacts")
            ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=False, dry_run=False, verbose=True)
            print("✅ Attached to Chrome session:", getattr(driver, "current_url", "unknown"))
        except Exception as e:
            print(f"❌ Failed to attach to Chrome session: {e}")
            raise SystemExit(1)

    parser = argparse.ArgumentParser(description="Scan favorites bar and optionally select assets with payout >= min_pct.")
    parser.add_argument("--min-pct", type=int, default=92, help="Minimum payout percentage (default: 92)")
    parser.add_argument("--select", choices=["first", "last", "all"], help="Select first, last, or all eligible assets")
    parser.add_argument("--dry-run", action="store_true", help="Do not click; preview only")
    args = parser.parse_args()

    cap = FavoriteSelect()
    inputs = {
        "min_pct": int(args.min_pct),
        "select": args.select,
        "dry_run": bool(args.dry_run),
    }

    res = cap.run(ctx, inputs)
    # Ensure JSON-safe output (no WebElements)
    out = {
        "ok": res.ok,
        "error": res.error,
        "data": res.data,
        "artifacts": list(res.artifacts) if getattr(res, "artifacts", None) else [],
    }
    print(_json.dumps(out, ensure_ascii=False, indent=2))
