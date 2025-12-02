#!/usr/bin/env python3
"""
self_bot.py - FINAL WORKING Self Bot v1.5 for Pocket Option Trading

This script implements the Self Bot v1.5 that monitors Telegram channels for trading signals
and executes trades on Pocket Option using the websocket SSID authentication method.

CHANGES IN v1.5:
- Replaced SQLite database with JSON file storage to eliminate locking issues
- Added interactive percentage-based amount calculator for trading
- Enhanced session management for better tracking and control
"""
import os
import sys
import json
import asyncio
import logging
import argparse
import pytz
import re
import signal
import threading
import time
import tempfile
import shutil
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any, Union
import dotenv
from timestamp_recorder import TimestampRecorder
from session_manager import SessionManager, SignalDeduplicator
from bot_warm_up_manager import BotWarmUpManager
from enhanced_bot_warm_up_manager import EnhancedBotWarmUpManager
from manual_warmup_controller import ManualWarmUpController
from selenium_session_monitor import SeleniumSessionMonitor
from session_screenshot_validator import validate_session_for_bot_startup

# High-precision timestamp function
def get_high_precision_time():
    """
    Returns a high-precision, timezone-aware UTC datetime object.
    Uses time.time_ns() for nanosecond precision, available in Python 3.7+.
    CRITICAL FIX: Actually use the nanosecond precision timestamp.
    """
    # Get current time in nanoseconds since the Epoch for high precision
    ns = time.time_ns()
    # Convert nanoseconds to a datetime object with TRUE UTC timezone
    # FIXED: Actually use the nanosecond timestamp instead of ignoring it
    utc_dt = datetime.fromtimestamp(ns / 1e9, tz=pytz.UTC)
    return utc_dt

def log_timing_event(event_type: str, timestamp: datetime = None):
    """
    Log timing events in UTC only for clean, consistent timing.
    """
    if timestamp is None:
        timestamp = get_high_precision_time()
    
    logger.info(f"{event_type} - UTC: {timestamp.isoformat()}")
    return timestamp

# Import trading client manager for optimized headless login support
try:
    from trading_client_manager import TradingClientManager, create_config_from_pocket_option_config
    TRADING_CLIENT_MANAGER_AVAILABLE = True
except ImportError:
    TRADING_CLIENT_MANAGER_AVAILABLE = False

# Import Telegram client
try:
    from telethon import TelegramClient, events
    from telethon.tl.types import Channel, Message
except ImportError:
    print("Error: telethon package is not installed.")
    print("Please install it using: pip install telethon")
    sys.exit(1)

# Import Pocket Option API v2
try:
    # Add the PocketOptionAPI-v2 directory to the path
    sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'PocketOptionAPI-v2'))
    from pocketoptionapi.stable_api import PocketOption
    import pocketoptionapi.global_value as global_value
except ImportError:
    print("Error: PocketOptionAPI-v2 package not found or cannot be imported.")
    print("Make sure the PocketOptionAPI-v2 directory is in the project root.")
    sys.exit(1)

# Import professional logging system
from professional_output_integration import initialize_professional_output, get_professional_output

# Import Telegram optimizations
from telegram_optimizations import create_telegram_optimization_manager

# Initialize professional logging system
professional_output = initialize_professional_output()

# Keep backward compatibility with existing logger references
logger = professional_output.logger if hasattr(professional_output, 'logger') else logging.getLogger(__name__)

# Signal parsing regex patterns
FIRST_MESSAGE_PATTERN = r"Trading Pair: (\w+/\w+)(?:\s*\(OTC\))?"
SECOND_MESSAGE_TIMER_PATTERN = r"SET THE TIMER TO (\d{2}:\d{2}:\d{2})"
SECOND_MESSAGE_PAIR_PATTERN = r"Currency pair ([A-Z]{3}/[A-Z]{3})"
SECOND_MESSAGE_DIRECTION_PATTERN = r"(HIGHER|LOWER)"
SECOND_MESSAGE_EXPIRY_PATTERN = r"Trade time: (\d+) MIN"

class JSONStorageManager:
    """Manages thread-safe JSON file operations for storing signals and trades."""
    def __init__(self, data_dir: str = "data", max_records: int = 1000, backup_enabled: bool = True):
        self.data_dir = data_dir
        self.signals_file = os.path.join(data_dir, "signals_history.json")
        self.trades_file = os.path.join(data_dir, "trades_history.json")
        self.session_file = os.path.join(data_dir, "session_data.json")
        self.timestamps_file = os.path.join(data_dir, "timestamps.json")
        self.max_records = max_records
        self.backup_enabled = backup_enabled
        
        # Create data directory if it doesn't exist
        os.makedirs(data_dir, exist_ok=True)
        
        # Initialize empty files if they don't exist
        for file_path in [self.signals_file, self.trades_file, self.timestamps_file]:
            if not os.path.exists(file_path):
                with open(file_path, 'w') as f:
                    json.dump([], f)
        
        if not os.path.exists(self.session_file):
            with open(self.session_file, 'w') as f:
                json.dump({}, f)
    
    def _create_backup(self, file_path: str) -> None:
        """Create a backup of the specified file if backup is enabled."""
        if self.backup_enabled and os.path.exists(file_path):
            backup_file = file_path + ".backup"
            shutil.copy2(file_path, backup_file)
            logger.debug(f"Created backup: {backup_file}")
    
    def _load_json(self, file_path: str) -> List[Dict]:
        """Load JSON data from file with error handling."""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.error(f"Error loading JSON from {file_path}: {str(e)}")
            backup_file = file_path + ".backup"
            if os.path.exists(backup_file):
                logger.info(f"Restoring from backup: {backup_file}")
                return self._load_json(backup_file)
            return []
    
    def _save_json(self, file_path: str, data: Union[List[Dict[Any, Any]], Dict[Any, Any]]) -> bool:
        """Save JSON data (list or dict) to file with thread safety and atomic operations."""
        try:
            # Create backup before writing
            self._create_backup(file_path)
            
            # Write to temporary file first for atomic operation
            temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, dir=self.data_dir)
            json.dump(data, temp_file, indent=2)
            temp_file.close()
            
            # Replace original file with temporary file
            shutil.move(temp_file.name, file_path)
            return True
        except Exception as e:
            logger.error(f"Error saving JSON to {file_path}: {str(e)}")
            return False
    
    def _cleanup_old_records(self, data: List[Dict]) -> List[Dict]:
        """Remove old records if exceeding max_records limit."""
        if len(data) > self.max_records:
            return data[-self.max_records:]
        return data
    
    def save_signal(self, signal: Dict) -> bool:
        """Save a signal to JSON storage."""
        signals = self._load_json(self.signals_file)
        signals.append(signal)
        signals = self._cleanup_old_records(signals)
        logger.debug(f"Saving signal with ID: {signal.get('id')}")
        return self._save_json(self.signals_file, signals)
    
    def save_trade(self, trade: Dict) -> bool:
        """Save a trade to JSON storage."""
        trades = self._load_json(self.trades_file)
        trades.append(trade)
        trades = self._cleanup_old_records(trades)
        logger.debug(f"Saving trade with ID: {trade.get('id')}")
        return self._save_json(self.trades_file, trades)
    
    def save_session_data(self, session_data: Dict) -> bool:
        """Save session data to JSON storage."""
        return self._save_json(self.session_file, session_data)
    
    def load_session_data(self) -> Dict:
        """Load session data from JSON storage."""
        try:
            with open(self.session_file, 'r') as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception as e:
            logger.error(f"Error loading session data: {str(e)}")
            return {}

