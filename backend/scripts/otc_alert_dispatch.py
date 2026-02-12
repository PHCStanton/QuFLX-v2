import asyncio
import aiohttp
import logging
import os
import sys
import json
import re
import argparse
import csv
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Any
from enum import Enum

# Third-party imports
try:
    import ta
    from ta.trend import ADXIndicator
    from ta.volatility import BollingerBands
    from ta.momentum import RSIIndicator
except ImportError:
    print("Error: 'ta' library not found. Please install with: pip install ta")
    sys.exit(1)

from dotenv import load_dotenv

try:
    import redis.asyncio as redis
except ImportError:
    redis = None
    print("Warning: 'redis' library not found. Redis subscription mode will be unavailable. pip install redis")

# --- Configuration & Setup ---

# Determine Project Root to load .env correctly
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parents[1] # Assuming backend/scripts/script.py -> backend -> root
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# QuFLX utilities
try:
    from backend.utils.history_utils import get_recent_history_file
    from backend.utils.asset_utils import normalize_asset
except ImportError:
    # Fallback if PYTHONPATH is not set correctly
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.append(str(PROJECT_ROOT))
    from backend.utils.history_utils import get_recent_history_file
    from backend.utils.asset_utils import normalize_asset

# Logging Setup
LOG_DIR = PROJECT_ROOT / "system_LOGS" / "alert_dispatch"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Redis Config
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
logger = logging.getLogger("OTC_Dispatch")


# --- Data Structures ---

class MarketCondition(Enum):
    STRONG_MOMENTUM_UP = "Strong Momentum Trending (Bullish)"
    STRONG_MOMENTUM_DOWN = "Strong Momentum Trending (Bearish)"
    PULLBACK_BUY = "Trending Pullback (Buy Dip)"
    PULLBACK_SELL = "Trending Pullback (Sell Rally)"
    RANGING_OVERBOUGHT = "Ranging – Overbought (Sell)"
    RANGING_OVERSOLD = "Ranging – Oversold (Buy)"
    BREAKOUT_UP = "Breakout (Bullish)"
    BREAKOUT_DOWN = "Breakout (Bearish)"
    REVERSAL_BULLISH = "Trend Reversal (Bullish)"
    REVERSAL_BEARISH = "Trend Reversal (Bearish)"
    NEUTRAL = "Neutral"

@dataclass
class AlertContext:
    asset: str
    condition: MarketCondition
    price: float
    time: str
    technicals: Dict[str, Any]
    payout: float = 92.0
    direction: Optional[str] = None # CALL/PUT
    suggested_expiry: Optional[str] = "1m"

@dataclass
class AIAnalysisResult:
    confirmed: bool
    reason: str
    confidence: float
    raw_response: str = ""


# --- Components ---

class MarketScanner:
    """Calculates technical indicators and identifies KB market regimes."""
    
    def __init__(self):
        self._cache = {} # {asset: (last_timestamp, result)}
    
    def analyze(self, candles: List[Dict], asset: str = "unknown", candle_count: int = 100) -> Optional[Dict]:
        """
        Returns condition details if interesting, else None.
        Uses a simple cache to skip recalculation if the latest candle hasn't changed.
        
        Now delegates to the shared regime_detector module.
        """
        if not candles or len(candles) < 30:
            logger.debug(f"Scanner: {asset} - Not enough candles ({len(candles) if candles else 0})")
            return None
            
        last_candle = candles[-1]
        last_ts = last_candle.get('time') or last_candle.get('timestamp') or last_candle.get('id')
        
        # Check Cache
        cache_key = f"{asset}_{candle_count}"
        if cache_key in self._cache:
            cached_ts, cached_result = self._cache[cache_key]
            if cached_ts == last_ts:
                return cached_result

        try:
            import pandas as pd
            from backend.services.strategy.regime_detector import detect_regime, calculate_indicators
            
            # Convert candles to DataFrame
            df = pd.DataFrame(candles)
            
            # Use enough candles for EMAs, but regime detection uses candle_count
            required_count = max(200, candle_count)
            df = df.tail(required_count)
            
            # Calculate indicators and detect regime
            df = calculate_indicators(df)
            regime_result = detect_regime(df)
            
            if regime_result is None:
                return None
            
            # Convert RegimeResult to the dict format expected by the dispatcher
            final_result = {
                "condition": regime_result.condition,
                "confluence_score": regime_result.confluence_score,
                "direction": regime_result.direction,
                "suggested_expiry": regime_result.suggested_expiry,
                "technicals": regime_result.technicals
            }
            
            # Cache and return
            self._cache[cache_key] = (last_ts, final_result)
            return final_result
            
        except Exception as e:
            logger.error(f"Error in regime detection: {e}", exc_info=True)
            return None




