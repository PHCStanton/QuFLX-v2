"""
Discord Test Alert Script
Sends a test signal to the configured Discord webhook
"""
import asyncio
import aiohttp
import json
import os
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
project_root = Path(__file__).resolve().parents[2]
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

# Try to load Discord webhook from .env first
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

# Fallback: load from user settings
if not DISCORD_WEBHOOK_URL:
    settings_path = project_root / "data" / "settings.json"
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text())
            DISCORD_WEBHOOK_URL = settings.get("alerts", {}).get("discordWebhookUrl", "")
        except Exception as e:
            print(f"⚠️ Failed to load webhook from settings: {e}")

if not DISCORD_WEBHOOK_URL:
    print("❌ ERROR: No Discord webhook URL found in .env or settings.json")
    print("   Set DISCORD_WEBHOOK_URL in .env or configure in Settings → ALERTS & NOTIFICATIONS")
    exit(1)


async def send_test_alert():
    """Send a test alert to Discord"""
    
    # Create test alert payload
    embed = {
        "title": "🧪 Test Alert - QuFLX v2 System Check",
        "description": "This is a test signal to verify Discord integration is working correctly.",
        "color": 3447003,  # Blue color
        "fields": [
            {
                "name": "📊 Asset",
                "value": "EURUSD_OTC",
                "inline": True
            },
            {
                "name": "📈 Direction",
                "value": "CALL",
                "inline": True
            },
            {
                "name": "⏱️ Expiry",
                "value": "3m",
                "inline": True
            },
            {
                "name": "🎯 Regime",
                "value": "Strong Momentum Trending (Bullish)",
                "inline": False
            },
            {
                "name": "💯 Confluence Score",
                "value": "75/100 (Weighted)",
                "inline": True
            },
            {
                "name": "💰 Payout",
                "value": "92%",
                "inline": True
            },
            {
                "name": "📍 Price",
                "value": "1.04523",
                "inline": True
            },
            {
                "name": "📊 Key Indicators",
                "value": "• ADX: 38.5 ✅\n• +DI > -DI: ✅\n• MACD Hist: Rising ✅\n• Large Body: ✅\n• ATR: Expanding ✅",
                "inline": False
            },
            {
                "name": "🤖 AI Confirmation",
                "value": "**Status:** Test Mode\n**Reason:** This is a system test, not a real trading signal",
                "inline": False
            }
        ],
        "footer": {
            "text": "QuFLX v2 Alert Dispatch | Test Signal"
        },
        "timestamp": datetime.utcnow().isoformat()
    }
    
    payload = {
        "username": "QuFLX Alert Bot",
        "avatar_url": "https://i.imgur.com/4M34hi2.png",
        "embeds": [embed]
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(DISCORD_WEBHOOK_URL, json=payload) as response:
                if response.status == 204:
                    print("✅ Test alert sent successfully to Discord!")
                    print(f"📊 Regime: Strong Momentum Trending (Bullish)")
                    print(f"💯 Confluence Score: 75/100 (Weighted)")
                    print(f"📈 Direction: CALL | Expiry: 3m")
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Failed to send alert. Status: {response.status}")
                    print(f"Error: {error_text}")
                    return False
    except Exception as e:
        print(f"❌ Error sending Discord alert: {e}")
        return False


if __name__ == "__main__":
    print("🚀 Sending test alert to Discord...")
    print(f"🔗 Webhook configured: {DISCORD_WEBHOOK_URL[:50]}...")
    print()
    
    asyncio.run(send_test_alert())
