import asyncio
import base64
import binascii
import json
import os
import re
from datetime import datetime, timezone
import time as time_mod
from typing import Any, Dict, List, Optional, Tuple

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By

try:
    # Try relative import first (when used as module)
    from .base import CapResult, Capability, Ctx, add_utils_to_syspath, save_json, timestamp
except ImportError:
    # Fallback for standalone execution
    import sys
    from pathlib import Path
    this_file = Path(__file__).resolve()
    api_root = this_file.parents[1]  # .../API-test-space
    if str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))
    from capabilities.base import CapResult, Capability, Ctx, add_utils_to_syspath, save_json, timestamp

add_utils_to_syspath()

class RealtimeDataStreaming(Capability):
    id: str = "realtime_data_streaming"
    kind: str = "read"

    def __init__(self):
        # Global state management following po_bot_v2.py methodology
        self.CANDLES: Dict[str, List[List[Any]]] = {}  # asset -> [[timestamp, open, close, high, low], ...]
        self.PERIOD: int = 60  # Default period in seconds (1 minute)
        # When locked, PERIOD should not be overridden by incoming chart settings.
        # This helps force a 1m stream when the platform UI reports an unexpected timeframe.
        self.PERIOD_LOCKED: bool = False
        self.CURRENT_ASSET: Optional[str] = None
        self.realtime_asset_data: List[Dict[str, Any]] = []
        self.current_asset_prices: Dict[str, Any] = {}  # To store the latest price for each asset
        self.SESSION_ID = None
        self.USER_ID = None
        self.FAVORITES = []
        self.SESSION_AUTHENTICATED = False
        self.SESSION_TIMEFRAME_DETECTED = False
        self.TICK_DATA_MODE: bool = False
        
        # New streaming mode attributes
        self.CANDLE_ONLY_MODE: bool = False
        self.TICK_ONLY_MODE: bool = False
        self.ASSET_FOCUS_MODE: bool = False

    # ========================================
    # Helper Methods
    # ========================================
    
    @staticmethod
    def _normalize_asset_name(asset: str) -> str:
        """
        Normalize asset names for consistent comparison.
        Removes underscores, slashes, spaces and converts to uppercase.
        
        Examples:
            'USDJPY_otc' -> 'USDJPYOTC'
            'EUR/USD_OTC' -> 'EURUSDOTC'
            'GBPUSD' -> 'GBPUSD'
        
        Args:
            asset: Raw asset name from any source
            
        Returns:
            Normalized asset name (uppercase, no special chars)
        """
        if not asset:
            return ''
        return asset.replace('_', '').replace('/', '').replace(' ', '').upper()
    
    # ========================================
    # Public API Methods (for external control)
    # ========================================
    
    def set_asset_focus(self, asset: str) -> None:
        """
        Enable asset focus mode and lock to a specific asset.
        This prevents the capability from auto-switching assets based on Pocket Option UI.
        
        Args:
            asset: The asset symbol to focus on (e.g., 'EURUSD_OTC')
        """
        self.ASSET_FOCUS_MODE = True
        self.CURRENT_ASSET = asset
    
    def release_asset_focus(self) -> None:
        """
        Disable asset focus mode, allowing the capability to auto-sync with Pocket Option UI.
        """
        self.ASSET_FOCUS_MODE = False
    
    def set_timeframe(self, minutes: int, lock: bool = True) -> None:
        """
        Set the timeframe for candle formation.
        
        Args:
            minutes: Timeframe in minutes (1, 5, 15, 60, etc.)
            lock: If True, prevents auto-detection from overriding this timeframe
        """
        self.PERIOD = minutes * 60  # Convert to seconds
        self.PERIOD_LOCKED = lock
        self.SESSION_TIMEFRAME_DETECTED = True
    
    def unlock_timeframe(self) -> None:
        """
        Unlock timeframe to allow auto-detection from chart settings.
        """
        self.PERIOD_LOCKED = False
    
    def get_latest_candle(self, asset: str) -> Optional[List[Any]]:
        """
        Get the latest candle for a specific asset.
        Uses normalized asset name matching to handle format variations.
        
        Args:
            asset: The asset symbol (any format: USDJPY_otc, USDJPYOTC, etc.)
            
        Returns:
            Latest candle as [timestamp, open, close, high, low] or None
        """
        # Try direct lookup first (fast path)
        if asset in self.CANDLES and self.CANDLES[asset]:
            return self.CANDLES[asset][-1]
        
        # If not found, try normalized matching (handles format differences)
        normalized_asset = self._normalize_asset_name(asset)
        for stored_asset in self.CANDLES:
            if self._normalize_asset_name(stored_asset) == normalized_asset:
                if self.CANDLES[stored_asset]:
                    return self.CANDLES[stored_asset][-1]
        
        return None
    
    def get_all_candles(self, asset: str) -> List[List[Any]]:
        """
        Get all candles for a specific asset.
        Uses normalized asset name matching to handle format variations.
        
        Args:
            asset: The asset symbol (any format: USDJPY_otc, USDJPYOTC, etc.)
            
        Returns:
            List of candles, each as [timestamp, open, close, high, low]
        """
        # Try direct lookup first (fast path)
        if asset in self.CANDLES:
            return self.CANDLES[asset]
        
        # If not found, try normalized matching (handles format differences)
        normalized_asset = self._normalize_asset_name(asset)
        for stored_asset in self.CANDLES:
            if self._normalize_asset_name(stored_asset) == normalized_asset:
                return self.CANDLES[stored_asset]
        
        return []
    
    def get_current_asset(self) -> Optional[str]:
        """
        Get the currently focused or active asset.
        
        Returns:
            The current asset symbol or None
        """
        return self.CURRENT_ASSET
    
    def detect_asset_from_ui(self, driver) -> Optional[str]:
        """
        Actively detect the currently selected asset from PocketOption's UI.
        
        Args:
            driver: Selenium WebDriver instance
            
        Returns:
            The detected asset symbol or None
        """
        if not driver:
            return None
        
        try:
            # Strategy 1: Check for active/selected asset in favorites bar
            # PocketOption highlights the active asset with specific classes
            selectors = [
                ".assets-favorites-item__line.active .assets-favorites-item__label",
                ".assets-favorites-item__line.selected .assets-favorites-item__label",
                ".assets-favorites-item--active .assets-favorites-item__label",
                ".assets-favorites-item.active .assets-favorites-item__label",
                # Fallback: check chart title area
                ".chart-header .asset-name",
                ".chart-title .asset",
                "[class*='chart'][class*='header'] [class*='asset']",
            ]
            
            for selector in selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    if elements and len(elements) > 0:
                        asset_text = elements[0].text.strip()
                        if asset_text:
                            # Clean up asset text (remove spaces, special chars)
                            asset = asset_text.replace(' ', '').replace('/', '').upper()
                            if asset:
                                return asset
                except Exception:
                    continue
            
            # Strategy 2: Check URL for asset parameter
            try:
                current_url = driver.current_url
                if 'active_symbol=' in current_url or 'symbol=' in current_url:
                    import urllib.parse
                    params = urllib.parse.parse_qs(urllib.parse.urlparse(current_url).query)
                    asset = params.get('active_symbol', params.get('symbol', [None]))[0]
                    if asset:
                        return asset.strip().upper()
            except Exception:
                pass
            
            # Strategy 3: Execute JavaScript to get active asset from page state
            try:
                asset = driver.execute_script("""
                    // Check for active asset in various possible locations
                    const selectors = [
                        '.assets-favorites-item.active .assets-favorites-item__label',
                        '.assets-favorites-item--active .assets-favorites-item__label',
                        '[data-active="true"] .assets-favorites-item__label',
                        '.chart-header .asset-name',
                        '.current-asset'
                    ];
                    
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent) {
                            return el.textContent.trim();
                        }
                    }
                    return null;
                """)
                if asset:
                    return asset.replace(' ', '').replace('/', '').upper()
            except Exception:
                pass
            
            return None
            
        except Exception as e:
            print(f"[DetectAsset] Error detecting asset from UI: {e}")
            return None

    # ========================================
    # Internal Processing Methods
    # ========================================

    def _decode_and_parse_payload(self, encoded_payload: str) -> Optional[Any]:
        """Decodes a base64 payload and parses it as JSON."""
        try:
            decoded_payload = base64.b64decode(encoded_payload).decode('utf-8')
            
            # Handle Socket.IO prefixes and event arrays
            decoded_payload = self._handle_socketio_format(decoded_payload)
            
            # Try to load as JSON directly
            return self._parse_json_payload(decoded_payload)
                
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as e:
            if self.ctx and self.ctx.verbose:
                print(f"⚠️ Payload decode error: {e}")
            return None

    def _handle_socketio_format(self, payload: str) -> str:
        """Handle Socket.IO prefixes and event arrays."""
        if not payload or not payload[0].isdigit():
            return payload
            
        # Remove numeric prefix
        match = re.match(r'^\d+', payload)
        if match:
            payload = payload[match.end():]
        
        # Handle Socket.IO event arrays like 42["event", data]
        if payload.startswith('["') and ']' in payload:
            event_match = re.match(r'\["([^"]+)"(?:,\s*(.+))?\]', payload)
            if event_match:
                event_name = event_match.group(1)
                data_str = event_match.group(2) if event_match.group(2) else '[]'
                try:
                    data = json.loads(data_str) if data_str else {}
                    # For Socket.IO events, we return a dict with event name and data
                    # This is a special case that should be handled by the caller
                    return json.dumps({"event": event_name, "data": data})
                except json.JSONDecodeError:
                    pass
                    
        return payload

    def _parse_json_payload(self, payload: str) -> Optional[Any]:
        """Parse JSON payload with fallback options."""
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            # If fails, try stripping outer array if present
            if payload.startswith('[') and payload.endswith(']'):
                inner = payload[1:-1]
                try:
                    parsed = json.loads(inner)
                    return [parsed] if isinstance(parsed, dict) else parsed
                except json.JSONDecodeError:
                    pass
            raise

    def _process_session_message(self, message: Dict[str, Any], ctx: Ctx) -> None:
        """Process session/connection and authentication messages with flexible parsing."""
        try:
            # Normalize message format
            payload = self._normalize_session_message(message)
            
            if ctx.verbose:
                print(f"🔍 Processing session message: {type(payload)} - {payload[:100] if isinstance(payload, str) else str(payload)[:100]}...")
            
            # Handle connection/session ID
            self._handle_session_id(payload, ctx)
            
            # Check for authentication indicators (flexible)
            self._check_authentication(payload, ctx)
            
            # Handle favorites
            self._handle_favorites(payload, ctx)
            
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing session message: {e}")

    def _normalize_session_message(self, message: Dict[str, Any]) -> Any:
        """Normalize session message format."""
        if isinstance(message, str):
            message = {"raw": message}
            
        # Try to get the decoded payload if available
        raw_message = message.get('raw', str(message))
        return self._decode_and_parse_payload(raw_message) if isinstance(raw_message, str) else message

    def _handle_session_id(self, payload: Any, ctx: Ctx) -> None:
        """Handle session ID and user ID from payload."""
        if not isinstance(payload, dict):
            return
            
        if 'sid' in payload:
            self.SESSION_ID = payload.get('sid')
            if ctx.verbose and self.SESSION_ID:
                print(f"🔗 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Session connected: {self.SESSION_ID[:8]}...")
        elif 'id' in payload or 'user_id' in payload:
            self.USER_ID = payload.get('id') or payload.get('user_id')
            if ctx.verbose:
                print(f"👤 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] User ID detected: {self.USER_ID}")

    def _check_authentication(self, payload: Any, ctx: Ctx) -> None:
        """Check for authentication indicators in the payload."""
        auth_indicators = [
            'auth' in str(payload).lower() and 'success' in str(payload).lower(),
            isinstance(payload, dict) and payload.get('authenticated', False),
            isinstance(payload, dict) and 'success' in payload.get('status', ''),
            'login_success' in str(payload).lower(),
            'user_ready' in str(payload).lower()
        ]
        
        if any(auth_indicators):
            self.SESSION_AUTHENTICATED = True
            if ctx.verbose:
                print(f"✅ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Authentication detected via flexible parsing")

    def _handle_favorites(self, payload: Any, ctx: Ctx) -> None:
        """Handle favorites data from the payload."""
        if isinstance(payload, list) and all(isinstance(item, str) for item in payload):
            self.FAVORITES = payload
            if ctx.verbose:
                print(f"⭐ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Favorites updated: {len(self.FAVORITES)} assets")
        elif isinstance(payload, dict) and 'favorites' in payload:
            self.FAVORITES = payload.get('favorites', [])
            if ctx.verbose:
                print(f"⭐ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Favorites from dict: {len(self.FAVORITES)} assets")

    def _process_chart_settings(self, payload: Any, ctx: Ctx) -> None:
        """Extract and sync chart settings from updateCharts messages with flexible parsing."""
        try:
            if ctx.verbose:
                print(f"📈 Processing chart settings payload: {type(payload)}")
            
            # Flatten payload if it's a list
            if isinstance(payload, list):
                for item in payload:
                    self._process_chart_settings(item, ctx)
                return
            
            if not isinstance(payload, dict):
                return
            
            # Extract settings from payload and process them
            settings = self._extract_settings(payload)
            if settings:
                self._process_chart_settings_data(settings, payload, ctx)
                                
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing chart settings: {e}")

    def _process_chart_settings_data(self, settings: Dict[str, Any], payload: Dict[str, Any], ctx: Ctx) -> None:
        """Process chart settings data including period and current asset."""
        # Process chart period
        self._process_chart_period(settings, ctx)
        
        # Process current asset
        self._process_current_asset(settings, payload, ctx)

    def _extract_settings(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract settings from the payload."""
        settings = None
        if 'settings' in payload:
            try:
                settings_str = payload['settings']
                if isinstance(settings_str, str):
                    settings = json.loads(settings_str)
                else:
                    settings = settings_str
            except json.JSONDecodeError:
                settings = payload['settings']
        
        # Fallback: search entire payload for chart-related keys
        if not settings:
            payload_str = json.dumps(payload)
            if 'chartPeriod' in payload_str or 'period' in payload_str or 'timeframe' in payload_str:
                # Extract potential settings
                for key, value in payload.items():
                    if isinstance(value, dict) and ('period' in value or 'chart' in str(key).lower()):
                        settings = value
                        break
        
        return settings

    def _process_chart_period(self, settings: Dict[str, Any], ctx: Ctx) -> None:
        """Process chart period from settings."""
        # Respect externally locked timeframe
        if self.PERIOD_LOCKED:
            self.SESSION_TIMEFRAME_DETECTED = True
            if ctx.verbose:
                print(f"⏱️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Chart timeframe locked at {int(self.PERIOD/60)} minutes; skipping auto-detection")
            return
        chart_period_keys = ['chartPeriod', 'period', 'timeframe', 'interval']
        chart_period = None
        for key in chart_period_keys:
            if key in settings:
                chart_period = settings[key]
                break
        
        if chart_period is not None:
            # Map to minutes (expanded mapping)
            period_map = {
                1: 1, 2: 2, 3: 3, 4: 5, 5: 10, 6: 15, 7: 30, 8: 60, 9: 240, 10: 1440,
                '1m': 1, '2m': 2, '3m': 3, '5m': 5, '10m': 10, '15m': 15, '30m': 30,
                '1h': 60, '4h': 240, '1d': 1440
            }
            minutes = period_map.get(chart_period, 1)
            self.PERIOD = minutes * 60  # Convert to seconds
            self.SESSION_TIMEFRAME_DETECTED = True
            if ctx.verbose:
                print(f"⏱️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Chart timeframe detected: {minutes} minutes (key: {chart_period})")

    def _process_current_asset(self, settings: Dict[str, Any], payload: Dict[str, Any], ctx: Ctx) -> None:
        """Process current asset from settings."""
        # When Asset Focus Mode is enabled and a user-selected asset is already set,
        # do NOT auto-sync CURRENT_ASSET from incoming settings/payload.
        # This prevents unexpected switches (e.g., to DOGE_OTC) while the user is
        # focusing a specific asset in the GUI.
        if self.ASSET_FOCUS_MODE and self.CURRENT_ASSET:
            if ctx.verbose:
                print(f"🎯 [Asset Focus] Keeping focused asset: {self.CURRENT_ASSET}; skipping auto asset sync")
            return

        symbol_keys = ['symbol', 'asset', 'pair', 'instrument']
        for key in symbol_keys:
            if key in settings:
                symbol = settings[key]
                if symbol:
                    self.CURRENT_ASSET = symbol
                    if ctx.verbose:
                        print(f"🎯 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Current asset synced: {symbol} (from {key})")
                    return
            
            # Also check in main payload
            if key in payload:
                symbol = payload[key]
                if symbol:
                    self.CURRENT_ASSET = symbol
                    if ctx.verbose:
                        print(f"🎯 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Current asset synced: {symbol} (from payload {key})")
                    return

    def _extract_favorites_from_payload(self, payload: Any, ctx: Ctx) -> None:
        """Extract favorite assets from decoded payload."""
        try:
            if isinstance(payload, list) and all(isinstance(item, str) for item in payload):
                # This looks like a list of asset symbols
                self.FAVORITES = payload
                if ctx.verbose:
                    print(f"⭐ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Favorites updated: {len(self.FAVORITES)} assets")
                    if ctx.debug:
                        print(f"    Assets: {', '.join(self.FAVORITES[:5])}{'...' if len(self.FAVORITES) > 5 else ''}")
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error extracting favorites: {e}")

    def _process_historical_data(self, data: Dict[str, Any], ctx: Ctx) -> None:
        """Process historical data with candle formation following po_bot_v2.py methodology."""
        try:
            if 'history' in data:
                # Extract asset from the data
                asset = data.get('asset')
                if not asset and 'candles' in data and len(data['candles']) > 0:
                    # Try to get asset from first candle if available
                    first_candle = data['candles'][0]
                    if isinstance(first_candle, dict):
                        asset = first_candle.get('asset', self.CURRENT_ASSET)
                
                # Use current asset if still not found
                if not asset:
                    asset = self.CURRENT_ASSET
                
                if not asset:
                    if ctx.verbose:
                        print(f"⚠️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] No asset specified in historical data")
                    return
                
                
                # Asset filtering: Skip if asset focus mode is enabled and asset doesn't match current asset
                # Use normalized comparison to handle format differences (USDJPY_otc vs USDJPYOTC)
                if self.ASSET_FOCUS_MODE and self.CURRENT_ASSET and self._normalize_asset_name(asset) != self._normalize_asset_name(self.CURRENT_ASSET):
                    if ctx.verbose:
                        print(f"🔍 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Filtering out historical data for {asset} (focus on {self.CURRENT_ASSET})")
                    return
                
                # Update current asset tracking (sync with user's session)
                if asset and not self.CURRENT_ASSET:
                    self.CURRENT_ASSET = asset
                    if ctx.verbose:
                        print(f"🎯 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Current asset synced: {asset}")
                
                # Process candles
                candles = []
                if 'candles' in data:
                    candles = list(reversed(data['candles']))
                
                # Process history points
                for tstamp, value in data['history']:
                    tstamp = int(float(tstamp))
                    # Find or create candle for this timestamp
                    candle_start = (tstamp // self.PERIOD) * self.PERIOD if self.PERIOD else tstamp
                    
                    # Find existing candle or create new one
                    existing_candle = None
                    for c in candles:
                        if c[0] == candle_start:
                            existing_candle = c
                            break
                    
                    if existing_candle:
                        # Update existing candle
                        existing_candle[2] = value  # close
                        if value > existing_candle[3]:
                            existing_candle[3] = value  # high
                        if value < existing_candle[4]:
                            existing_candle[4] = value  # low
                    else:
                        # Create new candle
                        candles.append([candle_start, value, value, value, value])
                
                # Sort candles by timestamp
                candles.sort(key=lambda x: x[0])
                
                # Store candles
                self.CANDLES[asset] = candles
                
                if ctx.verbose:
                    print(f"📊 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Processed {len(candles)} candles for {asset}")

                    
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing historical data: {e}")

    def _process_realtime_update(self, data: Any, ctx: Ctx) -> None:
        """Process real-time price updates with flexible parsing."""
        try:
            asset = None
            current_value = None
            tstamp = None
            
            if isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], list) and len(data[0]) >= 3:
                    # Original array format: [[asset, timestamp, price], ...]
                    asset = data[0][0]
                    tstamp = int(float(data[0][1]))
                    current_value = data[0][2]
                else:
                    # Simple list of prices or timestamps
                    current_value = data[-1] if isinstance(data[-1], (int, float)) else None
                    tstamp = int(time_mod.time())
                    asset = self.CURRENT_ASSET or 'Unknown'
            
            elif isinstance(data, dict):
                # Dict format: {"asset": "EURUSD", "quote": 1.1234, "timestamp": 1234567890}
                asset = data.get('asset') or data.get('symbol') or self.CURRENT_ASSET
                current_value = data.get('quote') or data.get('price') or data.get('value')
                tstamp = data.get('timestamp', int(time_mod.time()))
                if isinstance(tstamp, str):
                    tstamp = int(float(tstamp))
            
            else:
                # Fallback for scalar values
                current_value = float(data) if isinstance(data, (int, float, str)) else None
                tstamp = int(time_mod.time())
                asset = self.CURRENT_ASSET or 'Unknown'
            
            # CRITICAL FIX: Asset filtering BEFORE processing
            # Skip this update if asset focus mode is enabled and this isn't the focused asset
            # Use normalized comparison to handle format differences (USDJPY_otc vs USDJPYOTC)
            if self.ASSET_FOCUS_MODE and self.CURRENT_ASSET and asset and self._normalize_asset_name(asset) != self._normalize_asset_name(self.CURRENT_ASSET):
                if ctx.verbose:
                    print(f"🔍 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Filtering out {asset} (focus on {self.CURRENT_ASSET})")
                return
            
            if asset and current_value is not None and tstamp is not None:
                # Update or create candles
                if asset not in self.CANDLES:
                    self.CANDLES[asset] = []
                
                candles = self.CANDLES[asset]
                
                # Align timestamp to period boundary (round down to :00 seconds)
                candle_start = (tstamp // self.PERIOD) * self.PERIOD if self.PERIOD else tstamp
                
                if not candles:
                    # Initialize with first candle using aligned timestamp
                    candles.append([candle_start, current_value, current_value, current_value, current_value])
                else:
                    # Check if we've crossed into a new candle period
                    last_candle_start = candles[-1][0]
                    
                    if candle_start > last_candle_start:
                        # New candle period - create new candle with aligned timestamp
                        candles.append([candle_start, current_value, current_value, current_value, current_value])
                        if ctx.verbose:
                            print(f"📈 New candle created for {asset} at {datetime.fromtimestamp(candle_start, tz=timezone.utc).strftime('%H:%M:%S')}")
                    else:
                        # Same candle period - update last candle
                        candles[-1][2] = current_value  # close
                        candles[-1][3] = max(candles[-1][3], current_value)  # high
                        candles[-1][4] = min(candles[-1][4], current_value)  # low
                
                # Store real-time update
                self.realtime_asset_data.append({
                    "timestamp": datetime.fromtimestamp(tstamp, tz=timezone.utc).isoformat().replace('+00:00', 'Z'),
                    "asset": asset,
                    "price": current_value,
                    "raw_timestamp": tstamp,
                    "raw_payload": data
                })
                if len(self.realtime_asset_data) > 10000:
                    self.realtime_asset_data = self.realtime_asset_data[-10000:]
                self.current_asset_prices[asset] = {"price": current_value, "timestamp": tstamp}
                
                if ctx.verbose:
                    print(f"💰 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Real-time update for {asset}: {current_value} at {tstamp}")
                    
        except (ValueError, TypeError) as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing real-time update: {e} for payload {data}")

    def _stream_realtime_update(self, data: List[Any], ctx: Ctx) -> None:
        """Process and immediately output real-time price updates for streaming mode."""
        try:
            asset = data[0][0]
            current_value = data[0][2]
            tstamp = int(float(data[0][1]))
            timestamp_str = datetime.fromtimestamp(tstamp, tz=timezone.utc).strftime("%H:%M:%SZ")
            
            # Asset filtering: Skip if asset focus mode is enabled and asset doesn't match current asset
            # Use normalized comparison to handle format differences (USDJPY_otc vs USDJPYOTC)
            if self.ASSET_FOCUS_MODE and self.CURRENT_ASSET and self._normalize_asset_name(asset) != self._normalize_asset_name(self.CURRENT_ASSET):
                if ctx.verbose:
                    print(f"🔍 [{timestamp_str}] Filtering out {asset} (focus on {self.CURRENT_ASSET})")
                return
            
            # Update candles and prices
            self._update_candles_and_prices(asset, current_value, tstamp, timestamp_str)
            
            # Format price change indicator
            change_indicator = self._get_price_change_indicator(asset, current_value)
            
            # Store previous price for next comparison
            self.current_asset_prices[f"{asset}_prev"] = self.current_asset_prices.get(asset, current_value)
            
            # Output based on streaming mode
            self._output_streaming_data(asset, current_value, timestamp_str, change_indicator)
                
        except (IndexError, ValueError, TypeError) as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing stream: {e}")

    def _update_candles_and_prices(self, asset: str, current_value: float, tstamp: int, timestamp_str: str) -> None:
        """Update candles and prices for the asset."""
        # Update candles if available
        self._update_candles(asset, current_value, tstamp, timestamp_str)
        
        # Store real-time update
        self.current_asset_prices[asset] = current_value

    def _update_candles(self, asset: str, current_value: float, tstamp: int, timestamp_str: str) -> None:
        """Update candle data for the asset."""
        if asset in self.CANDLES and self.CANDLES[asset]:
            candles = self.CANDLES[asset]
            candles[-1][2] = current_value  # set close
            if current_value > candles[-1][3]:  # set high
                candles[-1][3] = current_value
            if current_value < candles[-1][4]:  # set low
                candles[-1][4] = current_value
            
            # Check if we need to create a new candle
            candle_boundary = (tstamp // self.PERIOD) * self.PERIOD
            last_boundary = (candles[-1][0] // self.PERIOD) * self.PERIOD
            if candle_boundary > last_boundary:
                candles.append([tstamp, current_value, current_value, current_value, current_value])
                print(f"🕯️  [{timestamp_str}] NEW CANDLE {asset}: O:{current_value} H:{current_value} L:{current_value} C:{current_value}")

    def _get_price_change_indicator(self, asset: str, current_value: float) -> str:
        """Get price change indicator based on previous price."""
        change_indicator = ""
        if asset in self.current_asset_prices:
            prev_price = self.current_asset_prices.get(f"{asset}_prev", current_value)
            if current_value > prev_price:
                change_indicator = "📈"
            elif current_value < prev_price:
                change_indicator = "📉"
            else:
                change_indicator = "➡️"
        return change_indicator

    def _output_streaming_data(self, asset: str, current_value: float, timestamp_str: str, change_indicator: str) -> None:
        """Output streaming data based on the current mode."""
        if self.TICK_ONLY_MODE:
            # TICK ONLY MODE: Only output raw tick data
            print(f"TICK|{timestamp_str}|{asset}|{current_value}|{change_indicator}")
        elif self.CANDLE_ONLY_MODE:
            # CANDLE ONLY MODE: Only output OHLC candle data when available
            if (self.SESSION_TIMEFRAME_DETECTED and
                asset in self.CANDLES and
                self.CANDLES[asset] and
                self.PERIOD and
                len(self.CANDLES[asset]) > 0):
                
                candle = self.CANDLES[asset][-1]
                candle_timestamp = datetime.fromtimestamp(candle[0], tz=timezone.utc).strftime('%H:%M:%SZ')
                open_price = candle[1]
                high_price = candle[3]
                low_price = candle[4]
                volume = 0  # Volume not available in current data
                
                # Output OHLC candle data with session-synced timeframe
                print(f"OHLC|{candle_timestamp}|{asset}|{self.PERIOD//60}m|O:{open_price}|H:{high_price}|L:{low_price}|C:{current_value}|V:{volume}|{change_indicator}")
            # Skip tick data output in candle-only mode
        elif self.TICK_DATA_MODE:
            # Raw tick data output (legacy mode)
            print(f"TICK|{timestamp_str}|{asset}|{current_value}|{change_indicator}")
        else:
            # Default/BOTH mode: Output both TICK and OHLC if available
            # TICK output
            print(f"TICK|{timestamp_str}|{asset}|{current_value}|{change_indicator}")
            
            # OHLC if available
            if (self.SESSION_TIMEFRAME_DETECTED and
                asset in self.CANDLES and
                self.CANDLES[asset] and
                self.PERIOD and
                len(self.CANDLES[asset]) > 0):
                
                candle = self.CANDLES[asset][-1]
                candle_timestamp = datetime.fromtimestamp(candle[0], tz=timezone.utc).strftime('%H:%M:%SZ')
                open_price = candle[1]
                high_price = candle[3]
                low_price = candle[4]
                volume = 0  # Volume not available in current data
                
                # Output OHLC candle data with session-synced timeframe
                print(f"OHLC|{candle_timestamp}|{asset}|{self.PERIOD//60}m|O:{open_price}|H:{high_price}|L:{low_price}|C:{current_value}|V:{volume}|{change_indicator}")
            else:
                # Fallback to simple price display until session sync is established
                sync_status = "⏳" if not self.SESSION_TIMEFRAME_DETECTED else "📊"
                print(f"{sync_status} [{timestamp_str}] {asset}: {current_value} {change_indicator}")

    def stream_continuous(self, ctx: Ctx, inputs: Dict[str, Any]) -> None:
        """Continuous streaming mode that outputs real-time data to terminal."""
        add_utils_to_syspath()
        self.ctx = ctx
        
        # Reset state for new stream
        self._reset_stream_state(inputs)
        
        # Display stream information
        self._display_stream_info(inputs)
        
        # Handle asset focus mode
        if self.ASSET_FOCUS_MODE:
            self._handle_asset_focus_mode(ctx)
        
        # Main streaming loop
        self._run_streaming_loop(ctx)
        
        # Final summary
        self._display_stream_summary(ctx)

    def _display_stream_info(self, inputs: Dict[str, Any]) -> None:
        """Display stream information."""
        print(f"🚀 Starting continuous data stream (Period: {inputs.get('period', 1)}min)")
        print(f"📊 Monitoring WebSocket data from PocketOption...")
        print(f"⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')} - Stream started")
        
        # Display streaming mode information
        self._display_streaming_mode()
        
        if self.ASSET_FOCUS_MODE:
            print("🎯 Asset Focus: Enabled - Waiting for user's selected asset...")
        
        print("" + "="*60)

    def _display_streaming_mode(self) -> None:
        """Display the current streaming mode."""
        if self.CANDLE_ONLY_MODE:
            print("🕯️  Mode: CANDLE ONLY - Streaming OHLC candle data only")
            print("Format: OHLC|timestamp|asset|timeframe|O:open|H:high|L:low|C:close|V:volume|direction")
        elif self.TICK_ONLY_MODE:
            print("⚡ Mode: TICK ONLY - Streaming raw tick data only")
            print("Format: TICK|timestamp|asset|price|direction")
        elif self.TICK_DATA_MODE:
            print("🎯 Mode: Raw tick data streaming")
            print("Format: TICK|timestamp|asset|price|direction")
        else:
            print("📊 Mode: OHLC candle streaming (session-synced)")
            print("Format: OHLC|timestamp|asset|timeframe|O:open|H:high|L:low|C:close|V:volume|direction")

    def _reset_stream_state(self, inputs: Dict[str, Any]) -> None:
        """Reset the stream state for a new stream."""
        self.realtime_asset_data = []
        self.current_asset_prices = {}
        self.CANDLES = {}
        self.CURRENT_ASSET = None
        self.PERIOD = inputs.get('period', 60)  # Already in seconds



    def _handle_asset_focus_mode(self, ctx: Ctx) -> None:
        """Handle asset focus mode."""
        print("⏳ Waiting for user's selected asset to be detected...")
        asset_detected = False
        wait_start_time = datetime.now()
        
        while not asset_detected and (datetime.now() - wait_start_time).seconds < 30:  # 30 second timeout
            try:
                logs = ctx.driver.get_log('performance')
                for wsData in logs:
                    message = json.loads(wsData['message'])['message']
                    response = message.get('params', {}).get('response', {})
                    
                    if response.get('opcode', 0) == 2:
                        payload = self._decode_and_parse_payload(response['payloadData'])
                        if payload and isinstance(payload, dict) and 'history' in payload:
                            asset = payload.get('asset')
                            if asset:
                                self.CURRENT_ASSET = asset
                                print(f"✅ Asset detected: {asset}")
                                asset_detected = True
                                break
                
                if not asset_detected:
                    time_mod.sleep(0.5)
                    
            except Exception as e:
                if ctx.verbose:
                    print(f"⚠️ Error during asset detection: {e}")
                time_mod.sleep(0.5)
        
        if not asset_detected:
            print("⚠️ Asset detection timeout. Proceeding with all assets...")
            self.ASSET_FOCUS_MODE = False  # Disable focus mode if no asset detected

    def _run_streaming_loop(self, ctx: Ctx) -> None:
        """Run the main streaming loop."""
        processed_messages = set()  # Track processed message IDs to avoid duplicates
        
        try:
            while True:
                try:
                    # Get fresh WebSocket logs
                    logs = ctx.driver.get_log('performance')
                    
                    # Priority: Process chart settings first to establish session sync
                    if not self.SESSION_TIMEFRAME_DETECTED:
                        # Look specifically for updateCharts messages first
                        for wsData in logs:
                            message = json.loads(wsData['message'])['message']
                            response = message.get('params', {}).get('response', {})
                            
                            if 'updateCharts' in str(response.get('payloadData', '')):
                                payload = self._decode_and_parse_payload(response['payloadData'])
                                if payload:
                                    self._process_chart_settings(payload, ctx)
                                    break  # Exit once we have chart settings
                    
                    for wsData in logs:
                        # Create unique message ID to avoid reprocessing
                        msg_id = f"{wsData.get('timestamp', 0)}_{hash(wsData.get('message', ''))}"
                        if msg_id in processed_messages:
                            continue
                        
                        processed_messages.add(msg_id)
                        
                        message = json.loads(wsData['message'])['message']
                        response = message.get('params', {}).get('response', {})
                        
                        if response.get('opcode', 0) == 2:
                            # Check for chart update messages
                            if 'updateCharts' in str(response.get('payloadData', '')):
                                # This is a chart settings update
                                chart_payload = self._decode_and_parse_payload(response['payloadData'])
                                if chart_payload:
                                    self._process_chart_settings(chart_payload, ctx)
                                    continue  # Skip further processing for this message
                            
                            payload = self._decode_and_parse_payload(response['payloadData'])
                            
                            if payload is None:
                                continue
                            
                            # Process historical data (initial setup)
                            if isinstance(payload, dict) and 'history' in payload:
                                self._process_historical_data(payload, ctx)
                                asset = payload.get('asset', self.CURRENT_ASSET or 'Unknown')
                                candle_count = len(self.CANDLES.get(asset, []))
                                print(f"📈 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Loaded {candle_count} historical candles for {asset}")
                                if self.SESSION_TIMEFRAME_DETECTED:
                                    print(f"⏱️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Session timeframe synced: {self.PERIOD // 60}m")
                            elif isinstance(payload, list):
                                self._stream_realtime_update(payload, ctx)
                    
                    # Small delay to prevent excessive CPU usage
                    time_mod.sleep(0.1)
                    
                except KeyboardInterrupt:
                    print(f"\n⏹️  [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream stopped by user")
                    break
                except WebDriverException as e:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] WebDriver error: {e}")
                    break
                except Exception as e:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream error: {e}")
                    time_mod.sleep(1)  # Wait before retrying
                    
        except KeyboardInterrupt:
            print(f"\n🛑 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream terminated")

    def _display_stream_summary(self, ctx: Ctx) -> None:
        """Display the stream summary."""
        # Final summary with expo_data
        print("" + "="*60)
        print(f"📊 Stream Summary:")
        print(f"   • Assets tracked: {len(self.current_asset_prices)}")
        print(f"   • Latest prices: {dict((k, v) for k, v in self.current_asset_prices.items() if not k.endswith('_prev'))}")
        
        # Export session data
        export_data = self.expo_data(ctx)
        if ctx.debug and ctx.artifacts_root:
            # Save export data as artifact
            export_filename = f"session_export_{timestamp()}.json"
            save_json(ctx, export_filename, export_data)
            print(f"💾 Session data exported to: {export_filename}")
        
        print(f"⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')} - Stream ended")

    def _process_websocket_message(self, message: Dict[str, Any], ctx: Ctx) -> None:
        """Process WebSocket message and extract relevant data with enhanced realtime handling."""
        try:
            # Check if message has payload data
            if 'message' in message and 'params' in message['message']:
                params = message['message']['params']
                
                # Look for WebSocket frame data
                if 'payloadData' in params:
                    self._process_payload_data(params['payloadData'], ctx)
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing WebSocket message: {e}")

    def _process_payload_data(self, raw_payload: str, ctx: Ctx) -> None:
        """Process payload data from WebSocket message."""
        # Try to decode as text first for session messages
        try:
            decoded_text = base64.b64decode(raw_payload).decode('utf-8')
            # Convert string to dict format for _process_session_message
            self._process_session_message({'raw': decoded_text}, ctx)
        except (binascii.Error, UnicodeDecodeError):
            # If text decoding fails, continue with JSON parsing
            pass
        
        # Parse as JSON for data messages
        payload = self._decode_and_parse_payload(raw_payload)
        if not payload:
            return
            
        # Process different types of payloads
        self._process_payload_by_type(payload, ctx)

    def _process_payload_by_type(self, payload: Any, ctx: Ctx) -> None:
        """Process payload based on its type."""
        # Check for favorites data
        self._extract_favorites_from_payload(payload, ctx)
        
        # Process chart settings
        if 'updateCharts' in str(payload) or 'chart' in str(payload).lower():
            self._process_chart_settings(payload, ctx)
        
        # Process historical data
        if isinstance(payload, dict) and ('history' in payload or 'candles' in payload):
            self._process_historical_data(payload, ctx)
        # Process real-time updates (enhanced)
        elif isinstance(payload, (list, dict)) or isinstance(payload, (int, float)):
            self._process_realtime_update(payload, ctx)


    def expo_data(self, ctx: Ctx) -> Dict[str, Any]:
        """Export comprehensive session data when closing."""
        try:
            export_data = {
                "session_info": {
                    "session_id": self.SESSION_ID,
                    "user_id": self.USER_ID,
                    "authenticated": self.SESSION_AUTHENTICATED,
                    "timeframe_detected": self.SESSION_TIMEFRAME_DETECTED,
                    "current_asset": self.CURRENT_ASSET,
                    "period_seconds": self.PERIOD,
                    "period_minutes": self.PERIOD // 60 if self.PERIOD else None,
                    "export_timestamp": datetime.now().isoformat(),
                    "tick_data_mode": self.TICK_DATA_MODE
                },
                "favorites": self.FAVORITES,
                "candles_data": {
                    asset: {
                        "count": len(candles),
                        "latest_candle": candles[-1] if candles else None,
                        "timeframe_minutes": self.PERIOD // 60 if self.PERIOD else None
                    } for asset, candles in self.CANDLES.items()
                },
                "realtime_data": {
                    "messages_count": len(self.realtime_asset_data),
                    "current_prices": self.current_asset_prices,
                    "latest_updates": self.realtime_asset_data[-10:] if self.realtime_asset_data else []
                },
                "session_validation": {
                    "sync_valid": self._validate_session_sync(ctx),
                    "assets_tracked": list(self.CANDLES.keys()),
                    "total_candles": sum(len(candles) for candles in self.CANDLES.values())
                }
            }
            
            if ctx.verbose:
                print(f"📤 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Session data exported: {len(self.CANDLES)} assets, {export_data['session_validation']['total_candles']} total candles")
            
            return export_data
            
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error exporting session data: {e}")
            return {"error": str(e), "timestamp": datetime.now().isoformat()}

    # NOTE: Technical indicator calculations have been moved to a dedicated module
    # See: strategies/technical_indicators.py (TechnicalIndicatorsPipeline)
    # Adapter: strategies/indicator_adapter.py (IndicatorAdapter)
    # This capability now focuses exclusively on WebSocket streaming and candle formation.
    #
    # Previous inline calculations (SMA, EMA, RSI, MACD, Bollinger) have been replaced
    # with professional-grade calculations using pandas-ta and talib libraries.
    # Now supports 13+ indicators: WMA, Stochastic, Williams %R, ROC, Schaff TC,
    # DeMarker, CCI, ATR, SuperTrend, and more.

    def get_stream_data(self, asset: str, driver: Any, ctx: Ctx) -> List[Dict[str, Any]]:
        """
        Fetches and processes real-time data from Chrome logs.
        This method is designed to be called by the streaming_server.py to abstract
        the data source logic.
        
        Args:
            asset: The currently focused asset.
            driver: The Selenium WebDriver instance.
            ctx: The capability context.
            
        Returns:
            A list of processed data entries (e.g., candle updates, tick data).
        """
        stream_data_entries = []
        
        try:
            logs = driver.get_log('performance')
            
            for log_entry in logs:
                message = json.loads(log_entry['message'])['message']
                response = message.get('params', {}).get('response', {})
                
                if response.get('opcode', 0) == 2:
                    payload_data = response.get('payloadData')
                    if payload_data:
                        payload = self._decode_and_parse_payload(payload_data)
                        
                        if payload:
                            # Process chart settings
                            if 'updateCharts' in str(payload) or 'chartPeriod' in str(payload):
                                self._process_chart_settings(payload, ctx)
                            
                            # Process real-time update
                            self._process_realtime_update(payload, ctx)
                            
                            # Extract latest candle for emission
                            current_focused_asset = self.get_current_asset()
                            if current_focused_asset:
                                candle_data = self.extract_candle_for_emit(current_focused_asset)
                                if candle_data:
                                    stream_data_entries.append({
                                        'type': 'candle_update',
                                        'asset': current_focused_asset,
                                        'candle': candle_data,
                                        'timestamp': datetime.now().isoformat(),
                                        'tick_value': candle_data['close'] # Include tick value for persistence
                                    })
        except Exception as e:
            if ctx.verbose:
                print(f"❌ Error in get_stream_data (RealtimeDataStreaming): {e}")
        
        return stream_data_entries

    def extract_candle_for_emit(self, asset: str) -> Optional[Dict]:
        """
        Extract latest formed candle from capability's candle data for Socket.IO emission.
        This emits OHLC candles instead of ticks, eliminating duplicate candle formation.
        Uses capability's public API instead of direct state access.
        """
        try:
            latest_candle = self.get_latest_candle(asset)
            
            if latest_candle:
                timestamp, open_price, close_price, high_price, low_price = latest_candle
                
                return {
                    'asset': asset,
                    'timestamp': timestamp,  # Unix timestamp in seconds
                    'open': open_price,
                    'high': high_price,
                    'low': low_price,
                    'close': close_price,
                    'volume': 0,
                    'date': datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
                }
        
        except Exception as e:
            print(f"❌ Error extracting candle for emit: {e}")
        
        return None

    def _validate_session_sync(self, ctx: Ctx) -> bool:
        """Validate that session synchronization is working correctly."""
        sync_valid = True
        validation_messages = []
        
        # Check if session timeframe is detected
        if not self.SESSION_TIMEFRAME_DETECTED:
            sync_valid = False
            validation_messages.append("❌ Session timeframe not detected")
        else:
            validation_messages.append(f"✅ Session timeframe synced: {self.PERIOD}m")
        
        # Check if current asset is detected
        if not self.CURRENT_ASSET:
            sync_valid = False
            validation_messages.append("❌ Current asset not detected")
        else:
            validation_messages.append(f"✅ Current asset synced: {self.CURRENT_ASSET}")
        
        # Check if we have candle data for the current asset
        if self.CURRENT_ASSET and self.CURRENT_ASSET in self.CANDLES:
            candle_count = len(self.CANDLES[self.CURRENT_ASSET])
            if candle_count > 0:
                validation_messages.append(f"✅ Candle data available: {candle_count} candles")
            else:
                sync_valid = False
                validation_messages.append("❌ No candle data available")
        
        # Check session authentication
        if self.SESSION_AUTHENTICATED:
            validation_messages.append("✅ Session authenticated")
        else:
            validation_messages.append("⚠️ Session authentication pending")
        
        if ctx.verbose:
            print(f"🔍 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Session Sync Validation:")
            for msg in validation_messages:
                print(f"   {msg}")
        
        return sync_valid

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        add_utils_to_syspath()  # Ensure utils are in path for any potential future imports
        self.ctx = ctx

        # Reset state for new run
        self._reset_run_state(inputs)

        try:
            # Process logs and collect data
            processed_count = self._process_logs(ctx)
            
            # Print final status
            self._print_final_status(ctx, processed_count)
            
        except WebDriverException as e:
            return CapResult(ok=False, error=f"WebDriver error during WebSocket log collection: {e}")
        except Exception as e:
            return CapResult(ok=False, error=f"Error processing WebSocket logs: {e}")

        # Prepare and save data summary
        return self._prepare_data_summary(ctx)

    def _reset_run_state(self, inputs: Dict[str, Any]) -> None:
        """Reset the state for a new run."""
        self.realtime_asset_data = []
        self.current_asset_prices = {}
        self.CANDLES = {}
        self.CURRENT_ASSET = None
        self.PERIOD = inputs.get('period', 60)  # Allow period override from inputs, in seconds

    def _process_logs(self, ctx: Ctx) -> int:
        """Process logs and collect data."""
        processed_count = 0
        max_wait_iterations = 10  # Wait up to ~10 seconds for more logs
        wait_iteration = 0

        while wait_iteration < max_wait_iterations:
            # Try to get performance logs, with fallback for different Chrome versions
            performance_logs = self._get_performance_logs(ctx)
            if not performance_logs:
                return processed_count

            # Process the logs (either performance or fallback)
            new_logs_count = self._process_log_messages(performance_logs, ctx)
            processed_count += new_logs_count

            # Check if we have sufficient session sync (auth and timeframe)
            if self.SESSION_AUTHENTICATED and self.SESSION_TIMEFRAME_DETECTED:
                if ctx.verbose:
                    print("[data_streaming] Session fully synced, stopping log collection")
                break

            # Wait for more logs if not synced yet
            if wait_iteration < max_wait_iterations - 1:
                time_mod.sleep(1)  # Wait 1 second for new logs
            wait_iteration += 1
            
        return processed_count

    def _get_performance_logs(self, ctx: Ctx) -> Optional[List[Dict[str, Any]]]:
        """Get performance logs with fallback options."""
        try:
            return ctx.driver.get_log('performance')
        except Exception as log_error:
            if ctx.verbose:
                print(f"[data_streaming] Performance logs not available: {log_error}")
                print("[data_streaming] Attempting alternative data collection methods...")

            # Fallback: Try to get browser logs or other available logs
            try:
                available_logs = ctx.driver.log_types
                if ctx.verbose:
                    print(f"[data_streaming] Available log types: {available_logs}")

                # Try browser logs as alternative
                if 'browser' in available_logs:
                    performance_logs = ctx.driver.get_log('browser')
                    if ctx.verbose:
                        print("[data_streaming] Using browser logs as fallback")
                    return performance_logs
                else:
                    # If no logs available, simulate basic data collection
                    if ctx.verbose:
                        print("[data_streaming] No suitable logs available - collecting basic page data")
                    self._collect_basic_page_data(ctx, {})
                    return None

            except Exception as fallback_error:
                if ctx.verbose:
                    print(f"[data_streaming] Fallback log collection failed: {fallback_error}")
                self._collect_basic_page_data(ctx, {})
                return None

    def _process_log_messages(self, performance_logs: List[Dict[str, Any]], ctx: Ctx) -> int:
        """Process log messages and return the count of processed messages."""
        new_logs_count = 0
        for wsData in performance_logs:
            message = json.loads(wsData['message'])
            self._process_websocket_message(message, ctx)
            new_logs_count += 1
        return new_logs_count

    def _print_final_status(self, ctx: Ctx, processed_count: int) -> None:
        """Print the final status of the data collection."""
        if ctx.verbose:
            print(f"[data_streaming] Final: Processed {processed_count} WebSocket messages")
            print(f"[data_streaming] Collected {len(self.realtime_asset_data)} real-time updates")
            print(f"[data_streaming] Tracking candles for {len(self.CANDLES)} assets")
            print(f"[data_streaming] Session authenticated: {self.SESSION_AUTHENTICATED}")
            print(f"[data_streaming] Timeframe detected: {self.SESSION_TIMEFRAME_DETECTED}")
            print(f"[data_streaming] Favorites count: {len(self.FAVORITES)}")

            # Additional debug info if not synced
            if not self.SESSION_AUTHENTICATED:
                print("[data_streaming] DEBUG: Authentication not detected - check message payloads for auth indicators")
            if not self.SESSION_TIMEFRAME_DETECTED:
                print("[data_streaming] DEBUG: Timeframe not detected - check for chartPeriod in payloads")

    def _prepare_data_summary(self, ctx: Ctx) -> CapResult:
        """Prepare and save the data summary."""
        # Prepare comprehensive data summary
        candles_summary = {}
        for asset, candles in self.CANDLES.items():
            candles_summary[asset] = {
                "total_candles": len(candles),
                "latest_candle": candles[-1] if candles else None,
                "timeframe_minutes": self.PERIOD
            }

        # Session summary
        session_summary = {
            "session_id": self.SESSION_ID,
            "user_id": self.USER_ID,
            "authenticated": self.SESSION_AUTHENTICATED,
            "timeframe_detected": self.SESSION_TIMEFRAME_DETECTED,
            "favorites_count": len(self.FAVORITES),
            "tick_data_mode": self.TICK_DATA_MODE
        }

        # Save collected data
        filename = f"realtime_streaming_data_{timestamp()}.json"
        artifact_path = save_json(ctx, f"assets_data/realtime_stream/{filename}", {
            "collected_at": datetime.now().isoformat(),
            "current_asset": self.CURRENT_ASSET,
            "period_minutes": self.PERIOD,
            "total_realtime_updates": len(self.realtime_asset_data),
            "latest_prices": self.current_asset_prices,
            "candles_summary": candles_summary,
            "realtime_updates": self.realtime_asset_data,
            "candles_data": self.CANDLES,
            "session_summary": session_summary
        })

        return CapResult(
            ok=True,
            data={
                "current_asset": self.CURRENT_ASSET,
                "period_minutes": self.PERIOD,
                "total_realtime_updates": len(self.realtime_asset_data),
                "latest_asset_prices": self.current_asset_prices,
                "candles_summary": candles_summary,
                "session_summary": session_summary,
                "artifact_path": artifact_path
            },
            artifacts=(artifact_path,)
        )

    def _collect_basic_page_data(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        """Collect basic page data when WebSocket logs are not available."""
        try:
            if ctx.verbose:
                print("[data_streaming] Collecting basic page information...")

            # Get basic page information
            page_title = ctx.driver.title
            current_url = ctx.driver.current_url
            page_source_length = len(ctx.driver.page_source)

            # Try to find trading-related elements
            asset_selectors = [
                "select[class*='asset']", "select[class*='symbol']",
                "button[class*='asset']", "div[class*='asset']",
                "[data-testid*='asset']", "[id*='asset']"
            ]

            found_assets = []
            for selector in asset_selectors:
                try:
                    elements = ctx.driver.find_elements(By.CSS_SELECTOR, selector)
                    if elements:
                        for elem in elements[:5]:  # Limit to first 5
                            text = elem.text.strip()
                            if text and len(text) > 0:
                                found_assets.append(text)
                except:
                    continue

            # Try to find chart elements
            chart_selectors = [
                "canvas", "svg", "[class*='chart']", "[id*='chart']",
                "[class*='tradingview']", "[class*='price']"
            ]

            chart_elements = 0
            for selector in chart_selectors:
                try:
                    elements = ctx.driver.find_elements(By.CSS_SELECTOR, selector)
                    chart_elements += len(elements)
                except:
                    continue

            # Create basic data structure
            basic_data = {
                "page_info": {
                    "title": page_title,
                    "url": current_url,
                    "source_length": page_source_length,
                    "is_pocketoption": "pocketoption" in current_url.lower()
                },
                "elements_found": {
                    "chart_elements": chart_elements,
                    "potential_assets": found_assets[:10]  # Limit to 10
                },
                "collection_method": "basic_page_data",
                "timestamp": datetime.now().isoformat(),
                "note": "WebSocket logs unavailable - collected basic page information only"
            }

            if ctx.verbose:
                print(f"[data_streaming] Page title: {page_title}")
                print(f"[data_streaming] Chart elements found: {chart_elements}")
                print(f"[data_streaming] Potential assets: {len(found_assets)}")

            # Save basic data
            filename = f"basic_page_data_{timestamp()}.json"
            artifact_path = save_json(ctx, f"assets_data/realtime_stream/{filename}", basic_data)

            return CapResult(
                ok=True,
                data={
                    "collection_method": "basic_page_data",
                    "page_title": page_title,
                    "chart_elements": chart_elements,
                    "potential_assets": found_assets,
                    "is_pocketoption": "pocketoption" in current_url.lower(),
                    "artifact_path": artifact_path
                },
                artifacts=(artifact_path,)
            )

        except Exception as e:
            return CapResult(ok=False, error=f"Error collecting basic page data: {e}")


def build() -> Capability:
    """Factory function to create RealtimeDataStreaming capability instance."""
    return RealtimeDataStreaming()


if __name__ == "__main__":
    import argparse
    import os
    import json as _json

    def attach_existing_chrome_session(verbose: bool = False):
        """
        Attach to an existing Chrome instance started with --remote-debugging-port=9222.
        Returns a selenium webdriver.Chrome instance or raises on failure.
        """
        try:
            if verbose:
                print("[attach] Preparing to attach to existing Chrome session at 127.0.0.1:9222")
            from selenium import webdriver  # type: ignore
            from selenium.webdriver.chrome.options import Options  # type: ignore

            options = Options()
            # Enable performance log to read WebSocket frames
            options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

            # Compatibility flags (non-invasive)
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--disable-web-security")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--no-first-run")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-popup-blocking")

            driver = webdriver.Chrome(options=options)
            if verbose:
                print(f"[attach] Attached. Current URL: {getattr(driver, 'current_url', 'unknown')}")
            return driver
        except Exception as e:
            raise RuntimeError(
                "Failed to attach to existing Chrome session at 127.0.0.1:9222. "
                "Ensure Chrome is started with --remote-debugging-port=9222. "
                f"Underlying error: {e}"
            )

    parser = argparse.ArgumentParser(description="Stream real-time WebSocket data with candle formation.")
    parser.add_argument("--period", type=int, default=1, help="Timeframe period in minutes (default: 1)")
    parser.add_argument("--output-dir", type=str, default=os.path.abspath(os.path.join("..", "data_output", "assets_data", "realtime_stream")), help="Artifacts root directory")
    parser.add_argument("--debug", action="store_true", help="Enable debug artifacts")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--stream", action="store_true", help="Enable continuous streaming mode (outputs to terminal)")
    parser.add_argument("--tick_data", action="store_true", help="Enable raw tick data mode (no candle aggregation)")
    
    # New streaming mode arguments
    parser.add_argument("--candle_only", action="store_true", help="Stream only OHLC candle data, no tick data processing")
    parser.add_argument("--tick_only", action="store_true", help="Stream only continuous tick data, no candle processing")
    parser.add_argument("--asset_focus", action="store_true", help="Focus streaming on user's currently selected asset only")
    parser.add_argument("--stream_mode", type=str, choices=["candle", "tick", "both"], help="Streaming mode: candle (OHLC only), tick (tick only), both (combined)")
    args = parser.parse_args()
    
    # Mode validation logic
    if args.candle_only and args.tick_only:
        print("❌ Error: Cannot use both --candle_only and --tick_only simultaneously")
        exit(1)
    
    if args.stream_mode:
        if args.stream_mode == "candle" and args.tick_only:
            print("❌ Error: --stream_mode=candle conflicts with --tick_only")
            exit(1)
        if args.stream_mode == "tick" and args.candle_only:
            print("❌ Error: --stream_mode=tick conflicts with --candle_only")
            exit(1)

    # Attach to running Hybrid Chrome session
    driver = attach_existing_chrome_session(verbose=args.verbose)

    # Build context and inputs
    ctx = Ctx(driver=driver, artifacts_root=args.output_dir, debug=args.debug, dry_run=False, verbose=args.verbose)
    cap = RealtimeDataStreaming()
    
    # Set streaming modes
    cap.TICK_DATA_MODE = args.tick_data
    cap.CANDLE_ONLY_MODE = args.candle_only or (args.stream_mode == "candle")
    cap.TICK_ONLY_MODE = args.tick_only or (args.stream_mode == "tick")
    cap.ASSET_FOCUS_MODE = args.asset_focus
    
    # Override TICK_DATA_MODE if using new modes
    if cap.TICK_ONLY_MODE:
        cap.TICK_DATA_MODE = True
    elif cap.CANDLE_ONLY_MODE:
        cap.TICK_DATA_MODE = False
    
    inputs = {}
    if args.period is not None:
        inputs["period"] = args.period * 60  # Convert minutes to seconds

    if args.stream:
        # Continuous streaming mode
        if args.tick_data:
            print("🎯 Starting tick data streaming mode...")
            print("Format: TICK|timestamp|asset|price|direction")
        else:
            print("📊 Starting OHLC candle streaming mode (session-synced)...")
            print("Format: OHLC|timestamp|asset|timeframe|O:open|H:high|L:low|C:close|V:volume|direction")
        print("💡 Press Ctrl+C to stop the stream")
        try:
            cap.stream_continuous(ctx, inputs)
        except KeyboardInterrupt:
            print("\n⏹️ Streaming interrupted by user")
        finally:
            driver.quit()
    else:
        # Batch processing mode (original behavior)
        res = cap.run(ctx, inputs)
        print(_json.dumps({
            "ok": res.ok,
            "data": res.data,
            "error": res.error,
            "artifacts": res.artifacts,
        }, ensure_ascii=False, indent=2))
        driver.quit()