class AmountCalculator:
    """Handles interactive calculation of trading amount based on balance percentage."""
    def __init__(self, config: Dict, pocket_option_client: Any):
        self.config = config.get("amount_calculator", {})
        self.enabled = self.config.get("enabled", True)
        self.default_percentage = self.config.get("default_percentage", 10)
        self.min_percentage = self.config.get("min_percentage", 1)
        self.max_percentage = self.config.get("max_percentage", 50)
        self.require_confirmation = self.config.get("require_confirmation", True)
        self.pocket_option_client = pocket_option_client
    
    def get_balance(self, retries: int = 3) -> Optional[float]:
        """Fetch current balance from Pocket Option with retry mechanism."""
        for attempt in range(retries):
            try:
                balance = self.pocket_option_client.get_balance()
                if balance is not None:
                    return float(balance)
                time.sleep(1)
            except Exception as e:
                logger.debug(f"Balance retrieval attempt {attempt + 1} failed: {str(e)}")
                time.sleep(1)
        logger.error("Failed to retrieve balance after multiple attempts")
        return None
    
    def calculate_amount(self, balance: float, percentage: float) -> float:
        """Calculate trading amount based on balance and percentage."""
        return round((balance * percentage) / 100, 2)
    
    def setup_trading_amount(self) -> Optional[float]:
        """Interactively setup trading amount for the session."""
        if not self.enabled:
            logger.info("Amount calculator disabled, using default trade amount")
            return None
        
        balance = self.get_balance()
        if balance is None:
            logger.error("Could not fetch balance, using default trade amount")
            return None
        
        logger.info(f"💰 Current Balance: ${balance:.2f}")
        
        # Ask user to choose between percentage or custom amount
        while True:
            choice = input("📊 Choose amount method:\n1. Percentage of balance\n2. Custom amount\nEnter choice (1 or 2): ").strip()
            if choice in ['1', '2']:
                break
            logger.warning("Please enter '1' for percentage or '2' for custom amount")
        
        amount = None
        
        if choice == '1':
            # Percentage-based calculation (existing logic)
            while True:
                default_text = f"{self.default_percentage}%"
                percentage_input = input(f"📊 Choose percentage to trade [{default_text}]: ").strip()
                
                if percentage_input == "":
                    percentage = self.default_percentage
                    break
                
                try:
                    percentage = float(percentage_input.replace('%', ''))
                    if self.min_percentage <= percentage <= self.max_percentage:
                        break
                    else:
                        logger.warning(f"Percentage must be between {self.min_percentage}% and {self.max_percentage}%")
                except ValueError:
                    logger.warning("Invalid input. Please enter a valid percentage (e.g., 15 or 15%)")
            
            amount = self.calculate_amount(balance, percentage)
            logger.info(f"💵 Calculated Amount: ${amount:.2f}")
        
        elif choice == '2':
            # Custom amount input
            while True:
                try:
                    amount_input = input(f"💵 Enter custom amount (max: ${balance:.2f}): ").strip().replace('$', '')
                    amount = float(amount_input)
                    
                    if amount <= 0:
                        logger.warning("Amount must be greater than 0")
                        continue
                    elif amount > balance:
                        logger.warning(f"Amount cannot exceed balance: ${balance:.2f}")
                        continue
                    else:
                        break
                except ValueError:
                    logger.warning("Invalid input. Please enter a valid amount (e.g., 10.50)")
            
            logger.info(f"💵 Custom Amount: ${amount:.2f}")
        
        if self.require_confirmation:
            while True:
                confirm = input(f"❓ Confirm this amount for the session? (y/n): ").strip().lower()
                if confirm in ['y', 'n']:
                    if confirm == 'n':
                        logger.info("Amount not confirmed, using default trade amount")
                        return None
                    break
                logger.warning("Please enter 'y' for yes or 'n' for no")
        
        logger.info(f"✅ Trading amount set to ${amount:.2f} for this session")
        return amount

