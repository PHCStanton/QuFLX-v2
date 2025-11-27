from __future__ import annotations

from typing import Any, Dict, Optional, List, Tuple, Set
import re
import time

try:
    from .base import (
        Ctx,
        CapResult,
        Capability,
        add_utils_to_syspath,
        take_screenshot_if,
        save_json,
        timestamp,
    )
except ImportError:
    # Allow running as a script: python capabilities\favorite_star_select.py
    import sys
    from pathlib import Path

    this_file = Path(__file__).resolve()
    project_root = this_file.parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from capabilities.base import (  # type: ignore
        Ctx,
        CapResult,
        Capability,
        add_utils_to_syspath,
        take_screenshot_if,
        save_json,
        timestamp,
    )

# Ensure utils are importable
add_utils_to_syspath()
try:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
except Exception:
    By = None  # type: ignore
    Keys = None  # type: ignore


class FavoriteStarSelect(Capability):
    """
    Manage favorites directly from the Assets dropdown.

    Modes:
      - sweep_all=True (default): scroll entire dropdown, star all assets with payout >= min_pct,
        and (optionally) unstar any below threshold (unstar_below=True by default).
      - sweep_all=False: act only on currently visible items (no deliberate scrolling).

    Star icons:
      - Not selected: <i class="alist__icon fa fa-star-o add">
      - Selected    : <i class="alist__icon fa fa-star del">

    Inputs:
      - min_pct: int = 92
      - sweep_all: bool = True
      - unstar_below: bool = True
      - limit_to_visible: bool = True (used only when sweep_all=False)
      - dry_run: bool = False
      - close_after: bool = True
    """
    id = "favorite_star_select"
    kind = "control"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())

        min_pct: int = int(inputs.get("min_pct", 92))
        sweep_all: bool = bool(inputs.get("sweep_all", True))
        unstar_below: bool = bool(inputs.get("unstar_below", True))
        limit_to_visible: bool = bool(inputs.get("limit_to_visible", True))
        dry_run: bool = bool(inputs.get("dry_run", False))
        close_after: bool = bool(inputs.get("close_after", True))
        filter_mode: Optional[str] = inputs.get("filter_mode", None)

        data: Dict[str, Any] = {
            "min_pct": min_pct,
            "sweep_all": sweep_all,
            "unstar_below": unstar_below,
            "limit_to_visible": limit_to_visible,
            "dry_run": dry_run,
            "filter_mode": filter_mode,
            "attempts": {},
            "processed": {
                "selected_now": [],
                "deselected_now": [],
                "already_favorited": [],
                "already_unfavorited": [],
                "skipped_non_eligible": [],
                "skipped_filtered": [],
                "errors": [],
                "counts": {
                    "rows_seen": 0,
                    "visible_checked": 0,
                    "eligible": 0,
                    "star_clicked": 0,
                    "unstar_clicked": 0,
                    "already_favorited": 0,
                    "already_unfavorited": 0,
                    "skipped": 0,
                    "filtered_out": 0,
                },
            },
        }
        artifacts: List[str] = []

        # Pre screenshot
        pre = take_screenshot_if(ctx, f"screenshots/fav_star_select_pre_{timestamp()}.png")
        if pre:
            artifacts.append(pre)

        # Open dropdown (capture toggle element but don't serialize it)
        open_meta, toggle_btn = self._open_assets_dropdown(ctx)
        open_meta_sanitized = dict(open_meta)
        if "button_el" in open_meta_sanitized:
            open_meta_sanitized["button_found"] = bool(open_meta_sanitized["button_el"])
            open_meta_sanitized["button_el"] = None
        data["attempts"]["open"] = open_meta_sanitized

        if not open_meta.get("opened", False) and not self._is_assets_panel_open(ctx):
            return CapResult(
                ok=False,
                data=data,
                error=open_meta.get("error") or "Failed to open Assets dropdown",
                artifacts=tuple(artifacts),
            )

        # Process items
        if sweep_all:
            self._process_entire_list(ctx, min_pct, unstar_below, dry_run, data, filter_mode=filter_mode)
        else:
            self._process_visible_only(ctx, min_pct, unstar_below, limit_to_visible, dry_run, data, filter_mode=filter_mode)

        # Close dropdown
        close_meta: Dict[str, Any] = {}
        if close_after:
            close_meta = self._close_assets_dropdown(ctx, toggle_btn)
        if "button_el" in close_meta:
            close_meta["button_el"] = None
        data["attempts"]["close"] = close_meta

        # Post screenshot
        post = take_screenshot_if(ctx, f"screenshots/fav_star_select_post_{timestamp()}.png")
        if post:
            artifacts.append(post)

        if ctx.debug:
            try:
                jf = save_json(ctx, f"favorite_star_select_{timestamp()}.json", data, subfolder="favorite_star_select")
                artifacts.append(jf)
            except Exception:
                pass

        return CapResult(ok=True, data=data, error=None, artifacts=tuple(artifacts))

    # ================= Core processing =================

    def _process_visible_only(
        self,
        ctx: Ctx,
        min_pct: int,
        unstar_below: bool,
        limit_to_visible: bool,
        dry_run: bool,
        data: Dict[str, Any],
        filter_mode: Optional[str] = None,
    ):
        driver = ctx.driver
        star_sel = "i.alist__icon.fa.fa-star-o.add, i.alist__icon.fa.fa-star.del"
        try:
            stars = driver.find_elements(By.CSS_SELECTOR, star_sel)
        except Exception:
            stars = []

        if not stars:
            force_meta = self._open_assets_dropdown_force(ctx)
            data["attempts"]["open_force"] = {"opened": force_meta.get("opened", False)}
            try:
                stars = driver.find_elements(By.CSS_SELECTOR, star_sel)
            except Exception:
                stars = []

        stars_filtered: List[Any] = []
        for el in stars:
            try:
                if not el.is_displayed():
                    continue
                if limit_to_visible and (not self._is_in_viewport(ctx, el)):
                    continue
                stars_filtered.append(el)
            except Exception:
                continue

        seen_assets: Set[str] = set()
        for star_el in stars_filtered:
            data["processed"]["counts"]["rows_seen"] += 1
            data["processed"]["counts"]["visible_checked"] += 1
            self._handle_star_on_row(ctx, star_el, min_pct, unstar_below, dry_run, data, seen_assets, filter_mode=filter_mode)

    def _process_entire_list(
        self,
        ctx: Ctx,
        min_pct: int,
        unstar_below: bool,
        dry_run: bool,
        data: Dict[str, Any],
        filter_mode: Optional[str] = None,
    ):
        driver = ctx.driver
        star_sel = "i.alist__icon.fa.fa-star-o.add, i.alist__icon.fa.fa-star.del"
        container = self._get_scroll_container(ctx)

        # Reset to top
        try:
            if container:
                driver.execute_script("arguments[0].scrollTop = 0;", container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.15)
        except Exception:
            pass

        seen_assets: Set[str] = set()
        last_scroll_top: Optional[int] = None
        stagnation_steps = 0
        max_stagnation = 4  # terminate when no more progress

        for _ in range(500):  # safety cap
            try:
                stars = driver.find_elements(By.CSS_SELECTOR, star_sel)
            except Exception:
                stars = []

            for star_el in stars:
                try:
                    if not star_el.is_displayed():
                        continue
                except Exception:
                    continue
                data["processed"]["counts"]["rows_seen"] += 1
                self._handle_star_on_row(ctx, star_el, min_pct, unstar_below, dry_run, data, seen_assets, filter_mode=filter_mode)

            progressed = self._scroll_step(ctx, container)
            if not progressed:
                stagnation_steps += 1
            else:
                stagnation_steps = 0

            # Measure scrollTop to detect end
            this_top = None
            if container:
                try:
                    this_top = driver.execute_script("return arguments[0].scrollTop;", container)
                except Exception:
                    this_top = None
            else:
                try:
                    this_top = driver.execute_script(
                        "return window.pageYOffset || document.documentElement.scrollTop || 0;"
                    )
                except Exception:
                    this_top = None

            if this_top is not None and last_scroll_top is not None and int(this_top) <= int(last_scroll_top):
                stagnation_steps += 1
            last_scroll_top = this_top

            if stagnation_steps >= max_stagnation:
                break

    def _handle_star_on_row(
        self,
        ctx: Ctx,
        star_el: Any,
        min_pct: int,
        unstar_below: bool,
        dry_run: bool,
        data: Dict[str, Any],
        seen_assets: Set[str],
        filter_mode: Optional[str] = None,
    ):
        try:
            row_el = self._row_for_star(ctx, star_el)
            asset_label = self._extract_asset_label(ctx, row_el) or "(unknown)"
            if asset_label in seen_assets:
                return
            seen_assets.add(asset_label)

            if filter_mode:
                is_otc = asset_label.endswith("_otc")
                if (filter_mode == "otc" and not is_otc) or (filter_mode == "fx" and is_otc):
                    data["processed"]["counts"]["skipped"] += 1
                    data["processed"]["counts"]["filtered_out"] += 1
                    data["processed"]["skipped_filtered"].append(asset_label)
                    return

            payout_pct = self._extract_payout_pct(ctx, row_el)
            class_attr = (star_el.get_attribute("class") or "").lower()
            is_selected = ("fa-star del" in class_attr) or ("del" in class_attr and "fa-star" in class_attr)

            if payout_pct is not None and payout_pct >= min_pct:
                data["processed"]["counts"]["eligible"] += 1
                if is_selected:
                    data["processed"]["already_favorited"].append(asset_label)
                    data["processed"]["counts"]["already_favorited"] += 1
                else:
                    if dry_run:
                        data["processed"]["selected_now"].append(asset_label)
                        data["processed"]["counts"]["star_clicked"] += 1
                    else:
                        if self._safe_click(ctx, star_el):
                            time.sleep(0.03)
                            data["processed"]["selected_now"].append(asset_label)
                            data["processed"]["counts"]["star_clicked"] += 1
                        else:
                            data["processed"]["errors"].append({"asset": asset_label, "reason": "star_click_failed"})
            else:
                data["processed"]["counts"]["skipped"] += 1
                data["processed"]["skipped_non_eligible"].append(asset_label)
                if unstar_below:
                    if is_selected:
                        if dry_run:
                            data["processed"]["deselected_now"].append(asset_label)
                            data["processed"]["counts"]["unstar_clicked"] += 1
                        else:
                            if self._safe_click(ctx, star_el):
                                time.sleep(0.03)
                                data["processed"]["deselected_now"].append(asset_label)
                                data["processed"]["counts"]["unstar_clicked"] += 1
                            else:
                                data["processed"]["errors"].append({"asset": asset_label, "reason": "unstar_click_failed"})
                    else:
                        data["processed"]["already_unfavorited"].append(asset_label)
                        data["processed"]["counts"]["already_unfavorited"] += 1
        except Exception as e:
            data["processed"]["errors"].append({"reason": f"row_processing_error: {e}"})

    # ================= Dropdown / scrolling helpers =================

    # ---- Helpers used by dropdown open/close and row handling ----

    def _scroll_into_view(self, ctx: Ctx, el: Any) -> None:
        try:
            ctx.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        except Exception:
            pass

    def _safe_click(self, ctx: Ctx, el: Any) -> bool:
        try:
            el.click()
            return True
        except Exception:
            try:
                ctx.driver.execute_script("arguments[0].click();", el)
                return True
            except Exception:
                return False

    def _is_assets_panel_open(self, ctx: Ctx) -> bool:
        """
        Consider the Assets dropdown open if at least one star icon (selected or not)
        is rendered and visible within the viewport.
        """
        try:
            return bool(ctx.driver.execute_script("""
                const inView = (el) => {
                  const r = el.getBoundingClientRect();
                  const vw = (window.innerWidth||document.documentElement.clientWidth);
                  const vh = (window.innerHeight||document.documentElement.clientHeight);
                  return r.width > 0 && r.height > 0 && r.left < vw && r.right > 0 && r.top < vh && r.bottom > 0;
                };
                const nodes = Array.from(document.querySelectorAll(
                  "i.alist__icon.fa.fa-star-o.add, i.alist__icon.fa.fa-star.del"
                ));
                for (const n of nodes) { if (inView(n)) return true; }
                return false;
            """))
        except Exception:
            return False

    def _open_assets_dropdown(self, ctx: Ctx) -> Tuple[Dict[str, Any], Optional[Any]]:
        meta: Dict[str, Any] = {
            "opened": False,
            "click_method": None,
            "selector_used": None,
            "selector_detail": None,
            "attempts": [],
            "button_el": None,
            "error": None,
        }
        drv = ctx.driver

        if self._is_assets_panel_open(ctx):
            meta["opened"] = True
            return meta, None

        strategies: List[Tuple[str, str]] = [
            ("css", "i.fa.fa-caret-down"),
            ("css", "i[class*='fa'][class*='caret'][class*='down']"),
            ("xpath", "//i[contains(@class,'fa') and contains(@class,'caret') and contains(@class,'down')]/ancestor::*[self::a or self::button][1]"),
            ("css", ".asset-selector, .asset__selector, .assets-select, .assets__select, .pair-selector, .asset-dropdown"),
            ("xpath", "//button[contains(normalize-space(.),'/')]"),
            ("xpath", "//a[contains(normalize-space(.),'/')]"),
        ]

        button_el = None
        selector_used = None
        selector_detail = None

        for strat, sel in strategies:
            try:
                if strat == "css":
                    el = drv.find_element(By.CSS_SELECTOR, sel)
                else:
                    el = drv.find_element(By.XPATH, sel)
                if el and el.is_displayed():
                    if el.tag_name.lower() == "i":
                        try:
                            anc = drv.find_element(
                                By.XPATH,
                                "//i[contains(@class,'fa') and contains(@class,'caret') and contains(@class,'down')]/ancestor::*[self::a or self::button][1]",
                            )
                            if anc and anc.is_displayed():
                                el = anc
                        except Exception:
                            pass
                    button_el = el
                    selector_used = strat
                    selector_detail = sel
                    break
            except Exception:
                continue

        meta["selector_used"] = selector_used
        meta["selector_detail"] = selector_detail
        meta["button_el"] = button_el

        if not button_el:
            meta["error"] = "Assets dropdown toggle not found"
            return meta, None

        try:
            self._scroll_into_view(ctx, button_el)
            try:
                button_el.click()
                meta["click_method"] = "native"
            except Exception:
                drv.execute_script("arguments[0].click();", button_el)
                meta["click_method"] = "js"
            time.sleep(0.2)
        except Exception as e:
            meta["error"] = f"toggle_click_error: {e}"

        if self._is_assets_panel_open(ctx):
            meta["opened"] = True
        else:
            try:
                try:
                    button_el.click()
                    meta["click_method"] = meta["click_method"] or "native"
                except Exception:
                    drv.execute_script("arguments[0].click();", button_el)
                    meta["click_method"] = meta["click_method"] or "js"
                time.sleep(0.2)
            except Exception:
                pass
            meta["opened"] = bool(self._is_assets_panel_open(ctx))
            if not meta["opened"] and not meta.get("error"):
                meta["error"] = "panel_not_detected"

        return meta, button_el

    def _open_assets_dropdown_force(self, ctx: Ctx) -> Dict[str, Any]:
        drv = ctx.driver
        sels: List[Tuple[str, str]] = [
            ("i.fa.fa-caret-down", "css"),
            ("i[class*='fa'][class*='caret']", "css"),
            ("//i[contains(@class,'fa') and contains(@class,'caret')]/ancestor::*[self::a or self::button][1]", "xpath"),
            ("//button[contains(normalize-space(.),'/')]", "xpath"),
            ("//a[contains(normalize-space(.),'/')]", "xpath"),
        ]
        for sel, kind in sels:
            try:
                el = drv.find_element(By.CSS_SELECTOR, sel) if kind == "css" else drv.find_element(By.XPATH, sel)
                if el and el.is_displayed():
                    try:
                        self._scroll_into_view(ctx, el)
                        el.click()
                    except Exception:
                        drv.execute_script("arguments[0].click();", el)
                    time.sleep(0.25)
                    if self._is_assets_panel_open(ctx):
                        return {"opened": True}
            except Exception:
                continue
        return {"opened": bool(self._is_assets_panel_open(ctx))}

    def _close_assets_dropdown(self, ctx: Ctx, button_el: Optional[Any]) -> Dict[str, Any]:
        drv = ctx.driver
        meta: Dict[str, Any] = {"closed": False, "attempts": []}

        def record(strategy: str, ok: bool, err: Optional[str] = None):
            rec = {"strategy": strategy, "ok": bool(ok)}
            if err:
                rec["error"] = err
            meta["attempts"].append(rec)

        if not self._is_assets_panel_open(ctx):
            meta["closed"] = True
            return meta

        if button_el:
            try:
                self._scroll_into_view(ctx, button_el)
                try:
                    button_el.click()
                except Exception:
                    drv.execute_script("arguments[0].click();", button_el)
                time.sleep(0.15)
                ok = not self._is_assets_panel_open(ctx)
                record("toggle_click", ok)
                if ok:
                    meta["closed"] = True
                    return meta
            except Exception as e:
                record("toggle_click", False, str(e))

        try:
            drv.execute_script("""
                const cx = Math.floor((window.innerWidth||document.documentElement.clientWidth)/2);
                const cy = Math.floor((window.innerHeight||document.documentElement.clientHeight)/2);
                const el = document.elementFromPoint(cx, cy);
                if (el) { el.click(); return true; }
                return false;
            """)
            time.sleep(0.1)
            ok = not self._is_assets_panel_open(ctx)
            record("blind_center_click", ok)
            if ok:
                meta["closed"] = True
                return meta
        except Exception as e:
            record("blind_center_click", False, str(e))

        try:
            body = drv.find_element(By.TAG_NAME, "body")
            if Keys is not None:
                body.send_keys(Keys.ESCAPE)
                time.sleep(0.1)
            ok = not self._is_assets_panel_open(ctx)
            record("escape_key", ok)
            if ok:
                meta["closed"] = True
                return meta
        except Exception as e:
            record("escape_key", False, str(e))

        meta["closed"] = not self._is_assets_panel_open(ctx)
        return meta

    def _get_scroll_container(self, ctx: Ctx) -> Optional[Any]:
        drv = ctx.driver
        candidates: List[Any] = []
        sels = [
            "[role='listbox']",
            ".dropdown.open, .dropdown.show, .menu.open, .menu.show",
            ".assets, .alist, .assets-list, .assets__list, .menu__list",
            ".scroll, .scrollable, .custom-scrollbar, .ps, .simplebar-content-wrapper",
        ]
        for sel in sels:
            try:
                candidates.extend(drv.find_elements(By.CSS_SELECTOR, sel))
            except Exception:
                continue

        for el in candidates:
            try:
                if not el.is_displayed():
                    continue
                dims = drv.execute_script(
                    "return {sh:arguments[0].scrollHeight, ch:arguments[0].clientHeight, oh:arguments[0].offsetHeight};",
                    el
                )
                sh = int(dims.get("sh", 0) or 0)
                ch = int(dims.get("ch", 0) or 0)
                oh = int(dims.get("oh", 0) or 0)
                if sh > max(ch, oh) + 5:
                    return el
            except Exception:
                continue
        return None

    def _scroll_step(self, ctx: Ctx, container: Optional[Any]) -> bool:
        drv = ctx.driver
        try:
            if container:
                before = drv.execute_script("return arguments[0].scrollTop;", container)
                drv.execute_script(
                    "arguments[0].scrollTop = arguments[0].scrollTop + Math.floor(arguments[0].clientHeight*0.85);",
                    container
                )
                time.sleep(0.15)
                after = drv.execute_script("return arguments[0].scrollTop;", container)
                return (after is not None) and (before is not None) and (int(after) > int(before))
            else:
                before = drv.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                drv.execute_script("window.scrollBy(0, Math.floor((window.innerHeight||document.documentElement.clientHeight)*0.85));")
                time.sleep(0.15)
                after = drv.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                return (after is not None) and (before is not None) and (int(after) > int(before))
        except Exception:
            return False

    def _is_in_viewport(self, ctx: Ctx, el: Any) -> bool:
        try:
            r = ctx.driver.execute_script(
                "var b=arguments[0].getBoundingClientRect();"
                "var w=(window.innerWidth||document.documentElement.clientWidth);"
                "var h=(window.innerHeight||document.documentElement.clientHeight);"
                "return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,w:w,h:h};",
                el
            )
            if not r:
                return True
            horiz = (r["right"] > 0) and (r["left"] < r["w"])
            vert = (r["bottom"] > 0) and (r["top"] < r["h"])
            return bool(horiz and vert)
        except Exception:
            return True

    def _row_for_star(self, ctx: Ctx, star_el: Any) -> Any:
        # Try ancestor patterns
        xpats = [
            ".//ancestor::*[self::li or self::div][contains(@class,'assets') or contains(@class,'list') or contains(@class,'item')][1]",
            ".//ancestor::*[self::li or self::div][1]",
        ]
        for xp in xpats:
            try:
                row = star_el.find_element(By.XPATH, xp)
                if row and row.is_displayed():
                    return row
            except Exception:
                continue
        return star_el

    def _extract_asset_label(self, ctx: Ctx, row_el: Any) -> Optional[str]:
        try:
            cands = row_el.find_elements(
                By.XPATH,
                ".//*[contains(@class,'label') or contains(@class,'asset') or contains(@class,'name')]"
            )
            for el in cands:
                try:
                    txt = (el.text or "").strip()
                    if txt and ("/" in txt or " " in txt) and len(txt) >= 3:
                        return txt
                except Exception:
                    continue
            txt = (row_el.text or "").strip()
            if txt:
                m = re.split(r"\s+\+\d+%?", txt)
                base = (m[0] if m else txt).strip()
                if base:
                    return base
        except Exception:
            pass
        return None

    def _extract_payout_pct(self, ctx: Ctx, row_el: Any) -> Optional[int]:
        try:
            nodes = row_el.find_elements(By.XPATH, ".//*[contains(normalize-space(.),'%') or contains(normalize-space(.),'+')]")
        except Exception:
            nodes = []
        best: Optional[int] = None
        for n in nodes:
            try:
                t = (n.text or "").strip()
                if not t:
                    continue
                m = re.search(r"(\d{1,3})\s*%?", t.replace("+", ""))
                if m:
                    val = int(m.group(1))
                    if best is None or val > best:
                        best = val
            except Exception:
                continue
        return best

    def _open_assets_dropdown(self, ctx: Ctx) -> Tuple[Dict[str, Any], Optional[Any]]:
        meta: Dict[str, Any] = {
            "opened": False,
            "click_method": None,
            "selector_used": None,
            "selector_detail": None,
            "attempts": [],
            "button_el": None,
            "error": None,
        }
        drv = ctx.driver

        if self._is_assets_panel_open(ctx):
            meta["opened"] = True
            return meta, None

        strategies: List[Tuple[str, str]] = [
            ("css", "i.fa.fa-caret-down"),
            ("css", "i[class*='fa'][class*='caret'][class*='down']"),
            ("xpath", "//i[contains(@class,'fa') and contains(@class,'caret') and contains(@class,'down')]/ancestor::*[self::a or self::button][1]"),
            ("css", ".asset-selector, .asset__selector, .assets-select, .assets__select, .pair-selector, .asset-dropdown"),
            ("xpath", "//button[contains(normalize-space(.),'/')]"),
            ("xpath", "//a[contains(normalize-space(.),'/')]"),
        ]

        button_el = None
        selector_used = None
        selector_detail = None

        for strat, sel in strategies:
            try:
                if strat == "css":
                    el = drv.find_element(By.CSS_SELECTOR, sel)
                else:
                    el = drv.find_element(By.XPATH, sel)
                if el and el.is_displayed():
                    if el.tag_name.lower() == "i":
                        try:
                            anc = drv.find_element(
                                By.XPATH,
                                "//i[contains(@class,'fa') and contains(@class,'caret') and contains(@class,'down')]/ancestor::*[self::a or self::button][1]",
                            )
                            if anc and anc.is_displayed():
                                el = anc
                        except Exception:
                            pass
                    button_el = el
                    selector_used = strat
                    selector_detail = sel
                    break
            except Exception:
                continue

        meta["selector_used"] = selector_used
        meta["selector_detail"] = selector_detail
        meta["button_el"] = button_el

        if not button_el:
            meta["error"] = "Assets dropdown toggle not found"
            return meta, None

        try:
            self._scroll_into_view(ctx, button_el)
            try:
                button_el.click()
                meta["click_method"] = "native"
            except Exception:
                drv.execute_script("arguments[0].click();", button_el)
                meta["click_method"] = "js"
            time.sleep(0.2)
        except Exception as e:
            meta["error"] = f"toggle_click_error: {e}"

        if self._is_assets_panel_open(ctx):
            meta["opened"] = True
        else:
            try:
                try:
                    button_el.click()
                    meta["click_method"] = meta["click_method"] or "native"
                except Exception:
                    drv.execute_script("arguments[0].click();", button_el)
                    meta["click_method"] = meta["click_method"] or "js"
                time.sleep(0.2)
            except Exception:
                pass
            meta["opened"] = bool(self._is_assets_panel_open(ctx))
            if not meta["opened"] and not meta.get("error"):
                meta["error"] = "panel_not_detected"

        return meta, button_el

    def _open_assets_dropdown_force(self, ctx: Ctx) -> Dict[str, Any]:
        drv = ctx.driver
        sels: List[Tuple[str, str]] = [
            ("i.fa.fa-caret-down", "css"),
            ("i[class*='fa'][class*='caret']", "css"),
            ("//i[contains(@class,'fa') and contains(@class,'caret')]/ancestor::*[self::a or self::button][1]", "xpath"),
            ("//button[contains(normalize-space(.),'/')]", "xpath"),
            ("//a[contains(normalize-space(.),'/')]", "xpath"),
        ]
        for sel, kind in sels:
            try:
                el = drv.find_element(By.CSS_SELECTOR, sel) if kind == "css" else drv.find_element(By.XPATH, sel)
                if el and el.is_displayed():
                    try:
                        self._scroll_into_view(ctx, el)
                        el.click()
                    except Exception:
                        drv.execute_script("arguments[0].click();", el)
                    time.sleep(0.25)
                    if self._is_assets_panel_open(ctx):
                        return {"opened": True}
            except Exception:
                continue
        return {"opened": bool(self._is_assets_panel_open(ctx))}

    def _close_assets_dropdown(self, ctx: Ctx, button_el: Optional[Any]) -> Dict[str, Any]:
        drv = ctx.driver
        meta: Dict[str, Any] = {"closed": False, "attempts": []}

        def record(strategy: str, ok: bool, err: Optional[str] = None):
            rec = {"strategy": strategy, "ok": bool(ok)}
            if err:
                rec["error"] = err
            meta["attempts"].append(rec)

        if not self._is_assets_panel_open(ctx):
            meta["closed"] = True
            return meta

        if button_el:
            try:
                self._scroll_into_view(ctx, button_el)
                try:
                    button_el.click()
                except Exception:
                    drv.execute_script("arguments[0].click();", button_el)
                time.sleep(0.15)
                ok = not self._is_assets_panel_open(ctx)
                record("toggle_click", ok)
                if ok:
                    meta["closed"] = True
                    return meta
            except Exception as e:
                record("toggle_click", False, str(e))

        try:
            drv.execute_script("""
                const cx = Math.floor((window.innerWidth||document.documentElement.clientWidth)/2);
                const cy = Math.floor((window.innerHeight||document.documentElement.clientHeight)/2);
                const el = document.elementFromPoint(cx, cy);
                if (el) { el.click(); return true; }
                return false;
            """)
            time.sleep(0.1)
            ok = not self._is_assets_panel_open(ctx)
            record("blind_center_click", ok)
            if ok:
                meta["closed"] = True
                return meta
        except Exception as e:
            record("blind_center_click", False, str(e))

        try:
            body = drv.find_element(By.TAG_NAME, "body")
            if Keys is not None:
                body.send_keys(Keys.ESCAPE)
                time.sleep(0.1)
            ok = not self._is_assets_panel_open(ctx)
            record("escape_key", ok)
            if ok:
                meta["closed"] = True
                return meta
        except Exception as e:
            record("escape_key", False, str(e))

        meta["closed"] = not self._is_assets_panel_open(ctx)
        return meta

    def _get_scroll_container(self, ctx: Ctx) -> Optional[Any]:
        drv = ctx.driver
        candidates: List[Any] = []
        sels = [
            "[role='listbox']",
            ".dropdown.open, .dropdown.show, .menu.open, .menu.show",
            ".assets, .alist, .assets-list, .assets__list, .menu__list",
            ".scroll, .scrollable, .custom-scrollbar, .ps, .simplebar-content-wrapper",
        ]
        for sel in sels:
            try:
                candidates.extend(drv.find_elements(By.CSS_SELECTOR, sel))
            except Exception:
                continue

        for el in candidates:
            try:
                if not el.is_displayed():
                    continue
                dims = drv.execute_script(
                    "return {sh:arguments[0].scrollHeight, ch:arguments[0].clientHeight, oh:arguments[0].offsetHeight};",
                    el
                )
                sh = int(dims.get("sh", 0) or 0)
                ch = int(dims.get("ch", 0) or 0)
                oh = int(dims.get("oh", 0) or 0)
                if sh > max(ch, oh) + 5:
                    return el
            except Exception:
                continue
        return None

    def _scroll_step(self, ctx: Ctx, container: Optional[Any]) -> bool:
        drv = ctx.driver
        try:
            if container:
                before = drv.execute_script("return arguments[0].scrollTop;", container)
                drv.execute_script(
                    "arguments[0].scrollTop = arguments[0].scrollTop + Math.floor(arguments[0].clientHeight*0.85);",
                    container
                )
                time.sleep(0.15)
                after = drv.execute_script("return arguments[0].scrollTop;", container)
                return (after is not None) and (before is not None) and (int(after) > int(before))
            else:
                before = drv.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                drv.execute_script("window.scrollBy(0, Math.floor((window.innerHeight||document.documentElement.clientHeight)*0.85));")
                time.sleep(0.15)
                after = drv.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                return (after is not None) and (before is not None) and (int(after) > int(before))
        except Exception:
            return False

    def _is_in_viewport(self, ctx: Ctx, el: Any) -> bool:
        try:
            r = ctx.driver.execute_script(
                "var b=arguments[0].getBoundingClientRect();"
                "var w=(window.innerWidth||document.documentElement.clientWidth);"
                "var h=(window.innerHeight||document.documentElement.clientHeight);"
                "return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,w:w,h:h};",
                el
            )
            if not r:
                return True
            horiz = (r["right"] > 0) and (r["left"] < r["w"])
            vert = (r["bottom"] > 0) and (r["top"] < r["h"])
            return bool(horiz and vert)
        except Exception:
            return True

    def _row_for_star(self, ctx: Ctx, star_el: Any) -> Any:
        xpats = [
            ".//ancestor::*[self::li or self::div][contains(@class,'assets') or contains(@class,'list') or contains(@class,'item')][1]",
            ".//ancestor::*[self::li or self::div][1]",
        ]
        for xp in xpats:
            try:
                row = star_el.find_element(By.XPATH, xp)
                if row and row.is_displayed():
                    return row
            except Exception:
                continue
        return star_el

    def _extract_asset_label(self, ctx: Ctx, row_el: Any) -> Optional[str]:
        try:
            cands = row_el.find_elements(
                By.XPATH,
                ".//*[contains(@class,'label') or contains(@class,'asset') or contains(@class,'name')]"
            )
            for el in cands:
                try:
                    txt = (el.text or "").strip()
                    if txt and ("/" in txt or " " in txt) and len(txt) >= 3:
                        return txt
                except Exception:
                    continue
            txt = (row_el.text or "").strip()
            if txt:
                m = re.split(r"\s+\+\d+%?", txt)
                base = (m[0] if m else txt).strip()
                if base:
                    return base
        except Exception:
            pass
        return None

    def _extract_payout_pct(self, ctx: Ctx, row_el: Any) -> Optional[int]:
        try:
            nodes = row_el.find_elements(By.XPATH, ".//*[contains(normalize-space(.),'%') or contains(normalize-space(.),'+')]")
        except Exception:
            nodes = []
        best: Optional[int] = None
        for n in nodes:
            try:
                t = (n.text or "").strip()
                if not t:
                    continue
                m = re.search(r"(\d{1,3})\s*%?", t.replace("+", ""))
                if m:
                    val = int(m.group(1))
                    if best is None or val > best:
                        best = val
            except Exception:
                continue
        return best

