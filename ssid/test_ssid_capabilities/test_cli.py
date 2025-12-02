#!/usr/bin/env python3
"""
Test SSID Capabilities CLI

A simple command-line interface to test Pocket Option API capabilities using SSID.
Supports SSID validation, asset listing, selection, and demo trading.

Usage:
    python test_cli.py escape-ssid --ssid "raw_ssid_here"  # Escape quotes for PowerShell
    python test_cli.py validate --ssid "your_ssid_here"    # Validate SSID (auto-unescapes)
    python test_cli.py list-assets --ssid "your_ssid_here" # List available assets
    python test_cli.py select-asset --ssid "your_ssid_here" --asset "EURUSD"  # Show asset details
    python test_cli.py test-trade --ssid "your_ssid_here" --asset "EURUSD" --direction "call" --amount 1 --expiry 60

Note: Run start_hybrid_session.py separately to obtain SSID, then use escape-ssid command for PowerShell compatibility.
"""

import argparse
import sys
import os
import logging
import time

# Add the PocketOptionAPI-v2 directory to the path
# Assuming this script is in ssid/test_ssid_capabilities/ and the library is in ssid/PocketOptionAPI-v2/
# We need to go up one level to find PocketOptionAPI-v2
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
library_path = os.path.join(parent_dir, 'PocketOptionAPI-v2')
sys.path.append(library_path)

try:
    from pocketoptionapi.stable_api import PocketOption
    import pocketoptionapi.global_value as global_value
except ImportError:
    # Fallback if running from root
    try:
        sys.path.append(os.path.join(os.getcwd(), 'ssid', 'PocketOptionAPI-v2'))
        from pocketoptionapi.stable_api import PocketOption
        import pocketoptionapi.global_value as global_value
    except ImportError as e:
        print(f"Error importing PocketOption library: {e}")
        sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def escape_ssid_quotes(ssid):
    """Escape double quotes in SSID for PowerShell compatibility."""
    return ssid.replace('"', '\\"')

def unescape_ssid_quotes(ssid):
    """Unescape double quotes in SSID for API usage."""
    return ssid.replace('\\"', '"')

def connect_and_wait(api, timeout_connect=15, timeout_auth=20):
    """
    Connect to the API and wait for authentication (balance update).
    Returns True if authenticated, False otherwise.
    """
    # Reset global values for a clean test
    global_value.websocket_is_connected = False
    global_value.balance = None
    global_value.balance_updated = False

    logger.info("Attempting to connect...")
    if not api.connect():
        logger.error("Failed to initiate connection")
        return False

    # Wait for connection
    start_time = time.time()
    connected = False
    while time.time() - start_time < timeout_connect:
        if api.check_connect():
            connected = True
            logger.info("Websocket connected")
            break
        time.sleep(0.5)
    
    if not connected:
        logger.error("Connection timeout")
        return False

    # Wait for balance (authentication)
    logger.info("Waiting for authentication (balance retrieval)...")
    start_time = time.time()
    while time.time() - start_time < timeout_auth:
        balance = api.get_balance()
        if balance is not None:
            logger.info(f"Authenticated successfully. Balance: {balance}")
            return True
        time.sleep(0.5)
    
    logger.error("Authentication timeout - could not retrieve balance")
    return False

def validate_ssid(ssid, demo=True):
    """Validate SSID by attempting connection and balance retrieval."""
    api = None
    try:
        api = PocketOption(ssid, demo)
        if connect_and_wait(api):
            logger.info("SSID is VALID")
            return True
        else:
            logger.error("SSID is INVALID or EXPIRED")
            return False
    except Exception as e:
        logger.error(f"Validation error: {str(e)}")
        return False
    finally:
        if api:
            api.disconnect()

def list_assets(ssid, demo=True):
    """List available assets with payout percentages."""
    api = None
    try:
        api = PocketOption(ssid, demo)
        if not connect_and_wait(api):
            return

        payout_data = api.GetPayoutData()
        if payout_data:
            logger.info("Available assets:")
            for asset in payout_data:
                if len(asset) >= 6:  # Basic validation
                    logger.info(f"Asset: {asset[2]} ({asset[1]}), Payout: {asset[5]}%, Type: {asset[3]}")
        else:
            logger.error("No payout data available")

    except Exception as e:
        logger.error(f"Error listing assets: {str(e)}")
    finally:
        if api:
            api.disconnect()