class SelfBot:
    def __init__(
        self,
        config_file: str = "config/bot_config.json",
        telegram_config_file: str = "config/telegram_config.json",
        pocket_option_config_file: str = "config/pocket_option_config.json",
        data_dir: str = "data",
        verbose: bool = False
    ):
        """Initialize the Self Bot."""
        self.config_file = config_file
        self.telegram_config_file = telegram_config_file
        self.pocket_option_config_file = pocket_option_config_file
        self.data_dir = data_dir
        self.verbose = verbose
        
        # Set logging level for PocketOption API
        if verbose:
            global_value.loglevel = 'DEBUG'
        else:
            global_value.loglevel = 'INFO'
        
        # Load configuration
        self.config = self._load_config(config_file)
        self.telegram_config = self._load_config(telegram_config_file)
        self.pocket_option_config = self._load_config(pocket_option_config_file)
        
        # Initialize clients
        self.telegram_client = None
        self.pocket_option_client = None
        
        self.trading_client_manager = None
        
        # Signal tracking
        self.last_first_message = None
        self.last_first_message_time = None
        self.pending_signals = []
        self.active_trades = {}
        
        # JSON storage
        json_config = self.config.get("json_storage", {})
        # Consistently use "sessions" directory for all data files managed by these components
        # to align with session_control.py's migration behavior.
        _data_dir_for_components = "sessions" 
        logger.info(f"Using '{_data_dir_for_components}' for session-related data files.")

        self.storage = JSONStorageManager(
            data_dir=_data_dir_for_components,
            max_records=json_config.get("max_records", 1000),
            backup_enabled=json_config.get("backup_enabled", True)
        )
        
        # Simplified timestamp recorder for basic execution delay measurement
        self.timestamp_recorder = TimestampRecorder(
            data_dir=_data_dir_for_components,
            max_records=json_config.get("max_records", 1000)
        )
        
        # Session manager for singleton pattern and session recovery
        self.session_manager = SessionManager(
            data_dir=_data_dir_for_components,
            timezone=self.config.get("timezone", "UTC")
        )
        
        # Signal deduplicator for preventing duplicate signal processing
        self.signal_deduplicator = SignalDeduplicator(
            data_dir=_data_dir_for_components,
            max_fingerprints=json_config.get("max_fingerprints", 1000)
        )
        
        # Amount calculator
        self.amount_calculator = None
        self.session_amount = None
        
        # Bot warm-up manager
        self.warm_up_manager = None
        self.enhanced_warm_up_manager = None
        self.manual_warmup_controller = None
        
        # Selenium session monitor
        self.selenium_monitor = None
        
        # Telegram optimization manager
        self.telegram_optimizer = None
        
        # Session data - will be managed by SessionManager
        self.session_id = None
        self.session_data = {}
        
        # Timezone
        self.timezone = pytz.timezone(self.config.get("timezone", "UTC"))
        
        # Trading stats
        self.stats = {
            "total_signals": 0,
            "valid_signals": 0,
            "executed_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "error_trades": 0,
            "total_profit": 0.0,
            "start_time": get_high_precision_time(),
        }
    
    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """Load configuration from file or create default."""
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                logger.error(f"Error parsing config file: {config_file}")
                return {}
        else:
            logger.warning(f"Configuration file {config_file} not found. Using defaults.")
            return {}
    
    async def initialize_telegram(self) -> bool:
        """Initialize the Telegram client."""
        try:
            # Get Telegram API credentials
            api_id = self.telegram_config.get("api_id") or os.environ.get("TELEGRAM_API_ID")
            api_hash = self.telegram_config.get("api_hash") or os.environ.get("TELEGRAM_API_HASH")
            session_name = self.telegram_config.get("session_name", "test_session")
            
            if not api_id or not api_hash:
                logger.error("Telegram API ID and hash are required. Set them in the config file or environment variables.")
                return False
            
            logger.info("Initializing Telegram client...")
            
            # User account mode
            self.telegram_client = TelegramClient(session_name, int(api_id), api_hash)
            await self.telegram_client.start()
            logger.info("Started Telegram client in user account mode")
            
            # Check if we need to complete the phone verification process
            if not await self.telegram_client.is_user_authorized():
                logger.info("User not authorized. Please complete the login process.")
                phone = input("Enter your phone number: ")
                await self.telegram_client.send_code_request(phone)
                code = input("Enter the code: ")
                await self.telegram_client.sign_in(phone, code)
                logger.info("Successfully authenticated")
            else:
                logger.info("Already authenticated using existing session")
                me = await self.telegram_client.get_me()
                last_name = getattr(me, 'last_name', '') if hasattr(me, 'last_name') else ''
                username = getattr(me, 'username', '') if hasattr(me, 'username') else ''
                logger.info(f"Logged in as: {getattr(me, 'first_name', 'Unknown')} {last_name} (@{username})")
            
            # Initialize Telegram optimizer with client if enabled
            if self.telegram_optimizer:
                try:
                    await self.telegram_optimizer.initialize_with_client(self.telegram_client)
                    logger.info("✅ Telegram optimizer initialized with client")
                except Exception as e:
                    logger.warning(f"Failed to initialize Telegram optimizer with client: {str(e)}")
            
            return True
        except Exception as e:
            logger.error(f"Error initializing Telegram client: {str(e)}")
            return False
    
    def initialize_pocket_option(self) -> bool:
        """Initialize trading client with dual implementation support (PocketOptionAPI-v2 + Headless Optimized)."""
        try:
            # Get SSID from config
            ssid = self.pocket_option_config.get("ssid")
            if not ssid:
                logger.error("No SSID provided in configuration")
                return False
            
            # Get demo mode setting - Default to real trading (False)
            is_demo = self.pocket_option_config.get("is_demo", False)
            
            # Initialize the PocketOption client
            logger.info(f"Initializing Pocket Option client (Demo mode: {is_demo})")
            self.pocket_option_client = PocketOption(ssid, is_demo)
            
            # Connect to the API
            connection_result = self.pocket_option_client.connect()
            if connection_result:
                logger.info("Successfully connected to Pocket Option API")
                
                # Get account balance with retry
                balance = None
                for attempt in range(3):
                    try:
                        balance = self.pocket_option_client.get_balance()
                        if balance is not None:
                            break
                        time.sleep(1)
                    except Exception as e:
                        logger.debug(f"Balance retrieval attempt {attempt + 1} failed: {str(e)}")
                        time.sleep(1)
                
                logger.info(f"Account balance: {balance}")
                self.session_data["balance_start"] = balance if balance is not None else 0.0
                self.storage.save_session_data(self.session_data)
                
                # Add favorite pairs after connection
                self.add_pairs_to_favorites()
                
                # Initialize amount calculator
                self.amount_calculator = AmountCalculator(self.config, self.pocket_option_client)
                
                # Initialize enhanced warm-up manager
                self.enhanced_warm_up_manager = EnhancedBotWarmUpManager(
                    config=self.config,
                    pocket_option_client=self.pocket_option_client,
                    telegram_client=self.telegram_client
                )
                
                # Initialize manual warm-up controller
                self.manual_warmup_controller = ManualWarmUpController(
                    enhanced_warmup_manager=self.enhanced_warm_up_manager,
                    config=self.config
                )
                
                # Keep backward compatibility with existing warm-up manager
                self.warm_up_manager = BotWarmUpManager(
                    config=self.config,
                    pocket_option_client=self.pocket_option_client,
                    telegram_client=self.telegram_client
                )
                
                # Initialize Selenium session monitor
                self.selenium_monitor = SeleniumSessionMonitor(
                    config=self.config,
                    telegram_client=self.telegram_client,
                    data_dir=self.data_dir
                )
                
                # Initialize Telegram optimization manager
                optimization_config = self.config.get("telegram_optimizations", {})
                if optimization_config.get("enabled", False):
                    try:
                        self.telegram_optimizer = create_telegram_optimization_manager(
                            telegram_config=self.telegram_config,
                            pocket_option_client=self.pocket_option_client
                        )
                        logger.info("✅ Telegram optimization manager initialized")
                    except Exception as e:
                        logger.warning(f"Failed to initialize Telegram optimizations: {str(e)}")
                        self.telegram_optimizer = None
                else:
                    logger.info("Telegram optimizations disabled in configuration")
                    self.telegram_optimizer = None
                
                return True
            else:
                logger.error("Failed to connect to Pocket Option API")
                return False
        except Exception as e:
            logger.error(f"Error initializing Pocket Option client: {str(e)}")
            return False
    
    def add_pairs_to_favorites(self) -> None:
        """Add trading pairs to favorites. Commented out due to missing subscribe method in PocketOptionAPI-v2."""
        try:
            # Get favorite pairs from config
            favorite_pairs = self.config.get("favorite_pairs", [
                "EURUSD_otc", "GBPUSD_otc", "USDJPY_otc", "AUDUSD_otc", 
                "USDCAD_otc", "USDCHF_otc", "NZDUSD_otc", "EURJPY_otc"
            ])
            
            # Commented out subscribe calls as the method does not exist in PocketOptionAPI-v2
            """
            for pair in favorite_pairs:
                try:
                    if self.pocket_option_client:
                        self.pocket_option_client.subscribe(pair)
                        logger.debug(f"Added {pair} to favorites")
                except Exception as e:
                    logger.debug(f"Could not add {pair} to favorites: {str(e)}")
            """
            logger.info("Subscription to favorite pairs is currently disabled due to API limitations.")
                    
        except Exception as e:
            logger.error(f"Error adding pairs to favorites: {str(e)}")
    
    def initialize_json_storage(self) -> bool:
        """Initialize JSON storage for signals and trades."""
        try:
            # Storage is already initialized in constructor
            logger.info("JSON storage initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing JSON storage: {str(e)}")
            return False
    
    def setup_session_amount(self) -> bool:
        """Setup the trading amount for the current session using the amount calculator."""
        if self.amount_calculator:
            amount = self.amount_calculator.setup_trading_amount()
            if amount is not None:
                self.session_amount = amount
                self.session_data["session_amount"] = amount
                self.storage.save_session_data(self.session_data)
                return True
        return False
    
    async def access_channel(self):
        """Access a Telegram channel that the user is already a member of."""
        if not self.telegram_client:
            logger.error("Telegram client not initialized")
            return None
        
        channel_name = self.telegram_config.get("channel_name", "SignalTest")
        channel_id = self.telegram_config.get("channel_id")
        
        logger.info(f"Accessing channel: {channel_name}")
        
        try:
            # Try to use channel ID if available
            if channel_id:
                try:
                    entity = await self.telegram_client.get_entity(int(channel_id))
                    logger.info(f"Accessed channel by ID: {getattr(entity, 'title', 'Unknown')}")
                    return entity
                except Exception as e:
                    logger.debug(f"Error accessing channel by ID: {str(e)}")
            
            # Try to find by name in dialog list
            async for dialog in self.telegram_client.iter_dialogs():
                if dialog.name == channel_name:
                    logger.info(f"Found channel in dialog list: {dialog.name}")
                    return dialog.entity
            
            logger.warning(f"Channel not found: {channel_name}")
            return None
            
        except Exception as e:
            logger.error(f"Error accessing channel: {str(e)}")
            return None
    
    def parse_signal_message(self, message_text: str) -> Optional[Dict]:
        """
        Parse a single message that contains the complete signal.
        
        Your format:
        ❗️SET THE TIMER TO 00:01:00❗️
        
        First signal: Currency pair AUD/USD 
        HIGHER ⬆️ 
        Trade time: 1 MIN
        """
        try:
            # Clean the message text
            text = message_text.strip()
            
            # Extract timer
            timer_match = re.search(r"SET THE TIMER TO (\d{2}:\d{2}:\d{2})", text)
            if not timer_match:
                return None
            timer = timer_match.group(1)
            
            # Extract currency pair
            pair_match = re.search(r"Currency pair ([A-Z]{3}/[A-Z]{3})", text)
            if not pair_match:
                return None
            pair = pair_match.group(1)
            
            # Extract direction
            direction = None
            if "HIGHER" in text or "⬆️" in text:
                direction = "HIGHER"
            elif "LOWER" in text or "⬇️" in text:
                direction = "LOWER"
            
            if not direction:
                return None
            
            # Extract expiry
            expiry_match = re.search(r"Trade time: (\d+) MIN", text)
            if not expiry_match:
                return None
            expiry = int(expiry_match.group(1))
            
            signal = {
                "timer": timer,
                "pair": pair,
                "direction": direction,
                "expiry": expiry
            }
            
            logger.info(f"✅ PARSED SIGNAL: {signal}")
            return signal
            
        except Exception as e:
            logger.error(f"Error parsing signal: {str(e)}")
            return None
    
    def parse_first_message(self, message_text: str) -> Optional[str]:
        """Parse the first message of the signal format."""
        pattern = self.telegram_config.get("first_message_regex", FIRST_MESSAGE_PATTERN)
        match = re.search(pattern, message_text)
        
        if match:
            trading_pair = match.group(1)
            logger.info(f"Parsed first message: Trading pair = {trading_pair}")
            return trading_pair
        
        return None
    
    def parse_second_message(self, message_text: str) -> Optional[Dict]:
        """Parse the second message of the signal format."""
        second_message_regex = self.telegram_config.get("second_message_regex", {})
        
        # Extract timer
        timer_pattern = second_message_regex.get("timer", SECOND_MESSAGE_TIMER_PATTERN)
        timer_match = re.search(timer_pattern, message_text)
        if not timer_match:
            return None
        timer = timer_match.group(1)
        
        # Extract pair
        pair_pattern = second_message_regex.get("pair", SECOND_MESSAGE_PAIR_PATTERN)
        pair_match = re.search(pair_pattern, message_text)
        if not pair_match:
            return None
        pair = pair_match.group(1)
        
        # Extract direction
        direction_pattern = second_message_regex.get("direction", SECOND_MESSAGE_DIRECTION_PATTERN)
        direction_match = re.search(direction_pattern, message_text)
        if not direction_match:
            return None
        direction = direction_match.group(1)
        
        # Extract expiry
        expiry_pattern = second_message_regex.get("expiry", SECOND_MESSAGE_EXPIRY_PATTERN)
        expiry_match = re.search(expiry_pattern, message_text)
        if not expiry_match:
            return None
        expiry = int(expiry_match.group(1))
        
        signal = {
            "timer": timer,
            "pair": pair,
            "direction": direction,
            "expiry": expiry
        }
        
        logger.info(f"Parsed second message: {signal}")
        return signal
    
    async def process_message(self, message) -> None:
        """Process a message from the channel with Telegram optimizations."""
        if not message.text:
            return
        
        try:
            # Use optimized message processing if available
            if self.telegram_optimizer:
                try:
                    # Use the optimized message processor
                    processed = await self.telegram_optimizer.process_message_optimized(
                        message, 
                        self._original_process_message
                    )
                    return
                except Exception as e:
                    logger.warning(f"Telegram optimization failed, falling back to original processing: {str(e)}")
                    # Fall through to original processing
            
            # Original message processing (fallback)
            await self._original_process_message(message)
            
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
    
    async def _original_process_message(self, message) -> None:
        """Original message processing logic (used as fallback and by optimizer)."""
        if not message.text:
            return
        
        try:
            # Clean message text for logging (remove emojis that cause encoding issues)
            clean_text = re.sub(r'[^\x00-\x7F]+', '?', message.text)
            logger.info(f"📨 Received message: {clean_text[:100]}...")
            
            # Try to parse as complete signal first (single message format)
            signal = self.parse_signal_message(message.text)
            if signal:
                # Complete signal detected
                complete_signal = {
                    "pair": signal["pair"],
                    "timer": signal["timer"],
                    "direction": signal["direction"],
                    "expiry": signal["expiry"],
                    "timestamp": get_high_precision_time().isoformat(),
                    "id": f"signal_{get_high_precision_time().strftime('%Y%m%d_%H%M%S%f')}_{len(self.pending_signals) + 1:03d}",
                    "session_id": self.session_id
                }
                
                # Use professional output for signal detection
                professional_output.signal_detected(
                    complete_signal["pair"], 
                    complete_signal["direction"], 
                    str(complete_signal["expiry"]), 
                    complete_signal["timer"]
                )
                self.stats["total_signals"] += 1
                
                # Check for duplicate signals
                if self.check_signal_duplicate(complete_signal):
                    professional_output.warning("Duplicate signal ignored")
                    return
                
                # Validate signal
                valid, validation_message = self.validate_signal(complete_signal)
                complete_signal["is_valid"] = valid
                complete_signal["validation_message"] = validation_message
                
                if valid:
                    professional_output.signal_validation("PASSED", "Balance sufficient")
                    self.stats["valid_signals"] += 1
                    self.pending_signals.append(complete_signal)
                    
                    # Record signal timestamp
                    timestamp_record = self.timestamp_recorder.record_signal_timestamp(
                        signal_id=complete_signal["id"],
                        currency_pair=complete_signal["pair"],
                        session_id=self.session_id or "unknown"
                    )
                    
                    # Save signal to JSON storage
                    self.storage.save_signal(complete_signal)
                    
                    # Execute trade immediately using threading to avoid event loop conflict
                    professional_output.info("EXECUTING TRADE IMMEDIATELY")
                    trade_thread = threading.Thread(target=self.execute_trade_threaded, args=(complete_signal, timestamp_record))
                    trade_thread.daemon = True
                    trade_thread.start()
                else:
                    professional_output.signal_validation("FAILED", validation_message)
                    # Save invalid signal to JSON storage
                    self.storage.save_signal(complete_signal)
                return
            
            # Fallback to two-message format
            # Try to parse as first message
            trading_pair = self.parse_first_message(message.text)
            if trading_pair:
                self.last_first_message = trading_pair
                self.last_first_message_time = get_high_precision_time()
                return
                
            # Try to parse as second message
            if self.last_first_message and self.last_first_message_time:
                # Check if the time between messages is within the allowed window
                pair_match_window = self.telegram_config.get("pair_match_window", 60)
                
                # Ensure both datetime objects are timezone-aware for comparison
                current_time = get_high_precision_time()
                if self.last_first_message_time.tzinfo is None:
                    # If last_first_message_time is naive, make it UTC-aware
                    last_message_time_utc = pytz.UTC.localize(self.last_first_message_time)
                else:
                    # If it's already timezone-aware, convert to UTC
                    last_message_time_utc = self.last_first_message_time.astimezone(pytz.UTC)
                
                time_diff = (current_time - last_message_time_utc).total_seconds()
                
                if time_diff <= pair_match_window:
                    signal = self.parse_second_message(message.text)
                    if signal:
                        # Verify that the pair matches
                        if signal["pair"] == self.last_first_message:
                            # Complete signal
                            complete_signal = {
                                "pair": self.last_first_message,
                                "timer": signal["timer"],
                                "direction": signal["direction"],
                                "expiry": signal["expiry"],
                                "timestamp": get_high_precision_time().isoformat(),
                                "id": f"signal_{get_high_precision_time().strftime('%Y%m%d_%H%M%S%f')}_{len(self.pending_signals) + 1:03d}",
                                "session_id": self.session_id
                            }
                            
                            logger.info(f"🎯 COMPLETE SIGNAL DETECTED (Two-message): {complete_signal}")
                            self.stats["total_signals"] += 1
                            
                            # Validate signal
                            valid, validation_message = self.validate_signal(complete_signal)
                            complete_signal["is_valid"] = valid
                            complete_signal["validation_message"] = validation_message
                            
                            if valid:
                                self.stats["valid_signals"] += 1
                                self.pending_signals.append(complete_signal)
                                
                                # Record signal timestamp
                                timestamp_record = self.timestamp_recorder.record_signal_timestamp(
                                    signal_id=complete_signal["id"],
                                    currency_pair=complete_signal["pair"],
                                    session_id=self.session_id
                                )
                                
                                # Save signal to JSON storage
                                self.storage.save_signal(complete_signal)
                                
                                # Execute trade immediately using threading
                                logger.info("🚀 EXECUTING TRADE IMMEDIATELY")
                                trade_thread = threading.Thread(target=self.execute_trade_threaded, args=(complete_signal, timestamp_record))
                                trade_thread.daemon = True
                                trade_thread.start()
                            else:
                                logger.warning(f"❌ Invalid signal: {validation_message}")
                                # Save invalid signal to JSON storage
                                self.storage.save_signal(complete_signal)
                            
                            # Reset tracking
                            self.last_first_message = None
                            self.last_first_message_time = None
                        else:
                            logger.warning(f"Pair mismatch: {self.last_first_message} vs {signal['pair']}")
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
    
    def validate_signal(self, signal: Dict) -> Tuple[bool, str]:
        """Validate a trading signal."""
        try:
            # Check if we have sufficient balance
            if self.pocket_option_client:
                balance = self.pocket_option_client.get_balance()
            else:
                return False, "Pocket Option client not initialized"
                
            trade_amount = self.session_amount if self.session_amount is not None else self.config.get("trade_amount", 1)
            
            if balance is None:
                return False, "Could not retrieve account balance"
            
            # Use safe balance comparison to handle tuple/list balance values
            try:
                # Validate balance data to ensure numeric comparison
                validated_balance = float(balance) if balance is not None else 0.0
                if isinstance(balance, (tuple, list)):
                    # Extract first numeric value from tuple/list
                    for item in balance:
                        try:
                            validated_balance = float(item)
                            break
                        except (ValueError, TypeError):
                            continue
                elif isinstance(balance, str):
                    try:
                        validated_balance = float(balance.replace(',', '').replace('$', ''))
                    except ValueError:
                        validated_balance = 0.0
                
                if validated_balance < trade_amount:
                    return False, f"Insufficient balance: {validated_balance} < {trade_amount}"
            except Exception as e:
                # Log balance error for debugging
                import json
                error_data = {
                    "timestamp": get_high_precision_time().isoformat(),
                    "balance_type": type(balance).__name__,
                    "balance_value": str(balance),
                    "operation": "balance_comparison",
                    "error": str(e)
                }
                try:
                    with open("data/balance_errors.json", "a") as f:
                        f.write(json.dumps(error_data) + "\n")
                except:
                    pass
                logger.error(f"Balance comparison error: {str(e)} - Balance type: {type(balance)} - Value: {balance}")
                return False, f"Error comparing balance: {str(e)}"
            
            # Check if we've reached the maximum daily trades
            max_daily_trades = self.config.get("max_daily_trades", 0)
            if max_daily_trades > 0 and self.stats["executed_trades"] >= max_daily_trades:
                return False, f"Maximum daily trades reached: {max_daily_trades}"
            
            # Check if we've reached the maximum daily loss
            max_daily_loss = self.config.get("max_daily_loss", 0)
            if max_daily_loss > 0 and self.stats["total_profit"] < -max_daily_loss:
                return False, f"Maximum daily loss reached: {max_daily_loss}"
            
            return True, "Signal is valid"
            
        except Exception as e:
            logger.error(f"Error validating signal: {str(e)}")
            return False, f"Error validating signal: {str(e)}"
    
    def execute_trade_threaded(self, signal: Dict, timestamp_record: Dict = None) -> None:
        """Execute a trade in a separate thread to avoid event loop conflicts."""
        try:
            # Calculate natural execution delay first
            natural_execution_delay_ms = 0.0
            if signal.get("timestamp"):
                try:
                    # Parse signal timestamp (ISO format)
                    signal_time = datetime.fromisoformat(signal["timestamp"].replace('Z', '+00:00'))
                    if signal_time.tzinfo is None:
                        signal_time = pytz.UTC.localize(signal_time)
                    else:
                        signal_time = signal_time.astimezone(pytz.UTC)
                    
                    # Calculate natural delay in milliseconds
                    natural_start_time = get_high_precision_time()
                    delay_seconds = (natural_start_time - signal_time).total_seconds()
                    natural_execution_delay_ms = delay_seconds * 1000
                except Exception as e:
                    logger.debug(f"Error calculating natural execution delay: {str(e)}")
                    natural_execution_delay_ms = 0.0
            
            # Apply execution delay control if enabled
            delay_control = self.config.get("execution_delay_control", {})
            if delay_control.get("enabled", False):
                target_delay_ms = delay_control.get("target_delay_ms", 200)
                min_natural_delay_ms = delay_control.get("min_natural_delay_ms", 50)
                max_offset_ms = delay_control.get("max_offset_ms", 300)
                logging_enabled = delay_control.get("logging_enabled", True)
                
                # Only apply to local system if configured
                apply_to_local_only = delay_control.get("apply_to_local_only", True)
                
                if apply_to_local_only:
                    # Check if this is the local system (you can modify this logic as needed)
                    # For now, we'll apply it to all systems when enabled
                    pass
                
                # Calculate required offset
                if natural_execution_delay_ms >= min_natural_delay_ms and natural_execution_delay_ms < target_delay_ms:
                    required_offset_ms = target_delay_ms - natural_execution_delay_ms
                    
                    # Cap the offset to prevent excessive delays
                    if required_offset_ms <= max_offset_ms:
                        offset_seconds = required_offset_ms / 1000.0
                        
                        if logging_enabled:
                            professional_output.info(f"🎯 EXECUTION DELAY CONTROL: Natural={natural_execution_delay_ms:.1f}ms, Target={target_delay_ms}ms, Adding={required_offset_ms:.1f}ms offset")
                        
                        # Apply the calculated delay
                        time.sleep(offset_seconds)
                    else:
                        if logging_enabled:
                            professional_output.warning(f"⚠️ EXECUTION DELAY CONTROL: Required offset {required_offset_ms:.1f}ms exceeds maximum {max_offset_ms}ms, executing immediately")
                elif natural_execution_delay_ms >= target_delay_ms:
                    if logging_enabled:
                        professional_output.info(f"🎯 EXECUTION DELAY CONTROL: Natural delay {natural_execution_delay_ms:.1f}ms already meets/exceeds target {target_delay_ms}ms")
                else:
                    if logging_enabled:
                        professional_output.warning(f"⚠️ EXECUTION DELAY CONTROL: Natural delay {natural_execution_delay_ms:.1f}ms below minimum {min_natural_delay_ms}ms, executing immediately")
            
            # Record final execution start time after any applied delays
            execution_start_time = get_high_precision_time()
            
            # Calculate final execution delay for reporting
            execution_delay_ms = 0.0
            if signal.get("timestamp"):
                try:
                    # Parse signal timestamp (ISO format)
                    signal_time = datetime.fromisoformat(signal["timestamp"].replace('Z', '+00:00'))
                    if signal_time.tzinfo is None:
                        signal_time = pytz.UTC.localize(signal_time)
                    else:
                        signal_time = signal_time.astimezone(pytz.UTC)
                    
                    # Calculate final delay in milliseconds
                    delay_seconds = (execution_start_time - signal_time).total_seconds()
                    execution_delay_ms = delay_seconds * 1000
                except Exception as e:
                    logger.debug(f"Error calculating final execution delay: {str(e)}")
                    execution_delay_ms = 0.0

            # Record execution timestamp if timestamp_record provided
            if timestamp_record:
                timestamp_record = self.timestamp_recorder.record_execution_timestamp(
                    timestamp_record, 
                    f"trade_{get_high_precision_time().strftime('%Y%m%d_%H%M%S%f')}_{self.session_data['trades_count'] + 1:03d}"
                )
            # Get trade parameters and handle OTC pairs
            raw_pair = signal["pair"].replace("/", "")  # Remove slash for Pocket Option format
            
            # Check if this should be an OTC pair based on configuration
            use_otc_by_default = self.config.get("use_otc_by_default", True)
            
            # Determine if we should use OTC version
            if use_otc_by_default:
                asset = f"{raw_pair}_otc"
                logger.info(f"🎯 Using OTC pair: {asset} for signal pair: {signal['pair']}")
            else:
                asset = raw_pair
                logger.info(f"🎯 Using regular pair: {asset} for signal pair: {signal['pair']}")
            
            # Determine trade direction, applying inversion if enabled
            original_direction = signal["direction"]
            inverted_direction = original_direction
            
            # Check if trade inversion is enabled in config
            trade_inversion_enabled = self.config.get("trade_inversion", {}).get("enabled", False)
            
            if trade_inversion_enabled:
                if original_direction == "HIGHER":
                    inverted_direction = "LOWER"
                    logger.info(f"🔄 Trade inversion enabled: Changed HIGHER to LOWER for {asset}")
                elif original_direction == "LOWER":
                    inverted_direction = "HIGHER"
                    logger.info(f"🔄 Trade inversion enabled: Changed LOWER to HIGHER for {asset}")
            
            direction = "call" if inverted_direction == "HIGHER" else "put"
            
            # Standard expiry conversion - no optimization tricks
            expiry = signal["expiry"] * 60  # Convert minutes to seconds
            
            amount = self.session_amount if self.session_amount is not None else self.config.get("trade_amount", 1)
            
            # Create trade record
            trade = {
                "signal_id": signal.get("id"),
                "timestamp": get_high_precision_time().isoformat(),
                "asset": asset,
                "direction": direction,
                "expiry": expiry,
                "amount": amount,
                "status": "executing",
                "id": f"trade_{get_high_precision_time().strftime('%Y%m%d_%H%M%S%f')}_{self.session_data['trades_count'] + 1:03d}",
                "session_id": self.session_id,
                "balance_before": self.pocket_option_client.get_balance() if self.pocket_option_client else 0.0
            }
            
            # Save trade to JSON storage
            self.storage.save_trade(trade)
            
            # Update session data
            self.session_data["trades_count"] += 1
            self.storage.save_session_data(self.session_data)
            
            # Execute trade with professional output
            professional_output.trade_execution(
                trade["id"], asset, direction.upper(), amount, expiry, execution_delay_ms
            )
            
            # Capture trade entry screenshot if Selenium monitor is active
            if self.selenium_monitor and self.selenium_monitor.is_monitoring:
                self.selenium_monitor.capture_trade_entry_screenshot(
                    trade_id=trade["id"],
                    asset=asset,
                    direction=direction
                )
            
            # Check if we're in test mode
            if self.config.get("test_mode", False):
                professional_output.info("TEST MODE: Simulating trade execution")
                
                # Simulate trade execution
                trade_id = f"test_{int(get_high_precision_time().timestamp() * 1e6)}"
                trade["trade_id"] = trade_id
                trade["status"] = "executed"
                
                # Update trade in JSON storage
                self.storage.save_trade(trade)
                
                # Add to active trades
                self.active_trades[trade_id] = trade
                
                # Increment executed trades counter
                self.stats["executed_trades"] += 1
                
                professional_output.info(f"TEST TRADE EXECUTED: {trade_id}")
            else:
                # Execute real trade using PocketOptionAPI-v2
                professional_output.info("REAL TRADING MODE: Executing actual trade on Pocket Option platform")
                
                try:
                    if self.pocket_option_client:
                        # Execute the trade
                        result = self.pocket_option_client.buy(
                            amount=amount,
                            active=asset,
                            action=direction,
                            expirations=expiry
                        )
                        
                        if result and result[0]:
                            trade_id = result[1]
                            trade["trade_id"] = trade_id
                            trade["status"] = "executed"
                            
                            professional_output.info(f"REAL TRADE EXECUTED: {asset} {direction.upper()} ${amount} - Trade ID: {trade_id}")
                            
                            # Update trade in JSON storage
                            self.storage.save_trade(trade)
                            
                            # Add to active trades
                            self.active_trades[trade_id] = trade
                            
                            # Increment executed trades counter
                            self.stats["executed_trades"] += 1
                            
                            # Capture trade close screenshot if Selenium monitor is active
                            if self.selenium_monitor and self.selenium_monitor.is_monitoring:
                                self.selenium_monitor.schedule_trade_exit_screenshot(
                                    trade_id=trade_id,
                                    asset=asset,
                                    direction=direction
                                )
                                
                                # Schedule exit screenshot at trade expiry
                                self.selenium_monitor.schedule_trade_exit_screenshot(
                                    trade_id=trade_id,
                                    asset=asset,
                                    direction=direction,
                                    duration_seconds=expiry
                                )
                            
                            # Schedule result checking
                            result_thread = threading.Thread(target=self.check_trade_result_threaded, args=(trade_id, expiry))
                            result_thread.daemon = True
                            result_thread.start()
                        else:
                            professional_output.error(f"REAL TRADE FAILED: {result}")
                            
                            trade["status"] = "failed"
                            trade["error_message"] = f"Failed to execute trade: {result}"
                            
                            # Update trade in JSON storage
                            self.storage.save_trade(trade)
                            
                            # Increment error trades counter
                            self.stats["error_trades"] += 1
                    else:
                        professional_output.error("Pocket Option client not initialized")
                        trade["status"] = "error"
                        trade["error_message"] = "Pocket Option client not initialized"
                        self.storage.save_trade(trade)
                        self.stats["error_trades"] += 1
                except Exception as e:
                    professional_output.error(f"Error executing real trade: {str(e)}")
                    trade["status"] = "error"
                    trade["error_message"] = str(e)
                    self.storage.save_trade(trade)
                    self.stats["error_trades"] += 1
            
        except Exception as e:
            logger.error(f"Error executing trade: {str(e)}")
    
    def check_trade_result_threaded(self, trade_id: str, expiry: int) -> None:
        """Check trade result in a separate thread to avoid event loop conflicts."""
        try:
            # Wait for the trade to complete
            time.sleep(expiry + 5)  # Wait for expiry plus buffer
            
            logger.info(f"🔍 Checking trade result for trade ID: {trade_id}")
            trade = self.active_trades.get(trade_id)
            
            if trade and self.pocket_option_client:
                try:
                    # Check trade result
                    result = self.pocket_option_client.check_win(trade_id)
                    
                    balance_after = self.pocket_option_client.get_balance()
                    trade["balance_after"] = balance_after if balance_after is not None else trade.get("balance_before", 0.0)
                    
                    if result is not None:
                        # Handle different result formats from PocketOption API
                        profit_value = 0.0
                        trade_result = "unknown"
                        
                        try:
                            # Check if result is a dictionary with 'result' key
                            if isinstance(result, dict):
                                if 'result' in result:
                                    trade_result = result['result']
                                    profit_value = result.get('profit', 0.0)
                                elif 'win' in result:
                                    profit_value = result['win']
                                    if profit_value > 0:
                                        trade_result = "win"
                                    elif profit_value < 0:
                                        trade_result = "loss"
                                    else:
                                        trade_result = "draw"
                                else:
                                    # Try to extract numeric value from dict
                                    for key, value in result.items():
                                        try:
                                            profit_value = float(value)
                                            if profit_value > 0:
                                                trade_result = "win"
                                            elif profit_value < 0:
                                                trade_result = "loss"
                                            else:
                                                trade_result = "draw"
                                            break
                                        except (ValueError, TypeError):
                                            continue
                            # Check if result is a tuple or list
                            elif isinstance(result, (tuple, list)):
                                if len(result) >= 2:
                                    # Check if it's (profit, 'win'/'loss') format
                                    if len(result) == 2 and isinstance(result[1], str):
                                        try:
                                            profit_value = float(result[0])
                                            result_str = str(result[1]).lower()
                                            if result_str in ['win', 'winning']:
                                                trade_result = "win"
                                            elif result_str in ['loss', 'losing', 'lose', 'loose']:
                                                trade_result = "loss"
                                            elif result_str in ['draw', 'tie']:
                                                trade_result = "draw"
                                            else:
                                                trade_result = "unknown"
                                        except (ValueError, TypeError):
                                            profit_value = 0.0
                                            trade_result = "unknown"
                                    else:
                                        # Assume first element is success flag, second is profit
                                        try:
                                            profit_value = float(result[1]) if len(result) > 1 else 0.0
                                            if profit_value > 0:
                                                trade_result = "win"
                                            elif profit_value < 0:
                                                trade_result = "loss"
                                            else:
                                                trade_result = "draw"
                                        except (ValueError, TypeError, IndexError):
                                            profit_value = 0.0
                                            trade_result = "unknown"
                                else:
                                    profit_value = 0.0
                                    trade_result = "unknown"
                            # Check if result is a numeric value
                            elif isinstance(result, (int, float)):
                                profit_value = float(result)
                                if profit_value > 0:
                                    trade_result = "win"
                                elif profit_value < 0:
                                    trade_result = "loss"
                                else:
                                    trade_result = "draw"
                            # Check if result is a string
                            elif isinstance(result, str):
                                if result.lower() in ['win', 'winning']:
                                    trade_result = "win"
                                    profit_value = trade.get("amount", 0) * 0.8  # Estimate profit
                                elif result.lower() in ['loss', 'losing', 'lose']:
                                    trade_result = "loss"
                                    profit_value = -trade.get("amount", 0)  # Loss is negative amount
                                elif result.lower() in ['draw', 'tie']:
                                    trade_result = "draw"
                                    profit_value = 0.0
                                else:
                                    try:
                                        profit_value = float(result)
                                        if profit_value > 0:
                                            trade_result = "win"
                                        elif profit_value < 0:
                                            trade_result = "loss"
                                        else:
                                            trade_result = "draw"
                                    except ValueError:
                                        trade_result = "unknown"
                                        profit_value = 0.0
                            else:
                                logger.warning(f"⚠️ Unexpected result format: {type(result)} - {result}")
                                trade_result = "unknown"
                                profit_value = 0.0
                        
                        except Exception as e:
                            logger.error(f"Error parsing trade result: {str(e)} - Result: {result}")
                            trade_result = "error"
                            profit_value = 0.0
                        
                        # Update trade based on parsed result
                        if trade_result == "win":
                            logger.info(f"✅ WINNING TRADE: {trade_id} - Profit: ${profit_value}")
                            trade["result"] = "win"
                            trade["profit"] = profit_value
                            self.stats["winning_trades"] += 1
                            self.stats["total_profit"] += profit_value
                            self.session_data["wins"] += 1
                            self.session_data["profit_loss"] += profit_value
                        elif trade_result == "loss":
                            logger.info(f"❌ LOSING TRADE: {trade_id} - Loss: ${profit_value}")
                            trade["result"] = "loss"
                            trade["profit"] = profit_value
                            self.stats["losing_trades"] += 1
                            self.stats["total_profit"] += profit_value
                            self.session_data["losses"] += 1
                            self.session_data["profit_loss"] += profit_value
                        elif trade_result == "draw":
                            logger.info(f"⚖️ DRAW TRADE: {trade_id} - No profit/loss")
                            trade["result"] = "draw"
                            trade["profit"] = 0.0
                            self.session_data["draws"] += 1
                        else:
                            logger.warning(f"⚠️ UNKNOWN TRADE RESULT: {trade_id} - Result: {result}")
                            trade["result"] = "unknown"
                            trade["profit"] = 0.0
                            trade["error_message"] = f"Unknown result format: {result}"
                        
                        # Update trade in JSON storage
                        self.storage.save_trade(trade)
                        
                        # Update session data
                        self.storage.save_session_data(self.session_data)
                        
                        # Log current stats
                        logger.info(f"📊 TRADING STATS: Total Profit: ${self.stats['total_profit']:.2f} | Wins: {self.stats['winning_trades']} | Losses: {self.stats['losing_trades']} | Total Trades: {self.stats['executed_trades']}")
                    else:
                        logger.warning(f"⚠️ Could not retrieve trade result for {trade_id}")
                        trade["result"] = "unknown"
                        trade["error_message"] = "Could not retrieve trade result"
                        self.storage.save_trade(trade)
                except Exception as e:
                    logger.error(f"Error checking trade result: {str(e)}")
                    trade["result"] = "error"
                    trade["error_message"] = str(e)
                    self.storage.save_trade(trade)
            else:
                logger.error(f"Trade {trade_id} not found or client not initialized")
        except Exception as e:
            logger.error(f"Error in check_trade_result_threaded: {str(e)}")
    
    async def start_monitoring(self) -> None:
        """Start monitoring the Telegram channel for signals."""
        if not self.telegram_client:
            logger.error("Telegram client not initialized")
            return
        
        channel = await self.access_channel()
        if not channel:
            logger.error("Could not access channel")
            return
        
        channel_name = self.telegram_config.get("channel_name", "SignalTest")
        logger.info(f"Starting monitoring of channel: {getattr(channel, 'title', channel_name)}")
        
        # Register event handler for new messages
        self.telegram_client.add_event_handler(
            self.process_message,
            events.NewMessage(chats=channel)
        )
        
        logger.info("Event handler registered. Waiting for signals...")
        
        # Keep the client running
        try:
            await self.telegram_client.run_until_disconnected()
        except Exception as e:
            logger.error(f"Error in monitoring loop: {str(e)}")
            return

    def initialize_session_management(self) -> bool:
        """Initialize session management. Uses existing session if loaded by SessionManager, otherwise starts a new one."""
        try:
            # SessionManager attempts to load from active_session.json or recover during its __init__
            loaded_session = self.session_manager.get_current_session()

            if loaded_session:
                logger.info(f"Using already loaded session: {loaded_session.session_id}")
                self.session_id = loaded_session.session_id
                
                # Update balance_start for the loaded session with current live balance
                current_balance = 0.0
                if self.pocket_option_client:
                    try:
                        balance_val = self.pocket_option_client.get_balance()
                        if balance_val is not None:
                            current_balance = float(balance_val)
                            self.session_manager.update_session(balance_start=current_balance, last_activity=get_high_precision_time().isoformat())
                            logger.info(f"Updated balance_start for loaded session {self.session_id} to {current_balance}")
                            loaded_session.balance_start = current_balance # Ensure local copy is also updated
                        else:
                            logger.warning(f"Could not get current balance for loaded session {self.session_id}; balance_start may be stale.")
                            current_balance = loaded_session.balance_start # Use existing if live fails
                    except Exception as e:
                        logger.warning(f"Error getting/updating balance for loaded session {self.session_id}: {str(e)}. Using existing balance_start: {loaded_session.balance_start}")
                        current_balance = loaded_session.balance_start # Use existing if live fails
                else:
                    logger.warning("Pocket Option client not available to update balance_start for loaded session.")
                    current_balance = loaded_session.balance_start

                self.session_data = {
                    "session_id": loaded_session.session_id,
                    "start_time": loaded_session.start_time,
                    "balance_start": current_balance, # Use the potentially updated balance
                    "trades_count": loaded_session.trades_count,
                    "wins": loaded_session.wins,
                    "losses": loaded_session.losses,
                    "draws": loaded_session.draws,
                    "profit_loss": loaded_session.profit_loss
                }
                logger.info(f"✅ Session management initialized with existing session: {self.session_id}")
                return True
            else:
                # No session loaded by SessionManager, try to start a new one
                logger.info("No existing session found by SessionManager. Attempting to start a new session.")
                can_start, message = self.session_manager.can_start_new_session()
                if not can_start:
                    logger.error(f"Cannot start new session: {message}")
                    return False

                initial_balance = 0.0
                if self.pocket_option_client:
                    try:
                        balance_val = self.pocket_option_client.get_balance()
                        if balance_val is not None:
                            initial_balance = float(balance_val)
                    except Exception as e:
                        logger.warning(f"Could not get initial balance for new session: {str(e)}")

                session_info = self.session_manager.start_new_session(initial_balance)
                if session_info:
                    self.session_id = session_info.session_id
                    self.session_data = {
                        "session_id": session_info.session_id,
                        "start_time": session_info.start_time,
                        "balance_start": session_info.balance_start,
                        "trades_count": session_info.trades_count,
                        "wins": session_info.wins,
                        "losses": session_info.losses,
                        "draws": session_info.draws,
                        "profit_loss": session_info.profit_loss
                    }
                    logger.info(f"✅ Session management initialized with new session: {self.session_id}")
                    return True
                else:
                    logger.error("Failed to start new session via SessionManager.")
                    return False
        except Exception as e:
            logger.error(f"Error initializing session management: {str(e)}")
            return False

    def update_session_stats(self, **kwargs) -> None:
        """Update session statistics."""
        try:
            if self.session_manager:
                self.session_manager.update_session(**kwargs)
                
                # Update local session data
                current_session = self.session_manager.get_current_session()
                if current_session:
                    self.session_data.update({
                        "trades_count": current_session.trades_count,
                        "wins": current_session.wins,
                        "losses": current_session.losses,
                        "draws": current_session.draws,
                        "profit_loss": current_session.profit_loss
                    })
        except Exception as e:
            logger.error(f"Error updating session stats: {str(e)}")
    
    def check_signal_duplicate(self, signal_data: Dict) -> bool:
        """Check if signal is a duplicate using the signal deduplicator."""
        try:
            is_duplicate, message = self.signal_deduplicator.is_duplicate_signal(signal_data)
            if is_duplicate:
                logger.warning(f"🔄 DUPLICATE SIGNAL DETECTED: {message}")
                return True
            
            # Register the signal to prevent future duplicates
            self.signal_deduplicator.register_signal(signal_data)
            return False
        except Exception as e:
            logger.error(f"Error checking signal duplicate: {str(e)}")
            return False
    
    def get_session_statistics(self) -> Dict:
        """Get comprehensive session statistics."""
        try:
            session_stats = self.session_manager.get_session_stats() if self.session_manager else {}
            fingerprint_stats = self.signal_deduplicator.get_fingerprint_stats() if self.signal_deduplicator else {}
            timestamp_stats = self.get_timestamp_performance_stats()
            
            return {
                "session": session_stats,
                "fingerprints": fingerprint_stats,
                "timestamps": timestamp_stats,
                "trading_stats": self.stats
            }
        except Exception as e:
            logger.error(f"Error getting session statistics: {str(e)}")
            return {"error": str(e)}
    
    def cleanup_session(self) -> None:
        """Clean up session data and end current session."""
        try:
            if self.session_manager:
                # Get final balance
                final_balance = None
                if self.pocket_option_client:
                    try:
                        final_balance = self.pocket_option_client.get_balance()
                        if final_balance is not None:
                            final_balance = float(final_balance)
                    except Exception as e:
                        logger.warning(f"Could not get final balance: {str(e)}")
                
                # End session
                self.session_manager.end_session(final_balance)
                logger.info("✅ Session cleanup completed")
        except Exception as e:
            logger.error(f"Error during session cleanup: {str(e)}")

    def get_timestamp_performance_stats(self) -> Dict:
        """Get timestamp performance statistics."""
        try:
            return self.timestamp_recorder.get_performance_stats()
        except Exception as e:
            logger.error(f"Error getting timestamp performance stats: {str(e)}")
            return {"error": str(e)}
    
    def get_recent_timestamp_records(self, limit: int = 10) -> List[Dict]:
        """Get recent timestamp records."""
        try:
            return self.timestamp_recorder.get_recent_records(limit)
        except Exception as e:
            logger.error(f"Error getting recent timestamp records: {str(e)}")
            return []

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Pocket Option Self Bot v1.5")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    return parser.parse_args()

