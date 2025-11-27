"""
Chrome connection management module for streaming_server.py refactoring
"""

import socket
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


class ChromeConnectionManager:
    """Manages Chrome remote debugging connection"""

    def __init__(self, port=9222, verbose=True):
        self.port = port
        self.verbose = verbose
        self.driver = None

    def check_port_availability(self):
        """Check if Chrome remote debugging port is available"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', self.port))
            sock.close()
            return result == 0
        except Exception:
            return False

    def attach_to_chrome(self):
        """Attach to existing Chrome instance"""
        if not self.check_port_availability():
            if self.verbose:
                print(f"[Chrome] ✗ Port {self.port} not available")
                print("[Chrome] Start Chrome with: chrome --remote-debugging-port=9222 --user-data-dir=/path/to/profile")
            return None

        try:
            if self.verbose:
                print(f"[Chrome] Connecting to Chrome at 127.0.0.1:{self.port}...")

            options = Options()
            # Enable performance log to capture WebSocket frames
            options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            options.add_experimental_option("debuggerAddress", f"127.0.0.1:{self.port}")

            # Compatibility flags
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--disable-web-security")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--no-first-run")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-popup-blocking")

            driver = webdriver.Chrome(options=options)

            if self.verbose:
                print(f"[Chrome] ✓ Connected! Current URL: {driver.current_url}")

            self.driver = driver
            return driver

        except Exception as e:
            print(f"[Chrome] ✗ Failed to connect: {e}")
            print("[Chrome] Make sure Chrome is running with: chrome --remote-debugging-port=9222 --user-data-dir=/path/to/profile")
            return None

    def is_connected(self):
        """Check if Chrome is still connected and responsive"""
        if not self.driver:
            return False

        try:
            _ = self.driver.current_url
            return True
        except Exception:
            print("[Chrome] Connection lost")
            self.driver = None
            return False

    def disconnect(self):
        """Disconnect from Chrome"""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            finally:
                self.driver = None