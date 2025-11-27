import base64
import json
import time as time_mod
from datetime import datetime, timezone
from selenium.common.exceptions import WebDriverException

class WebSocketClient:
    def __init__(self, driver, verbose=False):
        self.driver = driver
        self.verbose = verbose

    def _decode_and_parse_payload(self, payload_data: str):
        try:
            decoded_payload = base64.b64decode(payload_data)
            if decoded_payload.startswith(b'\x01'):
                return None
            json_str = decoded_payload.decode('utf-8', errors='ignore')
            return json.loads(json_str)
        except (base64.binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
            return None

    def run_streaming_loop(self, callback):
        processed_messages = set()
        try:
            while True:
                try:
                    logs = self.driver.get_log('performance')
                    for wsData in logs:
                        msg_id = f"{wsData.get('timestamp', 0)}_{hash(wsData.get('message', ''))}"
                        if msg_id in processed_messages:
                            continue
                        processed_messages.add(msg_id)
                        
                        message = json.loads(wsData['message'])['message']
                        response = message.get('params', {}).get('response', {})
                        
                        if response.get('opcode', 0) == 2:
                            payload = self._decode_and_parse_payload(response['payloadData'])
                            if payload:
                                callback(payload)
                    
                    time_mod.sleep(0.1)
                except KeyboardInterrupt:
                    print(f"\n⏹️  [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream stopped by user")
                    break
                except WebDriverException as e:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] WebDriver error: {e}")
                    break
                except Exception as e:
                    if self.verbose:
                        print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream error: {e}")
                    time_mod.sleep(1)
        except KeyboardInterrupt:
            print(f"\n🛑 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Stream terminated")