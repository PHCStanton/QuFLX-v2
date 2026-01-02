from __future__ import annotations

import time
from typing import Any, Dict, List

try:
    from .base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp
    from .timeframe_menu import TimeframeMenu
except ImportError:
    import sys
    from pathlib import Path

    this_file = Path(__file__).resolve()
    project_root = this_file.parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from capabilities_v2.base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp  # type: ignore
    from capabilities_v2.timeframe_menu import TimeframeMenu  # type: ignore

try:
    from selenium.webdriver.common.by import By
except Exception:
    By = None  # type: ignore


class TimeframeSelectSync(Capability):
    id = "timeframe_select_sync"
    kind = "control"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())

        labels_raw = inputs.get("labels")
        single_label = inputs.get("label")

        labels: List[str] = []
        if isinstance(labels_raw, list) and labels_raw:
            labels = [str(x) for x in labels_raw]
        elif single_label:
            labels = [str(single_label)]
        else:
            labels = ["H1", "M15", "M5", "M1"]

        attempts_per_label = int(inputs.get("attempts", 3))
        if attempts_per_label < 1:
            attempts_per_label = 1

        delay_ms = int(inputs.get("delay_ms", 300))
        if delay_ms < 0:
            delay_ms = 0

        tf_wait_s = float(inputs.get("tf_wait_s", 0.0))
        if tf_wait_s < 0.0:
            tf_wait_s = 0.0

        focus_on_chart = bool(inputs.get("focus_on_chart", True))
        save_diag = bool(inputs.get("save_diag", True))

        tf_cap = TimeframeMenu()

        artifacts: List[str] = []
        pre = take_screenshot_if(ctx, f"screenshots/timeframe_sync_pre_{timestamp()}.png")
        if pre:
            artifacts.append(pre)

        per_label: List[Dict[str, Any]] = []

        for label in labels:
            label_attempts: List[Dict[str, Any]] = []
            label_ok = False

            for attempt in range(attempts_per_label):
                meta: Dict[str, Any] = {
                    "label": label,
                    "attempt": attempt + 1,
                }
                try:
                    sel_res = tf_cap.run(ctx, {"action": "select_timeframe", "label": label})
                    meta["select_ok"] = bool(sel_res.ok)
                    meta["select_error"] = sel_res.error
                    meta["select_data"] = sel_res.data

                    if sel_res.ok:
                        label_ok = True
                        label_attempts.append(meta)
                        if delay_ms > 0:
                            try:
                                time.sleep(delay_ms / 1000.0)
                            except Exception:
                                pass
                        if tf_wait_s > 0.0:
                            try:
                                time.sleep(tf_wait_s)
                            except Exception:
                                pass
                        break

                    if (
                        not sel_res.ok
                        and focus_on_chart
                        and ctx.driver is not None
                        and By is not None
                        and attempt < attempts_per_label - 1
                    ):
                        try:
                            el = ctx.driver.find_element(By.CSS_SELECTOR, "canvas, .chart, .trading-chart")
                            el.click()
                            time.sleep(0.5)
                            meta["focus_clicked"] = True
                        except Exception as focus_e:
                            meta["focus_error"] = str(focus_e)

                    label_attempts.append(meta)
                    try:
                        time.sleep(0.5)
                    except Exception:
                        pass
                except Exception as e:
                    meta["exception"] = str(e)
                    label_attempts.append(meta)
                    try:
                        time.sleep(0.5)
                    except Exception:
                        pass

            per_label.append({
                "label": label,
                "ok": label_ok,
                "attempts": label_attempts,
            })

        labels_ok = sum(1 for item in per_label if item.get("ok"))
        all_ok = bool(per_label and labels_ok == len(per_label))

        data: Dict[str, Any] = {
            "inputs": {
                "labels": labels,
                "attempts": attempts_per_label,
                "delay_ms": delay_ms,
                "tf_wait_s": tf_wait_s,
                "focus_on_chart": focus_on_chart,
            },
            "per_label": per_label,
            "labels_total": len(per_label),
            "labels_ok": labels_ok,
        }

        if ctx.debug and save_diag:
            try:
                diag = save_json(
                    ctx,
                    f"timeframe_select_sync_{timestamp()}.json",
                    data,
                    subfolder="timeframe_select_sync",
                )
                artifacts.append(diag)
            except Exception:
                pass

        post = take_screenshot_if(ctx, f"screenshots/timeframe_sync_post_{timestamp()}.png")
        if post:
            artifacts.append(post)

        error = None if all_ok else "one or more timeframe selections failed"
        return CapResult(ok=all_ok, data=data, error=error, artifacts=tuple(artifacts))

