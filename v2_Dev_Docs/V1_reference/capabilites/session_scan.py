from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List

from .base import Ctx, CapResult, Capability, add_utils_to_syspath, save_json, timestamp

# Ensure we can import local utils under API-test-space/utils
add_utils_to_syspath()
try:
    from selenium_ui_controls import HighPriorityControls, ZoomManager
    from selenium.webdriver.common.by import By
except Exception:
    HighPriorityControls = None  # type: ignore
    ZoomManager = None  # type: ignore
    By = None  # type: ignore


class SessionScan(Capability):
    """
    Capability: Read session state only (no automation):
      - Account: DEMO/REAL
      - Balance: $x.xx
      - Strategy: placeholder string
      - Trade Amount: read-only
      - Optional viewport scale check (read-only)
    Interface: run(ctx, {})
    Outputs: {account, balance, strategy: "PLACEHOLDER", amount, viewport_scale}
    Kind: "read"
    """
    id = "session_scan"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        data: Dict[str, Any] = {
            "account": "UNKNOWN",
            "balance": None,
            "strategy": "PLACEHOLDER",
            "amount": None,
            "viewport_scale": None,
            "raw": {},
        }
        artifacts: List[str] = []

        if HighPriorityControls is None or By is None:
            return CapResult(ok=False, data=data, error="Selenium helpers not available", artifacts=tuple(artifacts))

        hpc = HighPriorityControls(ctx.driver)

        # Account & balance
        try:
            meta = hpc.read_balance_and_account_type_with_meta()
            data["raw"]["balance_and_account_meta"] = meta
            acct = meta.get("account_type")
            if acct in ("DEMO", "REAL"):
                data["account"] = acct
            bal_text = (meta.get("balance_text") or "").strip()
            data["balance"] = self._parse_money(bal_text)
        except Exception as e:
            data["raw"]["balance_error"] = str(e)

        # Amount (read-only)
        try:
            amount_val, amount_meta = self._read_amount_value(ctx)
            data["amount"] = amount_val
            data["raw"]["amount_meta"] = amount_meta
        except Exception as e:
            data["raw"]["amount_error"] = str(e)

        # Viewport scale
        try:
            if ZoomManager is not None:
                ok_zoom, observed = ZoomManager.verify(ctx.driver, expected=0.67, tolerance=0.05)
                data["viewport_scale"] = observed
                data["raw"]["viewport_scale_ok"] = ok_zoom
        except Exception:
            pass

        if ctx.debug:
            try:
                ts = timestamp()
                path = save_json(ctx, f"session_scan_{ts}.json", data, subfolder="session_scan")
                artifacts.append(path)
            except Exception:
                pass

        return CapResult(ok=True, data=data, error=None, artifacts=tuple(artifacts))

    # ---------- helpers ----------

    def _parse_money(self, text: str) -> Optional[float]:
        try:
            t = text.replace(",", "").replace(" ", "")
            for sym in ["$", "€", "£"]:
                t = t.replace(sym, "")
            if t.count(".") > 1 and "," in t:
                t = t.replace(".", "").replace(",", ".")
            return float(t)
        except Exception:
            try:
                t = text.replace(" ", "").replace(".", "").replace(",", ".")
                for sym in ["$", "€", "£"]:
                    t = t.replace(sym, "")
                return float(t)
            except Exception:
                return None

    def _read_amount_value(self, ctx: Ctx) -> Tuple[Optional[float], Dict[str, Any]]:
        meta: Dict[str, Any] = {"strategies": [], "raw_value": None, "parsed": None}
        strategies = [
            ("xpath", "//*[contains(normalize-space(.), 'Amount')]/following::input[1]"),
            ("xpath", "//input[contains(@placeholder,'Amount') or contains(@aria-label,'Amount')]"),
            ("css", "input.amount, .amount input, input[name*='amount']"),
        ]
        el = None
        for strat, sel in strategies:
            try:
                if strat == "xpath":
                    els = ctx.driver.find_elements(By.XPATH, sel)
                else:
                    els = ctx.driver.find_elements(By.CSS_SELECTOR, sel)
            except Exception:
                els = []
            cand = next((e for e in els if self._is_displayed(e)), None)
            meta["strategies"].append({"strategy": strat, "selector": sel, "found": bool(cand)})
            if cand:
                el = cand
                break

        if not el:
            return None, meta

        try:
            val = (el.get_attribute("value") or "").strip()
            meta["raw_value"] = val
            norm = val.replace(" ", "").replace(",", "")
            parsed = None
            try:
                parsed = float(norm)
            except Exception:
                try:
                    parsed = float(val.replace(" ", "").replace(",", "."))
                except Exception:
                    parsed = None
            meta["parsed"] = parsed
            return parsed, meta
        except Exception as e:
            meta["error"] = str(e)
            return None, meta

    def _is_displayed(self, el) -> bool:
        try:
            return el.is_displayed()
        except Exception:
            return False


# Factory
def build() -> Capability:
    return SessionScan()




