#!/usr/bin/env python3
"""Test script for SSID connection fix."""

from ssid_integration import SSIDConnector

# Test with a simple SSID (this won't actually connect, but will test the parsing)
test_ssid = "42[\"auth\",{\"session\":\"test\",\"isDemo\":1,\"uid\":123}]"

print("Testing SSIDConnector initialization...")
try:
    connector = SSIDConnector(ssid=test_ssid, demo=True)
    print("✅ SSIDConnector initialized successfully")
    print(f"   Parsed demo mode: {connector._actual_demo}")
    print(f"   Constructor demo: {connector.demo}")
except Exception as e:
    print(f"❌ SSIDConnector initialization failed: {e}")
    import traceback
    traceback.print_exc()

print("\nTesting with invalid SSID...")
try:
    connector2 = SSIDConnector(ssid="invalid_ssid", demo=False)
    print("✅ SSIDConnector with invalid SSID initialized successfully")
    print(f"   Fallback demo mode: {connector2._actual_demo}")
except Exception as e:
    print(f"❌ SSIDConnector with invalid SSID failed: {e}")
    import traceback
    traceback.print_exc()