class AIOrchestrator:
    """Handles communication with the AI Service."""
    
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url
        self.api_key = api_key
        # Semaphore to limit concurrent AI requests
        self.semaphore = asyncio.Semaphore(3)
        self._session: Optional[aiohttp.ClientSession] = None

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=aiohttp.ClientTimeout(total=45)
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    def update_config(self, enable_confirm: bool = None, min_confidence: float = None):
        """Update AI confirmation settings in real-time."""
        if enable_confirm is not None:
            self.enable_confirm = enable_confirm
            logger.info(f"AIOrchestrator: enable_confirm updated to {self.enable_confirm}")
        if min_confidence is not None:
            self.min_confidence = min_confidence
            logger.info(f"AIOrchestrator: min_confidence updated to {self.min_confidence}")

    async def verify_setup(self, context: AlertContext) -> AIAnalysisResult:
        """Sends context to AI and awaits verdict."""
        # Acquire semaphore before proceeding
        async with self.semaphore:
             return await self._execute_request(context)

    async def _execute_request(self, context: AlertContext) -> AIAnalysisResult:
        if not self.api_url:
            logger.warning("AI URL not configured, skipping AI verification.")
            return AIAnalysisResult(False, "AI_URL_MISSING", 0.0)

        regime_label = context.condition.value
        direction = context.direction
        tech = context.technicals
        
        prompt = f"""
        Analyze this {regime_label} setup for {context.asset} (OTC).
        
        ### Knowledge Base Criteria for this Regime:
        - Direction: {direction}
        - Required Confluences: EMA-16 trend aligned, Supertrend aligned, ADX rising, MACD momentum.
        - Volume Proxy: ATR expansion + Large candle bodies (Body Ratio > 0.7).
        
        ### Current Market Data:
        - Price: {context.price}
        - Indicators: ADX={tech.get('adx', '---')}, RSI={tech.get('rsi', '---')}, BB_Width={tech.get('bb_width', '---')}
        - KB Indicators: EMA16={tech.get('ema16', '---')}, Supertrend={tech.get('supertrend', '---')}, MACD_Hist={tech.get('macd_hist', '---')}
        - Volume Proxy: Body_Ratio={tech.get('body_ratio', '---')}, Large_Body={tech.get('large_body', '---')}
        - S/R Proximity: {tech.get('near_sr', '---')}
        
        ### Task:
        Evaluate if this is an "A+" setup. 
        - High-quality: Confirms with ≥3 signals and strong volume proxy.
        - Low-quality: Flat MACD, price trapped in noise, or ADX stalling.
        
        Return JSON ONLY:
        {{
            "confirmed": boolean,
            "reason": "short explanation referring to indicators",
            "confidence": float (0.0 to 1.0)
        }}
        """
        
        payload = {
            "model": "gpt-4-turbo", # or your configured model
            "prompt": prompt,
            "json": True
        }

        try:
            session = await self.get_session()
            async with session.post(self.api_url, json=payload) as response:
                if response.status != 200:
                    logger.error(f"AI API error status={response.status}")
                    return AIAnalysisResult(False, f"AI_API_ERROR_{response.status}", 0.0)
                
                data = await response.json()
                text = data.get('answer', '') or data.get('content', '') or data.get('response', '')
                
                # Robust JSON Parsing
                result = self._parse_json_result(text)
                result.raw_response = text
                return result

        except Exception as e:
            logger.error(f"AI Connection Failed: {e}")
            return AIAnalysisResult(False, f"CONNECTION_ERROR: {str(e)}", 0.0)

    def _parse_json_result(self, text: str) -> AIAnalysisResult:
        """Extracts JSON result from AI response using regex and heuristic fallbacks."""
        # 1. Regex strategy for markdown or raw blocks
        json_match = re.search(r'(\{.*\})', text.replace('\n', ' '), re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                return AIAnalysisResult(
                    confirmed=bool(data.get('confirmed', False)),
                    reason=str(data.get('reason', 'JSON parsed')),
                    confidence=float(data.get('confidence', 0.5))
                )
            except (json.JSONDecodeError, ValueError):
                pass

        # 2. Heuristic fallback
        confirmed = "true" in text.lower() and "not confirmed" not in text.lower()
        return AIAnalysisResult(confirmed, text[:100], 0.5)


class DiscordDispatcher:
    """Manages Alert sending."""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
        self.last_sent = {} # Dedup: {asset: timestamp}
    
    async def send_alert(self, context: AlertContext, ai_verdict: AIAnalysisResult):
        if not self.webhook_url:
            logger.warning("Discord Webhook missing.")
            return

        # Rate Limit Check (e.g., 1 alert per asset per 15 mins)
        now = datetime.now().timestamp()
        last = self.last_sent.get(context.asset, 0)
        if now - last < 900: # 15 mins
            logger.info(f"Skipping alert for {context.asset} (Rate Limit)")
            return

        # Shared Session
        if not hasattr(self, '_session') or self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))

        direction_emoji = "📈" if context.direction == "CALL" else "📉"
        
        # Regime metadata (if available from tech)
        regime_label = context.condition.value
        
        # Indicator strings for embed
        tech = context.technicals
        indicator_text = (
            f"**ADX:** {tech.get('adx', '---')} | **RSI:** {tech.get('rsi', '---')}\n"
            f"**MACD Hist:** {tech.get('macd_hist', '---')} | **BB Width:** {tech.get('bb_width', '---')}\n"
            f"**EMA-16/165:** {tech.get('ema16', '---')} / {tech.get('ema165', '---')}\n"
            f"**Supertrend:** {tech.get('supertrend', '---')}"
        )
        
        embed = {
            "title": f"{direction_emoji} {context.asset} Sniper Signal",
            "description": f"**Market Regime:** {regime_label}\n**Suggested Direction:** **{context.direction}**\n**Suggested Expiry:** **{context.suggested_expiry}**",
            "color": 0x22c55e if context.direction == "CALL" else 0xef4444,
            "fields": [
                {"name": "🎯 Entry Context", "value": f"**Price:** {context.price}\n**Payout:** {context.payout}%", "inline": True},
                {"name": "📊 Technicals", "value": indicator_text, "inline": False},
                {"name": "🤖 AI Verdict", "value": f"**Confirmed:** {'✅' if ai_verdict.confirmed else '❌'}\n**Confidence:** {ai_verdict.confidence:.0%}\n**Reason:** {ai_verdict.reason}", "inline": False}
            ],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "footer": {"text": f"QuFLX OTC Alert Dispatcher | Confluence Score: {tech.get('confluence_score', '---')}"}
        }
        
        payload = {
            "username": "QuFLX OTC Sniper",
            "avatar_url": "https://i.imgur.com/8N80W7I.png", # Optional: QuFLX logo
            "embeds": [embed]
        }
        
        try:
            async with self._session.post(self.webhook_url, json=payload) as resp:
                if resp.status in [200, 204]:
                    logger.info(f"Alert sent for {context.asset}")
                    self.last_sent[context.asset] = now
                else:
                    logger.error(f"Discord Failed: {resp.status}")
        except Exception as e:
            logger.error(f"Discord Dispatch Error: {e}")

    async def close(self):
        if hasattr(self, '_session') and self._session and not self._session.closed:
            await self._session.close()


