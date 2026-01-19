from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, List, Tuple, Set
import re
import time

# Add project root to sys.path for internal imports
this_file = Path(__file__).resolve()
project_root = this_file.parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.utils.asset_utils import normalize_asset

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
    from capabilities_v2.base import (  # type: ignore
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

logger = logging.getLogger(__name__)

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
        dry_run: bool = False
        close_after: bool = bool(inputs.get("close_after", True))
        filter_mode: Optional[str] = inputs.get("filter_mode", None)
        max_assets: Optional[int] = inputs.get("max_assets", 5)
        target_assets: Optional[List[str]] = inputs.get("target_assets", None)
        target_assets_mode: str = inputs.get("target_assets_mode", "ignore")

        if isinstance(max_assets, int) and max_assets <= 0:
            max_assets = None

        if isinstance(target_assets, list) and not target_assets:
            target_assets = None

        # Log the filter configuration for debugging
        logger.info(f"FavoriteStarSelect inputs: min_pct={min_pct}, max_assets={max_assets}, "
                    f"target_assets={target_assets}, target_assets_mode={target_assets_mode}, "
                    f"filter_mode={filter_mode}")

        data: Dict[str, Any] = {
            "min_pct": min_pct,
            "sweep_all": sweep_all,
            "unstar_below": unstar_below,
            "limit_to_visible": limit_to_visible,
            "dry_run": dry_run,
            "filter_mode": filter_mode,
            "max_assets": max_assets,  # NEW
            "target_assets": target_assets,  # NEW
            "target_assets_mode": target_assets_mode,
            "attempts": {},
            "processed": {
                "selected_now": [],
                "deselected_now": [],
                "already_favorited": [],
                "already_unfavorited": [],
                "skipped_non_eligible": [],
                "skipped_filtered": [],
                "skipped_max_limit": [],  # NEW: Track assets skipped due to max limit
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
                    "skipped_max_limit": 0,  # NEW
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
        items = []
        if sweep_all:
            items = self._collect_entire_list(ctx, data)
        else:
            items = self._collect_visible_only(ctx, data)

        logger.info(f"Collected {len(items)} assets for processing.")
        data["processed"]["counts"]["total_collected"] = len(items)

        # Apply selection logic
        to_star, to_unstar, selection = self._apply_selection_rules(
            items,
            min_pct,
            unstar_below,
            max_assets,
            target_assets,
            target_assets_mode,
            filter_mode
        )

        # Track already favorited items that are part of the selection
        already_favorited = [i for i in selection if i["is_selected"]]
        for item in already_favorited:
            label = item["label"]
            data["processed"]["already_favorited"].append(label)
            data["processed"]["counts"]["already_favorited"] += 1
            logger.info(f"Asset already starred (keeping): {label}")

        # Execute actions
        self._execute_actions(ctx, to_star, to_unstar, dry_run, data)

        # If we clicked any stars, wait a bit for the platform to register the changes
        # before potentially closing the dropdown or finishing.
        if data["processed"]["counts"]["star_clicked"] > 0 or data["processed"]["counts"]["unstar_clicked"] > 0:
            logger.info("Actions executed, waiting 0.5s for platform synchronization...")
            time.sleep(0.5)

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

    # ================= Collection and Selection =================

    def _collect_visible_only(self, ctx: Ctx, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        snapshot = self._get_assets_snapshot(ctx)
        seen_assets: Set[str] = set()
        collected = []
        
        for item in snapshot:
            if not item["visible"]:
                continue
            
            asset_label = item["label"] or "(unknown)"
            if asset_label in seen_assets:
                continue
            seen_assets.add(asset_label)
            
            data["processed"]["counts"]["rows_seen"] += 1
            data["processed"]["counts"]["visible_checked"] += 1
            collected.append(item)
            
        return collected

    def _collect_entire_list(self, ctx: Ctx, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        driver = ctx.driver
        container = self._get_scroll_container(ctx)

        # Reset to top
        try:
            if container:
                driver.execute_script("arguments[0].scrollTop = 0;", container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.05)
        except Exception:
            pass

        seen_assets: Set[str] = set()
        collected = []
        last_scroll_top: Optional[int] = None
        stagnation_steps = 0
        max_stagnation = 3

        for _ in range(200):  # safety cap
            snapshot = self._get_assets_snapshot(ctx)
            
            new_items_this_step = 0
            for item in snapshot:
                if not item["visible"]:
                    continue
                
                asset_label = item["label"] or "(unknown)"
                if asset_label in seen_assets:
                    continue
                
                seen_assets.add(asset_label)
                new_items_this_step += 1
                data["processed"]["counts"]["rows_seen"] += 1
                collected.append(item)

            progressed = self._scroll_step(ctx, container)
            
            this_top = None
            if container:
                try:
                    this_top = driver.execute_script("return arguments[0].scrollTop;", container)
                except Exception: pass
            else:
                try:
                    this_top = driver.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                except Exception: pass

            if this_top is not None and last_scroll_top is not None and int(this_top) <= int(last_scroll_top):
                stagnation_steps += 1
            elif not progressed and new_items_this_step == 0:
                stagnation_steps += 1
            else:
                stagnation_steps = 0
                
            last_scroll_top = this_top
            if stagnation_steps >= max_stagnation:
                break
                
        # Scroll back to top before finishing collection to ensure DOM is ready for clicks
        try:
            if container:
                driver.execute_script("arguments[0].scrollTop = 0;", container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.2)
        except Exception:
            pass

        return collected

    def _apply_selection_rules(
        self,
        items: List[Dict[str, Any]],
        min_pct: int,
        unstar_below: bool,
        max_assets: Optional[int],
        target_assets: Optional[List[str]],
        target_assets_mode: str,
        filter_mode: Optional[str]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Decides which assets to star and unstar based on the refined logic.
        Returns (to_star, to_unstar, selection)
        """
        eligible = []
        
        normalized_targets = [normalize_asset(a) for a in (target_assets or [])]
        
        for item in items:
            asset_label = item["label"] or "(unknown)"
            norm_label = normalize_asset(asset_label)
            
            # 1. Basic Eligibility (Payout)
            payout = item["payout"] or 0
            is_payout_ok = payout >= min_pct
            
            # 2. Filter Mode (OTC/FX)
            is_otc = norm_label.endswith("OTC")
            is_filter_ok = True
            if filter_mode == "otc" and not is_otc:
                is_filter_ok = False
            elif filter_mode == "fx" and is_otc:
                is_filter_ok = False
            
            # 3. Target Assets Mode (Ignore/Include)
            is_in_target = False
            is_target_ok = True
            if target_assets:
                is_in_target = norm_label in normalized_targets
                
                if target_assets_mode == "ignore" and is_in_target:
                    is_target_ok = False

                if is_in_target:
                    logger.info(f"EXACT MATCH: '{norm_label}' found in targets")
            
            # Categorize
            # RULE: If it's a target asset in 'include' mode, it BYPASSES the payout requirement.
            force_eligible = (target_assets_mode == "include" and is_in_target)

            if (is_payout_ok or force_eligible) and is_filter_ok and is_target_ok:
                item["is_target"] = is_in_target
                eligible.append(item)
                if is_in_target:
                    msg = f"Asset '{asset_label}' is a TARGET and is ELIGIBLE."
                    if not is_payout_ok:
                        msg += f" (Bypassing payout threshold: {payout}% < {min_pct}%)"
                    logger.info(msg)
            elif is_in_target:
                logger.info(f"Asset '{asset_label}' is a target but was REJECTED: payout_ok={is_payout_ok}, filter_ok={is_filter_ok}, target_ok={is_target_ok} (payout={payout}%)")
            
        # Apply Selection Priority
        to_star = []
        selection = []
        
        # Prioritize: Targets first, then others
        targets = [i for i in eligible if i["is_target"]]
        others = [i for i in eligible if not i["is_target"]]

        if target_assets and target_assets_mode == "include":
            # Mode 'include' prioritizes targets
            if max_assets is None:
                selection = targets + others
            else:
                selection = targets[:max_assets]
                if len(selection) < max_assets:
                    selection += others[:max_assets - len(selection)]
        else:
            # Normal or IGNORE mode (targets already filtered out of 'eligible')
            if max_assets is None:
                selection = eligible
            else:
                selection = eligible[:max_assets]
        
        logger.info(f"Selection finished. Mode: {target_assets_mode}, Max: {max_assets}, Eligible: {len(eligible)}, Targets: {len(targets)}, Selection: {[i['label'] for i in selection]}")
        
        to_star = [i for i in selection if not i["is_selected"]]
        
        # Determine items to UNSTAR
        to_unstar = []
        if unstar_below:
            # Currently starred items that are NOT in the new selection
            starred_currently = [i for i in items if i["is_selected"]]
            for s in starred_currently:
                if not any(normalize_asset(sel["label"]) == normalize_asset(s["label"]) for sel in selection):
                    to_unstar.append(s)

        logger.info(f"Final Plan: to_star={len(to_star)} ({[i['label'] for i in to_star]}), to_unstar={len(to_unstar)} ({[i['label'] for i in to_unstar]})")
        return to_star, to_unstar, selection

    def _execute_actions(
        self,
        ctx: Ctx,
        to_star: List[Dict[str, Any]],
        to_unstar: List[Dict[str, Any]],
        dry_run: bool,
        data: Dict[str, Any]
    ):
        """Clicks the stars for the decided selection."""
        for item in to_star:
            asset_label = item["label"]
            logger.info(f"Attempting to STAR: {asset_label}")
            if dry_run:
                data["processed"]["selected_now"].append(asset_label)
                data["processed"]["counts"]["star_clicked" ] += 1
            else:
                success = self._click_star_by_label(ctx, asset_label)
                if success:
                    data["processed"]["selected_now"].append(asset_label)
                    data["processed"]["counts"]["star_clicked"] += 1
                    logger.info(f"Successfully STARRED: {asset_label}")
                else:
                    data["processed"]["errors"].append({"asset": asset_label, "reason": "star_click_failed"})
                    logger.error(f"Failed to STAR: {asset_label}")
                time.sleep(0.1) # Breathe between clicks

        for item in to_unstar:
            asset_label = item["label"]
            logger.info(f"Attempting to UNSTAR: {asset_label}")
            if dry_run:
                data["processed"]["deselected_now"].append(asset_label)
                data["processed"]["counts"]["unstar_clicked"] += 1
            else:
                success = self._click_star_by_label(ctx, asset_label)
                if success:
                    data["processed"]["deselected_now"].append(asset_label)
                    data["processed"]["counts"]["unstar_clicked"] += 1
                    logger.info(f"Successfully UNSTARRED: {asset_label}")
                else:
                    data["processed"]["errors"].append({"asset": asset_label, "reason": "unstar_click_failed"})
                    logger.error(f"Failed to UNSTAR: {asset_label}")
                time.sleep(0.1) # Breathe between clicks

    def _get_assets_snapshot(self, ctx: Ctx) -> List[Dict[str, Any]]:
        """
        Extracts all asset rows currently in the DOM using a single JS call.
        This is MUCH faster than iterating via Selenium.
        """
        script = """
        const rows = Array.from(document.querySelectorAll(
          "li.alist__item, div.alist__item, [class*='alist__item'], .assets-table__row, .asset-item, .assets-list__item"
        ));
        return rows.map((row, idx) => {
            // Enhanced star detection: Platform often uses .add for unstarred and .del for starred
            const star = row.querySelector(
              "i.alist__icon.fa-star, i.alist__icon.fa-star-o, .fa-star, .fa-star-o, .add, .del, [class*='star'], .asset-star, button[class*='favorite'], [data-action='toggle-favorite']"
            );
            const labelEl = row.querySelector(".alist__label, .asset-name, .name, [class*='label']");
            const payoutEl = row.querySelector(".alist__payout, .payout, .percent, [class*='payout']");
            
            let payout = null;
            if (payoutEl) {
                const txt = payoutEl.innerText.replace(/[+%]/g, "").trim();
                const m = txt.match(/(\\d+)/);
                if (m) payout = parseInt(m[1]);
            }
            
            let is_selected = false;
            if (star) {
                const cls = star.className.toLowerCase();
                const classList = cls.split(/\\s+/);
                // "del" class is a strong indicator of "already starred" in this platform
                // "add" class is a strong indicator of "not starred"
                if (classList.includes("del")) is_selected = true;
                else if (classList.includes("add")) is_selected = false;
                else is_selected = classList.includes("fa-star") && !classList.includes("fa-star-o");
            }

            const rect = row.getBoundingClientRect();
            const visible = rect.height > 0 && rect.width > 0 && 
                          rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);

            let label = "";
            if (labelEl) {
                label = labelEl.innerText.trim();
            } else {
                // Fallback: take the first part of the row text, but try to exclude payout
                const rowText = row.innerText.split("\\n")[0].trim();
                // Remove trailing percentage if any (e.g. "AUDUSD 92%" -> "AUDUSD")
                label = rowText.replace(/\\s*\\d+\\s*%\\s*$/, "").trim();
            }

            return {
                id: idx,
                label: label,
                payout: payout,
                is_selected: is_selected,
                visible: visible
            };
        });
        """
        try:
            items = ctx.driver.execute_script(script)
            # We no longer return the element itself to avoid expensive serialization.
            # We use the index to find the element in JS when clicking.
            return items
        except Exception as e:
            logger.error(f"Snapshot extraction failed: {e}")
            return []


    def _click_star_by_label(self, ctx: Ctx, label: str) -> bool:
        """Clicks the star icon in the row that matches the label."""
        # We pass both original and normalized label for better matching
        norm_target = normalize_asset(label)
        
        # Enhanced debug script that returns detailed info
        script = """
        const targetLabel = arguments[0];
        const normTarget = arguments[1];
        
        const normalize = (txt) => {
            if (!txt) return "";
            return txt.toUpperCase().replace(/[^A-Z0-9]/g, "");
        };

        const rows = Array.from(document.querySelectorAll(
          "li.alist__item, div.alist__item, [class*='alist__item'], .assets-table__row, .asset-item, .assets-list__item"
        ));
        
        const debug = {
            rows_found: rows.length,
            labels_checked: [],
            match_found: false,
            match_type: null,
            matched_label: null,
            star_found: false,
            click_attempted: false,
            star_classes: null,
            error: null
        };

        let bestMatch = null;
        let bestMatchType = null;
        let bestMatchLabel = "";
        let bestMatchNorm = "";

        for (const row of rows) {
            const labelEl = row.querySelector(".alist__label, .asset-name, .name, [class*='label']");
            let rowLabel = "";
            if (labelEl) {
                rowLabel = labelEl.innerText.trim();
            } else {
                rowLabel = row.innerText.split("\\n")[0].trim().replace(/\\s*\\d+\\s*%\\s*$/, "");
            }

            const normRowLabel = normalize(rowLabel);
            debug.labels_checked.push({raw: rowLabel, norm: normRowLabel});

            if (rowLabel === targetLabel || normRowLabel === normTarget) {
                bestMatch = row;
                bestMatchType = 'exact';
                bestMatchLabel = rowLabel;
                bestMatchNorm = normRowLabel;
                break;
            }

            if (!bestMatch && normRowLabel.length > 3) {
                if (normRowLabel.includes(normTarget) || normTarget.includes(normRowLabel)) {
                    bestMatch = row;
                    bestMatchType = 'fuzzy';
                    bestMatchLabel = rowLabel;
                    bestMatchNorm = normRowLabel;
                }
            }
        }

        if (bestMatch) {
            debug.match_found = true;
            debug.match_type = bestMatchType;
            debug.matched_label = {raw: bestMatchLabel, norm: bestMatchNorm};
            bestMatch.scrollIntoView({block: 'center', behavior: 'instant'});

            const star = bestMatch.querySelector(
              "i.alist__icon.fa-star, i.alist__icon.fa-star-o, .add, .del, .fa-star, .fa-star-o, [class*='star'], .asset-star, button[class*='favorite'], [data-action='toggle-favorite']"
            );

            if (star) {
                debug.star_found = true;
                debug.star_classes = star.className;
                try {
                    star.click();
                    debug.click_attempted = true;
                } catch(e) {
                    debug.error = "star_click_error: " + e.message;
                }
                return debug;
            }

            debug.error = "no_star_element_in_row";
            try {
                bestMatch.click();
                debug.click_attempted = true;
            } catch(e) {
                debug.error = "row_click_error: " + e.message;
            }
            return debug;
        }

        return debug;
        """
        try:
            result = ctx.driver.execute_script(script, label, norm_target)
            
            # Log detailed debug info
            if isinstance(result, dict):
                logger.info(f"Click star debug for '{label}': rows_found={result.get('rows_found')}, "
                           f"match_found={result.get('match_found')}, star_found={result.get('star_found')}, "
                           f"match_type={result.get('match_type')}, click_attempted={result.get('click_attempted')}, "
                           f"star_classes={result.get('star_classes')}, "
                           f"error={result.get('error')}")
                if result.get('rows_found', 0) == 0:
                    logger.warning(f"NO ROWS FOUND - Assets dropdown may not be open!")
                elif not result.get('match_found'):
                    labels = result.get('labels_checked', [])[:5]  # Log first 5
                    logger.warning(f"NO MATCH for '{label}' (norm: {norm_target}). First labels in DOM: {labels}")
                
                success = result.get('click_attempted', False) and not result.get('error')
                if success:
                    time.sleep(0.2)  # Wait for UI to respond
                return success
            else:
                # Fallback for unexpected return type
                logger.warning(f"Unexpected result type from click script: {type(result)}")
                return bool(result)
        except Exception as e:
            logger.error(f"Click star by label '{label}' failed with exception: {e}")
            return False


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
                  "i.alist__icon.fa-star, i.alist__icon.fa-star-o, .alist__item .fa-star, .alist__item .fa-star-o"
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
                    time.sleep(0.15)
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

        # Try ESC key
        try:
            drv.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
            time.sleep(0.2)
            if not self._is_assets_panel_open(ctx):
                meta["closed"] = True
                record("esc_key", True)
                return meta
            record("esc_key", False)
        except Exception as e:
            record("esc_key", False, str(e))

        # Try clicking center
        try:
            drv.execute_script("""
                const cx = Math.floor((window.innerWidth||document.documentElement.clientWidth)/2);
                const cy = Math.floor((window.innerHeight||document.documentElement.clientHeight)/2);
                const el = document.elementFromPoint(cx, cy);
                if (el) { el.click(); return true; }
                return false;
            """)
            time.sleep(0.2)
            ok = not self._is_assets_panel_open(ctx)
            record("center_click", ok)
            if ok:
                meta["closed"] = True
                return meta
        except Exception as e:
            record("center_click", False, str(e))

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
                time.sleep(0.1)
                after = drv.execute_script("return arguments[0].scrollTop;", container)
                return (after is not None) and (before is not None) and (int(after) > int(before))
            else:
                before = drv.execute_script("return window.pageYOffset || document.documentElement.scrollTop || 0;")
                drv.execute_script("window.scrollBy(0, Math.floor((window.innerHeight||document.documentElement.clientHeight)*0.85));")
                time.sleep(0.1)
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
            logger.info(f"Attached to Chrome session: {getattr(driver, 'current_url', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to attach to Chrome session: {e}")
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
    # Ensure JSON-safe output (no WebElements) for CLI consumption
    out = {
        "ok": res.ok,
        "error": res.error,
        "data": res.data,
        "artifacts": list(res.artifacts) if getattr(res, "artifacts", None) else [],
    }
    # We keep this print because it's the primary JSON output for CLI callers
    print(_json.dumps(out, ensure_ascii=False, indent=2))
