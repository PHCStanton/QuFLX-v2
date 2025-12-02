import sys
import os
import logging

# Add library path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
library_path = os.path.join(parent_dir, 'PocketOptionAPI-v2')
sys.path.append(library_path)

from pocketoptionapi.stable_api import PocketOption
import pocketoptionapi.global_value as global_value
from test_cli import connect_and_wait

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# The user's provided string (raw, no extra escaping needed here as it's a python string literal)
# I need to be careful with the inner quotes.
# The user string: 42["auth",{"session":"a:4:{s:10:\"session_id\";s:32:\"0007d87611cbd61faabb669d221619e6\";s:10:\"ip_address\";s:14:\"105.245.96.227\";s:10:\"user_agent\";s:111:\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36\";s:13:\"last_activity\";i:1764373366;}67cdd21b0f5b2c6e74dcc2283c3a5f7f","isDemo":0,"uid":102904626,"platform":2,"isFastHistory":true,"isOptimized":true}]

# It contains \" which are escaped quotes in the JSON string itself.
# In Python, I can use a raw string or triple quotes.

ssid = r'42["auth",{"session":"a:4:{s:10:\"session_id\";s:32:\"0007d87611cbd61faabb669d221619e6\";s:10:\"ip_address\";s:14:\"105.245.96.227\";s:10:\"user_agent\";s:111:\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36\";s:13:\"last_activity\";i:1764373366;}67cdd21b0f5b2c6e74dcc2283c3a5f7f","isDemo":0,"uid":102904626,"platform":2,"isFastHistory":true,"isOptimized":true}]'

def main():
    print(f"Testing SSID: {ssid[:50]}...")
    
    # The user string indicates isDemo:0, so we should use demo=False (Real account)
    # However, usually we want to test connection first.
    # The library takes a 'demo' boolean.
    
    # Note: The 'isDemo':0 in the JSON string suggests it's a real account session.
    # But the API class init takes a 'demo' arg.
    # Let's try with demo=False since the session is for a real account.
    
    api = PocketOption(ssid, demo=False)
    
    if connect_and_wait(api):
        print("\nSUCCESS: SSID is VALID and Authenticated!")
        balance = api.get_balance()
        print(f"Balance: {balance}")
    else:
        print("\nFAILURE: SSID validation failed.")

    api.disconnect()

if __name__ == "__main__":
    main()
