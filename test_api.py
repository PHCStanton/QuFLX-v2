import requests
import json

def test_refresh_assets():
    url = "http://localhost:8000/api/v1/assets/refresh-assets"
    payload = {
        "min_pct": 92,
        "sweep_all": False,
        "unstar_below": False
    }
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        try:
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"Raw Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_refresh_assets()
