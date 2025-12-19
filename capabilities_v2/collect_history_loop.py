from __future__ import annotations

import time
from typing import Any, Dict

from .base import Capability, Ctx, CapResult
from .favorites_bar import FavoritesBar
from .timeframe_menu import TimeframeMenu
from .history_collector import HistoryCollector

class CollectHistoryLoop(Capability):
    id = "collect_history"
    kind = "orchestrator"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        duration = int(inputs.get("duration", 10))
        timeframe = inputs.get("timeframe", "1m")
        
        fav_bar = FavoritesBar()
        tf_menu = TimeframeMenu()
        collector = HistoryCollector()
        
        results = []

        if ctx.verbose:
            print("Resetting favorites bar...")
        res = fav_bar.run(ctx, {"action": "reset_to_left"})
        if not res.ok:
            return CapResult(ok=False, error=f"Failed to reset favorites: {res.error}")
            
        processed_assets = set()
        
        while True:
            vis_res = fav_bar.run(ctx, {"action": "get_visible_favorites"})
            if not vis_res.ok:
                if ctx.verbose:
                    print("Failed to get visible favorites")
                break
                
            visible_assets = vis_res.data.get("assets", [])
            
            if not visible_assets:
                if ctx.verbose:
                    print("No visible assets found")
                break
                
            new_assets = [a for a in visible_assets if a not in processed_assets]
            
            if not new_assets:
                scroll_res = fav_bar.run(ctx, {"action": "scroll_right"})
                if not scroll_res.ok or not scroll_res.data.get("scrolled", False):
                    if ctx.verbose:
                        print("End of favorites list")
                    break
                time.sleep(1.0)
                continue
                
            for asset in new_assets:
                if ctx.verbose:
                    print(f"Processing asset: {asset}")
                click_res = fav_bar.run(ctx, {"action": "click_favorite", "label": asset})
                if not click_res.ok:
                    if ctx.verbose:
                        print(f"Failed to click {asset}")
                    continue
                time.sleep(2.0)

                # User requested to skip timeframe selection for now to focus on history capture
                # tf_res = tf_menu.run(ctx, {"action": "select_timeframe", "label": timeframe})
                # if not tf_res.ok:
                #     if ctx.verbose:
                #         print(f"Failed to select timeframe {timeframe}: {tf_res.error}")
                #         if tf_res.data:
                #             print(tf_res.data)
                #     continue

                col_res = collector.run(ctx, {
                    "action": "collect_and_save", 
                    "asset": asset, 
                    "duration": duration,
                    "timeframe": timeframe
                })
                
                results.append({
                    "asset": asset,
                    "status": "ok" if col_res.ok else "error",
                    "details": col_res.data if col_res.ok else col_res.error
                })
                
                processed_assets.add(asset)
                
            scroll_res = fav_bar.run(ctx, {"action": "scroll_right"})
            if not scroll_res.ok or not scroll_res.data.get("scrolled", False):
                if ctx.verbose:
                    print("End of favorites list")
                break
            time.sleep(1.0)

        return CapResult(ok=True, data={"processed": list(processed_assets), "results": results})
