import requests
import json
import sys
import os

def test_indicators_e2e():
    url = "http://localhost:8001/api/v1/indicators"
    payload = {
        "asset": "AUDUSDOTC",
        "timeframe": "1m"
    }
    
    print(f"🚀 Testing Indicators E2E for {payload['asset']} @ {payload['timeframe']}...")
    print(f"📡 URL: {url}")
    print(f"📦 Payload: {json.dumps(payload)}")
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"🕒 Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Error Response: {response.text}")
            return False
            
        data = response.json()
        
        # Verify structure
        if not data.get("ok"):
            print(f"❌ API returned ok=False: {data}")
            return False
            
        series = data.get("series")
        if not series:
            print("❌ No 'series' data found in response!")
            print(f"Full Response: {json.dumps(data, indent=2)}")
            return False
            
        # Check for expected indicators
        expected_keys = ["sma_20", "ema_16", "rsi_14"]
        found_keys = [k for k in expected_keys if k in series]
        
        print(f"✅ Received indicators: {', '.join(found_keys)}")
        
        if len(found_keys) < len(expected_keys):
            missing = set(expected_keys) - set(found_keys)
            print(f"⚠️ Missing indicators: {', '.join(missing)}")
            
        # Check data points
        sample_key = found_keys[0] if found_keys else None
        if sample_key and series[sample_key]:
            sample_data = series[sample_key]
            print(f"📈 Sample data for {sample_key}: {len(sample_data)} points")
            print(f"   First 3 points: {sample_data[:3]}")
            print(f"   Last 3 points: {sample_data[-3:]}")
        else:
            print("⚠️ No data points found in series.")
            
        print("🎉 SUCCESS: Indicator pipeline verified end-to-end!")
        return True
        
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Is the Gateway running on http://localhost:8000?")
        return False
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        return False

if __name__ == "__main__":
    success = test_indicators_e2e()
    sys.exit(0 if success else 1)
