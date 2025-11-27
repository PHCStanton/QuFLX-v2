import logging
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import WebDriverException

logger = logging.getLogger(__name__)

class ChromeConnectionManager:
    """
    Manages the connection to an existing Chrome instance via Selenium and Remote Debugging.
    """
    def __init__(self, debug_port: int = 9222):
        self.debug_port = debug_port
        self.driver = None

    def connect(self) -> webdriver.Chrome:
        """
        Attaches to the existing Chrome session.
        """
        logger.info(f"Attempting to attach to Chrome on port {self.debug_port}...")
        
        try:
            options = Options()
            # Enable performance log to read WebSocket frames
            options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            options.add_experimental_option("debuggerAddress", f"127.0.0.1:{self.debug_port}")

            # Compatibility flags
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--disable-web-security")
            
            self.driver = webdriver.Chrome(options=options)
            logger.info(f"Successfully attached to Chrome. Current URL: {self.driver.current_url}")
            return self.driver
            
        except Exception as e:
            logger.error(f"Failed to attach to Chrome: {e}")
            raise RuntimeError(
                f"Failed to attach to existing Chrome session at 127.0.0.1:{self.debug_port}. "
                "Ensure Chrome is started with --remote-debugging-port=9222."
            ) from e

    def disconnect(self):
        """
        Disconnects the driver (but does not close the browser window if detached properly, 
        though Selenium's quit() usually closes it. We might want to just let it go out of scope 
        or be careful here if we want the browser to stay open).
        """
        if self.driver:
            try:
                # self.driver.quit() # Warning: This closes the browser window!
                # For a persistent miner, we might just want to close the session, not the window.
                # But Selenium doesn't easily support "detach". 
                # Usually, just letting the object die is enough if we don't call quit().
                pass 
            except Exception as e:
                logger.error(f"Error during disconnect: {e}")
