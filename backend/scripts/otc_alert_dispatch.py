import asyncio
import aiohttp
import logging
import os
import sys
import json
import argparse
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
    
    def analyze(self, candles: List[Dict]) -> Optional[Dict]:
        """
        Returns condition details if interesting, else None.
        Expects candles to have keys: 'close', 'high', 'low'.
        """
        if not candles or len(candles) < 30:
            return None

        # Convert to Pandas Series/List for TA-Lib
        # Note: 'ta' library works with pandas Series usually.
        # We'll assume simple list usage or convert if needed.
        # For performance/simplicity without pandas overhead in this script, 
        # let's assume valid list inputs compatible with 'ta' wrapper or manual calc.
        # Actually 'ta' requires pandas Series. ensuring pandas is available.
        try:
            import pandas as pd
            df = pd.DataFrame(candles)
            df['close'] = df['close'].astype(float)
            df['high'] = df['high'].astype(float)
            df['low'] = df['low'].astype(float)
        except ImportError:
            logger.error("Pandas is required for TA analysis. pip install pandas")
            return None

        # Calculate Indicators
        try:
            # ADX (Trend Strength)
            adx_ind = ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=14)
            df['adx'] = adx_ind.adx()
            
            # Bollinger Bands (Volatility)
            bb_ind = BollingerBands(close=df['close'], window=20, window_dev=2)
            df['bb_wband'] = bb_ind.bollinger_wband()
            df['bb_high'] = bb_ind.bollinger_hband()
            df['bb_low'] = bb_ind.bollinger_lband()
            
            # RSI (Momentum)
            rsi_ind = RSIIndicator(close=df['close'], window=14)
            df['rsi'] = rsi_ind.rsi()

            current = df.iloc[-1]
            prev = df.iloc[-2]

            condition = MarketCondition.NEUTRAL
            
            # Logic
            adx_val = current['adx']
            bb_width = current['bb_wband']
            rsi_val = current['rsi']
            close = current['close']
            
            # 1. Trending
            if adx_val > 25:
                if close > current['bb_high']: # Simple breakout/trend check
                    condition = MarketCondition.TRENDING_UP
                elif close < current['bb_low']:
                    condition = MarketCondition.TRENDING_DOWN
                # Refined Trend Check using EMA alignment could go here
            
            # 2. Breakout Squeeze
            elif bb_width < 0.05: # Threshold depends on asset scaling, usually requires normalization
                 # Standardized width: (High-Low)/SMA
                 condition = MarketCondition.BREAKOUT_POTENTIAL
            
            # 3. Ranging
            elif adx_val < 20:
                condition = MarketCondition.RANGING

            if condition == MarketCondition.NEUTRAL:
                return None

            return {
                "condition": condition,
                "technicals": {
                    "adx": round(float(adx_val), 2),
                    "bb_width": round(float(bb_width), 5),
                    "rsi": round(float(rsi_val), 2),
                    "price": float(close)
                }
            }

        except Exception as e:
            logger.error(f"Error in TA calculation: {e}")
            return None


class AIOrchestrator:
    """Handles communication with the AI Service."""
    
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url
        self.api_key = api_key
        # Fallback/Mock URL handling if needed, but assuming direct connection to Backend Service

    async def verify_setup(self, context: AlertContext) -> AIAnalysisResult:
        """Sends context to AI and awaits verdict."""
        if not self.api_url:
            logger.warning("AI URL not configured, skipping AI verification.")
            return AIAnalysisResult(False, "AI_URL_MISSING", 0.0)

        prompt = (
            f"Role: Sniper Trader. Task: Verify this setup.\n"
            f"Asset: {context.asset}\n"
            f"Condition: {context.condition.value}\n"
            f"Technicals: ADX={context.technicals['adx']}, RSI={context.technicals['rsi']}\n"
            f"Question: Is this a high-probability A+ entry? Reply JSON: {{'confirmed': bool, 'reason': str}}"
        )

        payload = {
            "prompt": prompt,
            "model": "flash", # or explicit model
            "temperature": 0.1
        }

        try:
            async with aiohttp.ClientSession() as session:
                # Assuming typical QuFLX AI Ops endpoint structure
                async with session.post(
                    self.api_url, 
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=10
                ) as response:
                    if response.status != 200:
                        logger.error(f"AI API returned {response.status}")
                        return AIAnalysisResult(False, "AI_API_ERROR", 0.0)
                    
                    data = await response.json()
                    # Parse AI response (adjust based on actual API format)
                    # Assuming data['content'] or similar holds the text
                    text = data.get('content', '') or data.get('response', '')
                    
                    # Simple Parsing Strategy if JSON is embedded in markdown
                    # For now, assume simple string check if JSON parsing fails
                    confirmed = "true" in text.lower() or "confirmed" in text.lower()
                    return AIAnalysisResult(confirmed, text[:100], 0.8) # truncated reason

        except Exception as e:
            logger.error(f"AI Connection Failed: {e}")
            return AIAnalysisResult(False, f"CONNECTION_ERROR: {str(e)}", 0.0)


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
            async with aiohttp.ClientSession() as session:
                async with session.post(self.webhook_url, json=payload) as resp:
                    if resp.status in [200, 204]:
                        logger.info(f"Alert sent for {context.asset}")
                        self.last_sent[context.asset] = now
                    else:
                        logger.error(f"Discord Failed: {resp.status}")
        except Exception as e:
            logger.error(f"Discord Dispatch Error: {e}")


# --- Tick Logger ---

