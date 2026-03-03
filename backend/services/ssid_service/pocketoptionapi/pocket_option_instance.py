
import asyncio
import websockets
import json
import ssl
import logging
from typing import Optional, Dict, List, Any, Callable, Union, Tuple

# Constants
DEMO_REGIONS = [
    "wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket",
    "wss://try-demo-eu.po.market/socket.io/?EIO=4&transport=websocket",
]

REAL_REGIONS = [
    "wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket",
    "wss://api-fi.po.market/socket.io/?EIO=4&transport=websocket",
    "wss://api-en.po.market/socket.io/?EIO=4&transport=websocket",
    "wss://api-us-north.po.market/socket.io/?EIO=4&transport=websocket",
    "wss://api-us-south.po.market/socket.io/?EIO=4&transport=websocket",
]

class PocketOptionInstance:
    """
    Instance-based Pocket Option API Wrapper
    Removes global state dependencies to allow multiple simultaneous connections
    """
    
    def __init__(self, ssid: str, demo: bool = True):
        self.ssid = ssid
        self.demo = demo
        self.logger = logging.getLogger(f"PocketOptionInstance_{'Demo' if demo else 'Real'}")
        
        # Connection state
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.connection_error = None
        
        # Account state
        self.balance: Optional[float] = None
        self.uid: Optional[int] = None
        self.is_demo_account: Optional[bool] = None
        
        # Data state
        self.payout_data = {}
        self.closed_deals = []
        self.active_orders = {}
        self.history_data = []

        # Auth state — connect() waits for this event before returning
        self._auth_event: Optional[asyncio.Event] = None
        self._auth_failed: bool = False
        
        # Event callbacks
        self.on_balance_update: Optional[Callable[[float], None]] = None
        self.on_order_update: Optional[Callable[[Dict], None]] = None
        
        # Async tasks
        self.tasks = []
        self.loop = None
        
        # Pending requests
        self.pending_requests: Dict[str, asyncio.Future] = {}
        
    async def connect(self) -> bool:
        """Establish WebSocket connection and wait for successful authentication."""
        self.loop = asyncio.get_running_loop()
        self._auth_event = asyncio.Event()
        self._auth_failed = False

        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        regions = DEMO_REGIONS if self.demo else REAL_REGIONS

        for url in regions:
            try:
                self.logger.info(f"Connecting to {url}...")
                self.websocket = await websockets.connect(
                    url,
                    ssl=ssl_context,
                    additional_headers={
                        "Origin": "https://pocketoption.com",
                        "Cache-Control": "no-cache",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    }
                )

                self.is_connected = True
                self.logger.info("WebSocket connected — waiting for auth confirmation...")

                # Start listener tasks
                self.tasks.append(asyncio.create_task(self._listener()))
                self.tasks.append(asyncio.create_task(self._keep_alive()))

                # Wait for successauth (or rejection) before returning
                try:
                    await asyncio.wait_for(self._auth_event.wait(), timeout=8.0)
                except asyncio.TimeoutError:
                    self.logger.error("Auth timeout — no successauth received within 8s. SSID may be expired.")
                    self.is_connected = False
                    await self.disconnect()
                    return False

                if self._auth_failed:
                    self.logger.error("Authentication rejected by PocketOption. SSID is invalid or expired.")
                    self.is_connected = False
                    await self.disconnect()
                    return False

                self.logger.info(f"Authenticated successfully. UID: {self.uid}")
                return True

            except Exception as e:
                self.logger.warning(f"Connection failed to {url}: {e}")
                continue

        self.logger.error("All connection attempts failed")
        return False

    async def disconnect(self):
        """Close connection and cleanup"""
        self.is_connected = False
        
        for task in self.tasks:
            task.cancel()
            
        if self.websocket:
            await self.websocket.close()
            
        self.logger.info("Disconnected")

    async def _listener(self):
        """Listen for incoming messages"""
        try:
            async for message in self.websocket:
                await self._process_message(message)
        except Exception as e:
            self.logger.error(f"Listener error: {e}")
            self.is_connected = False

    async def _resolve_pending_trade(self, event: str, payload) -> None:
        """
        Resolve the asyncio Future for a pending trade order.
        Called from both the 42[ and 451-[ message handlers since
        PocketOption may send successopenOrder on either prefix.
        """
        success = event == "successopenOrder"
        result = {"status": "success", "data": payload} if success else {"status": "error", "error": str(payload)}

        # Try to match by requestId first
        req_id = None
        if isinstance(payload, dict):
            req_id = payload.get("requestId") or payload.get("id")

        if req_id and req_id in self.pending_requests:
            future = self.pending_requests.pop(req_id, None)
            if future and not future.done():
                future.set_result(result)
                self.logger.info(f"Trade resolved by requestId {req_id}: {event}")
            return

        # Fallback: resolve the first pending future (only one trade at a time)
        for rid, future in list(self.pending_requests.items()):
            if not future.done():
                self.pending_requests.pop(rid, None)
                future.set_result(result)
                self.logger.info(f"Trade resolved (fallback) rid={rid}: {event}")
                break

    async def _process_message(self, message: Union[str, bytes]):
        """Process WebSocket messages"""
        
        # Handle binary messages (often large asset lists)
        if isinstance(message, bytes):
            try:
                # Try to decode as UTF-8 string
                message = message.decode('utf-8')
            except Exception as e:
                self.logger.warning(f"Received binary message that is not UTF-8 text: {e}")
                return

        # self.logger.info(f"Received: {message[:100]}") # Too verbose
        
        if message.startswith('0') and "sid" in message:
            # handshake 0
            await self.websocket.send("40")
            
        elif message == "2":
            await self.websocket.send("3")
            
        elif message.startswith("40") and not message.startswith("42"):
            # Socket.io namespace-connected frame: server sends "40" or "40{...}" after we connect.
            # This is our cue to send the auth payload.
            # NOTE: The old condition ("40" in message AND "sid" in message) was WRONG —
            # the server does NOT include "sid" in the 40 response, so auth was never sent.
            self.logger.info("Received namespace-connected (40) — sending auth...")
            if self.ssid.startswith('42["auth"'):
                auth_msg = self.ssid
            else:
                auth_msg = f'42["auth", {{"session": "{self.ssid}", "isDemo": {1 if self.demo else 0}, "uid": 0, "platform": 2}}]'

            await self.websocket.send(auth_msg)

        elif message.startswith('451-['):
            # ── Socket.io Binary Event (451-[...]) ──────────────────────────────
            # PocketOption sends critical events via this prefix:
            #   successauth, successopenOrder, failopenOrder, updateBalance, etc.
            # The reference implementation (client.py) only handles these here.
            # Without this branch ALL auth and trade responses are silently dropped.
            try:
                json_part = message.split("-", 1)[1]
                data = json.loads(json_part)
                event = data[0] if data else None
                payload = data[1] if len(data) > 1 else {}

                self.logger.debug(f"451 event: {event}")

                if event == "successauth":
                    self.uid = payload.get("uid") if isinstance(payload, dict) else None
                    self.is_demo_account = payload.get("isDemo") if isinstance(payload, dict) else None
                    self.logger.info(f"Authenticated! UID: {self.uid} (via 451)")
                    if self._auth_event and not self._auth_event.is_set():
                        self._auth_failed = False
                        self._auth_event.set()

                elif event in ("successopenOrder", "failopenOrder", "openOrder"):
                    self.logger.info(f"Trade event via 451: {event}")
                    await self._resolve_pending_trade(event, payload)

                elif event == "successupdateBalance":
                    # Balance confirmed update notification
                    self.logger.debug("Balance update confirmed via 451")

                elif event == "updateBalance":
                    if isinstance(payload, dict) and "balance" in payload:
                        self.balance = float(payload["balance"])
                        self.is_demo_account = bool(payload.get("isDemo"))
                        if self.on_balance_update:
                            self.on_balance_update(self.balance)

                elif event == "updateClosedDeals":
                    # Closed deal data follows — handled by the binary/JSON branch
                    self.logger.debug("updateClosedDeals received via 451")

            except (IndexError, json.JSONDecodeError, Exception) as e:
                self.logger.error(f"451 message processing error: {e} | raw: {message[:120]}")

        elif message.startswith('42'):
            # Standard event message
            try:
                data = json.loads(message[2:])
                event = data[0]
                payload = data[1] if len(data) > 1 else {}
                
                if event == "successauth":
                    self.uid = payload.get("uid")
                    self.is_demo_account = payload.get("isDemo")
                    self.logger.info(f"Authenticated! UID: {self.uid}")
                    # Signal connect() that auth succeeded
                    if self._auth_event and not self._auth_event.is_set():
                        self._auth_failed = False
                        self._auth_event.set()

                elif event in ("successopenOrder", "failopenOrder", "openOrder"):
                    # Trade order response — delegate to shared resolver
                    await self._resolve_pending_trade(event, payload)

                elif event == "updateBalance":
                    self.balance = payload
                    if self.on_balance_update:
                        self.on_balance_update(self.balance)

                elif "NotAuthorized" in str(payload):
                    self.logger.error("Authorization Failed: Invalid SSID")
                    self.is_connected = False
                    # Signal connect() that auth failed
                    if self._auth_event and not self._auth_event.is_set():
                        self._auth_failed = True
                        self._auth_event.set()
                    await self.disconnect()
                    
            except Exception as e:
                self.logger.error(f"Message processing error: {e}")

        elif message.startswith('{') or message.startswith('['):
            try:
                data = json.loads(message)
                
                if isinstance(data, list) and len(data) > 0:
                    first_item = data[0]
                    if isinstance(first_item, list) and len(first_item) > 0 and first_item[0] == 5:
                         self.payout_data = data
                
                elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) and "closeTime" in data[0] and "profit" in data[0]:
                    self.closed_deals.extend(data)
                    if len(self.closed_deals) > 100:
                         self.closed_deals = self.closed_deals[-100:]
                
                elif isinstance(data, dict) and "deals" in data:
                     deals = data["deals"]
                     if isinstance(deals, list):
                         self.closed_deals.extend(deals)
                         if len(self.closed_deals) > 100:
                             self.closed_deals = self.closed_deals[-100:]

                elif isinstance(data, dict):
                    if "balance" in data:
                        self.balance = float(data["balance"])
                        self.is_demo_account = bool(data.get("isDemo"))
                        if self.on_balance_update:
                            self.on_balance_update(self.balance)
                    
                    if "requestId" in data:
                        req_id = data["requestId"]
                        if req_id in self.pending_requests:
                            if not self.pending_requests[req_id].done():
                                self.pending_requests[req_id].set_result(data)

            except Exception as e:
                self.logger.error(f"JSON message processing error: {e}", exc_info=True)

    async def buy(self, amount: float, asset: str, action: str, expiration: int, request_id: str = None) -> Dict[str, Any]:
        """
        Execute a trade (buy order)
        """
        if not self.is_connected or not self.websocket:
            return {"status": "error", "error": "Not connected"}
            
        if request_id is None:
            import uuid
            request_id = str(uuid.uuid4())[:8]
            
        data_dict = {
            "asset": asset,
            "amount": amount,
            "action": action,
            "isDemo": 1 if self.demo else 0,
            "requestId": request_id,
            "optionType": 100,
            "time": expiration
        }
        
        msg = ["openOrder", data_dict]
        data = f'42{json.dumps(msg)}'
        
        future = self.loop.create_future()
        self.pending_requests[request_id] = future
        
        try:
            self.logger.info(f"Sending buy order: {action} {amount} {asset} ({expiration}s) [ID: {request_id}]")
            await self.websocket.send(data)
            
            try:
                result = await asyncio.wait_for(future, timeout=10.0)
                # Future already resolves with {"status": "success"/"error", "data": ...}
                return result
            except asyncio.TimeoutError:
                self.logger.error(f"Buy order timeout [ID: {request_id}]")
                return {"status": "error", "error": "Timeout waiting for order confirmation"}
                
        except Exception as e:
            self.logger.error(f"Buy execution error: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]

    async def _keep_alive(self):
        """Send periodic pings"""
        while self.is_connected:
            try:
                await self.websocket.send('42["ps"]')
                await asyncio.sleep(20)
            except Exception as exc:
                self.logger.error(f"Keep-alive error: {exc}")
                self.is_connected = False
                break

    async def get_balance(self) -> Optional[float]:
        """Get current balance"""
        if self.balance is not None:
            return self.balance
            
        for _ in range(20):
            if self.balance is not None:
                return self.balance
            await asyncio.sleep(0.5)
            
        return None

    def get_payout_data(self) -> Any:
        return self.payout_data

    async def check_win(self, trade_id: str) -> Optional[Tuple[float, str]]:
        """
        Check if a trade has finished and return result.
        """
        for deal in self.closed_deals:
            if str(deal.get("id")) == str(trade_id):
                profit = float(deal.get("profit", 0))
                status = "win" if profit > 0 else "loss"
                return (profit, status)
                
        return None
