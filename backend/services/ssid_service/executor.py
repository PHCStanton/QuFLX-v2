
import logging
import re
from typing import Dict, Any, Optional
from .connector import AsyncPocketOptionWrapper

logger = logging.getLogger("ssid_service.executor")


def _normalize_asset_symbol(asset: str) -> str:
    """
    Normalize any asset format to the PocketOption API symbol (e.g. 'GBPAUD_otc').

    PocketOption expects UPPERCASE base + lowercase '_otc' suffix.
    Examples (all produce the same output):
      - 'AUD/CHF OTC'   → 'AUDCHF_otc'
      - 'AUDCHFOTC'     → 'AUDCHF_otc'  (QuFLX normalized display format)
      - 'AUDCHF_otc'    → 'AUDCHF_otc'  (already correct)
      - 'audchf_otc'    → 'AUDCHF_otc'  (wrong case variant)
      - '#AAPL_otc'     → '#AAPL_otc'   (stock with # prefix)
    """
    if not asset:
        return ""
    # Preserve leading '#' for stock symbols (e.g. '#AAPL_otc')
    prefix = "#" if asset.startswith("#") else ""
    # Strip everything except alphanumeric chars (and the leading # already saved)
    stripped = re.sub(r"[^A-Za-z0-9]", "", asset)
    # Remove trailing 'OTC'/'otc' case-insensitively (we'll re-add with underscore)
    if stripped.lower().endswith("otc"):
        stripped = stripped[:-3]
    # PocketOption format: UPPERCASE base + lowercase '_otc'
    return f"{prefix}{stripped.upper()}_otc"

class OTCExecutor:
    """
    Handles trade execution and result tracking using a session wrapper.
    """
    def __init__(self, wrapper: AsyncPocketOptionWrapper):
        self.wrapper = wrapper

    def execute_trade(self, asset: str, direction: str, amount: float, expiration: int) -> Dict[str, Any]:
        """
        Execute a trade and return the result.
        Asset validation is handled by the PocketOption WebSocket API itself.
        """
        if not self.wrapper.is_connected():
            return {"success": False, "error": "Not connected to Pocket Option"}

        # Normalize to PocketOption API format: 'audchf_otc'
        # Handles all inputs: 'AUD/CHF OTC', 'AUDCHFOTC', 'AUDCHF_otc'
        asset = _normalize_asset_symbol(asset)
        if not asset:
            return {"success": False, "error": "Asset name is required"}

        success, order_id = self.wrapper.buy(
            amount=amount,
            asset=asset,
            action=direction.lower(),
            expiration=expiration
        )

        if success:
            return {
                "success": True,
                "order_id": order_id,
                "asset": asset,
                "direction": direction,
                "amount": amount,
                "expiration": expiration
            }
        else:
            return {"success": False, "error": "Order execution failed"}

    def check_result(self, order_id: str) -> Dict[str, Any]:
        """
        Check if an order has settled.
        """
        result = self.wrapper.check_win(order_id)
        if result:
            profit, status = result
            return {
                "success": True,
                "settled": True,
                "profit": profit,
                "status": status,
                "win": profit > 0
            }
        else:
            return {
                "success": True,
                "settled": False,
                "message": "Trade still active or result not yet received"
            }