# --- Tick Logger ---

class TickLogger:
    """Buffers ticks and saves to CSV in chunks of 1000."""
    
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.buffers = {} # {asset: [ticks]}
        self.CHUNK_SIZE = int(os.getenv("TICK_CHUNK_SIZE", "1000"))
        
        # Override data_dir if provided via ENV
        env_dir = os.getenv("TICK_LOG_DIR")
        if env_dir:
            self.data_dir = Path(env_dir) if Path(env_dir).is_absolute() else PROJECT_ROOT / env_dir
    
    async def log_ticks(self, asset: str, ticks: List[Dict]):
        if asset not in self.buffers:
            self.buffers[asset] = []
        
        # Add new data
        self.buffers[asset].extend(ticks)
        
        # Check buffer size
        if len(self.buffers[asset]) >= self.CHUNK_SIZE:
            await self.flush(asset)

    async def log_tick(self, asset: str, tick: Dict):
        """Log a single tick (e.g. from Redis)"""
        if asset not in self.buffers:
            self.buffers[asset] = []
        
        self.buffers[asset].append(tick)
        
        if len(self.buffers[asset]) >= self.CHUNK_SIZE:
            await self.flush(asset)
    
    async def flush(self, asset: str):
        if asset not in self.buffers or not self.buffers[asset]:
            return

        chunk = self.buffers[asset][:self.CHUNK_SIZE]
        self.buffers[asset] = self.buffers[asset][self.CHUNK_SIZE:] # Keep remainder
        
        if not chunk:
            return

        # Robust timestamp extraction
        def get_ts(item):
            t = item.get('time') or item.get('timestamp')
            if not t:
                return int(datetime.now().timestamp())
            try:
                return int(float(t))
            except (ValueError, TypeError):
                # Handle ISO strings if they snuck in
                try:
                    from dateutil import parser
                    return int(parser.parse(str(t)).timestamp())
                except:
                    return int(datetime.now().timestamp())

        ts_start = get_ts(chunk[0])
        ts_end = get_ts(chunk[-1])
        
        asset_dir = self.data_dir / asset
        asset_dir.mkdir(parents=True, exist_ok=True)
        
        filename = asset_dir / f"{ts_start}_{ts_end}.csv"
        
        try:
            # Simple CSV write
            import csv
            keys = chunk[0].keys()
            
            # Run blocking I/O in thread
            await asyncio.to_thread(self._write_csv, filename, keys, chunk)
            logger.info(f"Logged {len(chunk)} ticks for {asset} to {filename.name}")
            
        except Exception as e:
            logger.error(f"Failed to log ticks for {asset}: {e}")
            # Re-queue on failure? For now, drop to avoid memory leak
    
    def _write_csv(self, path, keys, data):
        with open(path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data)


