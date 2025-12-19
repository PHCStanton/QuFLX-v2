from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Dict, Set

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
        utils_dir = project_root / "local_selenium_utils"
        if str(utils_dir) not in sys.path:
            sys.path.insert(0, str(utils_dir))
        from selenium_ui_controls import HighPriorityControls  # type: ignore
    except Exception:
        HighPriorityControls = None  # type: ignore


class TimeframeMenu(Capability):
    id = "timeframe_menu"
    kind = "control"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())
        action = inputs.get("action")
        if action == "open_menu":
            return self._open_menu(ctx)
        if action == "is_open":
            return CapResult(ok=True, data={"open": self._is_open(ctx)})
        if action == "select_timeframe":
            label = inputs.get("label")
            if not label:
                return CapResult(ok=False, data={}, error="label required", artifacts=())
            return self._select_timeframe(ctx, label)
        return CapResult(ok=False, data={}, error="unknown action", artifacts=())

    def _is_open(self, ctx: Ctx) -> bool:
        drv = ctx.driver
        try:
            inds = drv.find_elements(By.CSS_SELECTOR, ".dropdown.open, [role='menu'], [role='listbox']")
            for el in inds:
                try:
                    if el.is_displayed():
                        return True
                except Exception:
                    continue
            return False
        except Exception:
            return False

    def _open_menu(self, ctx: Ctx) -> CapResult:
        drv = ctx.driver
        arts = []
        shot = take_screenshot_if(ctx, f"screenshots/timeframe_open_pre_{timestamp()}.png")
        if shot:
            arts.append(shot)
        btn = None
        try:
            if HighPriorityControls is not None:
                hpc = HighPriorityControls(drv)
                meta = hpc.find_chart_timeframe_dropdown_with_meta()
                btn = meta.get("button_element")
            if btn is None:
                for b in drv.find_elements(By.CSS_SELECTOR, "a.items__link--chart-type"):
                    try:
                        if b.is_displayed():
                            btn = b
                            break
                    except Exception:
                        continue
            if btn is None:
                return CapResult(ok=False, data={}, error="menu button not found", artifacts=tuple(arts))
            try:
                btn.click()
            except Exception:
                drv.execute_script("arguments[0].click();", btn)
            ok = self._is_open(ctx)
            post = take_screenshot_if(ctx, f"screenshots/timeframe_open_post_{timestamp()}.png")
            if post:
                arts.append(post)
            return CapResult(ok=ok, data={"opened": ok}, error=None if ok else "open failed", artifacts=tuple(arts))
        except Exception as e:
            return CapResult(ok=False, data={}, error=str(e), artifacts=tuple(arts))

    def _select_timeframe(self, ctx: Ctx, label: str) -> CapResult:
        drv = ctx.driver
        arts = []
        shot = take_screenshot_if(ctx, f"screenshots/timeframe_select_pre_{timestamp()}.png")
        if shot:
            arts.append(shot)
        try:
            if not self._is_open(ctx):
                open_res = self._open_menu(ctx)
                if not open_res.ok:
                    return open_res

            aliases = self._label_aliases(label)

            ok, meta = self._try_select_in_all_contexts(ctx, aliases)
            if not ok:
                self._attempt_close(ctx)
                return CapResult(ok=False, data={"label": label, **meta}, error="timeframe not found", artifacts=tuple(arts))

            post = take_screenshot_if(ctx, f"screenshots/timeframe_select_post_{timestamp()}.png")
            if post:
                arts.append(post)
            return CapResult(ok=True, data={"selected": label}, artifacts=tuple(arts))
        except Exception as e:
            return CapResult(ok=False, data={}, error=str(e), artifacts=tuple(arts))

    def _try_select_in_all_contexts(self, ctx: Ctx, aliases: Set[str]) -> tuple[bool, Dict[str, Any]]:
        drv = ctx.driver
        ok, meta = self._try_select_in_current_context(ctx, aliases)
        if ok:
            return True, meta

        frames = []
        try:
            frames = drv.find_elements(By.TAG_NAME, "iframe")
        except Exception:
            frames = []

        for idx, fr in enumerate(frames or []):
            try:
                drv.switch_to.frame(fr)
                ok2, meta2 = self._try_select_in_current_context(ctx, aliases)
                if ok2:
                    meta2["iframe_index"] = idx
                    return True, meta2
            except Exception:
                continue
            finally:
                try:
                    drv.switch_to.default_content()
                except Exception:
                    pass

        return False, meta

    def _try_select_in_current_context(self, ctx: Ctx, aliases: Set[str]) -> tuple[bool, Dict[str, Any]]:
        drv = ctx.driver

        opts = []
        try:
            opts = drv.find_elements(By.CSS_SELECTOR, ".items__list .item")
        except Exception:
            opts = []
        if not opts:
            try:
                opts = drv.find_elements(By.CSS_SELECTOR, "[role='option'], .tf-option, .timeframe-options button")
            except Exception:
                opts = []

        option_texts = []
        for el in opts:
            try:
                txt = (el.text or "").strip()
                if txt:
                    option_texts.append(txt)
                if self._normalize_label(txt) in aliases:
                    try:
                        el.click()
                    except Exception:
                        drv.execute_script("arguments[0].click();", el)
                    return True, {"method": "selenium", "clicked_text": txt, "options": option_texts[:40]}
            except Exception:
                continue

        js_meta: Dict[str, Any] = {}
        try:
            js_meta = drv.execute_script(
                """
                const normalize = (s) => (s || '').trim().toLowerCase().replace(/\\s+/g,' ');
                const aliases = arguments[0];
                const selectors = [
                  '.items__list .item',
                  '.items__list a',
                  '.items__list button',
                  '[role="option"]',
                  '.tf-option',
                  '.timeframe-options button'
                ];
                const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
                const visible = (el) => {
                  try {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width > 5 && r.height > 5 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
                  } catch (e) { return false; }
                };
                const options = [];
                for (const el of nodes) {
                  if (!visible(el)) continue;
                  const t = (el.innerText || el.textContent || '').trim();
                  if (t) options.push(t);
                }
                for (const el of nodes) {
                  if (!visible(el)) continue;
                  const t = (el.innerText || el.textContent || '').trim();
                  const n = normalize(t);
                  if (aliases.includes(n)) {
                    el.click();
                    return { ok: true, clicked_text: t, options: options.slice(0, 40) };
                  }
                }
                return { ok: false, options: options.slice(0, 40) };
                """,
                sorted(list(aliases)),
            )
        except Exception:
            js_meta = {"ok": False}

        if bool(js_meta.get("ok")):
            return True, {"method": "js", "clicked_text": js_meta.get("clicked_text"), "options": js_meta.get("options", [])}

        return False, {"method": "none", "options": option_texts[:40] or js_meta.get("options", [])}

    def _attempt_close(self, ctx: Ctx) -> None:
        drv = ctx.driver
        try:
            drv.execute_script(
                """
                const el = document.activeElement;
                if (el && typeof el.blur === 'function') el.blur();
                """
            )
        except Exception:
            pass
        try:
            drv.execute_script("document.body && document.body.click && document.body.click();")
        except Exception:
            pass

    def _normalize_label(self, s: str) -> str:
        txt = (s or "").strip().lower()
        txt = re.sub(r"\s+", " ", txt)
        return txt

    def _label_aliases(self, label: str) -> Set[str]:
        raw = (label or "").strip()
        norm = self._normalize_label(raw)
        out: Set[str] = set()
        if not norm:
            return out

        out.add(norm)
        out.add(norm.replace(" ", ""))

        m = re.match(r"^(\d+)m$", norm.replace(" ", ""))
        if m:
            n = m.group(1)
            out.add(f"m{n}")
            out.add(f"m {n}")
            out.add(f"m{n}".replace(" ", ""))
            out.add(f"{n} min")
            out.add(f"{n} mins")
            out.add(f"{n} minute")
            out.add(f"{n} minutes")

        h = re.match(r"^(\d+)h$", norm.replace(" ", ""))
        if h:
            n = h.group(1)
            out.add(f"h{n}")
            out.add(f"{n} hour")
            out.add(f"{n} hours")

        d = re.match(r"^(\d+)d$", norm.replace(" ", ""))
        if d:
            n = d.group(1)
            out.add(f"d{n}")
            out.add(f"{n} day")
            out.add(f"{n} days")

        ms = re.match(r"^(\d+)\s*min$", norm)
        if ms:
            out.add(f"{ms.group(1)}m")

        if norm == "1m":
            out.add("m1")
            out.add("1 min")
            out.add("1 minute")
        if norm == "5m":
            out.add("m5")
            out.add("5 min")
        if norm == "15m":
            out.add("m15")
            out.add("15 min")
        if norm == "1h":
            out.add("h1")
            out.add("1 hour")
        if norm == "4h":
            out.add("h4")
            out.add("4 hours")

        return {self._normalize_label(x) for x in out if x}