class TickLogger:
    """Buffers ticks and saves to CSV in chunks of 1000."""
    
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.buffers = {} # {asset: [ticks]}
        self.CHUNK_SIZE = 1000
    
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

        # Filename: asset_timestamp.csv
        ts_start = int(chunk[0].get('time', datetime.now().timestamp()))
        ts_end = int(chunk[-1].get('time', datetime.now().timestamp()))
        
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
        self.assets = [a.upper().replace("_", "") for a in assets]
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
                        asset = data.get('asset', '').upper().replace("_", "")
                        if not self.assets or asset in self.assets:
                            await self.logger_service.log_tick(asset, data)
                    except Exception as e:
                        logger.error(f"Error processing Redis tick: {e}")
        except Exception as e:
            logger.error(f"Redis Subscriber Error: {e}")
        finally:
            if self.redis_client:
                await self.redis_client.close()


# --- Main Service ---

class OTCDispatcher:
    def __init__(self, assets: List[str], test_mode: bool = False):
        self.assets = assets
        self.test_mode = test_mode
        self.scanner = MarketScanner()
        # Load from env
        self.ai = AIOrchestrator(
            api_url=os.getenv("QFLX_AI_ENDPOINT", "http://localhost:8000/api/v1/ai/generate"),
            api_key=os.getenv("QFLX_API_KEY", "")
        )
        self.discord = DiscordDispatcher(
            webhook_url=os.getenv("DISCORD_WEBHOOK_URL", "")
        )
        
        # Tick/Data Logger
        self.logger_service = TickLogger(data_dir=PROJECT_ROOT / "data" / "ticks")

        # Redis Subscriber (Optional)
        self.redis_mode = False
        self.subscriber = RedisSubscriber(REDIS_URL, self.logger_service, self.assets)

        # Assuming internal API for market data
        self.market_source_url = os.getenv("QFLX_MARKET_DATA_URL", "http://localhost:8000/api/v1/history")

    async def fetch_data(self, asset: str) -> List[Dict]:
        """Fetches last 50 candles for asset."""
        if self.test_mode:
             # Mock Data
             logger.info(f"Test Mode: Generating mock data for {asset}")
             # Return a pattern that triggers a BUY
             import random
             base = 1.0500
             now = datetime.now().timestamp()
             # Include time for logging
             return [{"time": now + (i*60), "close": base + (i * 0.0002), "high": base + (i*0.00025), "low": base + (i*0.00018)} for i in range(50)]

        # Real Data
        try:
            async with aiohttp.ClientSession() as session:
                # Adjust timeframe/params as per QuFLX API
                # Fetching 1m candles for scanning. 
                # Note: User asked for TICKS logging. 
                # If we are only fetching CANDLES here, we can only log CANDLES.
                # To log TICKS, we would need a WebSocket or a separate Tick API call.
                # For this implementation, we will log the fetched data (Candles) 
                # treating them as the "data unit" for now, or assume this fetch function 
                # might be swapped for a Tick fetcher later.
                url = f"{self.market_source_url}/{asset}/1m?limit=50"
                async with session.get(url, timeout=5) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get('candles', []) or data.get('data', [])
                    
                    if resp.status == 404:
                        logger.warning(f"Data not found for {asset} (404). Hint: Run 'Collect History' in Dashboard first.")
                    else:
                        logger.warning(f"Failed to fetch {asset}: {resp.status}")
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

        result = self.scanner.analyze(data_points)
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
            
            # AI Check
            ai_verdict = await self.ai.verify_setup(ctx)
            
            if self.test_mode:
                # Mock AI success
                ai_verdict = AIAnalysisResult(True, "TEST_MODE: Perfect setup confirmed.", 0.99)
            
            if ai_verdict.confirmed:
                await self.discord.send_alert(ctx, ai_verdict)
            else:
                logger.info(f"AI Rejected {asset}: {ai_verdict.reason}")

    async def run_loop(self):
        logger.info(f"Starting OTC Dispatcher. Monitoring: {self.assets}")
        if self.test_mode:
            logger.warning("⚠️ RUNNING IN TEST MODE (Mock Data) ⚠️")
            # Run once and exit
            await asyncio.gather(*(self.process_asset(a) for a in self.assets[:1])) # Test 1 asset
            logger.info("Test Mode Complete.")
            return

        if self.redis_mode:
            logger.info("Starting Redis Subscriber task...")
            asyncio.create_task(self.subscriber.run())

        while True:
            try:
                # Concurrent Checks
                await asyncio.gather(*(self.process_asset(asset) for asset in self.assets))
            except Exception as e:
                logger.error(f"Loop Error: {e}")
            
            # Wait 60s (Live Candle Close)
            await asyncio.sleep(60)

def main():
    parser = argparse.ArgumentParser(description="QuFLX OTC Alert Dispatcher")
    parser.add_argument("--assets", nargs="+", default=["EURUSD_OTC", "GBPUSD_OTC", "USDJPY_OTC"], help="Assets to monitor")
    parser.add_argument("--test-alert", action="store_true", help="Run a single mock alert for testing")
    parser.add_argument("--redis", action="store_true", help="Enable real-time tick logging via Redis subscription")
    
    args = parser.parse_args()
    
    # Windows Event Loop Policy
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    dispatcher = OTCDispatcher(assets=args.assets, test_mode=args.test_alert)
    if args.redis:
        dispatcher.redis_mode = True
    
    try:
        asyncio.run(dispatcher.run_loop())
    except KeyboardInterrupt:
        logger.info("Dispatcher Stopped by User.")

if __name__ == "__main__":
    main()
