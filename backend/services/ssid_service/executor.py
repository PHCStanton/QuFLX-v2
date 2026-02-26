
import logging
from typing import Dict, Any, List, Optional
from .connector import AsyncPocketOptionWrapper

logger = logging.getLogger("ssid_service.executor")

# Verified OTC Assets from Pocket Option
OTC_ASSETS = [
    {"id": "EURUSD_otc", "name": "EUR/USD (OTC)"},
    {"id": "GBPUSD_otc", "name": "GBP/USD (OTC)"},
    {"id": "USDJPY_otc", "name": "USD/JPY (OTC)"},
    {"id": "AUDUSD_otc", "name": "AUD/USD (OTC)"},
    {"id": "USDCAD_otc", "name": "USD/CAD (OTC)"},
    {"id": "USDCHF_otc", "name": "USD/CHF (OTC)"},
    {"id": "NZDUSD_otc", "name": "NZD/USD (OTC)"},
    {"id": "EURJPY_otc", "name": "EUR/JPY (OTC)"},
    {"id": "EURGBP_otc", "name": "EUR/GBP (OTC)"},
    {"id": "EURAUD_otc", "name": "EUR/AUD (OTC)"},
    {"id": "EURCAD_otc", "name": "EUR/CAD (OTC)"},
    {"id": "AUDNZD_otc", "name": "AUD/NZD (OTC)"},
    {"id": "AUDJPY_otc", "name": "AUD/JPY (OTC)"},
]

class OTCExecutor:
    """
    Handles trade execution and result tracking using a session wrapper.
    """
    def __init__(self, wrapper: AsyncPocketOptionWrapper):
        self.wrapper = wrapper

    def execute_trade(self, asset: str, direction: str, amount: float, expiration: int) -> Dict[str, Any]:
        """
        Execute a trade and return the result.
        """
        if not self.wrapper.is_connected():
            return {"success": False, "error": "Not connected to Pocket Option"}

        # Validate asset
        valid_ids = [a["id"] for a in OTC_ASSETS]
        if asset not in valid_ids:
            # Try to find if it needs _otc suffix
            if f"{asset}_otc" in valid_ids:
                asset = f"{asset}_otc"
            else:
                return {"success": False, "error": f"Invalid OTC asset: {asset}"}

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
