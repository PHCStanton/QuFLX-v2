import os
import logging
import requests
import ta  # pip install ta-lib (for indicators)
from datetime import datetime
from dotenv import load_dotenv  # pip install python-dotenv for config

load_dotenv()  # Load .env file for API keys

# Setup logging
logging.basicConfig(filename='alert_log.txt', level=logging.INFO, format='%(asctime)s - %(message)s')

# Config (replace with your actual endpoints)
QUFLX_API_URL = os.getenv('QUFLX_API_URL')  # e.g., 'https://your-quflx-api/data'
AI_CONFIRM_URL = os.getenv('AI_CONFIRM_URL')  # e.g., 'https://your-quflx-ai/confirm'
DISCORD_WEBHOOK = os.getenv('DISCORD_WEBHOOK')  # e.g., 'https://discord.com/api/webhooks/...'
ASSETS = ['EURUSD OTC', 'GBPUSD OTC', 'USDJPY OTC', 'AUDUSD OTC', 'USDCAD OTC']  # Your 5 assets from top-down

def fetch_market_data(asset, timeframe='1m', periods=20):
    """Fetch recent candles/ticks for an asset from QuFLX API."""
    try:
        response = requests.get(f"{QUFLX_API_URL}/{asset}/{timeframe}?periods={periods}")
        response.raise_for_status()
        data = response.json()  # Assume returns {'candles': [{'open':, 'high':, 'low':, 'close':, 'volume':}], 'ticks': [...], 'payout': 92}
        logging.info(f"Fetched data for {asset} on {timeframe}")
        return data
    except Exception as e:
        logging.error(f"Data fetch error for {asset}: {e}")
        return None

def identify_conditions(data):
    """Check market conditions using indicators (trending, ranging, breakout)."""
    if not data or not data['candles']:
        return None
    
    candles = data['candles']  # List of dicts: open, high, low, close, volume
    closes = [c['close'] for c in candles]
    
    # Compute indicators with TA-Lib
    adx = ta.trend.ADXIndicator(high=[c['high'] for c in candles], low=[c['low'] for c in candles], close=closes, window=14).adx()
    bb = ta.volatility.BollingerBands(close=closes, window=20, window_dev=2)
    bb_width = bb.bollinger_wband()
    
    latest_adx = adx.iloc[-1]
    latest_bb_width = bb_width.iloc[-1]
    
    if latest_adx > 35:
        condition = 'Trending'  # Strong trend
    elif latest_adx < 20 and latest_bb_width < 0.05:  # Arbitrary threshold for squeeze
        condition = 'Breakout Potential (BB Squeeze)'
    elif latest_adx < 20:
        condition = 'Ranging/Choppy'
    else:
        condition = 'Neutral'
    
    logging.info(f"Condition for asset: {condition}")
    return condition

def call_ai_for_confirmation(asset, condition, data):
    """Send to AI for A+ confirmation."""
    payload = {
        'asset': asset,
        'condition': condition,
        'candles': data['candles'][-5:],  # Last 5 for brevity
        'payout': data['payout'],
        'prompt': 'Confirm if this is A+ entry: Yes/No + Reason (one sentence).'
    }
    try:
        response = requests.post(AI_CONFIRM_URL, json=payload)
        response.raise_for_status()
        ai_response = response.json()  # Assume {'confirmed': True/False, 'reason': '...'}
        logging.info(f"AI confirmation for {asset}: {ai_response}")
        return ai_response
    except Exception as e:
        logging.error(f"AI error for {asset}: {e}")
        return {'confirmed': False, 'reason': 'AI timeout'}

def send_discord_alert(asset, condition, ai_response):
    """Send alert to Discord webhook."""
    message = f"**{datetime.now().strftime('%Y-%m-%d %H:%M')} - A+ Alert for {asset}**\nCondition: {condition}\nAI Confirmation: {ai_response['confirmed']} - {ai_response['reason']}\nPayout: {data['payout']}%"
    payload = {'content': message}
    try:
        response = requests.post(DISCORD_WEBHOOK, json=payload)
        response.raise_for_status()
        logging.info(f"Alert sent for {asset}")
    except Exception as e:
        logging.error(f"Discord error for {asset}: {e}")

def main():
    for asset in ASSETS:
        data = fetch_market_data(asset)
        if data:
            condition = identify_conditions(data)
            if condition and condition != 'Neutral':  # Only proceed for favorable
                ai_response = call_ai_for_confirmation(asset, condition, data)
                if ai_response['confirmed']:
                    send_discord_alert(asset, condition, ai_response)

if __name__ == "__main__":
    main()