class RedisSubscriber:
    """Listens to Redis 'market_data' channel for live ticks."""
    def __init__(self, redis_url: str, logger_service: TickLogger, assets: List[str]):
        self.redis_url = redis_url
        self.logger_service = logger_service
        self.assets = [normalize_asset(a) for a in assets]
        self.redis_client = None

    async def run(self):
        if not redis:
            logger.error("Redis library not available. Subscriber cannot start.")
            return

        logger.info(f"Connecting to Redis for tick logging: {self.redis_url}")
        while True:
            try:
                self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
                pubsub = self.redis_client.pubsub()
                await pubsub.subscribe("market_data")
                
                logger.info(f"Subscribed to 'market_data' for: {self.assets}")
                
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        try:
                            data = json.loads(message['data'])
                            asset = normalize_asset(data.get('asset', ''))
                            if not self.assets or asset in self.assets:
                                await self.logger_service.log_tick(asset, data)
                        except Exception as e:
                            logger.error(f"Error processing Redis tick: {e}")
            except Exception as e:
                logger.warning(f"Redis Tick Log Connection Error: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)
            finally:
                if self.redis_client:
                    await self.redis_client.close()
                    self.redis_client = None


class TickerSubscriber:
    """Listens for active ticker updates to whitelist dispatch assets."""
    def __init__(self, redis_url: str, logger_service=None):
        self.redis_url = redis_url
        self.active_assets = set()
        self.first_whitelist_received = asyncio.Event()
        
    async def run(self):
        if not redis: return
        while True:
            try:
                client = redis.from_url(self.redis_url, decode_responses=True)
                pubsub = client.pubsub()
                await pubsub.subscribe("ticker:active")
                logger.info("Subscribed to 'ticker:active' - Waiting for Frontend selections...")
                
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        try:
                            # Frontend sends list: ["AUDCAD_OTC", "EURUSD_OTC"]
                            data = json.loads(message['data'])
                            if isinstance(data, list):
                                self.active_assets = {normalize_asset(a) for a in data}
                                logger.info(f"Ticker Update -> Whitelist: {self.active_assets}")
                                self.first_whitelist_received.set()
                        except Exception as e:
                            logger.error(f"Ticker Update Error: {e}")
            except Exception as e:
                logger.warning(f"Ticker Sub Connection Error: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)


# --- Main Service ---

class SettingsSubscriber:
    """Listens for settings updates to reconfigure the dispatcher in real-time."""
    def __init__(self, redis_url: str, dispatcher: 'OTCDispatcher'):
        self.redis_url = redis_url
        self.dispatcher = dispatcher
        
    async def run(self):
        if not redis: return
        while True:
            try:
                client = redis.from_url(self.redis_url, decode_responses=True)
                pubsub = client.pubsub()
                await pubsub.subscribe("settings:updated")
                logger.info("Subscribed to 'settings:updated' - Ready for real-time config changes.")
                
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        try:
                            data = json.loads(message['data'])
                            alerts_cfg = data.get("alerts", {})
                            
                            # 1. Update AI Orchestrator
                            enable_ai = alerts_cfg.get("enableAIConfirm")
                            min_conf = alerts_cfg.get("minAIConfidence")
                            self.dispatcher.ai.update_config(enable_confirm=enable_ai, min_confidence=min_conf)
                            
                            # 2. Update Dispatcher Core
                            candle_count = alerts_cfg.get("candleCount")
                            if candle_count:
                                 self.dispatcher.candle_count = int(candle_count)
                                 logger.info(f"SettingsSync: candle_count updated to {self.dispatcher.candle_count}")
                                 
                            scan_interval = alerts_cfg.get("scanIntervalSeconds")
                            if scan_interval:
                                 self.dispatcher.scan_interval = int(scan_interval)
                                 logger.info(f"SettingsSync: scan_interval updated to {self.dispatcher.scan_interval}s")
                            
                            cooldown_min = alerts_cfg.get("alertCooldownMinutes")
                            if cooldown_min:
                                 self.dispatcher.COOLDOWN_SECONDS = int(cooldown_min) * 60
                                 logger.info(f"SettingsSync: COOLDOWN_SECONDS updated to {self.dispatcher.COOLDOWN_SECONDS}s")

                        except Exception as e:
                            logger.error(f"Settings Update Error: {e}")
            except Exception as e:
                logger.warning(f"Settings Sub Connection Error: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)

class OTCDispatcher:
    def __init__(self, assets: List[str], test_mode: bool = False):
        self.assets = assets
        self.test_mode = test_mode
        self.scanner = MarketScanner()
        # Load from env
        self.ai = AIOrchestrator(
            api_url=os.getenv("QFLX_AI_ENDPOINT", "http://localhost:8000/api/v1/ai/ask"),
            api_key=os.getenv("QFLX_API_KEY", "")
        )
        self.discord = DiscordDispatcher(
            webhook_url=os.getenv("DISCORD_WEBHOOK_URL", "")
        )
        
        self.logger_service = TickLogger(data_dir=PROJECT_ROOT / "data" / "ticks")
        self.redis_url = REDIS_URL
        self.redis_mode = False # Default unless toggled via main()
        
        self.subscriber = RedisSubscriber(self.redis_url, self.logger_service, self.assets)
        self.ticker_sub = TickerSubscriber(self.redis_url)
        self.settings_sub = SettingsSubscriber(self.redis_url, self)

        # Assuming internal API for market data
        self.market_source_url = os.getenv("QFLX_MARKET_DATA_URL", "http://localhost:8000/api/v1/history")
        
        # Cooldown Tracker: {asset: timestamp}
        self.cooldowns: Dict[str, float] = {}
        self.COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "300"))
        
        # Correlation Groups (R4)
        self.correlation_groups = {
            "AUD": ["AUDCADOTC", "AUDCHFDOTC", "AUDJPYOTC", "AUDNZDOTC", "AUDUSDOTC"],
            "EUR": ["EURUSDOTC", "EURJPYOTC", "EURGBPOTC", "EURAUDOTC", "EURCADOTC", "EURCHFDOTC"],
            "GBP": ["GBPUSDOTC", "GBPJPYOTC", "GBPAUDOTC", "GBPCADOTC", "GBPCHFDOTC"],
            "USD": ["EURUSDOTC", "GBPUSDOTC", "AUDUSDOTC", "USDJPYOTC", "USDCADOTC", "USDCHFDOTC"]
        }
        self.group_last_alert: Dict[str, float] = {} # {group: timestamp}
        self.GROUP_COOLDOWN = 120 # 2 minutes between correlated alerts
        
        # Pending Breakouts (R6)
        self.pending_breakouts: Dict[str, Dict] = {} # {asset: {direction, timestamp, start_price}}
        
        # New Settings
        self.enable_ai_confirm = os.getenv("ENABLE_AI_CONFIRM", "true").lower() == "true"
        self.min_ai_confidence = float(os.getenv("ALERT_MIN_CONFIDENCE", "0.7"))
        self.candle_count = int(os.getenv("ALERT_CANDLE_COUNT", "100"))
        self.scan_interval = int(os.getenv("SCAN_INTERVAL_SECONDS", "60"))

    async def close(self):
        """Gracefully shutdown all components."""
        logger.info("Closing OTC Dispatcher components...")
        await self.ai.close()
        await self.discord.close()
        # Add any other component cleanup here (e.g. redis)


    def scan_available_assets(self) -> List[str]:
        """Scans local history directory for assets with data."""
        history_dir = PROJECT_ROOT / "data" / "data_output" / "history"
        if not history_dir.exists():
            return []
        
        found_assets = []
        try:
            # Check subdirectories that contain CSV files
            for item in history_dir.iterdir():
                if item.is_dir():
                    # Strict: Folder name MUST be exactly equal to its normalized form
                    # This avoids picking up 'AED_CNY_OTC_' if 'AEDCNYOTC' is the target
                    name = item.name
                    if name == normalize_asset(name):
                        # Check if any .csv exists and ignore LEGACY
                        csvs = [f for f in item.glob("*.csv") if "LEGACY" not in f.name]
                        if csvs:
                            found_assets.append(name)
        except Exception as e:
            logger.error(f"Asset Scan Error: {e}")
            
        return found_assets

    async def fetch_data(self, asset: str) -> List[Dict]:
        """Fetches last N candles for asset, prioritizing local CSV."""
        if self.test_mode:
             # Mock Data
             logger.info(f"Test Mode: Generating mock data for {asset}")
             # Return a pattern that triggers a BUY
             import random
             base = 1.0500
             now = datetime.now().timestamp()
             # Include time for logging
             return [{"time": now + (i*60), "open": base + (i * 0.0002), "close": base + ((i+1) * 0.0002), "high": base + ((i+1) * 0.00025), "low": base + (i * 0.00018), "volume": 100} for i in range(self.candle_count)]

        # --- Option A: Direct CSV Reading ---
        try:
            # 1. Look for local history file
            # timeframe 1 = 1m
            csv_path = get_recent_history_file(asset, 1)
            
            if csv_path and csv_path.exists():
                import pandas as pd
                # Run blocking I/O in thread
                df = await asyncio.to_thread(pd.read_csv, csv_path)
                if not df.empty:
                    # Rename 'timestamp' to 'time' if needed to match dispatcher expectation
                    if 'timestamp' in df.columns and 'time' not in df.columns:
                        df = df.rename(columns={'timestamp': 'time'})
                    
                    # Request enough for EMA-165
                    required_limit = max(200, self.candle_count)
                    candles = df.tail(required_limit).to_dict('records')
                    
                    # Optional: Data Recency Check (Phase 2C)
                    if candles:
                        last_ts = candles[-1].get('time', 0)
                        now_ts = int(datetime.now().timestamp())
                        age = now_ts - last_ts
                        if age > 120:  # More than 2 minutes old
                            logger.warning(f"Data for {asset} is STALE ({age}s old).")
                        else:
                            logger.debug(f"Data for {asset} recency: {age}s")

                    logger.info(f"Loaded {len(candles)} candles from local CSV for {asset}")
                    return candles
        except Exception as e:
            logger.error(f"Error reading local history for {asset}: {e}")

        # --- Fallback: Real Data from API ---
        try:
            async with aiohttp.ClientSession() as session:
                # Adjust timeframe/params as per QuFLX API
                # Request at least 200 candles for EMA-165 stability
                required_limit = max(200, self.candle_count)
                url = f"{self.market_source_url}/{asset}/1m?limit={required_limit}"
                async with session.get(url, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        candles = data.get('candles', []) or data.get('data', [])
                        if candles:
                             logger.info(f"Fetched {len(candles)} candles via API for {asset}")
                        return candles
                    
                    if resp.status == 404:
                         # Silencing this unless in debug mode, as we now prioritize local CSV
                         pass
                    else:
                        logger.warning(f"Failed to fetch {asset} via API: {resp.status}")
                    return []
        except Exception as e:
            logger.error(f"Fetch Error {asset}: {e}")
            return []

    async def process_asset(self, asset: str):
        """Pipeline for a single asset."""
        data_points = await self.fetch_data(asset)
        
        # Log Data (Buffered)
        if data_points:
            await self.logger_service.log_ticks(asset, data_points)

        # 2. Analyze (R7: Cache enabled inside scanner)
        if self.test_mode:
             result = {
                 "condition": MarketCondition.STRONG_MOMENTUM_UP,
                 "confluence_score": 85,
                 "direction": "CALL",
                 "suggested_expiry": "3m",
                 "technicals": {
                     "price": 1.0600,
                     "adx": 45.0,
                     "rsi": 65.0,
                     "bb_width": 0.02,
                     "macd_hist": 0.001,
                     "stoch_k": 75.0,
                     "ema16": 1.0580,
                     "ema165": 1.0500,
                     "supertrend": 1.0550,
                     "near_sr": "Support",
                     "body_ratio": 0.6,
                     "large_body": True,
                     "confluence_score": 85
                 }
             }
        else:
            result = self.scanner.analyze(data_points, asset=asset, candle_count=self.candle_count)
            if not result:
                return

        # Prepare Context
        ctx = AlertContext(
            asset=asset,
            condition=result['condition'],
            price=result['technicals']['price'],
            time=datetime.now().isoformat(),
            technicals=result['technicals'],
            payout=92, # Default OTC payout
            direction=result.get('direction'),
            suggested_expiry=result.get('suggested_expiry', '1m')
        )
        
        logger.info(f"Condition Met: {asset} -> {ctx.condition.value} ({ctx.direction} {ctx.suggested_expiry})")
        
        # 1. Individual Cooldown
        now = datetime.now().timestamp()
        last_call = self.cooldowns.get(asset, 0)
        if now - last_call < self.COOLDOWN_SECONDS:
            logger.info(f"Skipping (Asset Cooldown): {asset} (Wait {int(self.COOLDOWN_SECONDS - (now - last_call))}s)")
            return
            
        # 2. Correlation Guard (R4)
        for group, assets in self.correlation_groups.items():
            if asset.upper().replace("_", "") in assets:
                last_group_alert = self.group_last_alert.get(group, 0)
                if now - last_group_alert < self.GROUP_COOLDOWN:
                    logger.info(f"Correlation Guard: Skipping {asset} (Group {group} active alert)")
                    return

        # 3. Confirmatory Candle Logic (R6) - Only for Breakouts
        if ctx.condition in [MarketCondition.BREAKOUT_UP, MarketCondition.BREAKOUT_DOWN]:
            if asset not in self.pending_breakouts:
                logger.info(f"Breakout Pending (Waiting for confirmation): {asset}")
                self.pending_breakouts[asset] = {
                    "condition": ctx.condition,
                    "price": ctx.price,
                    "time": now
                }
                return # Wait for next scan
            else:
                # Secondary scan: Check follow-through
                pending = self.pending_breakouts.pop(asset)
                if ctx.condition != pending['condition']:
                    logger.info(f"Breakout Invalidated (Condition changed): {asset}")
                    return
                # Check follow-through direction
                if ctx.condition == MarketCondition.BREAKOUT_UP and ctx.price < pending['price']:
                    logger.info(f"Breakout Fakeout (No follow-through): {asset}")
                    return
                elif ctx.condition == MarketCondition.BREAKOUT_DOWN and ctx.price > pending['price']:
                    logger.info(f"Breakout Fakeout (No follow-through): {asset}")
                    return
                logger.info(f"Breakout Confirmed: {asset}")

        # AI Check
        try:
            if self.enable_ai_confirm and not self.test_mode:
                ai_verdict = await self.ai.verify_setup(ctx)
                # Filter by Confidence
                if ai_verdict.confidence < self.min_ai_confidence:
                    logger.info(f"AI low confidence for {asset} ({ai_verdict.confidence:.2f} < {self.min_ai_confidence}). Skipping.")
                    return
                # Update cooldown only on successful AI evaluation
                self.cooldowns[asset] = now
            else:
                ai_verdict = AIAnalysisResult(True, "AI Confirmation Disabled (Force Pass)", 1.0)
        except Exception as e:
            logger.error(f"AI Check Failed for {asset}: {e}")
            return
        
        if ai_verdict.confirmed:
            # Update cooldowns
            self.cooldowns[asset] = now
            for group, assets in self.correlation_groups.items():
                if asset.upper().replace("_", "") in assets:
                    self.group_last_alert[group] = now
                    
            # 1. Dispatch to Discord
            await self.discord.send_alert(ctx, ai_verdict)
            logger.info(f"Alert Dispatched to Discord: {asset}")
            
            # 2. Publish to Redis for In-App Feed (R5)
            if redis:
                try:
                    client = redis.from_url(self.redis_url, decode_responses=True)
                    alert_data = {
                        "asset": ctx.asset,
                        "regime": ctx.condition.value,
                        "direction": ctx.direction,
                        "expiry": ctx.suggested_expiry,
                        "price": ctx.price,
                        "confluence": ctx.technicals.get('confluence_score', 0),
                        "ai_confirmed": ai_verdict.confirmed,
                        "ai_confidence": ai_verdict.confidence,
                        "timestamp": datetime.now().isoformat()
                    }
                    await client.publish("alerts:dispatched", json.dumps(alert_data))
                    await client.close()
                except Exception as e:
                    logger.error(f"Redis Alert Publish Error: {e}")

            # 3. Log to Journal (R3)
            await self.log_alert(ctx, ai_verdict)
        else:
            logger.info(f"AI Rejected {asset}: {ai_verdict.reason}")

    async def log_alert(self, context: AlertContext, ai_result: AIAnalysisResult):
        """Logs dispatched alert to a local CSV for later analysis (R3)."""
        log_file = PROJECT_ROOT / "data" / "logs" / "alert_journal.csv"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        headers = ["timestamp", "asset", "regime", "direction", "expiry", "entry_price", "payout", "confluence_score", "ai_confirmed", "ai_confidence", "ai_reason"]
        file_exists = log_file.exists()
        
        try:
            with open(log_file, 'a', newline='') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(headers)
                
                writer.writerow([
                    datetime.now().isoformat(),
                    context.asset,
                    context.condition.value,
                    context.direction,
                    context.suggested_expiry,
                    context.price,
                    context.payout,
                    context.technicals.get('confluence_score', 0),
                    ai_result.confirmed,
                    round(ai_result.confidence, 2),
                    ai_result.reason.replace('\n', ' ')
                ])
        except Exception as e:
            logger.error(f"Journal Logging Error: {e}")

    async def run_loop(self):
        logger.info(f"Starting OTC Dispatcher...")

        if self.test_mode:
            logger.warning("⚠️ RUNNING IN TEST MODE (Mock Data) ⚠️")
            if not self.assets:
                self.assets = ["EURUSD_OTC"] # Default for test
            await asyncio.gather(*(self.process_asset(a) for a in self.assets[:1]))
            logger.info("Test Mode Complete.")
            return

        # 0. Wait for Frontend Whitelist (30s timeout)
        logger.info("Standing by for Frontend Ticker selection...")
        try:
            await asyncio.wait_for(self.ticker_sub.first_whitelist_received.wait(), timeout=30)
            logger.info(f"Initial whitelist received: {self.ticker_sub.active_assets}")
        except asyncio.TimeoutError:
            logger.warning("No Ticker selection received after 30s. Entering standby mode.")

        # 1. Initial Discovery
        discovered = self.scan_available_assets()
        if discovered:
            # distinct union
            current_set = set(self.assets)
            for a in discovered:
                if a not in current_set:
                    self.assets.append(a)
            # logger.info(f"Assets merged with auto-discovery: {self.assets}")
        
        # Start Subscribers
        asyncio.create_task(self.ticker_sub.run())
        asyncio.create_task(self.settings_sub.run())
        
        if not self.assets:
            logger.warning("No assets found in history folder and none provided. Waiting for 'Collect History'...")

        if self.redis_mode:
            logger.info("Starting Redis Subscriber task...")
            # Ensure subscriber knows about all current assets
            if self.subscriber:
                self.subscriber.assets = [a.upper().replace("_", "") for a in self.assets]
            asyncio.create_task(self.subscriber.run())

        while True:
            try:
                # Loop Pulse
                logger.info(f"Scanner Heartbeat: {datetime.now().strftime('%H:%M:%S')} | Active Assets: {len(self.ticker_sub.active_assets)}")
                
                # 1. Hot-Swap: Scan for new assets every loop
                current_known = set(self.assets)
                freshly_found = self.scan_available_assets()
                new_ones = [a for a in freshly_found if a not in current_known]
                
                if new_ones:
                    logger.info(f"🔥 Hot-Swap: Detected new assets: {new_ones}")
                    self.assets.extend(new_ones)
                    # Update Redis Subscriber whitelist if active
                    if self.redis_mode and self.subscriber:
                        # Append new formatted assets
                        for na in new_ones:
                            fmt = na.upper().replace("_", "")
                            if fmt not in self.subscriber.assets:
                                self.subscriber.assets.append(fmt)

                if not self.assets and not self.ticker_sub.active_assets:
                    # Still waiting for assets
                    logger.debug("No assets to scan, standing by...")
                else:
                    # 2. Process ONLY Whitelisted Assets
                    if self.test_mode:
                        current_pool = self.assets if self.assets else ["EURUSD_OTC"]
                    else:
                        current_pool = [a for a in self.assets if a in self.ticker_sub.active_assets]
                    
                    if not current_pool and self.ticker_sub.active_assets:
                        # Maybe assets are normalized differently on disk?
                        # Log warning if we have a whitelist but no matches
                        logger.warning(f"Whitelist exists {list(self.ticker_sub.active_assets)} but no matching history files found on disk.")
                    
                    if current_pool:
                        logger.info(f"Core Loop: Scanning {len(current_pool)} selected assets: {current_pool}")
                        await asyncio.gather(*(self.process_asset(asset) for asset in current_pool))
                    else:
                        logger.info("No active selections found on disk. Standing by...")
            
            except Exception as e:
                logger.error(f"Loop Error: {e}")
            
            # Wait динамическая задержка based on settings
            if self.test_mode:
                logger.info("Test Mode: Single Scan Complete. Exiting Run Loop.")
                break
            await asyncio.sleep(self.scan_interval)

def main():
    parser = argparse.ArgumentParser(description="QuFLX OTC Alert Dispatcher")
    parser.add_argument("--assets", nargs="+", default=[], help="Assets to monitor (optional, defaults to auto-discovery)")
    parser.add_argument("--test-alert", action="store_true", help="Run a single mock alert for testing")
    parser.add_argument("--redis", action="store_true", help="Enable real-time tick logging via Redis subscription")
    
    args = parser.parse_args()
    
    # Windows Event Loop Policy
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    async def run_managed():
        dispatcher = OTCDispatcher(assets=args.assets, test_mode=args.test_alert)
        if args.redis:
            dispatcher.redis_mode = True
        
        try:
            await dispatcher.run_loop()
        finally:
            await dispatcher.close()

    try:
        asyncio.run(run_managed())
    except KeyboardInterrupt:
        logger.info("Dispatcher Stopped by User.")

if __name__ == "__main__":
    main()
