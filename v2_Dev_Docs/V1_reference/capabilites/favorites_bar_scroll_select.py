#!/usr/bin/env python3
"""
favorites_bar_scroll_select.py

Session: Scroll the entire favorites horizontal bar and select specified assets (or all eligible).
- Composes existing capabilities without modifying them:
  * capabilities.favorite_select.FavoriteSelect  (scan/click on current visible page)
  * capabilities.favorites_bar_scroll.FavoritesBarScroll (reset left, page right)
- Default payout threshold: 92%
- Always resets the favorites bar to the far left before starting
- Iterates page-by-page to the end (verified pagination)
- Optional screenshots when --save-screenshots is provided (not default)
- CLI kept simple per user request:
  - Removed: --dry-run, --no-reset-left, --max-steps

Usage (PowerShell):
  # Select all eligible favorites (default 92%), with screenshots
  python scripts\\custom_sessions\\favorites_bar_scroll_select.py --all --save-screenshots --shots-subdir fav_walk

  # Select specific assets (contains-match), default 92% payout
  python scripts\\custom_sessions\\favorites_bar_scroll_select.py --assets "EUR/USD OTC" "AUDCHF OTC"

  # Select all eligible favorites without screenshots
  python scripts\\custom_sessions\\favorites_bar_scroll_select.py --all
"""

from __future__ import annotations

import sys
import os
import time
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Ensure capabilities package is importable when running from anywhere
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # .../QuFLX
CAP_DIR = PROJECT_ROOT / "capabilities"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(CAP_DIR) not in sys.path:
    sys.path.insert(0, str(CAP_DIR))

# Capabilities and attach helpers
from capabilities.favorite_select import FavoriteSelect  # type: ignore
from capabilities.favorites_bar_scroll import FavoritesBarScroll  # type: ignore
from capabilities.base import take_screenshot_if, timestamp  # type: ignore
from qf import attach_chrome_session
import qf  # qf.ctx (Ctx) and qf.driver provided after attach


def _match_targets_on_page(visible_labels: List[str], asset_patterns: Optional[List[str]]) -> List[str]:
    """
    Compute which visible labels should be selected on this page.
    - If asset_patterns is None: return visible_labels (used for --all)
    - Else: return visible labels whose text contains any pattern (case-insensitive)
    """
    if not visible_labels:
        return []
    if not asset_patterns:
        return list(visible_labels)

    pats = [str(p or "").strip().lower() for p in asset_patterns if str(p or "").strip()]
    if not pats:
        return []

    out: List[str] = []
    for lbl in visible_labels:
        low = (lbl or "").strip().lower()
        for p in pats:
            if p and p in low:
                out.append(lbl)
                break
    return out


