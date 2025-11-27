"""Robust trade click utilities with diagnostics (BUY/SELL) for hybrid Selenium sessions.

This module provides:
- robust_trade_click_with_meta(driver, direction, root="#put-call-buttons-chart-1", timeout=5, save_artifacts=True)
    Attempts a pointer-true click on BUY/SELL anchors with rich diagnostics and independent verification.
- get_open_trades_count(driver)
    Heuristic count of "Opened" trades in the right panel.
- verify_open_trades_increment(driver, before_count, timeout=5)
    Polls until open trades count > before_count.

Artifacts (if save_artifacts=True):
- JSON:  API-test-space/data_output/trade_click_diagnostics_YYYYMMDD_HHMMSS.json
- PNGs:  API-test-space/data_output/screenshots/trade_click_[pre|post]_YYYYMMDD_HHMMSS.png
"""

from __future__ import annotations

import os
import json
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    StaleElementReferenceException,
    WebDriverException,
)
from selenium.webdriver.remote.webdriver import WebDriver


# -------------------- Path helpers --------------------


def _ensure_data_dirs() -> Tuple[str, str, str]:
    """Ensure API-test-space/data_output, trade_clicker, and screenshots subdirs exist. Return (data_dir, trade_clicker_dir, shots_dir)."""
    cwd = os.getcwd()
    base = os.path.join(cwd, "API-test-space", "data_output")
    trade_clicker_dir = os.path.join(base, "trade_clicker")
    shots = os.path.join(base, "screenshots")
    os.makedirs(base, exist_ok=True)
    os.makedirs(trade_clicker_dir, exist_ok=True)
    os.makedirs(shots, exist_ok=True)
    return base, trade_clicker_dir, shots


