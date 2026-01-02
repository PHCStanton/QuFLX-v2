from __future__ import annotations

import time
from typing import Any, Dict

from .base import Capability, Ctx, CapResult
from .favorites_bar import FavoritesBar
from .timeframe_menu import TimeframeMenu
from .history_collector import HistoryCollector
from .timeframe_select_sync import TimeframeSelectSync

class CollectHistoryLoop(Capability):
    id = "collect_history"
    kind = "orchestrator"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        duration = int(inputs.get("duration", 10))
        timeframe = inputs.get("timeframe", "1m")
        use_tf_sync = bool(inputs.get("use_tf_sync", False))
        tf_attempts = int(inputs.get("tf_attempts", 3))
        tf_delay_ms = int(inputs.get("tf_delay_ms", 300))
        tf_wait_s = float(inputs.get("tf_wait_s", 0.0))
        focus_on_chart = bool(inputs.get("focus_on_chart", True))
        save_tf_diag = bool(inputs.get("save_tf_diag", True))
        
        fav_bar = FavoritesBar()
        tf_menu = TimeframeMenu()
        collector = HistoryCollector()
        tf_sync = TimeframeSelectSync() if use_tf_sync else None
        
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

                if use_tf_sync and tf_sync is not None:
                    sync_res = tf_sync.run(ctx, {
                        "labels": [timeframe],
                        "attempts": tf_attempts,
                        "delay_ms": tf_delay_ms,
                        "tf_wait_s": tf_wait_s,
                        "focus_on_chart": focus_on_chart,
                        "save_diag": save_tf_diag,
                    })
                    if not sync_res.ok:
                        if ctx.verbose:
                            print(f"Failed to sync timeframe {timeframe} for {asset}: {sync_res.error}")
                        results.append({
                            "asset": asset,
                            "status": "timeframe_error",
                            "details": sync_res.error,
                        })
                        processed_assets.add(asset)
                        continue
                else:
                    tf_res = tf_menu.run(ctx, {"action": "select_timeframe", "label": timeframe})
                    if not tf_res.ok:
                        if ctx.verbose:
                            print(f"Failed to select timeframe {timeframe}: {tf_res.error}")
                            if tf_res.data:
                                print(tf_res.data)
                        results.append({
                            "asset": asset,
                            "status": "timeframe_error",
                            "details": tf_res.error,
                        })
                        processed_assets.add(asset)
                        continue

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