def run_session(
    assets: Optional[List[str]] = None,
    select_all: bool = False,
    min_pct: int = 92,
    click_delay_ms: int = 1500,
    step_delay_ms: int = 150,
    save_screenshots: bool = False,
    shots_subdir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main session:
      - Attach to Chrome (re-uses global qf.ctx)
      - Reset favorites bar to left
      - For each page:
         * Scan visible eligible favorites (>= min_pct)
         * Determine targets based on --assets or --all
         * Click targets not already selected, with pacing
         * Take per-page screenshot if requested
         * Page right once; stop if no progress
      - Return a concise JSON summary (also printed)

    Notes:
      - Internal max step ceiling protects against infinite loops but is not exposed as a CLI arg.
    """
    summary: Dict[str, Any] = {
        "ok": False,
        "mode": "assets" if (assets and not select_all) else "all",
        "min_pct": int(min_pct),
        "patterns": assets or [],
        "selected": [],
        "skipped": [],
        "pages_visited": 0,
        "steps": 0,
        "artifacts": [],
        "errors": [],
    }
    artifacts: List[str] = []

    # Attach or confirm existing session
    print("🔗 Attaching to Chrome on port 9222...")
    ok, info = attach_chrome_session(port=9222, verbose=True)
    if not ok:
        err = f"Attach failed: {info}"
        print(f"❌ {err}")
        summary["errors"].append(err)
        return summary
    print("✅ Attached")

    ctx = qf.ctx  # Ctx from qf

    # Instantiate capabilities
    fav = FavoriteSelect()
    fscroll = FavoritesBarScroll()

    # Determine screenshots dir
    shots_dir = shots_subdir or "favorites_scroll_select"

    # Optional initial screenshot
    if save_screenshots:
        pre = take_screenshot_if(ctx, f"screenshots/{shots_dir}/pre_{timestamp()}.png")
        if pre:
            artifacts.append(pre)

    # Always reset to far left
    print("↩️  Resetting favorites bar to far left...")
    try:
        res_reset = fscroll.run(ctx, {
            "direction": "reset_left",
            "verify": True,
            "delay_ms": int(step_delay_ms),
            "screenshots_subdir": shots_dir if save_screenshots else None,
        })
        if not res_reset.ok:
            print(f"⚠️ Reset warning: {res_reset.error}")
    except Exception as e:
        msg = f"Reset error: {e}"
        print(f"⚠️ {msg}")
        summary["errors"].append(msg)

    # Brief settle
    try:
        time.sleep(max(0, int(step_delay_ms)) / 1000.0)
    except Exception:
        pass

    # Iterate over pages to the end
    selected_set: set[str] = set()
    selected_order: List[str] = []
    page_index = 0
    total_steps = 0

    # Internal safety cap to avoid accidental infinite loops (not exposed as CLI)
    INTERNAL_MAX_STEPS = 300

    print("➡️  Starting page-by-page walk to the right...")
    while True:
        # 1) Scan currently visible eligible favorites
        try:
            scan = fav.run(ctx, {"min_pct": int(min_pct), "select": None})
            visible_eligible: List[str] = []
            if scan and scan.data:
                visible_eligible = scan.data.get("eligible", []) or []
        except Exception as e:
            msg = f"Scan error on page {page_index}: {e}"
            print(f"⚠️ {msg}")
            summary["errors"].append(msg)
            visible_eligible = []

        # 2) Decide targets for this page
        targets = _match_targets_on_page(visible_eligible, None if select_all else assets)

        # 3) Click targets not already selected (simple on-page click only; no verification)
        for label in targets:
            if label in selected_set:
                continue
            try:
                ok_click = False
                # Simple click on current page only (prevents verification debug noise and keeps sequence stable)
                try:
                    ok_click = bool(fav._click_favorite_simple(ctx, label))
                except Exception:
                    ok_click = False

                if ok_click:
                    selected_set.add(label)
                    selected_order.append(label)
                    print(f"✅ Selected: {label}")
                    # Pacing between clicks
                    try:
                        time.sleep(max(0, int(click_delay_ms)) / 1000.0)
                    except Exception:
                        pass
                else:
                    print(f"⚠️ Click failed: {label}")
                    summary["skipped"].append(label)
            except Exception as e:
                print(f"⚠️ Click error for '{label}': {e}")
                summary["skipped"].append(label)

        # 4) Per-page screenshot (after clicking this page)
        if save_screenshots:
            pg = take_screenshot_if(ctx, f"screenshots/{shots_dir}/page_{page_index:03d}_after_{timestamp()}.png")
            if pg:
                artifacts.append(pg)

        # 5) Page right once; stop if no progress
        try:
            scroll_res = fscroll.run(ctx, {
                "direction": "right",
                "steps": 1,
                "verify": True,
                "delay_ms": int(step_delay_ms),
                "screenshots_subdir": shots_dir if save_screenshots else None,
            })
            data = scroll_res.data or {}
            progressed = bool(data.get("progress")) or int(data.get("steps_performed") or 0) > 0
            step_inc = int(data.get("steps_performed") or 0)
            total_steps += step_inc
        except Exception as e:
            msg = f"Scroll error after page {page_index}: {e}"
            print(f"⚠️ {msg}")
            summary["errors"].append(msg)
            progressed = False

        page_index += 1

        # Stop conditions: no progress, or internal guard
        if not progressed:
            break
        if total_steps >= INTERNAL_MAX_STEPS:
            print(f"⚠️ Stopping due to internal max step ceiling ({INTERNAL_MAX_STEPS})")
            break

    # Final screenshot
    if save_screenshots:
        fin = take_screenshot_if(ctx, f"screenshots/{shots_dir}/done_{timestamp()}.png")
        if fin:
            artifacts.append(fin)

    # Compose summary
    summary["ok"] = True
    summary["selected"] = selected_order
    summary["pages_visited"] = page_index
    summary["steps"] = total_steps
    summary["artifacts"] = artifacts

    # Print concise JSON
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Scroll the favorites bar end-to-end and select specified assets (or all eligible)."
    )
    # Selection mode
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--assets", nargs="+", help="Asset labels (contains-match) to select across the entire favorites bar")
    group.add_argument("--all", action="store_true", help="Select all eligible favorites (>= min_pct) across the whole bar")

    # Threshold and pacing
    parser.add_argument("--min-pct", type=int, default=92, help="Minimum payout percent (default: 92)")
    parser.add_argument("--click-delay-ms", type=int, default=1500, help="Delay between clicks (ms), default 1500")
    parser.add_argument("--step-delay-ms", type=int, default=150, help="Settle delay after each page step (ms), default 150")

    # Screenshots (opt-in)
    parser.add_argument("--save-screenshots", action="store_true", help="Enable screenshots (not default)")
    parser.add_argument("--shots-subdir", type=str, default=None, help="Subdirectory under screenshots/ when --save-screenshots is used")

    args = parser.parse_args()

    # Validate numbers
    if args.min_pct < 0:
        print("⚠️ --min-pct should be non-negative; using 0")
        args.min_pct = 0
    if args.click_delay_ms < 0:
        print("⚠️ --click-delay-ms should be non-negative; using 0")
        args.click_delay_ms = 0
    if args.step_delay_ms < 0:
        print("⚠️ --step-delay-ms should be non-negative; using 0")
        args.step_delay_ms = 0

    run_session(
        assets=args.assets,
        select_all=bool(args.all),
        min_pct=int(args.min_pct),
        click_delay_ms=int(args.click_delay_ms),
        step_delay_ms=int(args.step_delay_ms),
        save_screenshots=bool(args.save_screenshots),
        shots_subdir=(args.shots_subdir or None),
    )
