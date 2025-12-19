from __future__ import annotations

from typing import Any, Dict, List
from pathlib import Path
import sys

from .base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp

try:
    from selenium.webdriver.common.by import By
except Exception:
    By = None  # type: ignore

try:
    from selenium_ui_controls import HighPriorityControls
except Exception:
    try:
        project_root = Path(__file__).resolve().parents[1]
        selenium_dir = project_root / "local_selenium_utils"
        if str(selenium_dir) not in sys.path:
            sys.path.insert(0, str(selenium_dir))
        from selenium_ui_controls import HighPriorityControls  # type: ignore
    except Exception:
        HighPriorityControls = None  # type: ignore


class FavoritesBar(Capability):
    id = "favorites_bar"
    kind = "control-read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())

        action = inputs.get("action")
        if action == "reset_to_left":
            return self._reset_to_left(ctx)
        if action == "scroll_right":
            return self._scroll_right(ctx)
        if action == "get_visible_favorites":
            return self._get_visible_favorites(ctx)
        if action == "click_favorite":
            label = inputs.get("label")
            if not label:
                return CapResult(ok=False, data={}, error="label required", artifacts=())
            return self._click_favorite(ctx, label)
        return CapResult(ok=False, data={}, error="unknown action", artifacts=())

    def _reset_to_left(self, ctx: Ctx) -> CapResult:
        arts = []
        shot = take_screenshot_if(ctx, f"screenshots/favorites_reset_left_{timestamp()}.png")
        if shot:
            arts.append(shot)
        ok = False
        scrolled = False
        meta: Dict[str, Any] = {}
        if HighPriorityControls is not None:
            try:
                hpc = HighPriorityControls(ctx.driver)
                scrolled = bool(hpc.scroll_favorites_reset_left())
                ok = True
            except Exception as e:
                meta["error"] = str(e)
        return CapResult(ok=ok, data={"scrolled": scrolled, "meta": meta}, error=None if ok else "reset failed", artifacts=tuple(arts))

    def _scroll_right(self, ctx: Ctx) -> CapResult:
        arts = []
        shot = take_screenshot_if(ctx, f"screenshots/favorites_scroll_right_{timestamp()}.png")
        if shot:
            arts.append(shot)
        ok = False
        scrolled = False
        meta: Dict[str, Any] = {}
        if HighPriorityControls is not None:
            try:
                hpc = HighPriorityControls(ctx.driver)
                scrolled = bool(hpc.scroll_favorites_right_scoped())
                ok = True
            except Exception as e:
                meta["error"] = str(e)
        return CapResult(ok=ok, data={"scrolled": scrolled, "meta": meta}, error=None if ok else "scroll failed", artifacts=tuple(arts))

    def _get_visible_favorites(self, ctx: Ctx) -> CapResult:
        drv = ctx.driver
        items: List[Dict[str, Any]] = []
        try:
            nodes = drv.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
            for n in nodes:
                try:
                    if not n.is_displayed():
                        continue
                    lbl = n.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                    data_id = None
                    try:
                        parent = n.find_element(By.XPATH, "ancestor::div[contains(@class,'assets-favorites-item')][1]")
                        data_id = parent.get_attribute("data-id")
                    except Exception:
                        data_id = None
                    payout_el = None
                    try:
                        payout_el = n.find_element(By.CSS_SELECTOR, ".payout__number")
                    except Exception:
                        payout_el = None
                    items.append({
                        "asset": (lbl.text or "").strip(),
                        "data_id": (data_id or "").strip() if data_id else None,
                        "payout": (payout_el.text or "").strip() if payout_el else None
                    })
                except Exception:
                    continue
        except Exception as e:
            return CapResult(ok=False, data={}, error=str(e))
        return CapResult(ok=True, data={"visible": items, "assets": [it.get("asset") for it in items if it.get("asset")]})

    def _click_favorite(self, ctx: Ctx, label: str) -> CapResult:
        drv = ctx.driver
        try:
            nodes = drv.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
            target = None
            for n in nodes:
                try:
                    if not n.is_displayed():
                        continue
                    lbl = n.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                    txt = (lbl.text or "").strip()
                    if txt == label:
                        try:
                            target = n.find_element(By.XPATH, "ancestor::div[contains(@class,'assets-favorites-item')][1]")
                        except Exception:
                            target = n
                        break
                except Exception:
                    continue
            if not target:
                return CapResult(ok=False, data={}, error="favorite not visible")
            try:
                target.click()
            except Exception:
                drv.execute_script("arguments[0].click();", target)
            return CapResult(ok=True, data={"clicked": label})
        except Exception as e:
            return CapResult(ok=False, data={}, error=str(e))
