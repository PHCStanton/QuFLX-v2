"""
trading_service.py — Live Trading Service (Singleton)

Manages the SSID WebSocket connection lifecycle and trade execution for the
Live Trading Panel. Wraps blocking PocketOption API calls in asyncio executors
for async FastAPI compatibility.

Safety model:
- Demo mode is the default; switching to Real requires explicit call.
- Connection is validated before every trade.
- Trade cooldown prevents rapid-fire accidental entries.
- Balance check guards against over-trading account.
- SSID is loaded/saved to data/settings/trading_config.json.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("gateway.trading")

# ---------------------------------------------------------------------------
# Resolved paths
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_CONFIG_PATH = _PROJECT_ROOT / "data" / "settings" / "trading_config.json"

# Ensure the SSID integration package is importable.
# The connector was written to live inside c:\QuFLX\v2\ssid\ssid_integration_package
# and resolves pocketoptionapi via the adjacent PocketOptionAPI-v2 folder.
_SSID_PKG = _PROJECT_ROOT / "ssid" / "ssid_integration_package"
_POCKET_API = _PROJECT_ROOT / "ssid" / "PocketOptionAPI-v2"
for _p in (_SSID_PKG, _POCKET_API):
    s = str(_p)
    if s not in sys.path:
        sys.path.insert(0, s)

# Lazy imports — only attempted after path is set
_SSIDConnector: Any = None
_OTCExecutor: Any = None


def _ensure_imports() -> bool:
    """Attempt to import the SSID integration package; return True on success."""
    global _SSIDConnector, _OTCExecutor
    if _SSIDConnector is not None:
        return True
    try:
        from core.ssid_connector import SSIDConnector  # type: ignore
        from core.otc_executor import OTCExecutor  # type: ignore
        _SSIDConnector = SSIDConnector
        _OTCExecutor = OTCExecutor
        return True
    except ImportError as exc:
        logger.error("Cannot import ssid_integration_package: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------
_DEFAULT_CONFIG: Dict[str, Any] = {
    "ssid": "",
    "demo": True,
    "default_amount": 10.0,
    "default_expiration": 300,
    "min_amount": 1.0,
    "max_amount": 1000.0,
    "confirm_real_trades": True,
    "trade_cooldown_seconds": 3,
}


# ---------------------------------------------------------------------------
# SSID parsing helpers
# ---------------------------------------------------------------------------

def _parse_demo_from_ssid(ssid: str) -> Optional[bool]:
    """
    Parse the isDemo flag directly from the SSID Socket.IO auth string.

    The PocketOption API ignores the demo= constructor argument; account
    mode is determined entirely by isDemo in the SSID payload.

    Returns True (demo), False (real), or None if parsing fails.

    Both SSID formats are handled:
      DEMO: 42["auth",{"session":"osh1dem0...","isDemo":1,"uid":...}]
      REAL: 42["auth",{"session":"a:4:{s:10...","isDemo":0,"uid":...}]
    """
    try:
        json_part = ssid[2:]          # strip '42', e.g. '["auth",{...}]'
        data = json.loads(json_part)  # list: ["auth", {...}]
        if isinstance(data, list) and len(data) >= 2 and isinstance(data[1], dict):
            return bool(data[1].get('isDemo', 0))
    except Exception as exc:
        logger.warning("Could not parse isDemo from SSID: %s", exc)
    return None


# ---------------------------------------------------------------------------
# TradingService singleton
# ---------------------------------------------------------------------------

class TradingService:
    """
    Singleton that owns the SSIDConnector / OTCExecutor instances.

    All heavy operations run in a thread-pool executor because the PocketOption
    WebSocket library is synchronous/blocking.
    """

    _instance: Optional["TradingService"] = None
    _lock: threading.Lock = threading.Lock()

    # ------------------------------------------------------------------ #
    def __init__(self) -> None:
        self._connector: Any = None          # SSIDConnector instance
        self._executor_obj: Any = None       # OTCExecutor instance
        self._config: Dict[str, Any] = {}
        self._is_connected: bool = False
        self._last_trade_ts: float = 0.0
        self._trade_lock: threading.Lock = threading.Lock()
        self._config_lock: threading.Lock = threading.Lock()
        self._load_config()

    # ------------------------------------------------------------------ #
    # Singleton factory
    # ------------------------------------------------------------------ #

    @classmethod
    def get(cls) -> "TradingService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------ #
    # Config persistence
    # ------------------------------------------------------------------ #

    def _load_config(self) -> None:
        """Load trading config from JSON. Fall back to defaults on any error."""
        with self._config_lock:
            try:
                if _CONFIG_PATH.exists():
                    raw = _CONFIG_PATH.read_text(encoding="utf-8")
                    loaded = json.loads(raw)
                    # Merge with defaults so new keys always appear
                    self._config = {**_DEFAULT_CONFIG, **loaded}
                else:
                    self._config = dict(_DEFAULT_CONFIG)
            except Exception as exc:
                logger.warning("Failed to load trading config: %s — using defaults", exc)
                self._config = dict(_DEFAULT_CONFIG)

    def _save_config(self) -> None:
        """Persist current config to disk (never logs the raw SSID)."""
        with self._config_lock:
            try:
                _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
                _CONFIG_PATH.write_text(
                    json.dumps(self._config, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                logger.debug("Trading config saved to %s", _CONFIG_PATH)
            except Exception as exc:
                logger.error("Failed to save trading config: %s", exc)

    def get_config_safe(self) -> Dict[str, Any]:
        """Return config dict without exposing the raw SSID."""
        with self._config_lock:
            safe = dict(self._config)
            safe["ssid"] = "***" if safe.get("ssid") else ""
            safe["ssid_saved"] = bool(self._config.get("ssid"))
        return safe

    def update_config(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply partial config updates (whitelist of allowed keys).
        SSID updates are handled separately via connect().
        """
        ALLOWED = {
            "default_amount", "default_expiration", "min_amount", "max_amount",
            "confirm_real_trades", "trade_cooldown_seconds",
        }
        with self._config_lock:
            for key, val in updates.items():
                if key in ALLOWED:
                    self._config[key] = val
        self._save_config()
        return self.get_config_safe()

    # ------------------------------------------------------------------ #
    # Status
    # ------------------------------------------------------------------ #

    def get_status(self) -> Dict[str, Any]:
        connected = self._is_connected and self._connector is not None
        balance: Optional[float] = None
        if connected:
            try:
                balance = self._connector.balance
            except Exception:
                pass
        return {
            "connected": connected,
            "demo": self._config.get("demo", True),
            "balance": balance,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------ #
    # Connection
    # ------------------------------------------------------------------ #

    def _connect_sync(self, ssid: str, demo: bool) -> Dict[str, Any]:
        """Blocking connect — runs inside executor."""
        if not _ensure_imports():
            return {"success": False, "error": "ssid_integration_package not available"}

        # Disconnect existing connection cleanly
        if self._connector is not None:
            try:
                self._connector.disconnect()
            except Exception:
                pass
            self._connector = None
            self._executor_obj = None
            self._is_connected = False

        try:
            # ⚠️  Python 3.10+: asyncio.get_event_loop() raises RuntimeError in
            # threads that have no running loop (e.g. asyncio thread-pool executor).
            # The PocketOption __init__ calls get_event_loop(), so we must create
            # and set a fresh loop for this worker thread before constructing.
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    raise RuntimeError("closed")
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            # ⚠️  The PocketOption API ignores the demo= argument.
            # Account mode (demo/real) is determined entirely by isDemo in the
            # SSID string itself.  We parse it here so our state reflects truth.
            parsed_demo = _parse_demo_from_ssid(ssid)
            effective_demo = parsed_demo if parsed_demo is not None else demo

            connector = _SSIDConnector(ssid=ssid, demo=effective_demo)
            ok, msg = connector.connect()
            if not ok:
                return {"success": False, "error": msg}

            executor = _OTCExecutor(connector)
            self._connector = connector
            self._executor_obj = executor
            self._is_connected = True

            # Persist SSID. Store demo/real SSIDs separately so switch_mode
            # can reconnect with the right SSID for each mode.
            with self._config_lock:
                self._config["ssid"] = ssid
                self._config["demo"] = effective_demo
                # Keep track of each SSID keyed by mode for easy switching
                if effective_demo:
                    self._config["ssid_demo"] = ssid
                else:
                    self._config["ssid_real"] = ssid
            self._save_config()

            balance = connector.balance
            return {
                "success": True,
                "demo": effective_demo,
                "balance": balance,
                "message": msg,
            }
        except Exception as exc:
            logger.error("Connection error: %s", exc, exc_info=True)
            self._is_connected = False
            return {"success": False, "error": str(exc)}

    async def connect(self, ssid: str, demo: bool) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._connect_sync, ssid, demo)

    def _disconnect_sync(self) -> Dict[str, Any]:
        if self._connector is None:
            return {"success": True, "message": "Already disconnected"}
        try:
            self._connector.disconnect()
        except Exception as exc:
            logger.warning("Error during disconnect: %s", exc)
        finally:
            self._connector = None
            self._executor_obj = None
            self._is_connected = False
        return {"success": True, "message": "Disconnected"}

    async def disconnect(self) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._disconnect_sync)

    # ------------------------------------------------------------------ #
    # Trade execution
    # ------------------------------------------------------------------ #

    def _execute_trade_sync(
        self,
        asset: str,
        direction: str,
        amount: float,
        expiration: int,
    ) -> Dict[str, Any]:
        """Blocking trade execution — runs inside executor."""
        # Guard: connection
        if not self._is_connected or self._executor_obj is None:
            return {"success": False, "error": "Not connected"}

        # Guard: cooldown
        with self._config_lock:
            cooldown = float(self._config.get("trade_cooldown_seconds", 3))
            min_amt = float(self._config.get("min_amount", 1.0))
            max_amt = float(self._config.get("max_amount", 1000.0))

        elapsed = time.time() - self._last_trade_ts
        if elapsed < cooldown:
            remaining = round(cooldown - elapsed, 1)
            return {"success": False, "error": f"Trade cooldown: {remaining}s remaining"}

        # Guard: amount bounds
        if amount < min_amt or amount > max_amt:
            return {
                "success": False,
                "error": f"Amount ${amount} outside allowed range ${min_amt}–${max_amt}",
            }

        # Guard: balance
        balance: Optional[float] = None
        try:
            balance = self._connector.balance
        except Exception:
            pass
        if balance is not None and amount > balance:
            return {
                "success": False,
                "error": f"Insufficient balance (${balance:.2f} < ${amount})",
            }

        try:
            with self._trade_lock:
                result = self._executor_obj.execute_trade(
                    asset=asset,
                    direction=direction,
                    amount=amount,
                    expiration=expiration,
                )
            self._last_trade_ts = time.time()
            return {"success": result.get("success", False), **result}
        except Exception as exc:
            logger.error("Trade execution error: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}

    async def execute_trade(
        self,
        asset: str,
        direction: str,
        amount: float,
        expiration: int,
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._execute_trade_sync, asset, direction, amount, expiration
        )

    # ------------------------------------------------------------------ #
    # Result checking
    # ------------------------------------------------------------------ #

    def _check_result_sync(self, order_id: str) -> Dict[str, Any]:
        if self._executor_obj is None:
            return {"success": False, "error": "Not connected"}
        try:
            result = self._executor_obj.check_trade_result(order_id)
            return {"success": True, **result}
        except Exception as exc:
            logger.error("check_result error: %s", exc)
            return {"success": False, "error": str(exc)}

    async def check_result(self, order_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._check_result_sync, order_id)

    # ------------------------------------------------------------------ #
    # Assets
    # ------------------------------------------------------------------ #

    def get_assets(self) -> List[str]:
        """Return the hardcoded verified OTC asset list."""
        if not _ensure_imports():
            return []
        try:
            return list(_OTCExecutor.OTC_ASSETS)
        except Exception:
            return []

    # ------------------------------------------------------------------ #
    # Mode switching
    # ------------------------------------------------------------------ #

    async def switch_mode(self, demo: bool) -> Dict[str, Any]:
        """
        Switch Demo ↔ Real by reconnecting with the SSID for the target mode.

        Because account mode is baked into the SSID string (isDemo field),
        we need a separate SSID for each mode.  We look for a previously
        saved ssid_demo / ssid_real in config.  If not found, the user must
        connect fresh with the correct SSID.
        """
        mode_key = "ssid_demo" if demo else "ssid_real"
        with self._config_lock:
            target_ssid = self._config.get(mode_key, "")

        if not target_ssid:
            mode_name = "Demo" if demo else "Real"
            return {
                "success": False,
                "error": (
                    f"No saved {mode_name} SSID found. "
                    f"Please connect with your {mode_name} account SSID first."
                ),
            }
        return await self.connect(target_ssid, demo)


# ---------------------------------------------------------------------------
# Module-level convenience accessor
# ---------------------------------------------------------------------------

def get_trading_service() -> TradingService:
    return TradingService.get()
