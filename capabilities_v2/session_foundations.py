from __future__ import annotations

from typing import Any, Dict

from .base import Ctx, CapResult, Capability, take_screenshot_if, save_json, timestamp

try:
    from selenium.webdriver.common.by import By
except Exception:
    By = None  # type: ignore

try:
    from selenium.selenium_ui_controls import HighPriorityControls
except Exception:
    HighPriorityControls = None  # type: ignore


class SessionFoundations(Capability):
    id = "session_foundations"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())

        drv = ctx.driver
        data: Dict[str, Any] = {
            "favorites_bar_present": False,
            "timeframe_control_present": False,
            "performance_log_readable": False,
            "raw": {}
        }

        arts = []
        shot = take_screenshot_if(ctx, f"screenshots/session_foundations_{timestamp()}.png")
        if shot:
            arts.append(shot)

        try:
            items = drv.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
            data["raw"]["favorites_items_count"] = len(items)
            for el in items:
                try:
                    if el.is_displayed():
                        data["favorites_bar_present"] = True
                        break
                except Exception:
                    continue
        except Exception as e:
            data["raw"]["favorites_error"] = str(e)

        try:
            tf_ok = False
            if HighPriorityControls is not None:
                hpc = HighPriorityControls(drv)
                meta = hpc.find_chart_timeframe_dropdown_with_meta()
                tf_ok = bool(meta.get("button_found"))
                data["raw"]["timeframe_meta"] = {k: (v if k != "button_element" else None) for k, v in meta.items()}
            else:
                btns = drv.find_elements(By.CSS_SELECTOR, "a.items__link--chart-type")
                for b in btns:
                    try:
                        if b.is_displayed():
                            tf_ok = True
                            break
                    except Exception:
                        continue
            data["timeframe_control_present"] = tf_ok
        except Exception as e:
            data["raw"]["timeframe_error"] = str(e)

        try:
            logs = drv.get_log("performance")
            data["raw"]["performance_log_count"] = len(logs) if isinstance(logs, list) else 0
            data["performance_log_readable"] = isinstance(logs, list)
        except Exception as e:
            data["raw"]["performance_error"] = str(e)
            data["performance_log_readable"] = False

        ok = bool(data["favorites_bar_present"] and data["timeframe_control_present"] and data["performance_log_readable"])

        if ctx.debug:
            try:
                jf = save_json(ctx, f"session_foundations_{timestamp()}.json", data, subfolder="session_foundations")
                arts.append(jf)
            except Exception:
                pass

        return CapResult(ok=ok, data=data, error=None if ok else "Foundations check failed", artifacts=tuple(arts))