async def main():
    """Main function to run the bot."""
    args = parse_arguments()
    
    # Create bot instance
    bot = SelfBot(verbose=args.verbose)
    
    # Display professional startup sequence
    components = professional_output.startup_sequence("v3.0")
    
    # Initialize components with professional status updates
    telegram_initialized = await bot.initialize_telegram()
    professional_output.update_component_status("Telegram Client", telegram_initialized, 
                                               "(Connected)" if telegram_initialized else "(Failed)")
    if not telegram_initialized:
        professional_output.error("Failed to initialize Telegram client. Exiting...")
        sys.exit(1)
    
    pocket_option_initialized = bot.initialize_pocket_option()
    balance_info = ""
    if pocket_option_initialized and bot.pocket_option_client:
        try:
            balance = bot.pocket_option_client.get_balance()
            if balance:
                balance_info = f"(Balance: ${float(balance):.2f})"
        except:
            balance_info = "(Balance: Unknown)"
    professional_output.update_component_status("PocketOption API", pocket_option_initialized, balance_info)
    if not pocket_option_initialized:
        professional_output.error("Failed to initialize Pocket Option client. Exiting...")
        sys.exit(1)
    
    json_storage_initialized = bot.initialize_json_storage()
    professional_output.update_component_status("JSON Storage", json_storage_initialized)
    if not json_storage_initialized:
        professional_output.error("Failed to initialize JSON storage. Exiting...")
        sys.exit(1)
    
    # Initialize session management
    session_management_initialized = bot.initialize_session_management()
    session_info = ""
    if session_management_initialized and bot.session_id:
        session_info = f"(Session #{bot.session_id})"
    professional_output.update_component_status("Session Manager", session_management_initialized, session_info)
    if not session_management_initialized:
        professional_output.error("Failed to initialize session management. Exiting...")
        sys.exit(1)
    
    # Setup trading amount for the session
    bot.setup_session_amount()
    
    # Start enhanced warm-up system
    if bot.enhanced_warm_up_manager:
        warm_up_success = bot.enhanced_warm_up_manager.start_drag_racing_warmup()
        if warm_up_success:
            performance_summary = bot.enhanced_warm_up_manager.get_performance_summary()
            professional_output.warmup_status("Enhanced drag racing warm-up started", details=performance_summary)
        else:
            professional_output.warning("Enhanced warm-up system had issues, but continuing...")
    
    # Start manual warm-up controller
    if bot.manual_warmup_controller:
        def status_callback(title, message):
            professional_output.warmup_status(f"Manual Control: {title}", details=message)
        
        def progress_callback(operation, stage, current, total):
            professional_output.warmup_status(f"Manual Progress: {operation}", details=f"{stage} ({current}/{total})")
        
        manual_control_success = bot.manual_warmup_controller.start_manual_control(
            status_callback=status_callback,
            progress_callback=progress_callback
        )
        if manual_control_success:
            professional_output.warmup_status("Manual warm-up control started", details="Press SPACEBAR for instant boost")
        else:
            professional_output.warning("Manual warm-up control had issues, but continuing...")
    
    # Start legacy warm-up system for backward compatibility
    if bot.warm_up_manager:
        warm_up_success = bot.warm_up_manager.start_warm_up_system()
        if warm_up_success:
            professional_output.warmup_status("Legacy warm-up system started")
        else:
            professional_output.warning("Legacy warm-up system had issues, but continuing...")
    
    # Validate session for screenshot functionality before starting Selenium monitor
    enable_screenshots, validation_message, validated_session = validate_session_for_bot_startup(
        sessions_dir="sessions",
        screenshots_dir="screenshots", 
        allow_emergency_session=True,
        verbose=args.verbose
    )
    
    # Start Selenium session monitor with session validation
    if bot.selenium_monitor and enable_screenshots:
        selenium_success = bot.selenium_monitor.start_monitoring("https://po.trade/en")
        professional_output.update_component_status("Browser Monitor", selenium_success, 
                                                   "(Screenshots enabled)" if selenium_success else "(Failed)")
        if selenium_success:
            professional_output.selenium_status("active", "Screenshots will be sent to Signal_Sniper_Test_Channel")
        else:
            professional_output.selenium_status("error", "Monitor had issues, but continuing...")
    elif bot.selenium_monitor and not enable_screenshots:
        professional_output.update_component_status("Browser Monitor", False, "(Disabled - Session validation failed)")
        professional_output.selenium_status("disabled", "Screenshots disabled due to session issues")
        professional_output.warning("Session validation failed for screenshots:")
        for line in validation_message.split('\n'):
            if line.strip():
                professional_output.warning(f"  {line}")
        # Disable screenshot functionality in the monitor
        bot.selenium_monitor.screenshot_enabled = False
        bot.selenium_monitor.is_monitoring = False
    else:
        professional_output.update_component_status("Browser Monitor", False, "(Not initialized)")
    
    # Show operational status
    all_components_ready = all([telegram_initialized, pocket_option_initialized, 
                               json_storage_initialized, session_management_initialized])
    professional_output.operational_status(all_components_ready)
    
    # Start monitoring
    await bot.start_monitoring()

