"""Selenium UI Controls Helpers for Hybrid Session (Non-invasive Zoom)

This module provides:
- ZoomManager: read-only verification of zoom (no changes applied by default)
- HighPriorityControls: resilient operations for key trading UI controls:
  * Trade Duration/Expiry (default "1 min")
  * Trade Amount
  * Payout indicator reading
  * Buy/Sell button presence and clickability checks
  * Balance and Account Type (DEMO/REAL)
  * Favorites scan for assets with payout ≥ threshold
  * (Optional helper) User profile details via dropdown

IMPORTANT:
- Do NOT modify browser zoom or settings here. ZoomManager.verify() is read-only.
- All outputs must stay under data/data_output/*
"""

from __future__ import annotations

import os
import re
import json
import time
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple, Any

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException


DEFAULT_TIMEOUT = 10  # seconds
LONG_TIMEOUT = 20


class ZoomManager:
    """Read-only zoom utilities. Does NOT change zoom."""

    @staticmethod
    def get_zoom_scale(driver: WebDriver) -> float:
        """Return current visual viewport scale (~0.67 for 67%)."""
        try:
            # Try visual viewport first (most accurate)
            scale = driver.execute_script(
                "return (window.visualViewport && window.visualViewport.scale) || 1;"
            )
            if isinstance(scale, (int, float)) and scale > 0:
                return float(scale)
        except Exception:
            pass

        # Fallback to device pixel ratio approximation
        try:
            dpr = driver.execute_script("return window.devicePixelRatio || 1;")
            return max(0.5, min(2.0, 1.0 / float(dpr)))  # Clamp reasonable range
        except Exception:
            return 1.0

    @staticmethod
    def verify(driver: WebDriver, expected: float = 0.67, tolerance: float = 0.03) -> Tuple[bool, float]:
        """Verify current zoom is approximately expected. Returns (ok, observed_scale)."""
        scale = ZoomManager.get_zoom_scale(driver)
        return (abs(scale - expected) <= tolerance), scale


@dataclass
class PayoutInfo:
    percentage: Optional[int] = None
    raw_text: Optional[str] = None
    payback_text: Optional[str] = None  # e.g. "$19.20" if visible