def _save_json(filename: str, data: Dict[str, Any]) -> str:
    _, trade_clicker_dir, _ = _ensure_data_dirs()
    path = os.path.join(trade_clicker_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def _save_screenshot(driver: WebDriver, filename: str) -> str:
    _, _, shots = _ensure_data_dirs()
    path = os.path.join(shots, filename)
    try:
        driver.save_screenshot(path)
    except Exception:
        # Best-effort; ignore failures
        pass
    return path


# -------------------- Element / DOM helpers --------------------


def _outer_html_clip(driver: WebDriver, el, max_len: int = 600) -> Optional[str]:
    try:
        html = el.get_attribute("outerHTML") or ""
        return html if len(html) <= max_len else html[:max_len] + "..."
    except Exception:
        return None


def _computed_style(driver: WebDriver, el) -> Dict[str, Any]:
    try:
        return driver.execute_script(
            """
            const el = arguments[0];
            const cs = window.getComputedStyle(el);
            return {
              display: cs.display,
              visibility: cs.visibility,
              opacity: cs.opacity,
              pointerEvents: cs.pointerEvents
            };
            """,
            el,
        )
    except Exception:
        return {}


def _rect(driver: WebDriver, el) -> Optional[Dict[str, float]]:
    try:
        r = driver.execute_script(
            "const r = arguments[0].getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};",
            el,
        )
        if isinstance(r, dict):
            return r
    except Exception:
        pass
    return None


def _element_from_point(driver: WebDriver, x: float, y: float) -> Dict[str, Any]:
    try:
        return driver.execute_script(
            """
            const el = document.elementFromPoint(arguments[0], arguments[1]);
            if (!el) return { found: false };
            const tag = el.tagName.toLowerCase();
            const id = el.id || null;
            const cls = el.className || null;
            return {
              found: true,
              tag,
              id,
              className: cls,
              text: (el.textContent || '').trim().slice(0,200)
            };
            """,
            float(x),
            float(y),
        )
    except Exception:
        return {"found": False}


def _css_query_first(driver: WebDriver, selector: str):
    try:
        return driver.find_element(By.CSS_SELECTOR, selector)
    except Exception:
        return None


def _find_buy_sell_anchor(driver: WebDriver, direction: str, root: str) -> Tuple[Optional[Any], List[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Try a sequence of strategies to find the anchor for BUY/SELL. Returns:
    (element, attempts, strategy_used, selector_detail)
    """
    attempts: List[Dict[str, Any]] = []
    used: Optional[str] = None
    detail: Optional[str] = None

    # Strict anchor-level selectors within the right panel root (preferred)
    if direction == "buy":
        strict_css = [
            f"{root} .action-high-low.button-call-wrap a.btn.btn-call",
            f"{root} .action-high-low.button-call-wrap a",
            f"{root} .button-call-wrap a",
        ]
    else:
        strict_css = [
            f"{root} .action-high-low.button-put-wrap a.btn.btn-put",
            f"{root} .action-high-low.button-put-wrap a",
            f"{root} .button-put-wrap a",
        ]

    for sel in strict_css:
        el = _css_query_first(driver, sel)
        ok = bool(el)
        attempts.append({"strategy": "css", "selector": sel, "ok": ok})
        if ok:
            return el, attempts, "css", sel

    # Fallback to text/class driven on any clickable container (anchor/div/button)
    if direction == "buy":
        fallbacks = [
            ("xpath", "(//*[self::a or self::button or self::div][contains(translate(normalize-space(.),'BUY','buy'),'buy')])[1]"),
            ("xpath", "(//*[self::a or self::button or self::div][contains(@class,'buy')])[1]"),
            ("css", "a.btn.btn-call, .button--buy, .trade-button--buy, .action_buy, .btn-buy, .green"),
        ]
    else:
        fallbacks = [
            ("xpath", "(//*[self::a or self::button or self::div][contains(translate(normalize-space(.),'SELL','sell'),'sell')])[1]"),
            ("xpath", "(//*[self::a or self::button or self::div][contains(@class,'sell')])[1]"),
            ("css", "a.btn.btn-put, .button--sell, .trade-button--sell, .action_sell, .btn-sell, .red"),
        ]

    for strat, sel in fallbacks:
        try:
            if strat == "css":
                el = driver.find_element(By.CSS_SELECTOR, sel)
            else:
                el = driver.find_element(By.XPATH, sel)
            ok = bool(el)
        except Exception:
            el = None
            ok = False
        attempts.append({"strategy": strat, "selector": sel, "ok": ok})
        if ok:
            return el, attempts, strat, sel

    return None, attempts, None, None


def get_open_trades_count(driver: WebDriver) -> int:
    """
    Heuristic count of opened trades from the right panel.
    Strategy:
      - Find an 'Opened' tab/label and count row-like descendants nearby
      - Fall back to scanning for a 'Trades' block and rows under it
    Returns 0 if not found.
    """
    # 1) Prefer "Opened" tab context
    try:
        opened_nodes = driver.find_elements(
            By.XPATH,
            "//*[contains(translate(normalize-space(.),'OPENED','opened'),'opened')]",
        )
    except Exception:
        opened_nodes = []

    def count_rows(container) -> int:
        count = 0
        xpaths = [
            ".//*[self::li or self::tr]",
            ".//*[contains(@class,'row') or contains(@class,'item') or contains(@class,'deal')]",
        ]
        for xp in xpaths:
            try:
                els = container.find_elements(By.XPATH, xp)
                count += len([e for e in els if _is_displayed_safe(e)])
            except Exception:
                continue
        return count

    for node in opened_nodes:
        try:
            if not _is_displayed_safe(node):
                continue
            # look ahead within a limited subtree
            subtotal = count_rows(node)
            if subtotal > 0:
                return subtotal
            # else walk up to a likely parent then count
            parent = node.find_element(By.XPATH, "ancestor::*[position()<=3][1]")
            subtotal = count_rows(parent)
            if subtotal > 0:
                return subtotal
        except Exception:
            continue

    # 2) Fallback: find 'Trades' header/block and count rows under it
    try:
        trades_nodes = driver.find_elements(
            By.XPATH,
            "//*[contains(translate(normalize-space(.),'TRADES','trades'),'trades')]",
        )
    except Exception:
        trades_nodes = []
    for node in trades_nodes:
        try:
            if not _is_displayed_safe(node):
                continue
            subtotal = count_rows(node)
            if subtotal > 0:
                return subtotal
            parent = node.find_element(By.XPATH, "ancestor::*[position()<=3][1]")
            subtotal = count_rows(parent)
            if subtotal > 0:
                return subtotal
        except Exception:
            continue

    return 0


def verify_open_trades_increment(driver: WebDriver, before_count: int, timeout: int = 5) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"ok": False, "before": before_count, "after": None, "samples": []}
    deadline = time.time() + max(0, timeout)
    last = before_count
    while time.time() < deadline:
        try:
            curr = get_open_trades_count(driver)
            meta["samples"].append({"t": time.time(), "count": curr})
            last = curr
            if curr > before_count:
                meta["ok"] = True
                meta["after"] = curr
                return meta
        except Exception:
            pass
        time.sleep(0.3)
    meta["after"] = last
    return meta


def _is_displayed_safe(el) -> bool:
    try:
        return el.is_displayed()
    except Exception:
        return False


# -------------------- Main public API --------------------


def robust_trade_click_with_meta(
    driver: WebDriver,
    direction: str,
    root: str = "#put-call-buttons-chart-1",
    timeout: int = 5,
    save_artifacts: bool = True,
) -> Dict[str, Any]:
    """
    Perform a resilient BUY/SELL click with diagnostics and independent verification.
    Returns a meta dict including:
      - ok: bool
      - target {selector_used, selector_detail, outer_html}
      - computed style, rect
      - elementFromPoint before/after at the click location
      - click_strategy: actions|js-dispatch|js-click
      - opened_count before/after + increment verification
      - streamer_seen: bool (best-effort)
      - artifacts paths (json, screenshots)
      - attempts and errors
    """
    meta: Dict[str, Any] = {
        "ok": False,
        "direction": direction,
        "target": {"selector_used": None, "selector_detail": None, "outer_html": None},
        "attempts": [],
        "computed": {},
        "rect": None,
        "element_from_point": {"before": None, "after": None},
        "click_strategy": None,
        "opened_count": {"before": None, "after": None},
        "verification": {"opened_increment": False, "streamer_seen": False},
        "artifacts": {},
        "errors": [],
    }

    direction = (direction or "").strip().lower()
    if direction not in ("buy", "sell"):
        meta["errors"].append("direction must be 'buy' or 'sell'")
        return meta

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    pre_shot = post_shot = diag_json = None

    # Try to ensure right panel is visible via optional HighPriorityControls
    try:
        from API_test_space.utils.selenium_ui_controls import HighPriorityControls  # wrong path guard
    except Exception:
        HighPriorityControls = None  # type: ignore

    try:
        # Correct import path for this repository structure
        from .selenium_ui_controls import HighPriorityControls as HPC  # type: ignore
        HighPriorityControls = HPC  # type: ignore
    except Exception:
        pass

    try:
        if HighPriorityControls is not None:
            try:
                hpc = HighPriorityControls(driver)
                hpc.ensure_right_panel_expanded(min_width=200)
            except Exception:
                pass
    except Exception:
        pass

    # Locate target
    target, attempts, used, detail = _find_buy_sell_anchor(driver, direction, root)
    meta["attempts"] = attempts
    meta["target"]["selector_used"] = used
    meta["target"]["selector_detail"] = detail

    if not target:
        _finalize_artifacts(driver, meta, ts, pre_shot, post_shot, diag_json, save_artifacts)
        return meta

    meta["target"]["outer_html"] = _outer_html_clip(driver, target)

    # Rect and computed style
    r = _rect(driver, target) or {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}
    meta["rect"] = r
    cs = _computed_style(driver, target)
    meta["computed"] = cs

    # Pre metrics
    cx = r["x"] + max(2.0, r["width"] * 0.5)
    cy = r["y"] + max(2.0, r["height"] * 0.5)
    meta["element_from_point"]["before"] = _element_from_point(driver, cx, cy)

    # Opened count before
    before_opened = get_open_trades_count(driver)
    meta["opened_count"]["before"] = before_opened

    # Pre screenshot
    if save_artifacts:
        pre_shot = _save_screenshot(driver, f"trade_click_pre_{ts}.png")
        meta["artifacts"]["pre_screenshot"] = pre_shot

    # Click strategies (try offsets first to avoid overlays/badges)
    offsets = [
        (max(2.0, r["width"] * 0.30), max(2.0, r["height"] * 0.50)),  # left-middle
        (max(2.0, r["width"] * 0.70), max(2.0, r["height"] * 0.50)),  # right-middle
        (max(2.0, r["width"] * 0.50), max(2.0, r["height"] * 0.50)),  # center
    ]

    clicked = False
    # Strategy 1: Selenium Actions click at offsets
    for ox, oy in offsets:
        try:
            ActionChains(driver).move_to_element_with_offset(target, int(ox), int(oy)).click().perform()
            meta["click_strategy"] = "actions"
            clicked = True
            break
        except (ElementClickInterceptedException, StaleElementReferenceException, WebDriverException) as e:
            meta["errors"].append(f"actions_click_error@({ox:.1f},{oy:.1f}): {str(e)}")
            try:
                # Re-fetch target if stale
                target, _, _, _ = _find_buy_sell_anchor(driver, direction, root)
                r = _rect(driver, target) or r
            except Exception:
                pass
            continue
        except Exception as e:
            meta["errors"].append(f"actions_click_generic@({ox:.1f},{oy:.1f}): {str(e)}")
            continue

    # Strategy 2: JS-dispatch pointer/mouse events on anchor
    if not clicked:
        try:
            driver.execute_script(
                """
                const el = arguments[0];
                const dispatch = (type) => {
                  let evt;
                  try {
                    evt = new PointerEvent(type, {bubbles:true,cancelable:true,composed:true});
                  } catch(e) {
                    evt = new MouseEvent(type, {bubbles:true,cancelable:true,composed:true});
                  }
                  el.dispatchEvent(evt);
                };
                ['pointerdown','mousedown','mouseup','click'].forEach(dispatch);
                """,
                target,
            )
            meta["click_strategy"] = "js-dispatch"
            clicked = True
        except Exception as e:
            meta["errors"].append(f"js_dispatch_error: {str(e)}")

    # Strategy 3: JS click() on anchor (bypasses some listeners)
    if not clicked:
        try:
            driver.execute_script("arguments[0].click();", target)
            meta["click_strategy"] = "js-click"
            clicked = True
        except Exception as e:
            meta["errors"].append(f"js_click_error: {str(e)}")

    # Post metrics
    meta["element_from_point"]["after"] = _element_from_point(driver, cx, cy)

    # Post screenshot
    if save_artifacts:
        post_shot = _save_screenshot(driver, f"trade_click_post_{ts}.png")
        meta["artifacts"]["post_screenshot"] = post_shot

    # Independent verification: opened trades increment
    try:
        inc_meta = verify_open_trades_increment(driver, before_opened, timeout=max(2, timeout))
        meta["opened_count"]["after"] = inc_meta.get("after")
        meta["verification"]["opened_increment"] = bool(inc_meta.get("ok"))
        meta["verification"]["opened_samples"] = inc_meta.get("samples", [])
    except Exception as e:
        meta["errors"].append(f"verify_opened_error: {str(e)}")

    # Optional: streamer (best-effort)
    try:
        streamer_seen = _detect_streamer(driver, timeout=1)
        meta["verification"]["streamer_seen"] = bool(streamer_seen)
    except Exception:
        pass

    # Finalize
    meta["ok"] = bool(clicked and (meta["verification"]["opened_increment"] or meta["verification"]["streamer_seen"]))

    # Save JSON
    if save_artifacts:
        diag_json = _save_json(f"trade_click_diagnostics_{ts}.json", meta)
        meta["artifacts"]["diagnostics_json"] = diag_json

    return meta


def _detect_streamer(driver: WebDriver, timeout: int = 1) -> bool:
    """Best-effort detection of the bottom-left 'Trade order placed' streamer."""
    deadline = time.time() + max(0, timeout)
    selectors = [
        ".deals-noty-streamer",
        ".deals-noty-streamer--position-bottom-left",
        ".noty, .toast, .notification",
    ]
    xpaths = [
        "//*[contains(translate(normalize-space(.),'TRADE','trade'),'trade') and contains(translate(normalize-space(.),'PLACED','placed'),'placed')]",
        "//*[contains(@class,'noty') or contains(@class,'toast') or contains(@class,'notification')]",
    ]
    while time.time() < deadline:
        for sel in selectors:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                if any(_is_displayed_safe(e) for e in els):
                    return True
            except Exception:
                continue
        for xp in xpaths:
            try:
                els = driver.find_elements(By.XPATH, xp)
                if any(_is_displayed_safe(e) for e in els):
                    return True
            except Exception:
                continue
        time.sleep(0.25)
    return False


def _finalize_artifacts(driver, meta, ts, pre_shot, post_shot, diag_json, save_artifacts: bool):
    if save_artifacts:
        if not pre_shot:
            meta["artifacts"]["pre_screenshot"] = _save_screenshot(driver, f"trade_click_pre_{ts}.png")
        if not post_shot:
            meta["artifacts"]["post_screenshot"] = _save_screenshot(driver, f"trade_click_post_{ts}.png")
        if not diag_json:
            meta["artifacts"]["diagnostics_json"] = _save_json(f"trade_click_diagnostics_{ts}.json", meta)




