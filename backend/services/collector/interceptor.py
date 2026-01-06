import json
import logging
import base64
import re
import time
from typing import List, Optional, Dict, Any, Set
from collections import OrderedDict
from datetime import datetime, timezone
from backend.utils.asset_utils import normalize_asset
from selenium import webdriver

from backend.models.market_data import Tick

logger = logging.getLogger(__name__)

class WebSocketInterceptor:
    """
    Intercepts WebSocket frames from Chrome performance logs and parses them into Tick objects.
    """
    def __init__(self, driver: webdriver.Chrome):
        self.driver = driver
        self.processed_messages = OrderedDict()  # Use OrderedDict for LRU eviction
        self.max_messages = 10000
        self._tick_buffer = []
        self._history_buffer = []

    def _refresh_logs(self):
        """
        Consumes performance logs once and populates internal buffers for ticks and history.
        This prevents one fetch method from 'stealing' logs from the other.
        """
        try:
            logs = self.driver.get_log('performance')
            if logs:
                logger.info(f"INTERCEPTOR: Fetched {len(logs)} performance log entries")
            for entry in logs:
                try:
                    message_json = json.loads(entry['message'])
                    message = message_json.get('message', {})
                    
                    if message.get('method') == 'Network.webSocketFrameReceived':
                        params = message.get('params', {})
                        response = params.get('response', {})
                        payload_data = response.get('payloadData')
                        
                        if payload_data:
                            msg_id = f"{params.get('requestId')}_{params.get('timestamp')}"
                            if msg_id in self.processed_messages:
                                continue
                            
                            self.processed_messages[msg_id] = True
                            if len(self.processed_messages) > self.max_messages:
                                self.processed_messages.popitem(last=False)

                            parsed_data = self._parse_payload(payload_data)
                            
                            # 1. Check for history/candles
                            found_history = False
                            if isinstance(parsed_data, list) and len(parsed_data) >= 2:
                                event_name = parsed_data[0]
                                event_data = parsed_data[1]
                                if isinstance(event_data, dict):
                                    if 'history' in event_data or 'candles' in event_data:
                                        logger.info(f"INTERCEPTOR: Caught history event: {event_name}")
                                        if 'event' not in event_data:
                                            event_data['event'] = event_name
                                        self._history_buffer.append(event_data)
                                        found_history = True
                            elif isinstance(parsed_data, dict):
                                if 'history' in parsed_data or 'candles' in parsed_data:
                                    self._history_buffer.append(parsed_data)
                                    found_history = True
                            
                            # 2. Check for ticks (only if not a history payload)
                            if not found_history:
                                ticks = self._extract_ticks(parsed_data)
                                if ticks:
                                    self._tick_buffer.extend(ticks)
                                    
                except Exception as e:
                    logger.debug(f"Error parsing log entry: {e}")
                    continue
        except Exception as e:
            logger.error(f"Error fetching logs: {e}")

    def fetch_history_events(self) -> List[Dict[str, Any]]:
        """
        Returns buffered history events and refreshes logs.
        """
        self._refresh_logs()
        events = list(self._history_buffer)
        self._history_buffer = []
        return events

    def fetch_ticks(self) -> List[Tick]:
        """
        Returns buffered ticks and refreshes logs.
        """
        self._refresh_logs()
        ticks = list(self._tick_buffer)
        self._tick_buffer = []
        return ticks

    def _looks_like_base64(self, s: str) -> bool:
        """
        Heuristic check to see if a string looks like base64.
        """
        if not s:
            return False
        # Check for valid base64 characters
        if not re.fullmatch(r'[A-Za-z0-9+/=]+', s):
            return False
        # Length must be a multiple of 4
        return len(s) % 4 == 0

    def _parse_payload(self, payload_data: str) -> Optional[Any]:
        """
        Decodes and parses the WebSocket payload.
        """
        try:
            # 1. Try to decode base64 (if it looks like base64)
            decoded_text = payload_data
            
            if self._looks_like_base64(payload_data):
                try:
                    decoded_text = base64.b64decode(payload_data).decode('utf-8')
                except Exception as e:
                    # Downgrade to debug to reduce log noise for non-base64 data that passed the heuristic
                    logger.debug(f"Failed to decode potential base64 payload, using raw data: {e}")
                    decoded_text = payload_data
            
            # 2. Handle Socket.IO format (remove numeric prefix)
            # e.g. "42[...]" -> "[...]"
            if decoded_text and decoded_text[0].isdigit():
                match = re.match(r'^\d+', decoded_text)
                if match:
                    decoded_text = decoded_text[match.end():]

            # 3. Parse JSON
            if decoded_text.startswith('[') or decoded_text.startswith('{'):
                return json.loads(decoded_text)
            
            return None

        except Exception as e:
            logger.warning(f"Payload parse error: {e}")
            return None

    def _extract_ticks(self, data: Any) -> List[Tick]:
        """
        Extracts Tick objects from the parsed data structure.
        """
        ticks = []
        
        # Handle Socket.IO event arrays: ["event_name", data]
        if isinstance(data, list) and len(data) >= 2:
            event_name = data[0]
            event_data = data[1]
            
            # Check for updateStream or similar events
            # Based on reference, real-time data often comes as a list of updates
            # [[asset, timestamp, price], ...] or just [asset, timestamp, price]
            
            if isinstance(event_data, list):
                # Check if it's a list of updates
                if len(event_data) > 0 and isinstance(event_data[0], list):
                    for item in event_data:
                        tick = self._parse_single_tick(item)
                        if tick:
                            ticks.append(tick)
                else:
                    # Single update
                    tick = self._parse_single_tick(event_data)
                    if tick:
                        ticks.append(tick)
                        
            elif isinstance(event_data, dict):
                # Handle dict format if applicable
                # {"asset": "EURUSD", "price": 1.05, "timestamp": ...}
                tick = self._parse_single_tick_dict(event_data)
                if tick:
                    ticks.append(tick)

        # Handle direct list of updates (if not wrapped in Socket.IO event)
        elif isinstance(data, list):
             if len(data) > 0 and isinstance(data[0], list):
                for item in data:
                    tick = self._parse_single_tick(item)
                    if tick:
                        ticks.append(tick)
             else:
                 tick = self._parse_single_tick(data)
                 if tick:
                     ticks.append(tick)

        return ticks

    def _parse_single_tick(self, item: List) -> Optional[Tick]:
        """
        Parses a list [asset, timestamp, price] into a Tick.
        """
        try:
            if len(item) >= 3:
                raw_asset = item[0]
                timestamp = float(item[1])
                price = float(item[2])
                
                asset = normalize_asset(raw_asset)
                
                logger.debug(f"Raw Tick: {raw_asset} -> {asset} {price}")
                
                return Tick(
                    timestamp=timestamp,
                    asset=asset,
                    price=price,
                    source="pocketoption"
                )
        except Exception as e:
            logger.error(f"Error parsing single tick list: {item} - {e}")
        return None

    def _parse_single_tick_dict(self, item: Dict) -> Optional[Tick]:
        """
        Parses a dict into a Tick.
        """
        try:
            raw_asset = item.get('asset') or item.get('symbol')
            price = item.get('price') or item.get('value') or item.get('quote')
            timestamp = item.get('timestamp')
            
            if raw_asset and price and timestamp:
                asset = normalize_asset(raw_asset)
                return Tick(
                    timestamp=float(timestamp),
                    asset=asset,
                    price=float(price),
                    source="pocketoption"
                )
        except Exception as e:
            logger.error(f"Error parsing single tick dict: {item} - {e}")
        return None
