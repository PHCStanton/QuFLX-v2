from __future__ import annotations

import time
import logging
import re
from typing import Any, Dict, List, Optional
from .base import Ctx, CapResult, Capability, take_screenshot_if, timestamp
from .favorites_bar import FavoritesBar

logger = logging.getLogger(__name__)

class FavoritesWalkSelect(Capability):
    """
    Orchestrator Capability: Favorites Walk & Select
    
    Composes FavoritesBar basic actions into a high-level "Walk" session:
    - Resets favorites bar to the far left.
    - Iteratively pages right until the end.
    - Scans visible assets and filters them by payout threshold or name.
    - Clicks eligible targets.
    """
    id = "favorites_walk_select"
    kind = "orchestrator"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        min_pct = inputs.get("min_pct", 92)
        assets_filter = inputs.get("assets", [])  # List of strings (contains match)
        select_all = inputs.get("all", False)
        click_delay_ms = inputs.get("click_delay_ms", 500)
        step_delay_ms = inputs.get("step_delay_ms", 150)
        save_screenshots = inputs.get("save_screenshots", False)
        shots_subdir = inputs.get("shots_subdir", "favorites_walk_select")

        summary = {
            "mode": "all" if select_all else "assets",
            "min_pct": min_pct,
            "patterns": assets_filter,
            "selected": [],
            "skipped": [],
            "pages_visited": 0,
            "steps": 0,
            "errors": [],
            "filter_stats": {
                "total_visible": 0,
                "below_min_pct": 0,
                "name_filtered_out": 0,
                "eligible": 0,
            },
            "pages": [],
        }
        artifacts = []

        # 1. Instantiate dependency capability
        fb = FavoritesBar()

        # 2. Reset favorites bar to far left
        logger.info("RESET: Resetting favorites bar to far left...")
        reset_res = fb.run(ctx, {"action": "reset_to_left"})
        if not reset_res.ok:
            summary["errors"].append(f"Reset failed: {reset_res.error}")
        artifacts.extend(reset_res.artifacts)

        selected_set = set()
        page_index = 0
        total_steps = 0
        INTERNAL_MAX_PAGES = 50
        logger.info(f"WALK: Starting walk (min_pct={min_pct}, filter={assets_filter})...")

        while page_index < INTERNAL_MAX_PAGES:
            js_visible = self._get_visible_favorites_js(ctx)
            if js_visible:
                visible_items = js_visible
            else:
                scan_res = fb.run(ctx, {"action": "get_visible_favorites"})
                if not scan_res.ok:
                    summary["errors"].append(f"Scan failed on page {page_index}: {scan_res.error}")
                    break
                artifacts.extend(scan_res.artifacts)
                visible_items = scan_res.data.get("visible", [])
            summary["filter_stats"]["total_visible"] += len(visible_items)

            targets = []
            page_visible = len(visible_items)
            page_eligible = 0
            selected_before_page = len(summary["selected"])

            for item in visible_items:
                asset_name = item.get("asset", "")
                payout_raw = item.get("payout", "0")
                payout_str = str(payout_raw)
                
                payout_val = 0
                try:
                    p_match = re.search(r'(\d+)', payout_str)
                    if p_match:
                        payout_val = int(p_match.group(1))
                except Exception:
                    payout_val = 0
                
                if payout_val < min_pct:
                    summary["filter_stats"]["below_min_pct"] += 1
                    continue
                
                if not select_all and assets_filter:
                    match = False
                    for pattern in assets_filter:
                        if pattern.lower() in asset_name.lower():
                            match = True
                            break
                    if not match:
                        summary["filter_stats"]["name_filtered_out"] += 1
                        continue
                
                summary["filter_stats"]["eligible"] += 1
                page_eligible += 1
                targets.append(asset_name)

            for label in targets:
                if label in selected_set:
                    continue
                
                logger.info(f"TARGET: {label} (page {page_index})")
                click_res = fb.run(ctx, {"action": "click_favorite", "label": label})
                
                if click_res.ok:
                    selected_set.add(label)
                    summary["selected"].append(label)
                    time.sleep(click_delay_ms / 1000.0)
                else:
                    summary["skipped"].append(label)
                    summary["errors"].append(f"Failed to click {label}: {click_res.error}")

            if save_screenshots:
                shot = take_screenshot_if(ctx, f"screenshots/{shots_subdir}/page_{page_index:03d}_{timestamp()}.png")
                if shot:
                    artifacts.append(shot)

            scroll_res = fb.run(ctx, {"action": "scroll_right"})
            scrolled = scroll_res.data.get("scrolled", False)
            
            if not scrolled:
                break
            
            total_steps += 1
            page_selected = len(summary["selected"]) - selected_before_page
            summary["pages"].append({
                "index": page_index,
                "visible": page_visible,
                "eligible": page_eligible,
                "selected": page_selected,
            })
            page_index += 1
            time.sleep(step_delay_ms / 1000.0)

        summary["pages_visited"] = page_index + 1
        summary["steps"] = total_steps

        if not summary["selected"] and not summary["errors"]:
            stats = summary.get("filter_stats", {})
            total_visible = stats.get("total_visible", 0)
            eligible = stats.get("eligible", 0)
            if total_visible == 0:
                summary["errors"].append("no favorites visible in favorites bar")
            elif eligible == 0:
                summary["errors"].append("no favorites met filter criteria")

        error_msg = None if not summary["errors"] else "; ".join(summary["errors"][:3])
        ok = len(summary["selected"]) > 0

        return CapResult(
            ok=ok,
            data=summary,
            error=error_msg,
            artifacts=tuple(artifacts)
        )

    def _get_visible_favorites_js(self, ctx: Ctx) -> List[Dict[str, Any]]:
        drv = getattr(ctx, "driver", None)
        if drv is None:
            return []

        script = """
        const rows = Array.from(document.querySelectorAll(
          ".assets-favorites-item__line"
        ));
        return rows.map((row, idx) => {
            const labelEl = row.querySelector(".assets-favorites-item__label");
            const payoutEl = row.querySelector(".payout__number");

            let payout = null;
            if (payoutEl) {
                const txt = payoutEl.innerText.replace(/[+%]/g, "").trim();
                const m = txt.match(/(\\d+)/);
                if (m) payout = parseInt(m[1]);
            }

            let label = "";
            if (labelEl) {
                label = labelEl.innerText.trim();
            } else {
                const rowText = row.innerText.split("\\n")[0].trim();
                label = rowText.replace(/\\s*\\d+\\s*%\\s*$/, "").trim();
            }

            const rect = row.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 &&
                            rect.right > 0 && rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
                            rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);

            return {
                id: idx,
                label: label,
                payout: payout,
                visible: visible
            };
        }).filter(it => it.visible);
        """

        try:
            items = drv.execute_script(script)
        except Exception as e:
            logger.error(f"JS favorites snapshot failed: {e}")
            return []

        result: List[Dict[str, Any]] = []
        if not isinstance(items, list):
            return result

        for it in items:
            if not isinstance(it, dict):
                continue
            asset = str(it.get("label", "") or "").strip()
            payout = it.get("payout")
            payout_str = "" if payout is None else str(payout)
            result.append({"asset": asset, "payout": payout_str})

        return result