# Factory for orchestrator
def build() -> Capability:
    return FavoriteStarSelect()


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

    parser = argparse.ArgumentParser(description="Select all >=min_pct favorites from Assets dropdown; optionally unstar below threshold.")
    parser.add_argument("--min-pct", type=int, default=92, help="Minimum payout percentage (default: 92)")
    parser.add_argument("--sweep-all", action="store_true", help="Scroll and process entire list")
    parser.add_argument("--no-sweep", dest="sweep_all", action="store_false", help="Only process visible items")
    parser.add_argument("--unstar-below", action="store_true", help="Unstar assets below threshold (default True if --sweep-all)")
    parser.add_argument("--no-unstar", dest="unstar_below", action="store_false", help="Do not unstar below-threshold assets")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--star-otc", action="store_true", help="Only process OTC assets (ending in '_otc')")
    group.add_argument("--star-fx", action="store_true", help="Only process standard forex assets (no '_otc' suffix)")
    parser.set_defaults(sweep_all=True, unstar_below=True)
    parser.add_argument("--dry-run", action="store_true", help="Do not click; only report")
    parser.add_argument("--no-close", action="store_true", help="Do not close dropdown after processing")
    args = parser.parse_args()

    cap = FavoriteStarSelect()
    filter_mode = "otc" if args.star_otc else "fx" if args.star_fx else None
    inputs = {
        "min_pct": int(args.min_pct),
        "sweep_all": bool(args.sweep_all),
        "unstar_below": bool(args.unstar_below),
        "limit_to_visible": True,
        "dry_run": bool(args.dry_run),
        "close_after": (not bool(args.no_close)),
        "filter_mode": filter_mode,
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
