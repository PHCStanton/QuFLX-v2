"""Start Hybrid Chrome Session

This script demonstrates how to start a Chrome session with remote debugging
enabled, which is required for the Hybrid Chrome Session Approach.

Usage:
1. Run this script to start Chrome with remote debugging
2. Then run the hybrid_chrome_session_test.py to connect to the session
"""

import subprocess
import sys
import os
import time
from pathlib import Path

def start_chrome_with_remote_debugging():
    """Start Chrome with remote debugging enabled."""
    print("Starting Chrome with remote debugging...")
    
    # Chrome executable paths (Windows)
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "chrome.exe"  # In PATH
    ]
    
    # Find Chrome executable
    chrome_exe = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_exe = path
            break
    
    if not chrome_exe:
        print("ERROR: Chrome executable not found!")
        print("Please install Chrome or specify the correct path.")
        return False
    
    print(f"Found Chrome executable: {chrome_exe}")
    
    # Create user data directory in workspace (standardized with backend)
    # Use workspace Chrome_profile directory to keep everything in project
    script_dir = Path(__file__).parent
    user_data_dir = script_dir / "Chrome_profile"
    user_data_dir.mkdir(parents=True, exist_ok=True)

    print(f"Using workspace Chrome profile directory: {user_data_dir}")
    
    # Chrome command line arguments
    chrome_args = [
        chrome_exe,
        f"--remote-debugging-port=9222",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-popup-blocking",
        "--disable-web-security",
        "--allow-running-insecure-content",
        "https://pocket2.click/cabinet/demo-quick-high-low"
    ]
    
    try:
        # Start Chrome process
        process = subprocess.Popen(chrome_args)
        print(f"Chrome started with PID: {process.pid}")
        print("Chrome is now running with remote debugging on port 9222")
        print("You can now run hybrid_chrome_session_test.py to connect to this session")
        print("\nPress Ctrl+C to stop Chrome (or close the Chrome window manually)")
        
        # Wait for user to stop
        try:
            process.wait()
        except KeyboardInterrupt:
            print("\nStopping Chrome...")
            process.terminate()
            process.wait()
            
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to start Chrome: {e}")
        return False

def check_if_chrome_running():
    """Check if Chrome with remote debugging is already running."""
    import psutil
    
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            if 'chrome' in proc.info['name'].lower():
                # Check if it's running with remote debugging
                try:
                    for conn in proc.connections():
                        if conn.laddr.port == 9222:
                            return True
                except:
                    pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    return False

if __name__ == "__main__":
    print("Hybrid Chrome Session Starter")
    print("=" * 40)
    
    # Check if Chrome is already running with remote debugging
    if check_if_chrome_running():
        print("Chrome with remote debugging is already running on port 9222")
        print("You can proceed with running hybrid_chrome_session_test.py")
        sys.exit(0)
    
    # Start Chrome with remote debugging
    success = start_chrome_with_remote_debugging()
    
    if success:
        print("\nChrome session started successfully!")
        print("To test the hybrid approach:")
        print("1. Log in to PocketOption manually if needed")
        print("2. Run: python hybrid_chrome_session_test.py")
    else:
        print("\nFailed to start Chrome session")
        sys.exit(1)




