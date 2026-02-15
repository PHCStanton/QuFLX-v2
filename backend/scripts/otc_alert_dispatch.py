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


from backend.services.strategy.regime_detector import MarketCondition

# --- Data Structures ---

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



# --- Regime-Specific AI Prompt Templates ---
# Each regime has specific confluence criteria that the AI should evaluate

REGIME_PROMPTS = {
    MarketCondition.STRONG_MOMENTUM_UP.value: """
### Regime: Strong Momentum Trending (Bullish)
**Required Confluences:**
- ADX > 35 and rising
- +DI > -DI (directional confirmation)
- MACD histogram expanding (momentum acceleration)
- Large bullish candle body (Body Ratio > 0.7)
- ATR rising (volatility expansion)

**Volume Proxy:** ATR expansion + Large candle bodies
**Risk:** Chasing momentum — needs all 3+ signals
""",
    MarketCondition.STRONG_MOMENTUM_DOWN.value: """
### Regime: Strong Momentum Trending (Bearish)
**Required Confluences:**
- ADX > 35 and rising
- -DI > +DI (directional confirmation)
- MACD histogram contracting (momentum acceleration down)
- Large bearish candle body (Body Ratio > 0.7)
- ATR rising (volatility expansion)

**Volume Proxy:** ATR expansion + Large candle bodies
**Risk:** Chasing momentum — needs all 3+ signals
""",
    MarketCondition.PULLBACK_BUY.value: """
### Regime: Trending Pullback (Buy Dip)
**Required Confluences:**
- Price > EMA-89 (macro uptrend bias)
- Price near EMA-16 (pullback to short-term trend)
- RSI 40-55 (not oversold, just cooling off)
- Price near BB lower band
- ATR stable or rising

**Volume Proxy:** ATR normalization for pullback distance
**Risk:** False pullback in ranging market — confirm macro trend with EMA-89
""",
    MarketCondition.PULLBACK_SELL.value: """
### Regime: Trending Pullback (Sell Rally)
**Required Confluences:**
- Price < EMA-89 (macro downtrend bias)
- Price near EMA-16 (pullback to short-term trend)
- RSI 45-60 (not overbought, just bouncing)
- Price near BB upper band
- ATR stable or rising

**Volume Proxy:** ATR normalization for pullback distance
**Risk:** False pullback in ranging market — confirm macro trend with EMA-89
""",
    MarketCondition.RANGING_OVERBOUGHT.value: """
### Regime: Ranging / Sideways (Overbought Sell)
**Required Confluences:**
- ADX < 20 (weak trend, ranging market)
- RSI > 75 (OTC-tuned overbought threshold)
- Stoch K > 80 and crossing below D
- Price at/above BB upper band
- Small candle bodies (indecision)

**Volume Proxy:** Low ATR, small body ratio
**Risk:** Breakout can invalidate — watch for ADX spike
""",
    MarketCondition.RANGING_OVERSOLD.value: """
### Regime: Ranging / Sideways (Oversold Buy)
**Required Confluences:**
- ADX < 20 (weak trend, ranging market)
- RSI < 35 (OTC-tuned oversold threshold)
- Stoch K < 20 and crossing above D
- Price at/below BB lower band
- Small candle bodies (indecision)

**Volume Proxy:** Low ATR, small body ratio
**Risk:** Breakout can invalidate — watch for ADX spike
""",
    MarketCondition.BREAKOUT_UP.value: """
### Regime: Breakout (Bullish)
**Required Confluences:**
- BB width < 0.04 (squeeze condition)
- Price breaks above BB upper band
- ADX > 25 and rising (trend emerging)
- ATR spike (volatility expansion)
- Large bullish candle body

**Volume Proxy:** ATR spike + Large body
**Risk:** False breakout — needs ADX confirmation
""",
    MarketCondition.BREAKOUT_DOWN.value: """
### Regime: Breakout (Bearish)
**Required Confluences:**
- BB width < 0.04 (squeeze condition)
- Price breaks below BB lower band
- ADX > 25 and rising (trend emerging)
- ATR spike (volatility expansion)
- Large bearish candle body

**Volume Proxy:** ATR spike + Large body
**Risk:** False breakout — needs ADX confirmation
""",
    MarketCondition.REVERSAL_BULLISH.value: """
### Regime: Trend Reversal (Bullish)
**Required Confluences:**
- RSI < 30 (extreme oversold)
- MACD histogram turning positive
- Price near support level
- Divergence signals (if available)

**Volume Proxy:** ATR spike at reversal point
**Risk:** HIGH — catching falling knife, needs S/R confirmation
""",
    MarketCondition.REVERSAL_BEARISH.value: """
### Regime: Trend Reversal (Bearish)
**Required Confluences:**
- RSI > 70 (extreme overbought)
- MACD histogram turning negative
- Price near resistance level
- Divergence signals (if available)

**Volume Proxy:** ATR spike at reversal point
**Risk:** HIGH — catching falling knife, needs S/R confirmation
"""
}


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
        
        # Get regime-specific prompt template
        regime_criteria = REGIME_PROMPTS.get(regime_label, "")
        
        if not regime_criteria:
            logger.warning(f"No prompt template found for regime: {regime_label}, using generic")
            regime_criteria = """
### Regime: Unknown
**Required Confluences:** Check ADX, RSI, MACD, and trend alignment.
**Volume Proxy:** ATR expansion + Large candle bodies.
"""
        
        prompt = f"""
        Analyze this {regime_label} setup for {context.asset} (OTC Binary Options, 1-minute timeframe).
        
        {regime_criteria}
        
        ### Current Market Data:
        - Price: {context.price}
        - Core Indicators: ADX={tech.get('adx', '---')}, RSI={tech.get('rsi', '---')}, BB_Width={tech.get('bb_width', '---')}
        - Trend: EMA16={tech.get('ema16', '---')}, EMA89={tech.get('ema89', '---')}, Supertrend={tech.get('supertrend', '---')}
        - Momentum: MACD_Hist={tech.get('macd_hist', '---')}, Stoch_K={tech.get('stoch_k', '---')}
        - Volume Proxy: Body_Ratio={tech.get('body_ratio', '---')}, Large_Body={tech.get('large_body', '---')}, ATR={tech.get('atr', '---')}
        - S/R Proximity: {tech.get('near_sr', '---')}
        - Confluence Score: {tech.get('confluence_score', '---')}
        
        ### Task:
        Evaluate if this is an "A+" setup based on the regime-specific confluences above.
        - **A+ Setup:** ≥3 strong confluences aligned, volume proxy confirms, no conflicting signals.
        - **Reject:** Missing key confluences, flat momentum, or price trapped in noise.
        
        Return JSON ONLY:
        {{
            "confirmed": boolean,
            "reason": "short explanation referring to specific indicators from the regime criteria",
            "confidence": float (0.0 to 1.0)
        }}
        """
        
        payload = {
            "prompt": prompt,
            "context": {
                "asset": context.asset,
                "regime": regime_label,
                "direction": direction,
                "uiMode": "alert_verification",
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
        self._session = None  # Initialize to None for clarity
    
    async def send_alert(self, context: AlertContext, ai_verdict: AIAnalysisResult) -> bool:
        if not self.webhook_url:
            logger.warning("Discord Webhook missing.")
            return False

        # Rate Limit Check - REMOVED (dispatcher-level cooldown is the single source of truth)
        # The OTCDispatcher.COOLDOWN_SECONDS handles rate limiting at line 900-904

        # Shared Session
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))

        direction_emoji = "📈" if context.direction == "CALL" else "📉"
        
        # Regime metadata (if available from tech)
        regime_label = context.condition.value
        
        # Indicator strings for embed
        tech = context.technicals
        indicator_text = (
            f"**ADX:** {tech.get('adx', '---')} | **RSI:** {tech.get('rsi', '---')}\n"
            f"**MACD Hist:** {tech.get('macd_hist', '---')} | **BB Width:** {tech.get('bb_width', '---')}\n"
            f"**EMA-16/89:** {tech.get('ema16', '---')} / {tech.get('ema89', '---')}\n"
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
                    logger.info(f"✅ Discord alert delivered: {context.asset}")
                    return True
                else:
                    logger.error(f"❌ Discord delivery failed: {context.asset} (HTTP {resp.status})")
                    return False
        except Exception as e:
            logger.error(f"❌ Discord dispatch exception for {context.asset}: {e}")
            return False

    async def close(self):
        if self._session and not self._session.closed:
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
            finally:
                if 'client' in locals():
                    await client.close()


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
                await pubsub.subscribe("settings:updated", "system:commands")
                logger.info("Subscribed to 'settings:updated' and 'system:commands' - Ready for real-time config changes and reset signals.")
                
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        try:
                            data = json.loads(message['data'])
                            
                            # Handle System Commands (Phase 4 #15)
                            if message['channel'] == "system:commands":
                                if data.get("command") == "reset_scanner":
                                    logger.info("📡 Received reset_scanner command via Redis.")
                                    await self.dispatcher.reset_scanner()
                                continue

                            # Handle Settings Updates
                            alerts_cfg = data.get("alerts", {})
                            
                            # 1. Update AI Settings (directly on dispatcher)
                            enable_ai = alerts_cfg.get("enableAIConfirm")
                            if enable_ai is not None:
                                self.dispatcher.enable_ai_confirm = enable_ai
                                logger.info(f"SettingsSync: enable_ai_confirm → {enable_ai}")
                            
                            min_conf = alerts_cfg.get("minAIConfidence")
                            if min_conf is not None:
                                self.dispatcher.min_ai_confidence = float(min_conf)
                                logger.info(f"SettingsSync: min_ai_confidence → {min_conf}")
                            
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
            finally:
                if 'client' in locals():
                    await client.close()

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
        self.redis_mode = False
        self.enable_tick_logging = os.getenv("ENABLE_TICK_LOGGING", "false").lower() == "true"
        
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
        self._redis_client = None  # Persistent Redis client for alert publishing
        self._scan_counter = 0  # Throttle filesystem scans (every 5th cycle)
        self._asset_tasks: Dict[str, asyncio.Task] = {}  # Per-asset worker tasks (Phase 4 #14)
        self.asset_folder_map: Dict[str, str] = {}  # normalized_name -> raw_folder_name


    async def _get_redis_client(self):
        """Get or create persistent Redis client for alert publishing."""
        if self._redis_client is None:
            self._redis_client = redis.from_url(self.redis_url, decode_responses=True)
        return self._redis_client

    async def reset_scanner(self):
        """Clears all active monitoring tasks and assets (Phase 4 #15)."""
        logger.info("♻️ Resetting Scanner Monitoring Pool...")
        
        # 1. Cancel all worker tasks
        for asset, task in self._asset_tasks.items():
            if not task.done():
                task.cancel()
                logger.info(f"Stop: Cancelled worker for {asset}")
        self._asset_tasks.clear()
        
        # 2. Reset internal lists & Whitelist
        self.ticker_sub.active_assets = set()
        
        # 3. Reset Redis subscriber whitelist
        if self.enable_tick_logging and self.subscriber:
            self.subscriber.assets = []
            
        # 4. Immediate Discovery Re-Sync (Fix: Blind spot on reset)
        self.assets = self.scan_available_assets()
        self._scan_counter = 0 
        
        logger.info(f"✅ Scanner reset complete. Discovered {len(self.assets)} assets on disk. Waiting for whitelist...")

    async def _asset_worker(self, asset: str):
        """Independently loops for a single asset (Phase 4 #14)."""
        # asset is NORMALIZED here. folder name is retrieved via map
        folder_name = self.asset_folder_map.get(asset, asset)
        logger.info(f"🚀 Started independent worker for {asset} (Folder: {folder_name})")
        
        # Phase 4 #16: Immediate scan on discovery
        try:
            await self.process_asset(asset)
        except Exception as e:
            logger.error(f"Initial scan error for {asset}: {e}")

        while True:
            try:
                await asyncio.sleep(self.scan_interval)
                await self.process_asset(asset)
            except asyncio.CancelledError:
                logger.info(f"Worker for {asset} was cancelled.")
                break
            except Exception as e:
                logger.error(f"Worker Loop Error for {asset}: {e}")
                await asyncio.sleep(5)  # Backoff on persistent errors

    async def close(self):
        """Gracefully shutdown all components."""
        logger.info("Closing OTC Dispatcher components...")
        await self.ai.close()
        await self.discord.close()
        if self._redis_client:
            await self._redis_client.close()
            logger.info("Persistent Redis client closed")


    def scan_available_assets(self) -> List[str]:
        """Scans local history directory for assets, populating normalized mapping."""
        history_dir = PROJECT_ROOT / "data" / "data_output" / "history"
        if not history_dir.exists():
            return []
        
        found_normalized = []
        try:
            # Clear old mapping
            self.asset_folder_map.clear()
            
            for item in history_dir.iterdir():
                if item.is_dir():
                    raw_name = item.name
                    norm_name = normalize_asset(raw_name)
                    
                    # Preference: Exact match folder name wins over underscored version if both exist
                    if norm_name in self.asset_folder_map:
                        if raw_name != norm_name:
                             continue # Keep the exact match one

                    # Check if any .csv exists and ignore LEGACY
                    csvs = [f for f in item.glob("*.csv") if "LEGACY" not in f.name]
                    if csvs:
                        if norm_name not in found_normalized:
                            found_normalized.append(norm_name)
                        self.asset_folder_map[norm_name] = raw_name
                        
        except Exception as e:
            logger.error(f"Asset Scan Error: {e}")
            
        return found_normalized

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
            # Use raw folder name from map if possible
            folder_name = self.asset_folder_map.get(asset, asset)
            csv_path = get_recent_history_file(folder_name, 1)
            
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
        """Pipeline for a single asset (normalized name)."""
        data_points = await self.fetch_data(asset)
        
        # Log Data (Buffered)
        if data_points:
            # Use raw folder name for logging to preserve consistency
            folder_name = self.asset_folder_map.get(asset, asset)
            await self.logger_service.log_ticks(folder_name, data_points)

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
                    "ema89": 1.0500,
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
            discord_ok = await self.discord.send_alert(ctx, ai_verdict)
            
            if not discord_ok:
                logger.warning(f"⚠️ Discord delivery FAILED for {asset} — alert not journaled or published")
                return
            
            logger.info(f"✅ Alert dispatched to Discord: {asset}")
            
            # 2. Publish to Redis for In-App Feed (R5)
            if redis:
                try:
                    client = await self._get_redis_client()
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
                except Exception as e:
                    logger.error(f"❌ Redis alert publish error for {asset}: {e}")

            # 3. Log to Journal (R3) - Only if Discord delivery succeeded
            await self.log_alert(ctx, ai_verdict)
        else:
            logger.info(f"AI Rejected {asset}: {ai_verdict.reason}")

    def _write_alert_csv(self, log_file: Path, file_exists: bool, context: AlertContext, ai_result: AIAnalysisResult):
        """Sync helper to write alert to CSV (called via asyncio.to_thread)."""
        headers = ["timestamp", "asset", "regime", "direction", "expiry", "entry_price", "payout", "confluence_score", "ai_confirmed", "ai_confidence", "ai_reason"]
        
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

    async def log_alert(self, context: AlertContext, ai_result: AIAnalysisResult):
        """Logs dispatched alert to a local CSV for later analysis (R3)."""
        log_file = PROJECT_ROOT / "data" / "logs" / "alert_journal.csv"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        file_exists = log_file.exists()
        
        try:
            await asyncio.to_thread(self._write_alert_csv, log_file, file_exists, context, ai_result)
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

        if self.enable_tick_logging and redis:
            logger.info("Starting Redis Subscriber task...")
            if self.subscriber:
                self.subscriber.assets = [a.upper().replace("_", "") for a in self.assets]
            asyncio.create_task(self.subscriber.run())
        elif self.enable_tick_logging and not redis:
            logger.error("Tick logging enabled but redis library is unavailable.")

        while True:
            try:
                # 1. Reactive Discovery: If requested assets aren't known, scan disk immediately
                # This fixes the lag when a new history is created/loaded
                active_requested = self.ticker_sub.active_assets
                missing_on_disk = [a for a in active_requested if a not in self.assets]
                
                if missing_on_disk:
                    logger.info(f"🔎 Reactive Discovery: Searching disk for missing assets: {missing_on_disk}")
                    self.assets = self.scan_available_assets()
                    self._scan_counter = 0 # Reset throttle since we just scanned

                # 2. Hot-Swap: Periodic discovery scan (throttled)
                self._scan_counter += 1
                if self._scan_counter >= 5:
                    self._scan_counter = 0
                    current_known = set(self.assets)
                    freshly_found = self.scan_available_assets()
                    new_ones = [a for a in freshly_found if a not in current_known]
                    
                    if new_ones:
                        logger.info(f"🔥 Hot-Swap: Detected new assets: {new_ones}")
                        self.assets.extend(new_ones)
                        # Sync logic for subscriber...
                        if self.redis_mode and self.subscriber:
                            for na in new_ones:
                                fmt = na.upper().replace("_", "")
                                if fmt not in self.subscriber.assets:
                                    self.subscriber.assets.append(fmt)

                # 3. Reconcile Workers with Whitelist (Phase 4 #14)
                desired_assets = [a for a in self.assets if a in self.ticker_sub.active_assets]
                desired_set = set(desired_assets)
                current_running_set = set(self._asset_tasks.keys())

                # A. Start New Workers
                for asset in desired_set:
                    if asset not in current_running_set or self._asset_tasks[asset].done():
                        self._asset_tasks[asset] = asyncio.create_task(self._asset_worker(asset))
                        # Update subscriber if missing
                        if self.redis_mode and self.subscriber:
                            fmt = asset.upper().replace("_", "")
                            if fmt not in self.subscriber.assets:
                                self.subscriber.assets.append(fmt)

                # B. Stop Obsolete Workers
                for asset in current_running_set:
                    if asset not in desired_set:
                        logger.info(f"🛑 Stopping worker for {asset} (Removed from whitelist)")
                        self._asset_tasks[asset].cancel()
                        del self._asset_tasks[asset]

                # 3. Management Pulse & Heartbeat
                active_workers = [a for a, t in self._asset_tasks.items() if not t.done()]
                
                # Standby Logging (Throttled)
                if not active_workers:
                    if self._scan_counter == 0:
                        logger.info("Standing by... (Waiting for Frontend selection)")
                else:
                    logger.info(f"Scanner Pulse | Active Workers: {len(active_workers)} | Whitelist: {len(self.ticker_sub.active_assets)}")
                
                # 4. Continuous Heartbeat (Phase 4 Pulse Fix)
                if self.redis_mode and redis:
                    try:
                        client = await self._get_redis_client()
                        heartbeat = {
                            "type": "scan:confirmed",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "assets_scanned": active_workers,
                            "scan_interval": self.scan_interval,
                            "scan_duration_ms": 100 if active_workers else 0 # Placeholder for UI visibility
                        }
                        await client.publish("scan:heartbeat", json.dumps(heartbeat))
                    except Exception as e:
                        logger.error(f"Heartbeat error: {e}")

            except Exception as e:
                logger.error(f"Management Loop Error: {e}")
            
            # Management loop runs every 10s (workers have their own timers)
            await asyncio.sleep(10)

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
        dispatcher.redis_mode = redis is not None
        if args.redis:
            dispatcher.enable_tick_logging = True
        
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