class HighPriorityControls:
    """
    Encapsulates resilient interactions with high-priority trading controls.
    No actual order placement is performed unless 'confirm=True' is passed to click methods.
    """

    def __init__(self, driver: WebDriver, wait_timeout: int = DEFAULT_TIMEOUT):
        self.driver = driver
        self.wait = WebDriverWait(driver, wait_timeout)

    @staticmethod
    def save_json_under_api_space(filename: str, data: Dict[str, Any], subfolder: Optional[str] = None) -> str:
        """
        Save JSON to project data_output[/subfolder]/filename. Returns absolute path.
        Ensures directories exist.
        """
        try:
            base_dir = os.path.join(os.getcwd(), "data", "data_output")
            if subfolder:
                base_dir = os.path.join(base_dir, subfolder)
            os.makedirs(base_dir, exist_ok=True)
            path = os.path.join(base_dir, filename)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return path
        except Exception:
            # Fallback to cwd if data directory is unavailable
            path = os.path.join(os.getcwd(), filename)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return path

    # ---------- Helper utilities ----------

    def _safe_find(self, by: str, value: str):
        try:
            return self.driver.find_element(by, value)
        except Exception:
            return None

    def _safe_finds(self, by: str, value: str):
        try:
            return self.driver.find_elements(by, value)
        except Exception:
            return []

    def _wait_visible(self, by: str, value: str, timeout: int = DEFAULT_TIMEOUT):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((by, value))
        )

    def _scroll_into_view(self, el):
        try:
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        except Exception:
            pass

    def _find_first_visible(self, strategies: List[Tuple[str, str]]) -> Tuple[Optional[Any], List[Dict[str, Any]], Optional[str], Optional[str]]:
        """Try a list of (strategy, selector) where strategy in {'css','xpath'}. Returns: (element_or_none, attempts, selector_used, selector_detail)"""
        attempts: List[Dict[str, Any]] = []
        for strat, sel in strategies:
            el = self._try_find_element(strat, sel)
            if el and el.is_displayed():
                attempts.append({"strategy": strat, "selector": sel, "ok": True})
                return el, attempts, strat, sel
            attempts.append({"strategy": strat, "selector": sel, "ok": False})
        return None, attempts, None, None

    def _verify_text_presence(self, strategies: List[Tuple[str, str]], expected_text_lower: str) -> Tuple[bool, List[Dict[str, Any]], Optional[str], Optional[str]]:
        """Try to find any node from strategies containing expected_text_lower (case-insensitive). Returns (ok, attempts, selector_used, selector_detail)"""
        attempts: List[Dict[str, Any]] = []
        for strat, sel in strategies:
            node = self._try_find_element(strat, sel)
            txt = ((node.text or "") if node else "").strip().lower()
            ok = bool(node and node.is_displayed() and expected_text_lower in txt)
            attempts.append({"strategy": strat, "selector": sel, "ok": ok})
            if ok:
                return True, attempts, strat, sel
        return False, attempts, None, None

    def _try_find_element(self, strategy: str, selector: str) -> Optional[Any]:
        """Safely find element using strategy and selector."""
        try:
            if strategy == "css":
                return self._safe_find(By.CSS_SELECTOR, selector)
            elif strategy == "xpath":
                return self._safe_find(By.XPATH, selector)
        except Exception:
            pass
        return None

    def _try_find_elements(self, strategy: str, selector: str) -> List[Any]:
        """Safely find elements using strategy and selector."""
        try:
            if strategy == "css":
                return self._safe_finds(By.CSS_SELECTOR, selector)
            elif strategy == "xpath":
                return self._safe_finds(By.XPATH, selector)
        except Exception:
            pass
        return []

    def _click_element_safely(self, element: Any) -> bool:
        """Safely click an element with fallback to JavaScript."""
        try:
            self._scroll_into_view(element)
            element.click()
            return True
        except Exception:
            try:
                self.driver.execute_script("arguments[0].click();", element)
                return True
            except Exception:
                return False

    # ---------- Right Panel (Expand/Verify) ----------

    def _get_element_width(self, el) -> Optional[float]:
        try:
            w = self.driver.execute_script("return arguments[0].getBoundingClientRect().width;", el)
            if isinstance(w, (int, float)):
                return float(w)
        except Exception:
            pass
        try:
            w = self.driver.execute_script("return arguments[0].offsetWidth;", el)
            if isinstance(w, (int, float)):
                return float(w)
        except Exception:
            pass
        return None

    def ensure_right_panel_expanded_with_meta(self, min_width: int = 200) -> Dict[str, Any]:
        """
        Ensure the right-side control panel is expanded/visible.
        We consider it expanded if a detected right-root container has width >= min_width and is displayed.

        Returns:
          {
            ok: bool,
            root_selector_used: str|None,
            root_selector_detail: str|None,
            root_attempts: [...],
            before_width: float|None,
            after_width: float|None,
            toggle_attempts: [...],
          }
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "root_selector_used": None,
            "root_selector_detail": None,
            "root_attempts": [],
            "before_width": None,
            "after_width": None,
            "toggle_attempts": [],
        }

        # Find a right panel root
        right_roots = [
            ("css", ".js-right-block"),
            ("css", ".right-sidebar"),
            ("css", "#js-right-block"),
        ]
        root_el, root_attempts, root_used, root_detail = self._find_first_visible(right_roots)
        meta["root_attempts"] = root_attempts
        meta["root_selector_used"] = root_used
        meta["root_selector_detail"] = root_detail

        if not root_el:
            return meta

        width_before = self._get_element_width(root_el)
        meta["before_width"] = width_before
        try:
            displayed = root_el.is_displayed()
        except Exception:
            displayed = False

        if displayed and (width_before is not None) and (width_before >= float(min_width)):
            meta["ok"] = True
            meta["after_width"] = width_before
            return meta

        # Try to expand via common toggle selectors (best-effort)
        toggle_selectors = [
            ".right-block__toggle",
            ".right-sidebar__toggle",
            ".toggle-right-panel",
            ".js-right-block-toggle",
            ".sidebar-toggle",
            "button[aria-label*='panel']",
            ".chevron, .chevron-right, .chevron-left",
            ".arrow, .arrow-right, .arrow-left",
        ]
        clicked = False
        for sel in toggle_selectors:
            try:
                els = self.driver.find_elements(By.CSS_SELECTOR, sel)
            except Exception:
                els = []
            for e in els:
                ok = False
                try:
                    if e.is_displayed() and e.is_enabled():
                        self._scroll_into_view(e)
                        e.click()
                        ok = True
                        clicked = True
                        meta["toggle_attempts"].append({"selector": sel, "ok": True})
                        break
                except Exception:
                    ok = False
                if not ok:
                    meta["toggle_attempts"].append({"selector": sel, "ok": False})
            if clicked:
                break

        # Re-measure
        try:
            root_el = self._safe_find(By.CSS_SELECTOR, meta["root_selector_detail"]) if (meta["root_selector_used"] == "css" and meta["root_selector_detail"]) else root_el
        except Exception:
            pass
        width_after = self._get_element_width(root_el) if root_el else None
        meta["after_width"] = width_after
        try:
            displayed_after = root_el.is_displayed() if root_el else False
        except Exception:
            displayed_after = False

        if displayed_after and (width_after is not None) and (width_after >= float(min_width)):
            meta["ok"] = True

        return meta

    def ensure_right_panel_expanded(self, min_width: int = 200) -> bool:
        """Boolean wrapper for ensure_right_panel_expanded_with_meta()."""
        meta = self.ensure_right_panel_expanded_with_meta(min_width=min_width)
        return bool(meta.get("ok"))

    # ---------- Trade Duration / Expiry ----------

    def _find_time_control(self) -> Tuple[Optional[Any], Dict[str, Any]]:
        """Find the time/duration control element. Returns (element, metadata)."""
        # Common time control strategies
        time_strategies = [
            # Label-based strategies
            ("xpath", "//*[normalize-space(.)='Time']/following::*[(self::button or self::div or self::input or self::span)][1]"),
            ("xpath", "//*[contains(normalize-space(.), 'Time')]/following::*[(self::button or self::div or self::input)][1]"),
            ("css", ".time"),
            ("xpath", "//*[contains(@aria-label,'Time')]"),

            # Duration/expiry synonyms
            ("xpath", "//*[contains(translate(normalize-space(.), 'DURATION','duration'), 'duration')]/following::*[(self::button or self::div or self::input)][1]"),
            ("xpath", "//*[contains(translate(normalize-space(.), 'EXPIRY','expiry'), 'expiry')]/following::*[(self::button or self::div or self::input)][1]"),
            ("xpath", "//*[contains(translate(normalize-space(.), 'EXPIRATION','expiration'), 'expiration')]/following::*[(self::button or self::div or self::input)][1]"),
            ("css", "[aria-label*='Duration'], [aria-label*='Expiry'], [aria-label*='Expiration']"),
            ("css", ".duration, .expiry, .expiration, .expire, .time-input, .expiration__time"),
        ]

        element, attempts, used, detail = self._find_first_visible(time_strategies)
        return element, {
            "attempts": attempts,
            "selector_used": used,
            "selector_detail": detail
        }

    def _select_time_option(self, control_element: Any) -> Tuple[Optional[Any], Dict[str, Any]]:
        """Select '1 min' option from time control. Returns (selected_option, metadata)."""
        option_strategies = [
            ("xpath", "//*[normalize-space(text())='1 min']"),
            ("xpath", "//*[contains(normalize-space(.), '1 min')]"),
            ("xpath", "//*[contains(normalize-space(.), '1 m')]"),
            ("xpath", "//*[normalize-space(text())='01:00' or normalize-space(text())='00:01:00']"),
        ]

        # Look for dropdown containers first
        container_selectors = [
            "//*[contains(@class,'dropdown') or contains(@class,'popover') or contains(@class,'popup') or contains(@class,'menu') or @role='listbox']",
            "//*[@role='menu' or @role='listbox']",
        ]

        containers = []
        for csel in container_selectors:
            containers.extend(self._try_find_elements("xpath", csel))

        # Search in containers first, then globally
        for container in containers + [None]:  # None represents global search
            for strategy, selector in option_strategies:
                elements = container.find_elements(By.XPATH, selector) if container else self._try_find_elements(strategy, selector)
                for element in elements:
                    if element.is_displayed():
                        return element, {"strategy": strategy, "selector": selector, "scope": "container" if container else "global"}

        return None, {"error": "No 1 min option found"}

    def _verify_time_selection(self) -> bool:
        """Verify that '1 min' is currently selected."""
        verify_strategies = [
            ("xpath", "//*[contains(normalize-space(.), 'Time')]/following::*[contains(normalize-space(.), '1 min')][1]"),
            ("xpath", "//*[contains(@class,'time') and contains(normalize-space(.), '1 min')]"),
            ("xpath", "//*[contains(normalize-space(.), '1 m')]"),
            ("xpath", "//*[contains(normalize-space(.), '01:00') or contains(normalize-space(.), '00:01:00')]"),
        ]
        ok, _, _, _ = self._verify_text_presence(verify_strategies, "1 min")
        return ok

    def ensure_trade_duration_1min_with_meta(self) -> Dict[str, Any]:
        """Ensure the 'Trade Duration/Expiry' control shows '1 min'. Returns dict with ok/value and selector provenance."""
        meta: Dict[str, Any] = {"ok": False, "value": None}

        # Ensure right panel is expanded
        meta["right_panel_expanded"] = self.ensure_right_panel_expanded(min_width=200)

        # Find and click the time control
        control_element, control_meta = self._find_time_control()
        meta.update(control_meta)

        if not control_element:
            return meta

        # Click the control to open options
        self._click_element_safely(control_element)

        # Select '1 min' option
        option_element, option_meta = self._select_time_option(control_element)
        meta["option_meta"] = option_meta

        if option_element:
            self._click_element_safely(option_element)
            time.sleep(0.2)  # Brief wait for selection to apply

        # Verify selection
        if self._verify_time_selection():
            meta["ok"] = True
            meta["value"] = "1 min"
        else:
            # Simple retry: try once more
            if control_element:
                self._click_element_safely(control_element)
                option_element, _ = self._select_time_option(control_element)
                if option_element:
                    self._click_element_safely(option_element)
                    time.sleep(0.2)
                    meta["ok"] = self._verify_time_selection()
                    meta["value"] = "1 min" if meta["ok"] else None

        return meta

    def ensure_trade_duration_1min(self) -> bool:
        """Convenience boolean wrapper for ensure_trade_duration_1min_with_meta()."""
        meta = self.ensure_trade_duration_1min_with_meta()
        return bool(meta.get("ok"))

    def probe_trade_duration_candidates_with_meta(self, limit: int = 25) -> Dict[str, Any]:
        """
        Discover potential 'Trade Duration/Expiry' controls.
        Scans within right panel (.js-right-block/.right-sidebar/#js-right-block) and globally for:
          - Common classes: .time, .timer, .duration, .expiry, .expiration, .expire
          - ARIA labels: [aria-label*='Time'|'Duration'|'Expiry'|'Expiration']
          - Text patterns: contains 'min', '1 m', '01:00', '00:01:00'
        Returns a dict with lists of matches including selector, text, and outerHTML snippet.
        """
        def clip(s: Optional[str], n: int = 400) -> Optional[str]:
            if not s:
                return None
            return s if len(s) <= n else s[:n] + "..."

        results: Dict[str, Any] = {
            "right_root": None,
            "right_root_attempts": [],
            "right_matches": [],
            "global_matches": [],
        }

        # Detect right root
        right_roots = [
            ("css", ".js-right-block"),
            ("css", ".right-sidebar"),
            ("css", "#js-right-block"),
        ]
        right_root_el = None
        for strat, sel in right_roots:
            try:
                el = self._safe_find(By.CSS_SELECTOR, sel) if strat == "css" else self._safe_find(By.XPATH, sel)
                ok = bool(el and el.is_displayed())
                results["right_root_attempts"].append({"strategy": strat, "selector": sel, "ok": ok})
                if ok and not right_root_el:
                    right_root_el = el
                    results["right_root"] = {"strategy": strat, "selector": sel}
            except Exception:
                results["right_root_attempts"].append({"strategy": strat, "selector": sel, "ok": False})

        css_classes = [
            ".time", ".timer", ".duration", ".expiry", ".expiration", ".expire",
            "[aria-label*='Time']", "[aria-label*='Duration']", "[aria-label*='Expiry']", "[aria-label*='Expiration']",
        ]
        xpath_texts = [
            "//*[contains(translate(normalize-space(.), 'MIN', 'min'), 'min')]",
            "//*[contains(normalize-space(.), '1 m')]",
            "//*[normalize-space(text())='01:00' or normalize-space(text())='00:01:00']",
        ]

        # Helper to collect matches from a container or document
        def collect_from_container(container, scope_label: str):
            collected = []
            # CSS strategies
            for css_sel in css_classes:
                try:
                    els = container.find_elements(By.CSS_SELECTOR, css_sel) if container is not None else self.driver.find_elements(By.CSS_SELECTOR, css_sel)
                except Exception:
                    els = []
                for el in els:
                    try:
                        if not el.is_displayed():
                            continue
                        txt = (el.text or "").strip()
                        html = el.get_attribute("outerHTML") or ""
                        collected.append({
                            "scope": scope_label,
                            "strategy": "css",
                            "selector": css_sel,
                            "text": txt,
                            "outer_html": clip(html)
                        })
                        if len(collected) >= limit:
                            return collected
                    except Exception:
                        continue
                if len(collected) >= limit:
                    return collected
            # XPath text strategies
            for xp in xpath_texts:
                try:
                    els = container.find_elements(By.XPATH, xp) if container is not None else self.driver.find_elements(By.XPATH, xp)
                except Exception:
                    els = []
                for el in els:
                    try:
                        if not el.is_displayed():
                            continue
                        txt = (el.text or "").strip()
                        html = el.get_attribute("outerHTML") or ""
                        collected.append({
                            "scope": scope_label,
                            "strategy": "xpath",
                            "selector": xp,
                            "text": txt,
                            "outer_html": clip(html)
                        })
                        if len(collected) >= limit:
                            return collected
                    except Exception:
                        continue
                if len(collected) >= limit:
                    return collected
            return collected

        # Collect within right root if available
        if right_root_el:
            try:
                results["right_matches"] = collect_from_container(right_root_el, "right")
            except Exception:
                results["right_matches"] = []

        # Collect globally
        try:
            results["global_matches"] = collect_from_container(None, "global")
        except Exception:
            results["global_matches"] = []

        return results

    # Backward compatibility (deprecated)
    def set_timeframe_1min(self) -> bool:
        """Deprecated: use ensure_trade_duration_1min() instead."""
        return self.ensure_trade_duration_1min()

    # ---------- Trade Amount ----------

    def _set_input_value_safely(self, element: Any, value: str, retries: int = 3) -> Dict[str, Any]:
        """Safely set input value with retries and fallback to JavaScript."""
        result = {"success": False, "js_fallback": False, "attempts": []}

        for attempt in range(retries):
            try:
                # Clear field thoroughly
                element.click()
                element.send_keys(Keys.CONTROL, "a")
                element.send_keys(Keys.BACKSPACE)
                element.clear()

                # Set new value
                element.send_keys(value)

                # Blur to trigger formatting
                self.driver.execute_script("document.activeElement && document.activeElement.blur();")

                # Verify value was set
                set_value = (element.get_attribute("value") or "").strip()
                if set_value == value or abs(float(set_value.replace(",", ".")) - float(value)) < 1e-6:
                    result["success"] = True
                    result["attempts"].append({"attempt": attempt + 1, "method": "native", "ok": True})
                    return result

            except Exception:
                pass

            result["attempts"].append({"attempt": attempt + 1, "method": "native", "ok": False})

        # JavaScript fallback
        try:
            self.driver.execute_script(
                "arguments[0].value = arguments[1];"
                "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));"
                "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
                element, value
            )
            result["success"] = True
            result["js_fallback"] = True
        except Exception as e:
            result["js_error"] = str(e)

        return result

    def set_trade_amount_with_meta(self, amount: float) -> Dict[str, Any]:
        """Set the trade amount under the 'Amount' label. Returns dict with ok and locator attempts."""
        meta: Dict[str, Any] = {"ok": False, "value": amount}

        # Find amount input field
        amount_strategies = [
            ("xpath", "//*[contains(normalize-space(.), 'Amount')]/following::input[1]"),
            ("xpath", "//*[contains(@class,'amount')]//input"),
            ("xpath", "//input[contains(@placeholder,'Amount') or contains(@aria-label,'Amount')]"),
        ]

        amount_field, attempts, used, detail = self._find_first_visible(amount_strategies)
        meta.update({"attempts": attempts, "selector_used": used, "selector_detail": detail})

        if not amount_field:
            return meta

        # Set the amount value
        self._scroll_into_view(amount_field)
        set_result = self._set_input_value_safely(amount_field, str(amount))
        meta.update(set_result)

        meta["ok"] = set_result["success"]
        return meta

    # ---------- Payout Indicator Reading ----------

    def read_payout_indicator_with_meta(self) -> Dict[str, Any]:
        """
        Read the payout indicator (percentage and payback) from the current asset context.
        Returns dict with percentage, payback, and locator attempts.
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "percentage": None,
            "payback_text": None,
            "selector_used": None,
            "selector_detail": None,
            "attempts": [],
        }

        # Common payout indicator strategies
        strategies = [
            ("css", ".payout__number"),
            ("xpath", "//*[contains(@class,'payout') and contains(@class,'number')]"),
            ("xpath", "//*[contains(normalize-space(.), '%')]"),
        ]

        payout_el, attempts, used, detail = self._find_first_visible(strategies)
        meta["attempts"] = attempts
        meta["selector_used"] = used
        meta["selector_detail"] = detail

        if not payout_el:
            return meta

        try:
            text = (payout_el.text or "").strip()
            # Extract percentage (e.g., "+92" -> 92)
            pct_match = re.search(r'(\d+)', text)
            if pct_match:
                meta["percentage"] = int(pct_match.group(1))
                meta["ok"] = True

            # Look for payback text nearby (e.g., "$19.20")
            try:
                payback_candidates = payout_el.find_elements(By.XPATH, "following-sibling::*[contains(normalize-space(.), '$')]")
                if payback_candidates:
                    meta["payback_text"] = (payback_candidates[0].text or "").strip()
            except Exception:
                pass

        except Exception as e:
            meta["error"] = str(e)

        return meta

    def read_payout_indicator(self) -> Optional[PayoutInfo]:
        """Convenience wrapper for read_payout_indicator_with_meta()."""
        meta = self.read_payout_indicator_with_meta()
        if meta.get("ok"):
            return PayoutInfo(
                percentage=meta.get("percentage"),
                raw_text=meta.get("raw_text"),
                payback_text=meta.get("payback_text")
            )
        return None

    # ---------- Chart/Timeframe Dropdown Button ----------

    def find_chart_timeframe_dropdown_with_meta(self) -> Dict[str, Any]:
        """
        Find the chart/timeframe dropdown button (the one that opens chart types and timeframe options).
        This is typically located in the top-left area of the chart interface.
        Returns dict with button info and locator attempts.
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "button_found": False,
            "button_element": None,
            "selector_used": None,
            "selector_detail": None,
            "attempts": [],
        }

        # Chart/timeframe dropdown button strategies
        # Based on common patterns for buttons that open chart controls
        strategies = [
            # PocketOption specific selector (user provided)
            ("css", "a.items__link--chart-type"),

            # Common chart control button patterns
            ("css", "button[class*='chart'][class*='control'], button[class*='timeframe'][class*='toggle']"),
            ("css", ".chart-controls button, .timeframe-controls button"),
            ("css", "button[aria-label*='Chart'], button[aria-label*='Time']"),
            ("css", ".chart-toolbar button, .toolbar-chart button"),

            # Icon-based buttons (hamburger menu style)
            ("css", "button[class*='menu'][class*='chart'], button[class*='dropdown'][class*='chart']"),
            ("css", ".chart-menu-button, .timeframe-menu-button"),

            # Position-based (top-left area of chart)
            ("xpath", "//div[contains(@class,'chart')]/preceding::button[1]"),
            ("xpath", "//canvas/preceding::button[1]"),

            # Generic chart control patterns
            ("css", "button[data-testid*='chart'], button[data-testid*='timeframe']"),
            ("css", ".tradingview-widget button, .chart-widget button"),

            # Fallback patterns for timeframe buttons
            ("css", "[aria-label*='Time'], [aria-label*='Chart']"),
            ("css", "button[title*='Time'], button[title*='Chart']"),
        ]

        button_el, attempts, used, detail = self._find_first_visible(strategies)
        meta["attempts"] = attempts
        meta["selector_used"] = used
        meta["selector_detail"] = detail

        if button_el:
            meta["button_found"] = True
            meta["button_element"] = button_el
            meta["ok"] = True

            # Additional metadata about the button
            try:
                meta["button_text"] = (button_el.text or "").strip()
                meta["button_tag"] = button_el.tag_name
                meta["button_classes"] = button_el.get_attribute("class") or ""
                meta["button_aria_label"] = button_el.get_attribute("aria-label") or ""
                meta["button_title"] = button_el.get_attribute("title") or ""
                meta["button_enabled"] = button_el.is_enabled()
                meta["button_displayed"] = button_el.is_displayed()
            except Exception as e:
                meta["button_metadata_error"] = str(e)

        return meta

    def find_chart_timeframe_dropdown(self) -> Optional[Any]:
        """Convenience wrapper for find_chart_timeframe_dropdown_with_meta()."""
        meta = self.find_chart_timeframe_dropdown_with_meta()
        return meta.get("button_element") if meta.get("ok") else None

    def click_chart_timeframe_dropdown_with_meta(self) -> Dict[str, Any]:
        """
        Click the chart/timeframe dropdown button and return metadata.
        Returns dict with click results and button info.
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "clicked": False,
            "dropdown_opened": False,
            "button_found": False,
            "click_attempts": [],
        }

        # First find the button
        find_meta = self.find_chart_timeframe_dropdown_with_meta()
        # Preserve the actual WebElement and rich metadata so other capabilities can close the dropdown
        meta.update({k: v for k, v in find_meta.items() if k in [
            "button_found",
            "selector_used",
            "selector_detail",
            "attempts",
            "button_element",
            "button_text",
            "button_tag",
            "button_classes",
            "button_aria_label",
            "button_title",
            "button_enabled",
            "button_displayed",
        ]})

        if not find_meta.get("button_found") or not find_meta.get("button_element"):
            meta["error"] = "Chart/timeframe dropdown button not found"
            return meta

        button_el = find_meta["button_element"]
        meta["button_found"] = True

        # Try to click the button
        try:
            self._scroll_into_view(button_el)

            # Try regular click first
            try:
                button_el.click()
                meta["clicked"] = True
                meta["click_method"] = "native"
            except Exception:
                # Fallback to JavaScript click
                self.driver.execute_script("arguments[0].click();", button_el)
                meta["clicked"] = True
                meta["click_method"] = "javascript"

            # Brief wait for dropdown to open
            time.sleep(0.3)

            # Verify dropdown opened by looking for common dropdown indicators
            dropdown_indicators = [
                ("css", ".dropdown.open, .dropdown.show, .menu.open, .menu.show"),
                ("css", "[role='menu'], [role='listbox']"),
                ("xpath", "//*[contains(@class,'dropdown') and contains(@class,'open')]"),
                ("xpath", "//div[contains(@class,'chart-types') or contains(@class,'timeframes')]"),
            ]

            dropdown_el, _, _, _ = self._find_first_visible(dropdown_indicators)
            if dropdown_el:
                meta["dropdown_opened"] = True
                meta["ok"] = True

        except Exception as e:
            meta["click_error"] = str(e)

        return meta

    def click_chart_timeframe_dropdown(self) -> bool:
        """Convenience wrapper for click_chart_timeframe_dropdown_with_meta()."""
        meta = self.click_chart_timeframe_dropdown_with_meta()
        return bool(meta.get("ok"))

    # ---------- Buy/Sell Button Presence and Clickability ----------

    def _check_button_presence(self, strategies: List[Tuple[str, str]]) -> Dict[str, Any]:
        """Check for button presence and clickability. Returns button info dict."""
        element, attempts, used, detail = self._find_first_visible(strategies)

        result = {
            "ok": element is not None,
            "clickable": False,
            "selector_used": used,
            "selector_detail": detail,
            "attempts": attempts
        }

        if element:
            try:
                result["clickable"] = element.is_enabled() and element.is_displayed()
            except Exception:
                result["clickable"] = False

        return result

    def check_buy_sell_buttons_with_meta(self) -> Dict[str, Any]:
        """Check presence and clickability of Buy/Sell buttons. Returns dict with button states."""
        # Buy button strategies
        buy_strategies = [
            ("xpath", "(//*[self::button or self::div][contains(translate(normalize-space(.),'BUY','buy'),'buy')])[1]"),
            ("xpath", "(//*[self::button or self::div][contains(@class,'buy')])[1]"),
            ("css", "button.buy, .button--buy, .trade-button--buy, .action_buy, .btn-buy, .green"),
        ]

        # Sell button strategies
        sell_strategies = [
            ("xpath", "(//*[self::button or self::div][contains(translate(normalize-space(.),'SELL','sell'),'sell')])[1]"),
            ("xpath", "(//*[self::button or self::div][contains(@class,'sell')])[1]"),
            ("css", "button.sell, .button--sell, .trade-button--sell, .action_sell, .btn-sell, .red"),
        ]

        return {
            "buy": self._check_button_presence(buy_strategies),
            "sell": self._check_button_presence(sell_strategies)
        }

    # ---------- Favorites Scan ----------

    def scan_favorites_for_payout(self, min_pct: int = 92) -> List[Dict[str, Any]]:
        """
        Scan favorites bar for assets with payout >= min_pct.
        Uses scoped navigation to avoid interfering with other UI elements.
        Returns list of dicts with asset name and payout info.
        """
        results = []
        seen_assets = set()  # Track assets we've already seen to avoid duplicates

        try:
            # Start by resetting to the leftmost position using scoped navigation
            self.scroll_favorites_reset_left()

            # Scan all pages using scoped right navigation
            while True:
                # Find favorites items on current page
                current_page_assets = []
                items = self.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                for item in items:
                    try:
                        # Get asset label
                        label_el = item.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        asset_name = (label_el.text or "").strip()

                        # Get payout percentage
                        payout_el = item.find_element(By.CSS_SELECTOR, ".payout__number")
                        pct_raw = (payout_el.text or "").strip().replace("+", "").replace("%", "")
                        pct = int("".join(ch for ch in pct_raw if ch.isdigit())) if pct_raw else None

                        if pct is not None and pct >= min_pct and asset_name not in seen_assets:
                            asset_info = {
                                "asset": asset_name,
                                "payout_percent": pct
                            }
                            current_page_assets.append(asset_info)
                            seen_assets.add(asset_name)

                    except Exception:
                        continue

                results.extend(current_page_assets)

                # Try to scroll to the right to find more assets using scoped navigation
                if not self.scroll_favorites_right_scoped():
                    # No more scrolling possible, we're done
                    break

                # Small delay to let the page update
                time.sleep(0.2)

        except Exception:
            pass

        # Note: We don't reset to leftmost position at the end to avoid interfering
        # with subsequent operations. The caller can reset if needed.

        return results

    def _favorites_context(self) -> Dict[str, Any]:
        """Find favorites container and navigation buttons. Returns scoped context."""
        # Find visible favorites items
        visible_items = [item for item in self._try_find_elements("css", ".assets-favorites-item__line") if item.is_displayed()]

        if not visible_items:
            return {"container": None, "left": None, "right": None}

        # Find scrollable container
        container = self._find_scrollable_container(visible_items[0])

        if not container:
            return {"container": None, "left": None, "right": None}

        # Find navigation buttons
        left_btn = self._find_navigation_button(container, ["left"])
        if not left_btn:
            left_btn = self._find_navigation_button_near(container, ["left"])
        right_btn = self._find_navigation_button(container, ["right", "chevron-right"])
        if not right_btn:
            right_btn = self._find_navigation_button_near(container, ["right", "chevron-right"])
        return {
            "container": container,
            "left": left_btn,
            "right": right_btn
        }

    def _find_scrollable_container(self, start_element: Any) -> Optional[Any]:
        """Find scrollable container by traversing up from start element."""
        current = start_element
        for _ in range(5):
            try:
                scroll_info = self.driver.execute_script("""
                    var el = arguments[0];
                    return {
                        scrollWidth: el.scrollWidth || 0,
                        clientWidth: el.clientWidth || 0,
                        overflowX: window.getComputedStyle(el).overflowX || 'visible'
                    };
                """, current)

                if (scroll_info.get('scrollWidth', 0) > scroll_info.get('clientWidth', 0) + 5 and
                    scroll_info.get('overflowX') in ['auto', 'scroll']):
                    return current
            except Exception:
                pass

            try:
                current = current.find_element(By.XPATH, "..")
            except Exception:
                break

        return None

    def _find_navigation_button(self, container: Any, direction_keywords: List[str]) -> Optional[Any]:
        """Find navigation button within container."""
        selectors = [
            # Left-side selectors
            ".assets-favorites__arrow--left", ".favorites-nav__left", ".favorites-arrow-left",
            "button[aria-label*='left']", ".chevron-left", "i.fa.fa-chevron-left", "i.fa.fa-angle-left",
            # Right-side selectors
            ".assets-favorites__arrow--right", ".favorites-nav__right", ".favorites-arrow-right",
            "button[aria-label*='right']", ".chevron-right", "i.fa.fa-chevron-right", "i.fa.fa-angle-right",
        ]

        for selector in selectors:
            # Keep only selectors that semantically match requested direction keywords
            if not any(keyword in selector for keyword in direction_keywords):
                continue

            try:
                buttons = container.find_elements(By.CSS_SELECTOR, selector)
                for button in buttons:
                    try:
                        if not (button.is_displayed() and button.is_enabled()):
                            continue
                        # If we matched an icon <i>, prefer its clickable ancestor (button/a/role=button)
                        tag = (button.tag_name or "").lower()
                        if tag == "i":
                            try:
                                anc = button.find_element(By.XPATH, "ancestor::*[self::button or self::a or @role='button'][1]")
                                if anc and anc.is_displayed() and anc.is_enabled():
                                    return anc
                            except Exception:
                                pass
                        return button
                    except Exception:
                        continue
            except Exception:
                continue

        return None

    def _find_navigation_button_near(self, container: Any, direction_keywords: List[str]) -> Optional[Any]:
        """
        Search ancestors and then globally for a navigation arrow. If an <i> icon is matched
        (e.g. i.fa.fa-chevron-right), prefer its clickable ancestor (button/a/role=button).
        """
        selectors = [
            ".assets-favorites__arrow--left", ".favorites-nav__left", ".favorites-arrow-left",
            "button[aria-label*='left']", ".chevron-left", "i.fa.fa-chevron-left", "i.fa.fa-angle-left",
            ".assets-favorites__arrow--right", ".favorites-nav__right", ".favorites-arrow-right",
            "button[aria-label*='right']", ".chevron-right", "i.fa.fa-chevron-right", "i.fa.fa-angle-right",
        ]

        # Ancestor scan (closest-first)
        anc = container
        for _ in range(6):
            if anc is None:
                break
            for sel in selectors:
                if not any(k in sel for k in direction_keywords):
                    continue
                try:
                    nodes = anc.find_elements(By.CSS_SELECTOR, sel)
                except Exception:
                    nodes = []
                for n in nodes:
                    try:
                        if not (n.is_displayed() and n.is_enabled()):
                            continue
                        tag = (n.tag_name or "").lower()
                        if tag == "i":
                            try:
                                anc_btn = n.find_element(By.XPATH, "ancestor::*[self::button or self::a or @role='button'][1]")
                                if anc_btn and anc_btn.is_displayed() and anc_btn.is_enabled():
                                    return anc_btn
                            except Exception:
                                pass
                        return n
                    except Exception:
                        continue
            try:
                anc = anc.find_element(By.XPATH, "..")
            except Exception:
                anc = None

        # Global fallback
        for sel in selectors:
            if not any(k in sel for k in direction_keywords):
                continue
            try:
                nodes = self.driver.find_elements(By.CSS_SELECTOR, sel)
            except Exception:
                nodes = []
            for n in nodes:
                try:
                    if not (n.is_displayed() and n.is_enabled()):
                        continue
                    tag = (n.tag_name or "").lower()
                    if tag == "i":
                        try:
                            anc_btn = n.find_element(By.XPATH, "ancestor::*[self::button or self::a or @role='button'][1]")
                            if anc_btn and anc_btn.is_displayed() and anc_btn.is_enabled():
                                return anc_btn
                        except Exception:
                            pass
                    return n
                except Exception:
                    continue

        return None

    def _find_common_ancestor(self, el1: Any, el2: Any) -> Optional[Any]:
        """Find the closest common ancestor of two elements."""
        try:
            # Simple approach: ascend from both elements and find intersection
            path1 = []
            current = el1
            for _ in range(10):  # Limit depth
                path1.append(current)
                try:
                    current = current.find_element(By.XPATH, "..")
                except Exception:
                    break

            path2 = []
            current = el2
            for _ in range(10):
                path2.append(current)
                try:
                    current = current.find_element(By.XPATH, "..")
                except Exception:
                    break

            # Find common ancestor
            for anc1 in reversed(path1):
                for anc2 in reversed(path2):
                    if anc1 == anc2:
                        return anc1
            return None
        except Exception:
            return None

    def scroll_favorites_left_scoped(self) -> bool:
        """Scroll favorites left one page using scoped navigation. Returns True if successful."""
        try:
            ctx = self._favorites_context()
            if not ctx.get("left") or not ctx.get("container"):
                return False

            container = ctx["container"]
            left_btn = ctx["left"]

            # Get scroll position before click
            before_scroll = self.driver.execute_script("return arguments[0].scrollLeft || 0;", container)

            # Click the left button
            self._scroll_into_view(left_btn)
            try:
                left_btn.click()
            except Exception:
                self.driver.execute_script("arguments[0].click();", left_btn)

            # Brief wait for scroll to take effect
            time.sleep(0.15)

            # Check if scroll position changed
            after_scroll = self.driver.execute_script("return arguments[0].scrollLeft || 0;", container)

            # Also check if visible items changed (fallback verification)
            try:
                items_before = container.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                visible_before = [item for item in items_before if item.is_displayed()]
                first_label_before = None
                if visible_before:
                    try:
                        label_el = visible_before[0].find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        first_label_before = (label_el.text or "").strip()
                    except Exception:
                        pass

                time.sleep(0.1)  # Additional wait for DOM update

                items_after = container.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                visible_after = [item for item in items_after if item.is_displayed()]
                first_label_after = None
                if visible_after:
                    try:
                        label_el = visible_after[0].find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        first_label_after = (label_el.text or "").strip()
                    except Exception:
                        pass

                label_changed = first_label_before != first_label_after
                scroll_changed = after_scroll < before_scroll

                return scroll_changed or label_changed

            except Exception:
                # Fallback to just scroll position check
                return after_scroll < before_scroll

        except Exception:
            return False

    def scroll_favorites_right_scoped(self) -> bool:
        """Scroll favorites right one page using scoped navigation. Returns True if successful."""
        try:
            ctx = self._favorites_context()
            if not ctx.get("right") or not ctx.get("container"):
                return False

            container = ctx["container"]
            right_btn = ctx["right"]

            # Get scroll position before click
            before_scroll = self.driver.execute_script("return arguments[0].scrollLeft || 0;", container)

            # Capture global last visible label before click (fallback verification)
            try:
                _nodes = self.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                _last = None
                for _n in _nodes:
                    try:
                        if _n.is_displayed():
                            _last = _n
                    except Exception:
                        continue
                if _last:
                    _lbl = _last.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                    global_label_before = (_lbl.text or "").strip()
                else:
                    global_label_before = None
            except Exception:
                global_label_before = None

            # Click the right button
            self._scroll_into_view(right_btn)
            try:
                right_btn.click()
            except Exception:
                self.driver.execute_script("arguments[0].click();", right_btn)

            # Brief wait for scroll to take effect
            time.sleep(0.15)

            # Check if scroll position changed
            after_scroll = self.driver.execute_script("return arguments[0].scrollLeft || 0;", container)

            # Also check if visible items changed (fallback verification)
            try:
                items_before = container.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                visible_before = [item for item in items_before if item.is_displayed()]
                first_label_before = None
                if visible_before:
                    try:
                        label_el = visible_before[0].find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        first_label_before = (label_el.text or "").strip()
                    except Exception:
                        pass

                time.sleep(0.1)  # Additional wait for DOM update

                items_after = container.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                visible_after = [item for item in items_after if item.is_displayed()]
                first_label_after = None
                if visible_after:
                    try:
                        label_el = visible_after[0].find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        first_label_after = (label_el.text or "").strip()
                    except Exception:
                        pass

                label_changed = first_label_before != first_label_after
                scroll_changed = after_scroll > before_scroll

                # Global fallback verification
                try:
                    _nodes2 = self.driver.find_elements(By.CSS_SELECTOR, ".assets-favorites-item__line")
                    _last2 = None
                    for _n2 in _nodes2:
                        try:
                            if _n2.is_displayed():
                                _last2 = _n2
                        except Exception:
                            continue
                    if _last2:
                        _lbl2 = _last2.find_element(By.CSS_SELECTOR, ".assets-favorites-item__label")
                        global_label_after = (_lbl2.text or "").strip()
                    else:
                        global_label_after = None
                except Exception:
                    global_label_after = None

                global_changed = (global_label_before != global_label_after)

                return scroll_changed or label_changed or global_changed

            except Exception:
                # Fallback to just scroll position check
                return after_scroll > before_scroll

        except Exception:
            return False

    def scroll_favorites_reset_left(self, max_steps: int = 20) -> bool:
        """Reset favorites to leftmost position using scoped navigation. Returns True if any scrolling occurred."""
        scrolled = False
        for _ in range(max_steps):
            if not self.scroll_favorites_left_scoped():
                break
            scrolled = True
            time.sleep(0.1)  # Brief delay between scrolls
        return scrolled

    def _scroll_favorites_left(self) -> bool:
        """Legacy wrapper for backward compatibility. Use scroll_favorites_left_scoped() instead."""
        return self.scroll_favorites_left_scoped()

    def _scroll_favorites_right(self) -> bool:
        """Legacy wrapper for backward compatibility. Use scroll_favorites_right_scoped() instead."""
        return self.scroll_favorites_right_scoped()

    # ---------- Balance and Account Type ----------

    def read_balance_and_account_type_with_meta(self) -> Dict[str, Any]:
        """
        Read balance and account type (DEMO/REAL) from the UI.
        Returns dict with balance_text, account_type, and locator attempts.
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "balance_text": None,
            "account_type": None,
            "selector_used": None,
            "selector_detail": None,
            "attempts": [],
        }

        # Balance strategies
        balance_strategies = [
            ("xpath", "//*[contains(translate(normalize-space(.),'BALANCE','balance'),'balance')]/following::*[contains(normalize-space(.),'$') or contains(normalize-space(.),'€') or contains(normalize-space(.),'£')][1]"),
            ("css", ".balance, .account-balance, .user-balance"),
            ("xpath", "//*[contains(@class,'balance')]"),
        ]

        # Account type strategies
        account_strategies = [
            ("xpath", "//*[contains(translate(normalize-space(.),'DEMO','demo'),'demo')]"),
            ("xpath", "//*[contains(translate(normalize-space(.),'REAL','real'),'real')]"),
            ("css", ".account-type, .account-mode"),
        ]

        # Read balance
        balance_el, balance_attempts, balance_used, balance_detail = self._find_first_visible(balance_strategies)
        if balance_el:
            meta["balance_text"] = (balance_el.text or "").strip()
            meta["selector_used"] = balance_used
            meta["selector_detail"] = balance_detail
            meta["ok"] = True

        meta["balance_attempts"] = balance_attempts

        # Read account type
        account_el, account_attempts, account_used, account_detail = self._find_first_visible(account_strategies)
        if account_el:
            text = (account_el.text or "").strip().upper()
            if "DEMO" in text:
                meta["account_type"] = "DEMO"
            elif "REAL" in text:
                meta["account_type"] = "REAL"

        meta["account_attempts"] = account_attempts

        return meta

    # ---------- Trade Confirmation Modal Handler ----------

    def _find_modal_element(self) -> Optional[Any]:
        """Find modal element using common strategies."""
        modal_strategies = [
            ("css", ".modal, .popup, .dialog, .overlay"),
            ("xpath", "//*[contains(@class,'modal') or contains(@class,'popup') or @role='dialog']"),
            ("xpath", "//*[contains(@class,'confirmation') or contains(@class,'confirm')]"),
        ]

        for strategy, selector in modal_strategies:
            elements = self._try_find_elements(strategy, selector)
            for element in elements:
                if element.is_displayed():
                    # Check if element has reasonable size (not just a tiny element)
                    try:
                        rect = self.driver.execute_script("return arguments[0].getBoundingClientRect();", element)
                        if rect and rect.get('width', 0) > 50 and rect.get('height', 0) > 50:
                            return element
                    except Exception:
                        continue
        return None

    def _find_confirm_button(self, modal_element: Any) -> Optional[Any]:
        """Find confirm button within modal."""
        confirm_strategies = [
            ("xpath", ".//*[contains(translate(normalize-space(.),'CONFIRM','confirm'),'confirm') and (self::button or self::div or self::span)]"),
            ("xpath", ".//*[contains(translate(normalize-space(.),'OK','ok'),'ok') and (self::button or self::div or self::span)]"),
            ("xpath", ".//*[contains(@class,'confirm') or contains(@class,'primary')]"),
            ("css", "button.confirm, .btn-confirm, button.primary"),
            ("xpath", ".//button[1]"),  # First button as fallback
        ]

        for strategy, selector in confirm_strategies:
            try:
                if strategy == "xpath":
                    elements = modal_element.find_elements(By.XPATH, selector)
                else:
                    elements = modal_element.find_elements(By.CSS_SELECTOR, selector)

                for element in elements:
                    if element.is_displayed():
                        return element
            except Exception:
                continue
        return None

    def handle_trade_confirmation_modal_with_meta(self, timeout: int = 3) -> Dict[str, Any]:
        """Handle trade confirmation modal that appears after Buy/Sell click. Returns dict with modal detection and click results."""
        meta: Dict[str, Any] = {"ok": False, "modal_detected": False, "confirm_clicked": False}

        # Wait for modal to appear
        modal_element = None
        for _ in range(timeout):
            modal_element = self._find_modal_element()
            if modal_element:
                meta["modal_detected"] = True
                break
            time.sleep(1)

        if not modal_element:
            return meta

        # Wait for modal to fully render and find confirm button
        time.sleep(0.5)
        self._scroll_into_view(modal_element)

        confirm_button = self._find_confirm_button(modal_element)
        if confirm_button:
            # Try to click confirm button
            if self._click_element_safely(confirm_button):
                meta["confirm_clicked"] = True
                meta["ok"] = True
            else:
                # Last resort: try global confirm button
                global_strategies = [
                    ("xpath", "//*[contains(translate(normalize-space(.),'CONFIRM','confirm'),'confirm') and (self::button or self::div)]"),
                    ("xpath", "//button[1]"),
                ]
                for strategy, selector in global_strategies:
                    element = self._try_find_element(strategy, selector)
                    if element and element.is_displayed():
                        self.driver.execute_script("arguments[0].click();", element)
                        meta["confirm_clicked"] = True
                        meta["ok"] = True
                        break

        return meta

    def handle_trade_confirmation_modal(self, timeout: int = 3) -> bool:
        """Convenience wrapper for handle_trade_confirmation_modal_with_meta()."""
        meta = self.handle_trade_confirmation_modal_with_meta(timeout=timeout)
        return bool(meta.get("ok"))

    # ---------- Post-Trade Verification ----------

    def verify_trade_execution_with_meta(self, timeout: int = 5) -> Dict[str, Any]:
        """
        Verify trade execution by checking for success indicators.
        Looks for toast messages, position updates, or trade confirmations.
        Returns dict with verification results.
        """
        meta: Dict[str, Any] = {
            "ok": False,
            "toast_detected": False,
            "position_updated": False,
            "trade_confirmed": False,
            "toast_text": None,
            "attempts": [],
        }

        # Toast/message strategies
        toast_strategies = [
            ("xpath", "//*[contains(@class,'toast') or contains(@class,'notification') or contains(@class,'message')]"),
            ("xpath", "//*[contains(translate(normalize-space(.),'POSITION','position'),'position') and contains(translate(normalize-space(.),'OPENED','opened'),'opened')]"),
            ("xpath", "//*[contains(translate(normalize-space(.),'TRADE','trade'),'trade') and contains(translate(normalize-space(.),'SUCCESS','success'),'success')]"),
            ("xpath", "//*[contains(translate(normalize-space(.),'ORDER','order'),'order') and contains(translate(normalize-space(.),'PLACED','placed'),'placed')]"),
        ]

        # Position indicator strategies
        position_strategies = [
            ("xpath", "//*[contains(@class,'position') or contains(@class,'trade')]"),
            ("xpath", "//*[contains(translate(normalize-space(.),'OPEN','open'),'open') and contains(translate(normalize-space(.),'POSITION','position'),'position')]"),
        ]

        try:
            # Check for toast messages
            toast_el, toast_attempts, _, _ = self._find_first_visible(toast_strategies)
            if toast_el:
                meta["toast_detected"] = True
                meta["toast_text"] = (toast_el.text or "").strip()
                if any(keyword in meta["toast_text"].lower() for keyword in ["opened", "placed", "success", "confirmed"]):
                    meta["trade_confirmed"] = True

            # Check for position updates
            position_el, position_attempts, _, _ = self._find_first_visible(position_strategies)
            if position_el:
                meta["position_updated"] = True

            meta["toast_attempts"] = toast_attempts
            meta["position_attempts"] = position_attempts

            # Overall success if any indicator is found
            if meta["toast_detected"] or meta["position_updated"]:
                meta["ok"] = True

        except Exception as e:
            meta["error"] = str(e)

        return meta

    def verify_trade_execution(self, timeout: int = 5) -> bool:
        """Convenience wrapper for verify_trade_execution_with_meta()."""
        meta = self.verify_trade_execution_with_meta(timeout=timeout)
        return bool(meta.get("ok"))
