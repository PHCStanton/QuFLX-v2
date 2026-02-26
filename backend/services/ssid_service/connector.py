
import asyncio
import threading
import logging
from typing import Optional, Any, Dict, Tuple
from .pocketoptionapi.pocket_option_instance import PocketOptionInstance

class AsyncPocketOptionWrapper:
    """
    Thread-safe synchronous wrapper for the async PocketOptionInstance.
    Maintains a dedicated event loop in a background thread.
    """
    def __init__(self, ssid: str, demo: bool = True):
        self.ssid = ssid
        self.demo = demo
        self.logger = logging.getLogger(f"AsyncWrapper_{'Demo' if demo else 'Real'}")
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        self.instance = None
        
        # Initialize instance in the loop
        future = asyncio.run_coroutine_threadsafe(self._init_instance(), self.loop)
        future.result()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    async def _init_instance(self):
        self.instance = PocketOptionInstance(self.ssid, self.demo)

    def connect(self, timeout=20) -> bool:
        future = asyncio.run_coroutine_threadsafe(self.instance.connect(), self.loop)
        try:
            return future.result(timeout=timeout)
        except Exception as e:
            self.logger.error(f"Connection timeout/error: {e}")
            return False

    def disconnect(self):
        if self.instance:
            future = asyncio.run_coroutine_threadsafe(self.instance.disconnect(), self.loop)
            try:
                future.result(timeout=5)
            except Exception as exc:
                self.logger.error(f"Disconnect error: {exc}")

    def stop(self):
        """Stop the background thread and event loop"""
        self.disconnect()
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=5)

    def get_balance(self) -> Optional[float]:
        future = asyncio.run_coroutine_threadsafe(self.instance.get_balance(), self.loop)
        try:
            return future.result(timeout=10)
        except Exception as exc:
            self.logger.error(f"Balance fetch error: {exc}")
            return None
    
    def is_connected(self) -> bool:
        return self.instance.is_connected if self.instance else False

    def buy(self, amount: float, asset: str, action: str, expiration: int) -> Tuple[bool, Optional[str]]:
        """
        Execute trade thread-safely.
        Returns tuple (success, order_id).
        """
        future = asyncio.run_coroutine_threadsafe(
            self.instance.buy(amount, asset, action, expiration), 
            self.loop
        )
        try:
            response = future.result(timeout=15)
            if response.get("status") == "success":
                data = response.get("data", {})
                order_id = self._extract_order_id(data)
                return True, str(order_id) if order_id else None
            else:
                self.logger.error(f"Trade failed: {response.get('error')}")
                return False, None
        except Exception as e:
            self.logger.error(f"Trade execution exception: {e}")
            return False, None

    def check_win(self, trade_id: str) -> Optional[Tuple[float, str]]:
        """
        Check trade result.
        Returns (profit, status) or None if pending.
        """
        future = asyncio.run_coroutine_threadsafe(self.instance.check_win(trade_id), self.loop)
        try:
            return future.result(timeout=5)
        except Exception as exc:
            self.logger.error(f"Check win error for trade_id={trade_id}: {exc}")
            return None

    def _extract_order_id(self, payload: Any) -> Optional[Any]:
        """Extract order identifier from varying upstream payload shapes."""
        if isinstance(payload, dict):
            for key in ("id", "order_id", "orderId", "dealId", "trade_id", "ticket"):
                value = payload.get(key)
                if value is not None:
                    return value

            # Search nested common fields first
            for nested_key in ("order", "deal", "data", "result"):
                nested = payload.get(nested_key)
                extracted = self._extract_order_id(nested)
                if extracted is not None:
                    return extracted

            # Fallback recursive scan
            for value in payload.values():
                extracted = self._extract_order_id(value)
                if extracted is not None:
                    return extracted

        if isinstance(payload, list):
            for item in payload:
                extracted = self._extract_order_id(item)
                if extracted is not None:
                    return extracted

        return None
