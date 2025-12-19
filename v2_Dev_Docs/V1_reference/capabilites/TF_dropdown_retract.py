from __future__ import annotations

from typing import Any, Dict, Optional, List
import time
import sys
import os

# Handle both module and standalone script execution
try:
    from .base import Ctx, CapResult, Capability, add_utils_to_syspath
except ImportError:
    # Running as standalone script
    from base import Ctx, CapResult, Capability, add_utils_to_syspath

# Ensure we can import selenium and local utils
add_utils_to_syspath()
try:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.keys import Keys
except Exception:
    By = None  # type: ignore
    ActionChains = None  # type: ignore
    Keys = None  # type: ignore

try:
    from selenium_ui_controls import HighPriorityControls
except Exception:
    try:
        # Try absolute import when run as standalone script
        sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
        from selenium_ui_controls import HighPriorityControls
    except Exception:
        HighPriorityControls = None  # type: ignore


class TF_Dropdown_Retract(Capability):
    """
    Capability: Open and retract the timeframe dropdown menu.

    Interface:
      run(ctx, {
        "action": "open" | "close" | "toggle" (required)
        "store_button": bool=True,  # Store button reference for closing (default: True)
      })

    Behavior:
      - "open": Finds and clicks the chart/timeframe dropdown button using enhanced detection
      - "close": Closes the most recently opened dropdown (requires stored button reference)
      - "toggle": Opens dropdown, waits briefly, then closes it

    This capability uses the enhanced chart/timeframe dropdown detection from HighPriorityControls
    and properly manages button state for reliable open/close operations.
    Kind: "control"
    """
    id = "tf_dropdown_retract"
    kind = "control"

    def __init__(self):
        # Use context storage instead of instance variable for button persistence
        self._stored_buttons: Dict[str, Any] = {}

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if By is None:
            return CapResult(ok=False, data={}, error="Selenium not available", artifacts=())

        action = (inputs.get("action") or "").strip().lower()
        store_button = inputs.get("store_button", True)

        if action not in ["open", "close", "toggle"]:
            return CapResult(
                ok=False,
                data={"inputs": inputs},
                error="action must be 'open', 'close', or 'toggle'",
                artifacts=()
            )

        try:
            if action == "open":
                return self._open_dropdown(ctx, store_button)
            elif action == "close":
                return self._close_dropdown(ctx)
            elif action == "toggle":
                return self._toggle_dropdown(ctx, store_button)

        except Exception as e:
            return CapResult(
                ok=False,
                data={"action": action, "inputs": inputs},
                error=f"TF dropdown operation failed: {str(e)}",
                artifacts=()
            )

    def _open_dropdown(self, ctx: Ctx, store_button: bool = True) -> CapResult:
        """Open the chart/timeframe dropdown using enhanced detection with robust fallbacks (iframe-aware)."""
        drv = ctx.driver

        def is_dropdown_open() -> bool:
            try:
                return bool(drv.execute_script("""
                    const nodes = Array.from(document.querySelectorAll(
                        '.dropdown.open, .dropdown.show, .menu.open, .menu.show, [role="menu"], [role="listbox"]'
                    ));
                    for (const el of nodes) {
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        if (r.width > 5 && r.height > 5 && cs.visibility !== 'hidden' && cs.display !== 'none') return true;
                    }
                    // Text probe as extra signal
                    return !!Array.from(document.querySelectorAll('*')).find(n => /time\\s*frames/i.test(n.textContent||''));
                """))
            except Exception:
                return False

        attempts: List[Dict[str, Any]] = []
        button_el = None
        click_method = None

        # Strategy A: HighPriorityControls if available
        if HighPriorityControls is not None:
            try:
                hpc = HighPriorityControls(drv)
                click_meta = hpc.click_chart_timeframe_dropdown_with_meta()
                attempts.append({"strategy": "HPC", "ok": bool(click_meta.get("ok")), "selector_used": click_meta.get("selector_used"), "selector_detail": click_meta.get("selector_detail"), "click_method": click_meta.get("click_method")})
                if click_meta.get("ok"):
                    button_el = click_meta.get("button_element")
                    click_method = f"HPC/{click_meta.get('click_method')}"
            except Exception as e:
                attempts.append({"strategy": "HPC", "ok": False, "error": str(e)})

        # Strategy B: Direct CSS/XPath in current context
        if button_el is None:
            selectors = [
                ("css", "a.items__link--chart-type"),
                ("css", "a.items__link.items__link--chart-type"),
                ("css", "a[class*='items__link'][class*='chart-type']"),
                ("css", "button[class*='chart'][class*='type'], button[aria-label*='chart']"),
                ("xpath", "//a[contains(@class,'items__link') and contains(@class,'chart-type')]"),
            ]
            for kind, sel in selectors:
                try:
                    if kind == "css":
                        candidate = drv.find_element(By.CSS_SELECTOR, sel)
                    else:
                        candidate = drv.find_element(By.XPATH, sel)
                    if candidate and candidate.is_displayed():
                        button_el = candidate
                        attempts.append({"strategy": "direct_find", "selector": sel, "kind": kind, "ok": True})
                        break
                except Exception:
                    attempts.append({"strategy": "direct_find", "selector": sel, "kind": kind, "ok": False})

        # Strategy C: Search inside iframes (common for PocketOption controls)
        switched = False
        iframe_index_used = None
        if button_el is None:
            try:
                frames = drv.find_elements(By.TAG_NAME, "iframe")
            except Exception:
                frames = []
            for idx, fr in enumerate(frames or []):
                try:
                    drv.switch_to.frame(fr)
                    switched = True
                    iframe_index_used = idx
                    # Try the same selectors inside frame
                    found = None
                    for kind, sel in [
                        ("css", "a.items__link--chart-type"),
                        ("css", "a.items__link.items__link--chart-type"),
                        ("css", "a[class*='items__link'][class*='chart-type']"),
                        ("xpath", "//a[contains(@class,'items__link') and contains(@class,'chart-type')]"),
                    ]:
                        try:
                            if kind == "css":
                                c = drv.find_element(By.CSS_SELECTOR, sel)
                            else:
                                c = drv.find_element(By.XPATH, sel)
                            if c and c.is_displayed():
                                found = c
                                attempts.append({"strategy": "iframe_find", "iframe": idx, "selector": sel, "kind": kind, "ok": True})
                                break
                        except Exception:
                            attempts.append({"strategy": "iframe_find", "iframe": idx, "selector": sel, "kind": kind, "ok": False})
                    if found is not None:
                        button_el = found
                        break
                    # Not found in this frame; continue next
                    drv.switch_to.default_content()
                    switched = False
                except Exception as e:
                    attempts.append({"strategy": "iframe_enter", "iframe": idx, "ok": False, "error": str(e)})
                    try:
                        drv.switch_to.default_content()
                    except Exception:
                        pass
                    switched = False
                    continue

        # Click the button with robust strategies (Actions offsets, JS dispatch, JS click)
        if button_el is not None:
            try:
                # 1) Actions offsets
                if ActionChains is not None:
                    try:
                        rect = drv.execute_script(
                            "const r = arguments[0].getBoundingClientRect(); return {w:r.width,h:r.height};",
                            button_el
                        ) or {"w": 20, "h": 20}
                        offsets = [
                            (max(2.0, rect["w"] * 0.30), max(2.0, rect["h"] * 0.50)),
                            (max(2.0, rect["w"] * 0.70), max(2.0, rect["h"] * 0.50)),
                            (max(2.0, rect["w"] * 0.50), max(2.0, rect["h"] * 0.50)),
                        ]
                        for ox, oy in offsets:
                            try:
                                ActionChains(drv).move_to_element_with_offset(button_el, int(ox), int(oy)).click().perform()
                                if is_dropdown_open():
                                    click_method = f"actions_offset({int(ox)},{int(oy)})"
                                    attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": True})
                                    break
                                attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": False})
                            except Exception as e:
                                attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": False, "error": str(e)})
                        if click_method is None and is_dropdown_open():
                            click_method = "actions_offset"
                    except Exception as e:
                        attempts.append({"strategy": "actions_offset_prep", "ok": False, "error": str(e)})
                # 2) JS dispatch
                if click_method is None:
                    try:
                        drv.execute_script("""
                            const el = arguments[0];
                            const fire = (type) => {
                              let evt;
                              try { evt = new PointerEvent(type, {bubbles:true,cancelable:true,composed:true}); }
                              catch(e) { evt = new MouseEvent(type, {bubbles:true,cancelable:true,composed:true}); }
                              el.dispatchEvent(evt);
                            };
                            ['pointerdown','mousedown','mouseup','click'].forEach(fire);
                        """, button_el)
                        if is_dropdown_open():
                            click_method = "js_dispatch"
                            attempts.append({"strategy": "js_dispatch", "ok": True})
                        else:
                            attempts.append({"strategy": "js_dispatch", "ok": False})
                    except Exception as e:
                        attempts.append({"strategy": "js_dispatch", "ok": False, "error": str(e)})
                # 3) JS click
                if click_method is None:
                    try:
                        drv.execute_script("arguments[0].click();", button_el)
                        if is_dropdown_open():
                            click_method = "js_click"
                            attempts.append({"strategy": "js_click", "ok": True})
                        else:
                            attempts.append({"strategy": "js_click", "ok": False})
                    except Exception as e:
                        attempts.append({"strategy": "js_click", "ok": False, "error": str(e)})
            finally:
                # Always restore to default content if we switched to an iframe
                if switched:
                    try:
                        drv.switch_to.default_content()
                    except Exception:
                        pass

        ok = bool(is_dropdown_open())
        data: Dict[str, Any] = {
            "action": "open",
            "ok": ok,
            "attempts": attempts,
            "click_method": click_method,
            "iframe_index_used": iframe_index_used,
        }

        # Store for closing
        if ok and store_button and button_el is not None:
            try:
                button_key = f"tf_dropdown_button_{id(ctx.driver)}"
                self._stored_buttons[button_key] = button_el
                data["button_stored"] = True
                data["storage_key"] = button_key
            except Exception as e:
                data["button_stored"] = False
                data["store_error"] = str(e)

        return CapResult(ok=ok, data=data, error=None if ok else "Failed to open dropdown", artifacts=())

    def _close_dropdown(self, ctx: Ctx) -> CapResult:
        """Close the dropdown using robust strategies (Actions offsets, JS events, blind click, ESC)."""
        button_key = f"tf_dropdown_button_{id(ctx.driver)}"
        stored_button = self._stored_buttons.get(button_key)

        if not stored_button:
            return CapResult(
                ok=False,
                data={"action": "close"},
                error="No stored button found. Call 'open' action first.",
                artifacts=()
            )

        drv = ctx.driver
        attempts: List[Dict[str, Any]] = []

        def dropdown_open() -> bool:
            try:
                dropdown_status = drv.execute_script("""
                    const nodes = Array.from(document.querySelectorAll(
                        '.dropdown.open, .dropdown.show, .menu.open, .menu.show, [role="menu"], [role="listbox"]'
                    ));
                    for (const el of nodes) {
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        if (r.width > 5 && r.height > 5 && cs.visibility !== 'hidden' && cs.display !== 'none') {
                            return {
                                open: true,
                                rect: {width: r.width, height: r.height, left: r.left, top: r.top},
                                style: {visibility: cs.visibility, display: cs.display},
                                classes: el.className
                            };
                        }
                    }
                    return {open: false};
                """)
                return bool(dropdown_status.get("open", False))
            except Exception:
                # If we cannot detect, don't block closure
                return False

        def verify_closed_with_timeout(timeout_seconds: float = 2.0) -> bool:
            """Verify dropdown is closed with timeout to handle animations."""
            import time
            start_time = time.time()
            while time.time() - start_time < timeout_seconds:
                if not dropdown_open():
                    time.sleep(0.1)  # Brief stabilization check
                    if not dropdown_open():  # Double-check
                        return True
                time.sleep(0.05)  # Short polling interval
            return False

        try:
            # Strategy 1: Selenium Actions with offsets (left-mid, right-mid, center)
            if stored_button and ActionChains is not None:
                try:
                    rect = drv.execute_script(
                        "const r = arguments[0].getBoundingClientRect(); return {w:r.width,h:r.height};",
                        stored_button
                    ) or {"w": 20, "h": 20}
                    offsets = [
                        (max(2.0, rect["w"] * 0.30), max(2.0, rect["h"] * 0.50)),
                        (max(2.0, rect["w"] * 0.70), max(2.0, rect["h"] * 0.50)),
                        (max(2.0, rect["w"] * 0.50), max(2.0, rect["h"] * 0.50)),
                    ]
                    for ox, oy in offsets:
                        try:
                            ActionChains(drv).move_to_element_with_offset(stored_button, int(ox), int(oy)).click().perform()
                            closed = verify_closed_with_timeout(1.5)
                            attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": closed})
                            if closed:
                                del self._stored_buttons[button_key]
                                return CapResult(ok=True, data={"action": "close", "closed": True, "method": "actions_offset", "attempts": attempts}, artifacts=())
                        except Exception as e:
                            attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": False, "error": str(e)})
                except Exception as e:
                    attempts.append({"strategy": "actions_offset_prep", "ok": False, "error": str(e)})

            # Strategy 2: JS dispatch pointer/mouse events
            try:
                drv.execute_script("""
                    const el = arguments[0];
                    const fire = (type) => {
                      let evt;
                      try { evt = new PointerEvent(type, {bubbles:true,cancelable:true,composed:true}); }
                      catch(e) { evt = new MouseEvent(type, {bubbles:true,cancelable:true,composed:true}); }
                      el.dispatchEvent(evt);
                    };
                    ['pointerdown','mousedown','mouseup','click'].forEach(fire);
                """, stored_button)
                closed = verify_closed_with_timeout(1.5)
                attempts.append({"strategy": "js_dispatch", "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return CapResult(ok=True, data={"action": "close", "closed": True, "method": "js_dispatch", "attempts": attempts}, artifacts=())
            except Exception as e:
                attempts.append({"strategy": "js_dispatch", "ok": False, "error": str(e)})

            # Strategy 3: JS click on the opening button
            try:
                drv.execute_script("arguments[0].click();", stored_button)
                closed = verify_closed_with_timeout(1.5)
                attempts.append({"strategy": "js_click", "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return CapResult(ok=True, data={"action": "close", "closed": True, "method": "js_click", "attempts": attempts}, artifacts=())
            except Exception as e:
                attempts.append({"strategy": "js_click", "ok": False, "error": str(e)})

            # Strategy 4: Blind click center of viewport (if menu closes on outside click)
            try:
                res = drv.execute_script("""
                    const centerX = Math.floor(window.innerWidth/2);
                    const centerY = Math.floor(window.innerHeight/2);
                    const el = document.elementFromPoint(centerX, centerY);
                    if (el) { el.click(); return true; }
                    return false;
                """)
                closed = verify_closed_with_timeout(1.5)
                attempts.append({"strategy": "blind_center_click", "performed": bool(res), "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return CapResult(ok=True, data={"action": "close", "closed": True, "method": "blind_center_click", "attempts": attempts}, artifacts=())
            except Exception as e:
                attempts.append({"strategy": "blind_center_click", "ok": False, "error": str(e)})

            # Strategy 5: ESC key
            try:
                if Keys is not None:
                    drv.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                    closed = verify_closed_with_timeout(1.5)
                    attempts.append({"strategy": "escape_key", "ok": closed})
                    if closed:
                        del self._stored_buttons[button_key]
                        return CapResult(ok=True, data={"action": "close", "closed": True, "method": "escape_key", "attempts": attempts}, artifacts=())
            except Exception as e:
                attempts.append({"strategy": "escape_key", "ok": False, "error": str(e)})

            # If we reach here, closure not confirmed
            return CapResult(
                ok=False,
                data={"action": "close", "closed": False, "attempts": attempts},
                error="Failed to retract dropdown reliably",
                artifacts=()
            )

        except Exception as e:
            return CapResult(
                ok=False,
                data={"action": "close", "closed": False, "attempts": attempts},
                error=f"Error closing dropdown: {str(e)}",
                artifacts=()
            )

    def _toggle_dropdown(self, ctx: Ctx, store_button: bool = True) -> CapResult:
        """Open dropdown, wait briefly, then close it."""
        # First open the dropdown
        open_result = self._open_dropdown(ctx, store_button)
        if not open_result.ok:
            return open_result

        # Wait for dropdown to fully open
        time.sleep(0.5)

        # Then close it
        close_result = self._close_dropdown(ctx)

        if close_result.ok:
            return CapResult(
                ok=True,
                data={
                    "action": "toggle",
                    "opened": True,
                    "closed": True,
                    "toggle_success": True
                },
                artifacts=()
            )
        else:
            return CapResult(
                ok=False,
                data={
                    "action": "toggle",
                    "opened": True,
                    "closed": False,
                    "toggle_success": False,
                    "close_error": close_result.error
                },
                error="Toggle failed: opened dropdown but could not close it",
                artifacts=()
            )

    def _click(self, el, driver) -> bool:
        """Click element with fallback to JavaScript."""
        try:
            el.click()
            return True
        except Exception:
            try:
                driver.execute_script("arguments[0].click();", el)
                return True
            except Exception:
                return False


# Factory for orchestrator
def build() -> Capability:
    return TF_Dropdown_Retract()