if __name__ == "__main__":
    # Handle Ctrl+C gracefully with proper cleanup
    def signal_handler(sig, frame):
        logger.info("Shutting down Self Bot...")
        if "bot" in locals():
            try:
                if hasattr(bot, "timestamp_recorder") and hasattr(bot.timestamp_recorder, "flush_buffer"):
                    bot.timestamp_recorder.flush_buffer()
            except Exception as e:
                logger.error(f"Error flushing timestamp buffer on shutdown: {str(e)}")
            
            # Stop enhanced warm-up system
            if hasattr(bot, "enhanced_warm_up_manager") and bot.enhanced_warm_up_manager:
                try:
                    bot.enhanced_warm_up_manager.stop_enhanced_warmup_system()
                except Exception as e:
                    logger.error(f"Error stopping enhanced warm-up system: {str(e)}")
            
            # Stop manual warm-up controller
            if hasattr(bot, "manual_warmup_controller") and bot.manual_warmup_controller:
                try:
                    bot.manual_warmup_controller.stop_manual_control()
                except Exception as e:
                    logger.error(f"Error stopping manual warm-up controller: {str(e)}")
            
            # Stop legacy warm-up system
            if hasattr(bot, "warm_up_manager") and bot.warm_up_manager:
                try:
                    bot.warm_up_manager.stop_warm_up_system()
                except Exception as e:
                    logger.error(f"Error stopping warm-up system: {str(e)}")
            
            # Stop Selenium session monitor
            if hasattr(bot, "selenium_monitor") and bot.selenium_monitor:
                try:
                    bot.selenium_monitor.stop_monitoring()
                except Exception as e:
                    logger.error(f"Error stopping Selenium monitor: {str(e)}")
            
            # Stop Telegram optimization manager
            if hasattr(bot, "telegram_optimizer") and bot.telegram_optimizer:
                try:
                    import asyncio
                    asyncio.run(bot.telegram_optimizer.shutdown())
                except Exception as e:
                    logger.error(f"Error stopping Telegram optimizer: {str(e)}")
            
            bot.cleanup_session()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    # Run the bot
    asyncio.run(main())
