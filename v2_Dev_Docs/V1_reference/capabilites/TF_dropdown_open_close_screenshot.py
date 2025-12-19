from __future__ import annotations

from typing import Any, Dict, Optional, List, Tuple
import time
import sys
import os
from datetime import datetime

try:
    # Try relative import first (when used as module)
    from .base import CapResult, Capability, add_utils_to_syspath, timestamp
except ImportError:
    # Fallback for standalone execution
    import sys
    from pathlib import Path
    this_file = Path(__file__).resolve()
    api_root = this_file.parents[1]  # .../API-test-space
    if str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))
    from capabilities.base import CapResult, Capability, add_utils_to_syspath, timestamp

add_utils_to_syspath()

try:
    from selenium_ui_controls import HighPriorityControls
except Exception:
    try:
        # Try absolute import when run as standalone script
        sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
        from utils.selenium_ui_controls import HighPriorityControls
    except Exception:
        HighPriorityControls = None  # type: ignore

try:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.keys import Keys
except Exception:
    By = None  # type: ignore
    ActionChains = None  # type: ignore
    Keys = None  # type: ignore

class TF_Dropdown_Open_Close_Screenshot(Capability):
    """
    Capability: Complete dropdown open/close/screenshot workflow automation.

    Interface inputs:
      - None (automated workflow execution)

    Behavior:
      1. Connects to existing Chrome session (port 9222) like data_streaming_csv_save.py
      2. Opens timeframe dropdown using TF_dropdown_retract.py pattern
      3. Waits 3 seconds (to show dropdown options)
      4. Closes timeframe dropdown using TF_dropdown_retract.py pattern
      5. Waits 3 seconds (for clean screen)
      6. Takes screenshot and saves directly in screenshots/ directory with timestamp

    Combines session connection from data_streaming_csv_save.py with
    dropdown operations from TF_dropdown_retract.py and screenshot capture.
    Kind: "control-read"
    """
    id: str = "tf_dropdown_open_close_screenshot"
    kind: str = "control-read"

    def __init__(self):
        # Store button references like TF_dropdown_retract.py
        self._stored_buttons: Dict[str, Any] = {}

    def run(self, ctx: Any, inputs: Dict[str, Any]) -> CapResult:
        """
        Execute the complete dropdown open/close/screenshot automation workflow.

        Workflow:
        1. Connect to Chrome session (port 9222)
        2. Open timeframe dropdown
        3. Wait 3 seconds (show dropdown options)
        4. Close timeframe dropdown
        5. Wait 3 seconds (clean screen)
        6. Take screenshot and save in screenshots/ directory
        """
        data: Dict[str, Any] = {
            "operation": "dropdown_open_close_screenshot",
            "workflow_steps": [],
            "timestamp": timestamp(),
            "screenshot_saved": False,
            "filepath": None
        }
        artifacts: List[str] = []

        try:
            # Step 1: Connect to Chrome session and verify (following data_streaming pattern)
            if ctx.verbose:
                print(f"[{self.id}] Step 1: Connected to Chrome session - starting dropdown workflow...")

            # Brief pause for session stability
            time.sleep(0.5)
            data["workflow_steps"].append({"step": 1, "action": "connect_and_stabilize", "status": "completed"})

            # Step 2: Open timeframe dropdown (using TF_dropdown_retract pattern)
            if ctx.verbose:
                print(f"[{self.id}] Step 2: Opening timeframe dropdown...")

            open_result, open_meta = self._open_dropdown(ctx, store_button=True, verbose=ctx.verbose)

            data["workflow_steps"].append({
                "step": 2,
                "action": "open_dropdown",
                "status": "completed" if open_result else "failed",
                "meta": open_meta
            })

            if not open_result:
                return CapResult(
                    ok=False,
                    data=data,
                    error="Failed to open timeframe dropdown",
                    artifacts=tuple(artifacts)
                )

            # Step 3: Wait 3 seconds (show dropdown options to user)
            if ctx.verbose:
                print(f"[{self.id}] Step 3: Waiting 3 seconds (dropdown open)...")

            time.sleep(3.0)  # Exactly 3 seconds as requested
            data["workflow_steps"].append({"step": 3, "action": "wait_3_seconds_open", "wait_seconds": 3})

            # Step 4: Close timeframe dropdown (using TF_dropdown_retract pattern)
            if ctx.verbose:
                print(f"[{self.id}] Step 4: Closing timeframe dropdown...")

            close_result, close_meta = self._close_dropdown(ctx, verbose=ctx.verbose)

            data["workflow_steps"].append({
                "step": 4,
                "action": "close_dropdown",
                "status": "completed" if close_result else "failed",
                "meta": close_meta
            })

            if not close_result:
                return CapResult(
                    ok=False,
                    data=data,
                    error="Failed to close timeframe dropdown",
                    artifacts=tuple(artifacts)
                )

            # Step 4.5: Verify dropdown stays closed (prevent re-opening)
            if ctx.verbose:
                print(f"[{self.id}] Step 4.5: Verifying dropdown remains closed...")

            # Double check that dropdown is still closed a short time after closing
            time.sleep(0.5)  # Brief settling time

            # Re-check dropdown status and re-close if necessary
            is_still_closed = self._is_dropdown_closed(ctx.driver)
            if not is_still_closed:
                if ctx.verbose:
                    print(f"[{self.id}] ⚠️ Dropdown reopened, attempting second close...")

                # Try one more close attempt
                retry_result, retry_meta = self._close_dropdown(ctx, verbose=ctx.verbose)
                data["workflow_steps"].append({
                    "step": "4.5",
                    "action": "dropdown_closure_retry",
                    "status": "completed" if retry_result else "failed",
                    "meta": retry_meta
                })

                if not retry_result:
                    return CapResult(
                        ok=False,
                        data=data,
                        error="Dropdown reopened after close and failed retry",
                        artifacts=tuple(artifacts)
                    )

                time.sleep(0.2)  # Brief settling time before moving on

            # Step 4.6: Final verification before screenshot (extended check)
            if ctx.verbose:
                print(f"[{self.id}] Step 4.6: Final dropdown check before screenshot...")

            # Do multiple checks over the remaining wait period
            final_checks = 0
            final_checks_passed = 0
            check_interval = 0.3  # Check every 0.3 seconds
            remaining_wait = 2.5
            total_checks = int(remaining_wait / check_interval)

            for check_idx in range(total_checks):
                time.sleep(check_interval)
                remaining_wait -= check_interval

                # ⚠️ CRITICAL FIX: Check state ONCE per iteration ⚠️
                is_closed = self._is_dropdown_closed(ctx.driver)

                if is_closed:
                    final_checks_passed += 1
                else:
                    if ctx.verbose:
                        print(f"[{self.id}] 🚨 Dropdown detected open at {check_idx + 1}/{total_checks}, attempting emergency close...")

                    # Only attempt close when we KNOW dropdown is open (no redundant check!)
                    emergency_result, emergency_meta = self._close_dropdown(ctx, verbose=False)
                    data["workflow_steps"].append({
                        "step": f"4.6.{check_idx + 1}",
                        "action": "emergency_dropdown_close",
                        "status": "completed" if emergency_result else "failed",
                        "meta": emergency_meta
                    })

                    if emergency_result:
                        # Wait a bit after emergency close
                        time.sleep(0.5)
                        if ctx.verbose:
                            print(f"[{self.id}] ✅ Emergency close successful")
                    else:
                        if ctx.verbose:
                            print(f"[{self.id}] ❌ Emergency close failed - proceeding with risky screenshot")

                final_checks += 1

            # Log final verification status
            final_verification_rate = final_checks_passed / final_checks if final_checks > 0 else 0
            data["workflow_steps"].append({
                "step": "4.6_final",
                "action": "final_dropdown_verification",
                "status": "passed" if final_verification_rate >= 0.8 else "warning",
                "checks_passed": final_checks_passed,
                "total_checks": final_checks,
                "success_rate": float(f"{final_verification_rate:.2f}")
            })

            if ctx.verbose:
                print(f"[{self.id}] Final verification: {final_checks_passed}/{final_checks} checks passed ({final_verification_rate:.1%})")

            # Step 5: Wait remaining 2.5 seconds (total 3 seconds from dropdown close start)
            remaining_wait = 2.5
            if ctx.verbose:
                print(f"[{self.id}] Step 5: Waiting {remaining_wait} seconds (clean screen)...")

            time.sleep(remaining_wait)
            data["workflow_steps"].append({"step": 5, "action": "wait_clean_screen", "wait_seconds": remaining_wait})

            # Step 6: Take screenshot (save in screenshots/ directory)
            if ctx.verbose:
                print(f"[{self.id}] Step 6: Taking screenshot...")

            screenshot_result, screenshot_meta = self._take_screenshot(ctx)

            data["workflow_steps"].append({
                "step": 6,
                "action": "take_screenshot",
                "status": "completed" if screenshot_result else "failed",
                "meta": screenshot_meta
            })

            # Update data with results
            data["screenshot_saved"] = screenshot_result
            if screenshot_result and screenshot_meta.get("path"):
                artifacts.append(screenshot_meta["path"])
                data["filepath"] = screenshot_meta["path"]
                data["filename"] = screenshot_meta["filename"]
                data["filesize"] = screenshot_meta["filesize"]

            if ctx.verbose:
                if screenshot_result:
                    print(f"[{self.id}] ✅ Screenshot saved: {screenshot_meta['path']}")
                else:
                    print(f"[{self.id}] ❌ Screenshot failed: {screenshot_meta.get('error', 'Unknown error')}")

            # Workflow complete
            data["workflow_steps"].append({
                "step": 7,
                "action": "workflow_complete",
                "total_steps": 6,
                "success": screenshot_result
            })

            return CapResult(
                ok=screenshot_result,
                data=data,
                error=None if screenshot_result else f"Screenshot failed: {screenshot_meta.get('error', 'Unknown')}",
                artifacts=tuple(artifacts)
            )

        except Exception as e:
            data["error"] = str(e)
            data["workflow_steps"].append({
                "step": "error",
                "action": "workflow_failed",
                "error": str(e)
            })
            return CapResult(
                ok=False,
                data=data,
                error=f"Workflow error: {str(e)}",
                artifacts=tuple(artifacts)
            )

    # ===== TF_dropdown_retract.py dropdown methods integrated =====

    def _open_dropdown(self, ctx: Any, store_button: bool = True, verbose: bool = True) -> Tuple[bool, Dict[str, Any]]:
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
            "opened": ok,
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

        return ok, data

    def _close_dropdown(self, ctx: Any, verbose: bool = True) -> Tuple[bool, Dict[str, Any]]:
        """Close the dropdown using robust strategies (Actions offsets, JS events, blind click, ESC)."""
        button_key = f"tf_dropdown_button_{id(ctx.driver)}"
        stored_button = self._stored_buttons.get(button_key)

        if not stored_button:
            return False, {"closed": False, "error": "No stored button found. Call 'open' action first."}

        drv = ctx.driver
        attempts: List[Dict[str, Any]] = []

        def dropdown_open() -> bool:
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
                    return false;
                """))
            except Exception:
                # If we cannot detect, don't block closure
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
                            closed = not dropdown_open()
                            attempts.append({"strategy": "actions_offset", "offset": [int(ox), int(oy)], "ok": closed})
                            if closed:
                                # Don't delete button yet - wait until we're sure it's properly closed
                                return True, {"closed": True, "method": "actions_offset", "attempts": attempts, "button_preserved": True}
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
                closed = not dropdown_open()
                attempts.append({"strategy": "js_dispatch", "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return True, {"closed": True, "method": "js_dispatch", "attempts": attempts}
            except Exception as e:
                attempts.append({"strategy": "js_dispatch", "ok": False, "error": str(e)})

            # Strategy 3: JS click on the opening button
            try:
                drv.execute_script("arguments[0].click();", stored_button)
                closed = not dropdown_open()
                attempts.append({"strategy": "js_click", "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return True, {"closed": True, "method": "js_click", "attempts": attempts}
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
                closed = not dropdown_open()
                attempts.append({"strategy": "blind_center_click", "performed": bool(res), "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return True, {"closed": True, "method": "blind_center_click", "attempts": attempts}
            except Exception as e:
                attempts.append({"strategy": "blind_center_click", "ok": False, "error": str(e)})

            # Strategy 5: ESC key
            try:
                if Keys is not None:
                    drv.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                    closed = not dropdown_open()
                    attempts.append({"strategy": "escape_key", "ok": closed})
                    if closed:
                        del self._stored_buttons[button_key]
                        return True, {"closed": True, "method": "escape_key", "attempts": attempts}
            except Exception as e:
                attempts.append({"strategy": "escape_key", "ok": False, "error": str(e)})

            # Strategy 6: Final fallback - try clicking the button again with a longer delay
            try:
                time.sleep(0.5)  # Wait a bit before final attempt
                ActionChains(drv).move_to_element_with_offset(stored_button, 10, 10).click().perform()
                time.sleep(0.5)  # Wait for any animations
                closed = not dropdown_open()
                attempts.append({"strategy": "final_fallback_click", "ok": closed})
                if closed:
                    del self._stored_buttons[button_key]
                    return True, {"closed": True, "method": "final_fallback_click", "attempts": attempts}
            except Exception as e:
                attempts.append({"strategy": "final_fallback_click", "ok": False, "error": str(e)})

            # If we reach here, closure not confirmed
            return False, {"closed": False, "attempts": attempts, "error": "Failed to retract dropdown reliably"}

        except Exception as e:
            return False, {"closed": False, "attempts": attempts, "error": f"Error closing dropdown: {str(e)}"}

    def _is_dropdown_closed(self, driver) -> bool:
        """Check if the dropdown is closed by verifying no active dropdowns or chart panels are present."""
        def check_closed_once() -> bool:
            try:
                # Check for standard dropdown markers and chart panel in one call
                detection_result = driver.execute_script("""
                    const result = {
                        standard_dropdown_open: false,
                        chart_panel_open: false
                    };

                    // Check for standard dropdown markers
                    const nodes = Array.from(document.querySelectorAll(
                        '.dropdown.open, .dropdown.show, .menu.open, .menu.show, [role="menu"], [role="listbox"]'
                    ));
                    for (const el of nodes) {
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        if (r.width > 5 && r.height > 5 && cs.visibility !== 'hidden' && cs.display !== 'none') {
                            result.standard_dropdown_open = true;
                            break;
                        }
                    }

                    // Check for chart panel overlay (PocketOption specific)
                    const candidates = Array.from(document.querySelectorAll('div, aside, section'));
                    for (const el of candidates) {
                        const cs = getComputedStyle(el);
                        const r = el.getBoundingClientRect();
                        const txt = (el.textContent || '').toLowerCase();

                        // Must be visible, reasonably large, and contain chart-related text
                        if (r.width > 200 && r.height > 150 &&
                            cs.visibility !== 'hidden' && cs.display !== 'none' &&
                            (txt.includes('chart types') || txt.includes('time frames') ||
                             txt.includes('enable timer') || txt.includes('custom candle colors') ||
                             (txt.includes('m1') && txt.includes('m5') && txt.includes('h1')))) {
                            result.chart_panel_open = true;
                            break;
                        }
                    }

                    return result;
                """)

                # Both checks must pass for dropdown to be considered closed
                return not detection_result.get('standard_dropdown_open', False) and not detection_result.get('chart_panel_open', False)

            except Exception:
                return True  # Assume closed if we can't check

        # Check multiple times with small delay to account for animations
        import time
        for _ in range(3):
            if check_closed_once():
                time.sleep(0.1)  # Brief stabilization
                if check_closed_once():  # Double-check
                    return True
            time.sleep(0.05)

        return False  # Still detecting dropdown as open

    def _take_screenshot(self, ctx: Any) -> Tuple[bool, Dict[str, Any]]:
        """
        Take screenshot and save it in the screenshots directory.

        Follows the pattern from other capabilities but saves directly in screenshots/.
        """
        try:
            # Create screenshots directory path (following project structure)
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            shots_dir_abs = os.path.join(project_root, "screenshots")

            # Ensure screenshots directory exists
            os.makedirs(shots_dir_abs, exist_ok=True)

            # Generate filename with timestamp (following naming pattern)
            ts = timestamp()
            filename = f"TF_dropdown_{ts}.png"
            filepath = os.path.join(shots_dir_abs, filename)

            # Take the screenshot using Selenium WebDriver
            success = bool(ctx.driver.save_screenshot(filepath))

            # Gather metadata
            meta = {
                "path": filepath,
                "filename": filename,
                "directory": shots_dir_abs,
                "timestamp": ts,
                "filesize": os.path.getsize(filepath) if success and os.path.exists(filepath) else 0,
            }

            # Success case
            if success:
                return True, meta
            else:
                # Failure case
                meta["error"] = "save_screenshot() returned False"
                return False, meta

        except Exception as e:
            # Exception case
            return False, {"error": str(e), "timestamp": timestamp()}


def build() -> Capability:
    """Factory function to create TF_Dropdown_Open_Close_Screenshot capability instance."""
    return TF_Dropdown_Open_Close_Screenshot()


if __name__ == "__main__":
    import argparse

    def attach_existing_chrome_session(verbose: bool = False):
        """
        Attach to existing Chrome session - following data_streaming_csv_save.py pattern
        """
        try:
            if verbose:
                print("[attach] Preparing to attach to existing Chrome session at 127.0.0.1:9222")
            from selenium.webdriver.chrome.options import Options
            from selenium import webdriver

            options = Options()
            # Enable performance log to read WebSocket frames (like data_streaming_csv_save.py)
            options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

            # Compatibility flags (non-invasive)
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--disable-web-security")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--no-first-run")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-popup-blocking")

            driver = webdriver.Chrome(options=options)
            if verbose:
                print(f"[attach] Attached. Current URL: {getattr(driver, 'current_url', 'unknown')}")
            return driver
        except Exception as e:
            raise RuntimeError(
                f"Failed to attach to existing Chrome session at 127.0.0.1:9222. "
                f"Underlying error: {e}"
            )

    parser = argparse.ArgumentParser(description="Take screenshot and save in screenshots directory")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Attach to running Hybrid Chrome session (following data_streaming_csv_save.py pattern)
    driver = attach_existing_chrome_session(verbose=args.verbose)

    # Build context and inputs (minimal setup)
    artifacts_root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_output")
    ctx = type('Ctx', (), {
        'driver': driver,
        'artifacts_root': artifacts_root,
        'debug': False,
        'dry_run': False,
        'verbose': args.verbose
    })()

    # Create and run capability
    cap = TF_Dropdown_Open_Close_Screenshot()
    inputs = {}

    try:
        res = cap.run(ctx, inputs)

        # Print results
        import json
        output = {
            "ok": res.ok,
            "data": res.data,
            "error": res.error,
            "artifacts": list(res.artifacts) if res.artifacts else []
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))

        # Clean up
        driver.quit()

        if not res.ok:
            exit(1)

    except KeyboardInterrupt:
        print("\nOperation interrupted by user")
        driver.quit()
        exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        driver.quit()
        exit(1)
