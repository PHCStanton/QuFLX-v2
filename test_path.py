import os
import sys

# Simulate the location of backend/services/gateway/routes/history.py
# We are running this from project root, so we need to construct the path relative to where history.py WOULD be.
# But simpler: let's just verify the relative path logic.

# Current working directory is project root: c:\QuFLX\v2
cwd = os.getcwd()
print(f"Current Working Directory: {cwd}")

# Simulate history.py location
history_py_dir = os.path.join(cwd, "backend", "services", "gateway", "routes")
print(f"Simulated history.py dir: {history_py_dir}")

# Test the OLD logic (3 levels up)
old_path = os.path.abspath(os.path.join(history_py_dir, "../../../capabilities_v2/runner.py"))
print(f"OLD Logic Path (3 levels): {old_path}")
print(f"OLD Path Exists? {os.path.exists(old_path)}")

# Test the NEW logic (4 levels up)
new_path = os.path.abspath(os.path.join(history_py_dir, "../../../../capabilities_v2/runner.py"))
print(f"NEW Logic Path (4 levels): {new_path}")
print(f"NEW Path Exists? {os.path.exists(new_path)}")

# Verify capabilities_v2/runner.py actually exists at project root
actual_runner = os.path.join(cwd, "capabilities_v2", "runner.py")
print(f"Actual runner.py location: {actual_runner}")
print(f"Actual Runner Exists? {os.path.exists(actual_runner)}")
