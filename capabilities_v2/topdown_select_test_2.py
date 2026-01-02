from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

try:
    from .base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp
    from .favorites_bar import FavoritesBar
    from .timeframe_menu import TimeframeMenu
    from .session_foundations import SessionFoundations
    from .timeframe_select_sync import TimeframeSelectSync
except ImportError:
    this_file = Path(__file__).resolve()
    project_root = this_file.parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from capabilities_v2.base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp  # type: ignore
    from capabilities_v2.favorites_bar import FavoritesBar  # type: ignore
    from capabilities_v2.timeframe_menu import TimeframeMenu  # type: ignore
    from capabilities_v2.session_foundations import SessionFoundations  # type: ignore
    from capabilities_v2.timeframe_select_sync import TimeframeSelectSync  # type: ignore


class TopdownSelectTest2(Capability):
    id = "topdown_select_test_2"
    kind = "orchestrator"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        labels_raw = inputs.get("labels")
        if labels_raw is None:
            labels: List[str] = ["H1", "M15", "M5", "M1"]
        else:
            labels = [str(x) for x in labels_raw]

        min_pct = int(inputs.get("min_pct", 92))
        delay_ms = int(inputs.get("delay_ms", 300))
        stack = str(inputs.get("stack", "1m"))
        save_screenshots = bool(inputs.get("save_screenshots", False))
        screenshots_subdir = inputs.get("screenshots_subdir") or "topdown_test_2"
        reopen_each = bool(inputs.get("reopen_each", True))

        use_tf_sync = bool(inputs.get("use_tf_sync", False))
        tf_attempts = int(inputs.get("tf_attempts", 3))
        tf_wait_s = float(inputs.get("tf_wait_s", 0.0))
        focus_on_chart = bool(inputs.get("focus_on_chart", True))
        save_tf_diag = bool(inputs.get("save_tf_diag", True))

        data: Dict[str, Any] = {
            "inputs": {
                "labels": labels,
                "min_pct": min_pct,
                "delay_ms": delay_ms,
                "stack": stack,
                "save_screenshots": save_screenshots,
                "screenshots_subdir": screenshots_subdir,
                "reopen_each": reopen_each,
                "use_tf_sync": use_tf_sync,
                "tf_attempts": tf_attempts,
                "tf_wait_s": tf_wait_s,
                "focus_on_chart": focus_on_chart,
                "save_tf_diag": save_tf_diag,
            },
            "foundations": None,
            "favorite_candidate": None,
            "topdown_result": None,
        }

        artifacts: List[str] = []

        pre = take_screenshot_if(ctx, f"screenshots/topdown_test_2_pre_{timestamp()}.png")
        if pre:
            artifacts.append(pre)

        foundations_cap = SessionFoundations()
        foundations_res = foundations_cap.run(ctx, {})
        data["foundations"] = foundations_res.data
        if not foundations_res.ok:
            if ctx.debug:
                try:
                    jf = save_json(ctx, f"topdown_test_2_foundations_{timestamp()}.json", data)
                    artifacts.append(jf)
                except Exception:
                    pass
            return CapResult(ok=False, data=data, error=foundations_res.error or "session foundations failed", artifacts=tuple(artifacts))

        fav_bar = FavoritesBar()
        vis_res = fav_bar.run(ctx, {"action": "get_visible_favorites"})
        if not vis_res.ok:
            return CapResult(ok=False, data=data, error=vis_res.error or "failed to read favorites bar", artifacts=tuple(artifacts))

        visible = vis_res.data.get("visible") or []
        eligible_assets: List[str] = []
        for item in visible:
            try:
                payout_txt = str(item.get("payout") or "")
                m = re.search(r"(\d+)", payout_txt)
                pct = int(m.group(1)) if m else 0
                if pct >= min_pct:
                    asset_label = str(item.get("asset") or "").strip()
                    if asset_label:
                        eligible_assets.append(asset_label)
            except Exception:
                continue

        if not eligible_assets:
            return CapResult(ok=False, data=data, error=f"no visible favorites with payout >= {min_pct}%", artifacts=tuple(artifacts))

        target_asset = eligible_assets[0]
        data["favorite_candidate"] = {
            "asset": target_asset,
            "eligible_count_visible": len(eligible_assets),
        }

        click_res = fav_bar.run(ctx, {"action": "click_favorite", "label": target_asset})
        if not click_res.ok:
            return CapResult(ok=False, data=data, error=f"failed to click favorite: {target_asset}", artifacts=tuple(artifacts))

        attempts_meta: List[Dict[str, Any]] = []
        if use_tf_sync:
            tf_sync = TimeframeSelectSync()
            sync_inputs: Dict[str, Any] = {
                "labels": labels,
                "attempts": tf_attempts,
                "delay_ms": delay_ms,
                "tf_wait_s": tf_wait_s,
                "focus_on_chart": focus_on_chart,
                "save_diag": save_tf_diag,
            }
            sync_res = tf_sync.run(ctx, sync_inputs)
            data["timeframe_select_sync"] = {
                "ok": sync_res.ok,
                "error": sync_res.error,
                "data": sync_res.data,
            }

            per_label = []
            if isinstance(sync_res.data, dict):
                per_label = sync_res.data.get("per_label") or []

            for item in per_label:
                label_value = item.get("label")
                ok_flag = bool(item.get("ok"))
                attempts_meta.append({
                    "label": label_value,
                    "ok": ok_flag,
                    "error": None if ok_flag else "timeframe_select_sync label failed",
                    "data": item,
                })
        else:
            tf_menu = TimeframeMenu()

            for label in labels:
                tf_inputs = {"action": "select_timeframe", "label": label}
                tf_res = tf_menu.run(ctx, tf_inputs)
                attempts_meta.append({
                    "label": label,
                    "ok": bool(tf_res.ok),
                    "error": tf_res.error,
                    "data": tf_res.data,
                })
                if not tf_res.ok and ctx.verbose:
                    print(json.dumps({"warning": "timeframe selection failed", "label": label, "data": tf_res.data, "error": tf_res.error}))
                try:
                    if tf_res.ok and delay_ms > 0:
                        time.sleep(max(0, int(delay_ms)) / 1000.0)
                except Exception:
                    pass

        attempts_ok = sum(1 for a in attempts_meta if a.get("ok"))
        all_ok = bool(attempts_meta and attempts_ok == len(attempts_meta))

        data["topdown_result"] = {
            "ok": all_ok,
            "error": None if all_ok else "one or more timeframe selections failed",
            "labels": labels,
            "stack": stack,
            "attempts_total": len(attempts_meta),
            "attempts_ok": attempts_ok,
            "attempts": attempts_meta,
            "screenshots_count": 0,
        }

        if ctx.debug:
            try:
                jf = save_json(ctx, f"topdown_test_2_{timestamp()}.json", data, subfolder="topdown_test_2")
                artifacts.append(jf)
            except Exception:
                pass

        post = take_screenshot_if(ctx, f"screenshots/topdown_test_2_post_{timestamp()}.png")
        if post:
            artifacts.append(post)

        return CapResult(ok=bool(data["topdown_result"]["ok"]), data=data, error=data["topdown_result"]["error"], artifacts=tuple(artifacts))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TopdownSelect v2 test harness")
    parser.add_argument("--labels", nargs="+", help="Timeframe labels to test, e.g. H1 M15 M5 M1")
    parser.add_argument("--min-pct", type=int, default=92, help="Minimum payout percentage for favorites")
    parser.add_argument("--delay-ms", type=int, default=300, help="Delay between timeframe selections (ms)")
    parser.add_argument("--stack", type=str, default="1m", help="TopdownSelect stack value")
    parser.add_argument("--save-screenshots", action="store_true", help="Enable screenshots during TopdownSelect")
    parser.add_argument("--screenshots-subdir", type=str, default=None, help="Subdirectory under screenshots/ for artifacts")
    parser.add_argument("--reopen-each", action="store_true", help="Reopen timeframe menu for each label")
    parser.add_argument("--use-tf-sync", action="store_true")
    parser.add_argument("--tf-attempts", type=int, default=3)
    parser.add_argument("--tf-wait-s", type=float, default=0.0)
    parser.add_argument("--no-chart-focus", action="store_true")
    parser.add_argument("--no-tf-diag", action="store_true")
    parser.add_argument("--debug", action="store_true", help="Enable debug artifacts")
    parser.add_argument("--verbose", action="store_true", help="Verbose console output")

    args = parser.parse_args()

    try:
        import qf  # type: ignore

        ok, _ = qf.attach_chrome_session(port=9222)
        if not ok:
            raise SystemExit("Failed to attach to Chrome session on port 9222")

        ctx = qf.ctx
        ctx.debug = bool(args.debug or getattr(ctx, "debug", False))
        ctx.verbose = bool(args.verbose or getattr(ctx, "verbose", False))

    except Exception:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        driver = webdriver.Chrome(options=opts)
        artifacts_root = project_root / "data" / "artifacts"
        ctx = Ctx(driver=driver, artifacts_root=str(artifacts_root), debug=bool(args.debug), dry_run=False, verbose=bool(args.verbose))

    cap = TopdownSelectTest2()
    run_inputs: Dict[str, Any] = {
        "labels": args.labels,
        "min_pct": args.min_pct,
        "delay_ms": args.delay_ms,
        "stack": args.stack,
        "save_screenshots": bool(args.save_screenshots),
        "screenshots_subdir": args.screenshots_subdir,
        "reopen_each": bool(args.reopen_each),
        "use_tf_sync": bool(args.use_tf_sync),
        "tf_attempts": int(args.tf_attempts),
        "tf_wait_s": float(args.tf_wait_s),
        "focus_on_chart": not bool(args.no_chart_focus),
        "save_tf_diag": not bool(args.no_tf_diag),
    }

    result = cap.run(ctx, run_inputs)
    print(json.dumps({
        "ok": result.ok,
        "data": result.data,
        "error": result.error,
        "artifacts": result.artifacts,
    }))

