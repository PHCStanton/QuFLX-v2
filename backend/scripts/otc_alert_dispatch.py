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
from datetime import datetime
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
    TRENDING_UP = "Trending Up"
    TRENDING_DOWN = "Trending Down"
    RANGING = "Ranging/Choppy"
    BREAKOUT_POTENTIAL = "Breakout Potential (Squeeze)"
    EMA_CROSS_UP = "EMA Cross-Over (Bullish)"
    EMA_CROSS_DOWN = "EMA Cross-Over (Bearish)"
    NEUTRAL = "Neutral"

@dataclass
class AlertContext:
    asset: str
    condition: MarketCondition
    price: float
    time: str
    technicals: Dict[str, float]
    payout: int = 0

@dataclass
class AIAnalysisResult:
    confirmed: bool
    reason: str
    confidence: float
    raw_response: str = ""


# --- Components ---

class MarketScanner:
    """Analyzes raw market data to detect conditions."""
    
    def analyze(self, candles: List[Dict], candle_count: int = 100) -> Optional[Dict]:
        """
        Returns condition details if interesting, else None.
        Expects candles to have keys: 'close', 'high', 'low'.
        """
        if not candles or len(candles) < 30:
            return None

        try:
            import pandas as pd
            from ta.trend import ADXIndicator, EMAIndicator
            from ta.volatility import BollingerBands, AverageTrueRange
            from ta.momentum import RSIIndicator
            
            df = pd.DataFrame(candles)
            df['close'] = df['close'].astype(float)
            df['high'] = df['high'].astype(float)
            df['low'] = df['low'].astype(float)
            
            # Use requested candle count if available
            df = df.tail(candle_count)
        except ImportError:
            logger.error("Pandas/TA required for analysis. pip install pandas ta")
            return None

        # Calculate Indicators
        try:
            # 1. Trend & Momentum
            adx_ind = ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=14)
            df['adx'] = adx_ind.adx()
            
            rsi_ind = RSIIndicator(close=df['close'], window=14)
            df['rsi'] = rsi_ind.rsi()

            # 2. Volatility (Bollinger + ATR for Normalization)
            bb_ind = BollingerBands(close=df['close'], window=20, window_dev=2)
            df['bb_wband'] = bb_ind.bollinger_wband()
            df['bb_high'] = bb_ind.bollinger_hband()
            df['bb_low'] = bb_ind.bollinger_lband()
            
            atr_ind = AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=14)
            df['atr'] = atr_ind.average_true_range()

            # 3. EMA Cross (9/21)
            ema9 = EMAIndicator(close=df['close'], window=9).ema_indicator()
            ema21 = EMAIndicator(close=df['close'], window=21).ema_indicator()
            
            # 4. Support / Resistance (Fractal Pivots)
            window = 5
            df['pivot_h'] = df['high'].rolling(window=window, center=True).max()
            df['pivot_l'] = df['low'].rolling(window=window, center=True).min()
            
            current_resistance = df[df['high'] == df['pivot_h']]['high'].iloc[-1] if not df[df['high'] == df['pivot_h']].empty else None
            current_support = df[df['low'] == df['pivot_l']]['low'].iloc[-1] if not df[df['low'] == df['pivot_l']].empty else None

            current = df.iloc[-1]
            prev = df.iloc[-2]

            # Normalization: BB Width / (ATR / Price) -> High value means expanded relative to volatility
            # Standardized Threshold: If bb_width (as % of price) is very small relative to recent ATR
            price = float(current['close'])
            norm_bb_width = current['bb_wband']
            atr_val = current['atr']
            
            condition = MarketCondition.NEUTRAL
            confluence_count = 0
            
            # Logic
            adx_val = current['adx']
            rsi_val = current['rsi']
            
            # A. EMA Cross
            ema_cross = None
            if ema9.iloc[-1] > ema21.iloc[-1] and ema9.iloc[-2] <= ema21.iloc[-2]:
                ema_cross = "UP"
                confluence_count += 20
            elif ema9.iloc[-1] < ema21.iloc[-1] and ema9.iloc[-2] >= ema21.iloc[-2]:
                ema_cross = "DOWN"
                confluence_count += 20

            # B. BB Breakout / Squeeze
            is_breakout = False
            if adx_val > 25:
                if price > current['bb_high']:
                    condition = MarketCondition.TRENDING_UP
                    confluence_count += 30
                    is_breakout = True
                elif price < current['bb_low']:
                    condition = MarketCondition.TRENDING_DOWN
                    confluence_count += 30
                    is_breakout = True
            
            # C. Squeeze (Improved with Volatility context)
            # 0.05 is usually ~5% width. If ATR-based width is compressed:
            if current['bb_wband'] < 0.04:
                condition = MarketCondition.BREAKOUT_POTENTIAL
                confluence_count += 25

            # D. RSI Confluence
            if (condition == MarketCondition.TRENDING_UP and rsi_val > 60) or \
               (condition == MarketCondition.TRENDING_DOWN and rsi_val < 40):
                confluence_count += 15

            # E. S/R Proximity
            near_sr = None
            if current_resistance and abs(price - current_resistance) / price < 0.001:
                near_sr = "RESISTANCE"
                confluence_count += 10
            elif current_support and abs(price - current_support) / price < 0.001:
                near_sr = "SUPPORT"
                confluence_count += 10

            if condition == MarketCondition.NEUTRAL and not ema_cross:
                return None
            
            # Map EMA Cross to Condition if none set
            if condition == MarketCondition.NEUTRAL:
                condition = MarketCondition.EMA_CROSS_UP if ema_cross == "UP" else MarketCondition.EMA_CROSS_DOWN

            return {
                "condition": condition,
                "confidence": min(confluence_count, 100),
                "technicals": {
                    "adx": round(float(adx_val), 2),
                    "rsi": round(float(rsi_val), 2),
                    "bb_width": round(float(current['bb_wband']), 5),
                    "atr": round(float(atr_val), 6),
                    "ema_cross": ema_cross,
                    "near_sr": near_sr,
                    "price": price,
                    "support": float(current_support) if current_support else None,
                    "resistance": float(current_resistance) if current_resistance else None
                }
            }

        except Exception as e:
            logger.error(f"Error in TA calculation: {e}", exc_info=True)
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

        prompt = (
            f"Role: Elite Sniper Trader. Task: Verify this A+ trade setup.\n\n"
            f"Asset: {context.asset} | Timeframe: 1m | Payout: {context.payout}%\n"
            f"Detected Condition: {context.condition.value}\n\n"
            f"Technical Snapshot:\n"
            f"- ADX: {context.technicals['adx']} (Trend Strength)\n"
            f"- RSI: {context.technicals['rsi']} (Momentum)\n"
            f"- BB Width: {context.technicals['bb_width']} (Volatility Squeeze)\n"
            f"- EMA Cross: {context.technicals.get('ema_cross') or 'Stable'}\n"
            f"- Near S/R: {context.technicals.get('near_sr') or 'None'}\n"
            f"- Current Price: {context.technicals['price']}\n\n"
            f"Question: Is this a high-probability entry? Focus on confluence.\n"
            f"RESPOND IN RAW JSON ONLY:\n"
            f"{{\"confirmed\": bool, \"confidence\": float, \"reason\": \"string\"}}"
        )

        payload = {
            "prompt": prompt,
            "context": {
                "asset": context.asset,
                "timeframe": "1m",
                "indicators": context.technicals,
                "uiMode": "insights",
                "responseVerbosity": "concise"
            }
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
    
    async def send_alert(self, context: AlertContext, ai_result: AIAnalysisResult):
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

        color = 0x22c55e if ai_result.confirmed else 0xef4444 # Green/Red
        
        embed = {
            "title": f"🚨 A+ Setup: {context.asset}",
            "description": f"**Condition:** {context.condition.value}\n**Price:** {context.price}",
            "color": color,
            "fields": [
                {"name": "Technicals", "value": f"ADX: {context.technicals['adx']}\nRSI: {context.technicals['rsi']}", "inline": True},
                {"name": "AI Verdict", "value": f"{'✅ CONFIRMED' if ai_result.confirmed else '❌ REJECTED'}\n*{ai_result.reason}*", "inline": False}
            ],
            "footer": {"text": f"QuFLX OTC Sniper | Payout: {context.payout}%"}
        }

        payload = {"embeds": [embed]}

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
            logger.error(f"Redis Subscriber Error: {e}")
        finally:
            if self.redis_client:
                await self.redis_client.close()


class TickerSubscriber:
    """Listens for active ticker updates to whitelist dispatch assets."""
    def __init__(self, redis_url: str, logger_service=None):
        self.redis_url = redis_url
        self.active_assets = set()
        self.first_whitelist_received = asyncio.Event()
        
    async def run(self):
        if not redis: return
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
            logger.error(f"Ticker Sub Error: {e}")


# --- Main Service ---

class SettingsSubscriber:
    """Listens for settings updates to reconfigure the dispatcher in real-time."""
    def __init__(self, redis_url: str, orchestrator: AIOrchestrator, scanner: MarketScanner):
        self.redis_url = redis_url
        self.orchestrator = orchestrator
        self.scanner = scanner
        
    async def run(self):
        if not redis: return
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
                        
                        # Update Orchestrator
                        enable_ai = alerts_cfg.get("enableAIConfirm")
                        min_conf = alerts_cfg.get("minAIConfidence")
                        self.orchestrator.update_config(enable_confirm=enable_ai, min_confidence=min_conf)
                        
                        # Update Scanner (e.g. candle count)
                        candle_count = alerts_cfg.get("candleCount")
                        if candle_count:
                             # We'd need to update scanner.candle_count if it were stored
                             # For now, orchestrator is the primary dynamic target
                             pass
                             
                    except Exception as e:
                        logger.error(f"Settings Update Error: {e}")
        except Exception as e:
            logger.error(f"Settings Sub Error: {e}")

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
        self.settings_sub = SettingsSubscriber(self.redis_url, self.ai, self.scanner)

        # Assuming internal API for market data
        self.market_source_url = os.getenv("QFLX_MARKET_DATA_URL", "http://localhost:8000/api/v1/history")
        
        # Cooldown Tracker: {asset: timestamp}
        self.cooldowns: Dict[str, float] = {}
        self.COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "300"))
        
        # New Settings
        self.enable_ai_confirm = os.getenv("ENABLE_AI_CONFIRM", "true").lower() == "true"
        self.min_ai_confidence = float(os.getenv("ALERT_MIN_CONFIDENCE", "0.7"))
        self.candle_count = int(os.getenv("ALERT_CANDLE_COUNT", "100"))

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
             return [{"time": now + (i*60), "close": base + (i * 0.0002), "high": base + (i*0.00025), "low": base + (i*0.00018)} for i in range(self.candle_count)]

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
                    
                    # Take last N candles
                    candles = df.tail(self.candle_count).to_dict('records')
                    
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
                url = f"{self.market_source_url}/{asset}/1m?limit={self.candle_count}"
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

        result = self.scanner.analyze(data_points, candle_count=self.candle_count)
        if not result and not self.test_mode:
            return

        # Force a result in test mode if scanner returns None
        if self.test_mode and not result:
            result = {
                "condition": MarketCondition.TRENDING_UP,
                "technicals": {"adx": 45.0, "bb_width": 0.02, "rsi": 65.0, "price": 1.0600}
            }

        if result:
            ctx = AlertContext(
                asset=asset,
                condition=result['condition'],
                price=result['technicals']['price'],
                time=datetime.now().isoformat(),
                technicals=result['technicals'],
                payout=92 # Default OTC payout, could be fetched
            )
            
            logger.info(f"Condition Met: {asset} -> {ctx.condition.value}")
            
            # check cooldown
            now = datetime.now().timestamp()
            last_call = self.cooldowns.get(asset, 0)
            if now - last_call < self.COOLDOWN_SECONDS:
                logger.info(f"Skipping AI (Cooldown): {asset} (Wait {int(self.COOLDOWN_SECONDS - (now - last_call))}s)")
                return

            # AI Check
            try:
                if self.enable_ai_confirm:
                    ai_verdict = await self.ai.verify_setup(ctx)
                    # Filter by Confidence
                    if ai_verdict.confidence < self.min_ai_confidence:
                        logger.info(f"AI low confidence for {asset} ({ai_verdict.confidence:.2f} < {self.min_ai_confidence}). Skipping.")
                        return
                    # Only update cooldown on successful call (or rejection)
                    self.cooldowns[asset] = now
                else:
                    ai_verdict = AIAnalysisResult(True, "AI Confirmation Disabled (Force Pass)", 1.0)
            except Exception as e:
                logger.error(f"AI Check Failed for {asset}: {e}")
                return
            
            if self.test_mode:
                # Mock AI success
                ai_verdict = AIAnalysisResult(True, "TEST_MODE: Perfect setup confirmed.", 0.99)
            
            if ai_verdict.confirmed:
                await self.discord.send_alert(ctx, ai_verdict)
            else:
                logger.info(f"AI Rejected {asset}: {ai_verdict.reason}")

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
                    # Intersection of what's on disk and what's selected in frontend
                    current_pool = [a for a in self.assets if a in self.ticker_sub.active_assets]
                    
                    if not current_pool and self.ticker_sub.active_assets:
                        # Maybe assets are normalized differently on disk?
                        # Log warning if we have a whitelist but no matches
                        logger.warning(f"Whitelist exists {self.ticker_sub.active_assets} but none found on disk.")
                    
                    if current_pool:
                        logger.info(f"Core Loop: Scanning {len(current_pool)} selected assets: {current_pool}")
                        await asyncio.gather(*(self.process_asset(asset) for asset in current_pool))
                    else:
                        logger.info("No active selections found on disk. Standing by...")
            
            except Exception as e:
                logger.error(f"Loop Error: {e}")
            
            # Wait 60s (Live Candle Close)
            await asyncio.sleep(60)

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
