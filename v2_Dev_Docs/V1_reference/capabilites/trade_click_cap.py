from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List

from .base import Ctx, CapResult, Capability, add_utils_to_syspath, timestamp

# Ensure we can import API-test-space/utils modules despite directory name
add_utils_to_syspath()
try:
    from trade_clicker import robust_trade_click_with_meta  # from API-test-space/utils/trade_clicker.py
except Exception:
    robust_trade_click_with_meta = None  # type: ignore


class TradeClick(Capability):
    """
    Capability wrapper around robust_trade_click_with_meta for BUY/SELL execution.

    Interface inputs:
      - side: "buy" | "sell" (required)
      - timeout: int = 5
      - root: str = "#put-call-buttons-chart-1"  (anchor root selector)

    Behavior:
      - Delegates to utils.trade_clicker.robust_trade_click_with_meta(driver, side, root, timeout, save_artifacts=ctx.debug)
      - Returns meta as data with ok flag and collected artifact paths (json + screenshots)
    Kind: "trade"
    """
    id = "trade_click"
    kind = "trade"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        if robust_trade_click_with_meta is None:
            return CapResult(ok=False, data={}, error="trade_clicker not available/importable", artifacts=())

        side = (inputs.get("side") or "").strip().lower()
        timeout = int(inputs.get("timeout", 5))
        root = inputs.get("root", "#put-call-buttons-chart-1")

        if side not in ("buy", "sell"):
            return CapResult(ok=False, data={"inputs": inputs}, error="side must be 'buy' or 'sell'", artifacts=())

        # Execute trade click with diagnostics controlled by ctx.debug
        meta: Dict[str, Any] = robust_trade_click_with_meta(
            ctx.driver,
            direction=side,
            root=root,
            timeout=timeout,
            save_artifacts=bool(ctx.debug),
        )

        # Collect artifact paths if present in meta
        artifacts: List[str] = []
        try:
            arts = meta.get("artifacts") or {}
            for key in ("pre_screenshot", "post_screenshot", "diagnostics_json"):
                p = arts.get(key)
                if isinstance(p, str) and p:
                    artifacts.append(p)
        except Exception:
            pass

        ok = bool(meta.get("ok"))
        return CapResult(ok=ok, data=meta, error=None if ok else "trade_click reported failure", artifacts=tuple(artifacts))


# Factory for orchestrator
def build() -> Capability:
    return TradeClick()