def select_asset(ssid, asset, demo=True):
    """Select and show details for a specific asset."""
    api = None
    try:
        api = PocketOption(ssid, demo)
        if not connect_and_wait(api):
            return

        payout_data = api.GetPayoutData()
        selected = next((a for a in payout_data if a[1] == asset or a[2] == asset), None)
        
        if selected:
            logger.info(f"Selected Asset Details:")
            logger.info(f"Name: {selected[2]}")
            logger.info(f"Code: {selected[1]}")
            logger.info(f"Type: {selected[3]}")
            logger.info(f"Payout: {selected[5]}%")
            logger.info(f"Active: {'Yes' if selected[14] else 'No'}")
        else:
            logger.error(f"Asset {asset} not found")

    except Exception as e:
        logger.error(f"Error selecting asset: {str(e)}")
    finally:
        if api:
            api.disconnect()

def test_trade(ssid, asset, direction, amount, expiry, demo=True):
    """Perform a test trade (use demo mode to avoid real money)."""
    api = None
    try:
        api = PocketOption(ssid, demo)
        if not connect_and_wait(api):
            return

        logger.info(f"Placing {direction} trade for {amount} on {asset} with {expiry}s expiry...")
        result, order_id = api.buy(amount, asset, direction, expiry)
        if result:
            logger.info(f"Trade placed successfully. Order ID: {order_id}")
            # Wait for trade to complete
            logger.info(f"Waiting {expiry + 5} seconds for trade completion...")
            time.sleep(expiry + 5)
            win_result = api.check_win(order_id)
            if win_result:
                profit, status = win_result
                logger.info(f"Trade result: {status.upper()} - Profit: {profit}")
            else:
                logger.error("Could not retrieve trade result")
        else:
            logger.error("Trade placement failed")

    except Exception as e:
        logger.error(f"Error performing test trade: {str(e)}")
    finally:
        if api:
            api.disconnect()

def main():
    parser = argparse.ArgumentParser(description="Pocket Option API Test CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Escape SSID command
    escape_parser = subparsers.add_parser("escape-ssid", help="Escape SSID quotes for PowerShell compatibility")
    escape_parser.add_argument("--ssid", required=True, help="Raw SSID string to escape")

    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate SSID")
    validate_parser.add_argument("--ssid", required=True, help="SSID string (auto-unescapes if needed)")
    validate_parser.add_argument("--demo", action="store_true", help="Use demo mode")

    # List assets command
    list_parser = subparsers.add_parser("list-assets", help="List available assets")
    list_parser.add_argument("--ssid", required=True, help="SSID string (auto-unescapes if needed)")
    list_parser.add_argument("--demo", action="store_true", help="Use demo mode")

    # Select asset command
    select_parser = subparsers.add_parser("select-asset", help="Select and show asset details")
    select_parser.add_argument("--ssid", required=True, help="SSID string (auto-unescapes if needed)")
    select_parser.add_argument("--asset", required=True, help="Asset code or name")
    select_parser.add_argument("--demo", action="store_true", help="Use demo mode")

    # Test trade command
    trade_parser = subparsers.add_parser("test-trade", help="Perform a test trade")
    trade_parser.add_argument("--ssid", required=True, help="SSID string (auto-unescapes if needed)")
    trade_parser.add_argument("--asset", required=True, help="Asset code")
    trade_parser.add_argument("--direction", required=True, choices=["call", "put"], help="Trade direction")
    trade_parser.add_argument("--amount", type=float, required=True, help="Trade amount")
    trade_parser.add_argument("--expiry", type=int, required=True, help="Expiry in seconds")
    trade_parser.add_argument("--demo", action="store_true", help="Use demo mode")

    args = parser.parse_args()

    # Auto-unescape SSID if it contains escaped quotes (for all commands except escape-ssid)
    if hasattr(args, 'ssid') and args.command != "escape-ssid":
        args.ssid = unescape_ssid_quotes(args.ssid)

    if args.command == "escape-ssid":
        escaped = escape_ssid_quotes(args.ssid)
        print(f"Escaped SSID: {escaped}")
        print("\nUse this in PowerShell commands like:")
        print(f'python test_cli.py validate --ssid "{escaped}" --demo')
    elif args.command == "validate":
        validate_ssid(args.ssid, args.demo)
    elif args.command == "list-assets":
        list_assets(args.ssid, args.demo)
    elif args.command == "select-asset":
        select_asset(args.ssid, args.asset, args.demo)
    elif args.command == "test-trade":
        test_trade(args.ssid, args.asset, args.direction, args.amount, args.expiry, args.demo)

if __name__ == "__main__":
    main()
