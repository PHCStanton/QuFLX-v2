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

        if By is None:
            return CapResult(
                ok=False,
                data=result,
                error="Selenium not available",
                artifacts=tuple(artifacts),
            )

        # Optional pre-shot
        pre_shot = take_screenshot_if(ctx, f"screenshots/favorites_pre_{timestamp()}.png")
        if pre_shot:
            artifacts.append(pre_shot)

        # Scan ONLY currently visible favorites; no scrolling in this capability
        try:
            eligible = self._scan_visible_favorites(ctx, min_pct=min_pct) or []
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
                        if self._click_favorite_simple(ctx, label):  # No scrolling here; click only if visible on current page
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

    def _scan_visible_favorites(self, ctx: Ctx, min_pct: int = 92) -> List[Dict[str, Any]]:
        """
        Scan ONLY the currently visible favorites items (no pagination) and return those
        with payout >= min_pct. Structure: [{"asset": str, "payout_percent": int}, ...]
        """
        results: List[Dict[str, Any]] = []
        try:
            items = ctx.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
        except Exception:
            items = []

        for item in items:
            try:
                if not item.is_displayed():
                    continue
                # Asset label
                try:
                    label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                    asset_name = (label_el.text or "").strip()
                except Exception:
                    asset_name = None

                if not asset_name:
                    continue

                # Payout percentage
                try:
                    payout_el = item.find_element(By.CSS_SELECTOR, ".payout__number")
                    pct_raw = (payout_el.text or "").strip().replace("+", "").replace("%", "")
                    digits = "".join(ch for ch in pct_raw if ch.isdigit())
                    pct = int(digits) if digits else None
                except Exception:
                    pct = None

                if pct is not None and pct >= int(min_pct):
                    results.append({"asset": asset_name, "payout_percent": pct})
            except Exception:
                continue

        return results

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
        Simple click without verification - just try to click the favorite item on the current page.
        No pagination or favorites-bar scrolling is performed here.
        """
        return self._click_favorite_on_current_page(ctx, label)

    def _find_favorites_container(self, ctx: Ctx) -> Optional[Any]:
        """
        Ascend from a visible favorites item to find a horizontally scrollable container.
        """
        try:
            items = ctx.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
        except Exception:
            items = []
        base = None
        for it in items:
            try:
                if it.is_displayed():
                    base = it
                    break
            except Exception:
                continue
        if base is None:
            return None

        current = base
        for _ in range(6):
            try:
                scroll_info = ctx.driver.execute_script("""
                    var el = arguments[0];
                    if (!el) return {sw:0,cw:0,ox:''};
                    var cs = getComputedStyle(el);
                    return {sw: el.scrollWidth||0, cw: el.clientWidth||0, ox: (cs.overflowX||'visible')};
                """, current)
            except Exception:
                scroll_info = None

            try:
                sw = float(scroll_info.get("sw") or 0)
                cw = float(scroll_info.get("cw") or 0)
                ox = str(scroll_info.get("ox") or "")
                if (sw > cw + 5.0) and (ox in ("auto", "scroll")):
                    return current
            except Exception:
                pass

            try:
                current = current.find_element(By.XPATH, "..")
            except Exception:
                break

        return None

    def _find_right_arrow_near(self, ctx: Ctx, container: Any) -> Optional[Any]:
        """
        Search for a right-arrow control within the container, its ancestors, or globally.
        """
        selectors = [
            ".assets-favorites__arrow--right",
            ".favorites-nav__right",
            ".favorites-arrow-right",
            "button[aria-label*='right']",
            "[class*='chevron'][class*='right']",
            ".chevron-right",
            "i.fa.fa-chevron-right",
            "i.fa.fa-angle-right",
            "[class*='arrow'][class*='right']",
            "button[title*='next']",
        ]

        # Search inside container
        for sel in selectors:
            try:
                for el in container.find_elements(By.CSS_SELECTOR, sel):
                    try:
                        if el.is_displayed() and el.is_enabled():
                            return el
                    except Exception:
                        continue
            except Exception:
                continue

        # Search ancestors
        anc = container
        for _ in range(5):
            try:
                anc = anc.find_element(By.XPATH, "..")
            except Exception:
                anc = None
            if not anc:
                break
            for sel in selectors:
                try:
                    for el in anc.find_elements(By.CSS_SELECTOR, sel):
                        try:
                            if el.is_displayed() and el.is_enabled():
                                return el
                        except Exception:
                            continue
                except Exception:
                    continue

        # Global fallback
        for sel in selectors:
            try:
                for el in ctx.driver.find_elements(By.CSS_SELECTOR, sel):
                    try:
                        if el.is_displayed() and el.is_enabled():
                            return el
                    except Exception:
                        continue
            except Exception:
                continue

        return None

    def _last_visible_label(self, ctx: Ctx, container: Any) -> Optional[str]:
        try:
            items = container.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
        except Exception:
            return None
        last = None
        for it in items:
            try:
                if it.is_displayed():
                    last = it
            except Exception:
                continue
        if not last:
            return None
        try:
            lbl = last.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
            return (lbl.text or "").strip()
        except Exception:
            return None

    def _page_right_fallback(self, ctx: Ctx, step_ratio: float = 0.85) -> bool:
        """
        Attempt to page the favorites bar right when HighPriorityControls under-scrolls:
        - Click a nearby right-arrow control if found
        - Else perform JS scrollLeft += clientWidth * step_ratio
        Returns True if progress is detected via scrollLeft or visible label change.
        """
        container = self._find_favorites_container(ctx)
        if not container:
            return False

        try:
            before = ctx.driver.execute_script("return arguments[0].scrollLeft || 0;", container)
        except Exception:
            before = 0
        label_before = self._last_visible_label(ctx, container)

        progressed = False
        arrow = None
        try:
            arrow = self._find_right_arrow_near(ctx, container)
        except Exception:
            arrow = None

        if arrow is not None:
            try:
                self._scroll_into_view(ctx, arrow)
            except Exception:
                pass
            try:
                arrow.click()
                progressed = True
            except Exception:
                try:
                    ctx.driver.execute_script("arguments[0].click();", arrow)
                    progressed = True
                except Exception:
                    progressed = False

        if not progressed:
            # JS scroll fallback
            try:
                info = ctx.driver.execute_script("return {cw: arguments[0].clientWidth||0};", container) or {"cw": 0}
                step = max(50, int(float(info.get("cw") or 0) * float(step_ratio or 0.85)))
                ctx.driver.execute_script("arguments[0].scrollLeft = (arguments[0].scrollLeft||0) + arguments[1];", container, step)
                progressed = True
            except Exception:
                progressed = False

        time.sleep(0.15)

        try:
            after = ctx.driver.execute_script("return arguments[0].scrollLeft || 0;", container)
        except Exception:
            after = before
        label_after = self._last_visible_label(ctx, container)

        return (after > before) or (label_after is not None and label_after != label_before)

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
