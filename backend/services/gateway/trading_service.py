"""
trading_service.py — Live Trading Service (Singleton)

Clean rewrite fixing 6 critical bugs in the live trading pipeline.

Bug fixes applied
-----------------
#1  _connect_sync now returns {success, balance, demo, message}
#2  asyncio.Lock replaces threading.Lock — no event-loop deadlock on await
#3  get_assets returns [{id, payout}] instead of [{symbol, payout}]
#4  update_config() method added (was missing → 500 on PUT /config)
#5  switch_mode reads isDemo from saved SSID, not stale config flag
#6  get_status reads live balance directly from connector

Architecture
------------
- All blocking PocketOption calls run in asyncio thread-pool executor.
- Cooldown is validated under asyncio.Lock but lock is RELEASED before
  the blocking executor call — no deadlock possible.
- Demo/Real mode is determined entirely by isDemo inside the SSID string.
  The `demo` constructor param to SSIDConnector is for fallback only.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from ssid_integration import SSIDConnector, OTCExecutor

logger = logging.getLogger("gateway.trading")

# ---------------------------------------------------------------------------
# Paths & defaults
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_CONFIG_PATH = _PROJECT_ROOT / "data" / "settings" / "trading_config.json"

_DEFAULT_CONFIG: Dict[str, Any] = {
    "ssid": "",
    "ssid_demo": "",
    "ssid_real": "",
    "demo": True,
    "default_amount": 10.0,
    "default_expiration": 300,
    "min_amount": 1.0,
    "max_amount": 1000.0,
    "trade_cooldown_seconds": 2.0,
}

# Fields that callers may update via update_config()
_UPDATABLE_CONFIG_KEYS = frozenset({
    "default_amount",
    "default_expiration",
    "min_amount",
    "max_amount",
    "confirm_real_trades",
    "trade_cooldown_seconds",
})


# ---------------------------------------------------------------------------
# TradingService (Singleton)
# ---------------------------------------------------------------------------

class TradingService:
    """
    Singleton that owns the SSIDConnector / OTCExecutor instances.

    Thread-safety model
    -------------------
    - Singleton creation:   threading.Lock (one-time, non-blocking path)
    - Config reads/writes:  threading.Lock (config is sync-only)
    - Trade cooldown check: asyncio.Lock  (held only for the timestamp check,
                                           released before any I/O)
    """

    _instance: Optional["TradingService"] = None
    _class_lock: threading.Lock = threading.Lock()  # singleton creation only

    # ------------------------------------------------------------------ #
    def __init__(self) -> None:
        self._connector: Optional[SSIDConnector] = None
        self._executor_obj: Optional[OTCExecutor] = None
        self._config: Dict[str, Any] = {}
        self._is_connected: bool = False
        self._last_trade_ts: float = 0.0
        # BUG #2 FIX: asyncio.Lock — safe to await inside coroutines
        self._trade_lock: asyncio.Lock = asyncio.Lock()
        self._config_lock: threading.Lock = threading.Lock()
        self._load_config()

    # ------------------------------------------------------------------ #
    # Singleton factory
    # ------------------------------------------------------------------ #
    @classmethod
    def get(cls) -> "TradingService":
        """Thread-safe singleton factory."""
        if cls._instance is None:
            with cls._class_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------ #
    # Config persistence
    # ------------------------------------------------------------------ #
    def _load_config(self) -> None:
        try:
            if _CONFIG_PATH.exists():
                loaded = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
                self._config = {**_DEFAULT_CONFIG, **loaded}
            else:
                self._config = _DEFAULT_CONFIG.copy()
        except Exception as exc:
            logger.error("Failed to load trading config: %s", exc)
            self._config = _DEFAULT_CONFIG.copy()

    def _save_config(self) -> None:
        with self._config_lock:
            try:
                _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
                _CONFIG_PATH.write_text(
                    json.dumps(self._config, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                logger.debug("Trading config saved → %s", _CONFIG_PATH)
            except Exception as exc:
                logger.error("Failed to save trading config: %s", exc)

    def get_config_safe(self) -> Dict[str, Any]:
        """Return config dict — SSID values masked."""
        with self._config_lock:
            safe = self._config.copy()
            for key in ("ssid", "ssid_demo", "ssid_real"):
                if safe.get(key):
                    safe[key] = "<redacted>"
            return safe

    def update_config(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        BUG #4 FIX: This method was missing — PUT /config raised AttributeError.

        Update allowed runtime trading settings. Returns the safe config dict.
        """
        with self._config_lock:
            for key, value in updates.items():
                if key in _UPDATABLE_CONFIG_KEYS:
                    self._config[key] = value
                else:
                    logger.warning("update_config: ignored unknown/protected key '%s'", key)
        self._save_config()
        return self.get_config_safe()

    # ------------------------------------------------------------------ #
    # Blocking helpers (always run inside run_in_executor)
    # ------------------------------------------------------------------ #
    def _connect_sync(self, ssid: str, demo: bool) -> Dict[str, Any]:
        """
        Blocking connect — must run in executor, never directly in a coroutine.

        BUG #1 FIX: Returns {success, balance, demo, message} so that the
        route and the frontend both receive balance and demo correctly.
        """
        # Tear down any existing connection cleanly
        if self._connector is not None:
            try:
                self._connector.disconnect()
            except Exception:
                pass
            self._connector = None
            self._executor_obj = None
            self._is_connected = False

        try:
            # Python 3.10+ raises RuntimeError in threads without a running loop.
            # PocketOption.__init__ calls get_event_loop(), so create one here.
            try:
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    raise RuntimeError("closed")
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            connector = SSIDConnector(ssid=ssid, demo=demo)
            ok, msg = connector.connect()
            if not ok:
                return {"success": False, "error": msg}

            executor = OTCExecutor(connector)

            self._connector = connector
            self._executor_obj = executor
            self._is_connected = True

            # BUG #5 FIX: effective mode comes from the SSID, not the `demo` arg.
            # SSIDConnector already parses _actual_demo from isDemo in the SSID.
            effective_demo: bool = connector._actual_demo

            with self._config_lock:
                self._config["ssid"] = ssid
                self._config["demo"] = effective_demo
                # Store under the correct mode slot for future switch_mode calls
                if effective_demo:
                    self._config["ssid_demo"] = ssid
                else:
                    self._config["ssid_real"] = ssid
            self._save_config()

            # BUG #1 FIX: include balance + demo in return value
            balance = connector.balance
            return {
                "success": True,
                "balance": balance,
                "demo": effective_demo,
                "message": msg,
            }

        except Exception as exc:
            logger.exception("Connection failed")
            self._is_connected = False
            return {"success": False, "error": f"Connection failed: {exc}"}

    def _disconnect_sync(self) -> Dict[str, Any]:
        if self._connector is None:
            return {"success": True, "message": "Already disconnected"}
        try:
            self._connector.disconnect()
        except Exception as exc:
            logger.warning("Disconnect error: %s", exc)
        finally:
            self._connector = None
            self._executor_obj = None
            self._is_connected = False
        return {"success": True, "message": "Disconnected"}

    def _execute_trade_sync(
        self, asset: str, direction: str, amount: float, expiration: int
    ) -> Dict[str, Any]:
        """
        Blocking trade execution — runs OUTSIDE the asyncio.Lock.
        BUG #2 FIX: lock is acquired/released in execute_trade() before this
        call, so there is no threading.Lock held while awaiting I/O.
        """
        if not self._executor_obj:
            return {"success": False, "error": "Not connected"}
        return self._executor_obj.execute_trade(asset, direction, amount, expiration)

    # ------------------------------------------------------------------ #
    # Public async API
    # ------------------------------------------------------------------ #
    async def connect(self, ssid: str, demo: bool) -> Dict[str, Any]:
        """Connect to Pocket Option. Returns {success, balance, demo, message}."""
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self._connect_sync, ssid, demo),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            logger.error("connect: timed out after 30 s")
            self._is_connected = False
            return {"success": False, "error": "Connection timeout (30 s)"}

    async def disconnect(self) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._disconnect_sync)

    async def get_status(self) -> Dict[str, Any]:
        """
        BUG #6 FIX: Read live balance directly from connector instance.
        Previously the stale config value was used → always None.
        """
        connected = (
            self._is_connected
            and self._connector is not None
            and self._connector.check_connection()
        )
        balance = self._connector.balance if self._connector else None
        return {
            "connected": connected,
            "demo": self._config.get("demo", True),
            "balance": balance,
        }

    async def get_assets(self) -> List[Dict[str, Any]]:
        """
        BUG #3 FIX: Return [{id, payout}] — frontend uses asset.id, not asset.symbol.
        The old code returned {symbol} which left selectedAsset always empty,
        permanently disabling the Execute button.
        """
        return [{"id": asset, "payout": None} for asset in OTCExecutor.OTC_ASSETS]

    async def execute_trade(
        self, asset: str, direction: str, amount: float, expiration: int
    ) -> Dict[str, Any]:
        """
        Execute a binary options trade.

        BUG #2 FIX: asyncio.Lock is acquired only for the cooldown timestamp
        check, then immediately released before any blocking I/O.
        The old code held a threading.Lock across an `await` — guaranteed deadlock.
        """
        if not self._is_connected or not self._executor_obj:
            return {"success": False, "error": "Not connected"}

        # Validate amount before touching the lock
        min_a = self._config["min_amount"]
        max_a = self._config["max_amount"]
        if not (min_a <= amount <= max_a):
            return {
                "success": False,
                "error": f"Amount ${amount:.2f} out of allowed range [${min_a}, ${max_a}]",
            }

        # Cooldown check — lock is held for μs, released before executor call
        async with self._trade_lock:
            now = time.time()
            elapsed = now - self._last_trade_ts
            cooldown = self._config["trade_cooldown_seconds"]
            if elapsed < cooldown:
                remaining = cooldown - elapsed
                return {"success": False, "error": f"Trade cooldown: wait {remaining:.1f} s"}
            # Reserve slot optimistically — rolled back on failure below
            self._last_trade_ts = now
        # ← asyncio.Lock released here, before any blocking I/O

        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    self._execute_trade_sync,
                    asset, direction, amount, expiration,
                ),
                timeout=30.0,
            )
            # Roll back timestamp on failure so cooldown doesn't penalise bad trades
            if not result.get("success"):
                self._last_trade_ts = 0.0
            return result
        except asyncio.TimeoutError:
            self._last_trade_ts = 0.0
            return {"success": False, "error": "Trade execution timeout (30 s)"}

    async def check_trade_result(self, order_id: str) -> Dict[str, Any]:
        """Check WIN/LOSS result for a completed trade."""
        if not self._is_connected or not self._executor_obj:
            return {"success": False, "error": "Not connected"}
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(
                    None, self._executor_obj.check_trade_result, order_id
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            return {"success": False, "error": "Trade result check timeout (30 s)"}

    async def switch_mode(self, demo: bool) -> Dict[str, Any]:
        """
        BUG #5 FIX: Mode is entirely determined by the SSID string.
        We look up the previously-saved SSID for the requested mode and reconnect.
        If no SSID is saved for that mode, return a clear error instead of silently
        using an empty string (which caused connection failures with no feedback).
        """
        with self._config_lock:
            current_demo = self._config.get("demo", True)
            if current_demo == demo:
                balance = self._connector.balance if self._connector else None
                return {
                    "success": True,
                    "demo": demo,
                    "balance": balance,
                    "message": f"Already in {'demo' if demo else 'real'} mode",
                }
            ssid_key = "ssid_demo" if demo else "ssid_real"
            ssid = self._config.get(ssid_key, "")

        if not ssid:
            mode_name = "demo" if demo else "real"
            return {
                "success": False,
                "error": (
                    f"No {mode_name} SSID saved. "
                    f"Connect with a {mode_name} SSID first, then switch."
                ),
            }

        await self.disconnect()
        return await self.connect(ssid, demo)


# ---------------------------------------------------------------------------
# Module-level factory used by routes
# ---------------------------------------------------------------------------

def get_trading_service() -> TradingService:
    """Return the singleton TradingService instance."""
    return TradingService.get()
