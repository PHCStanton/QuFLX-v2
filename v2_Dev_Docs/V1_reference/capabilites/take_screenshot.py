from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple, List

import os
import sys

# Add parent directory to sys.path for direct execution
_parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from capabilities.base import Ctx, CapResult, Capability, add_utils_to_syspath, join_artifact, ensure_dir, timestamp

# Ensure utils are importable
add_utils_to_syspath()


class TakeScreenshot(Capability):
    """
    Capability: Take a screenshot of the current page.
    Interface: run(ctx, {"subfolder": str=None})
    Outputs: screenshot path in artifacts
    Kind: "read"
    """
    id = "take_screenshot"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        subfolder: Optional[str] = inputs.get("subfolder", None)

        artifacts: List[str] = []

        # Take the screenshot (always, not just in debug mode like take_screenshot_if)
        filename = f"screenshot_{timestamp()}.png"
        try:
            if subfolder:
                screenshot_path = join_artifact(ctx, subfolder, filename)
            else:
                screenshot_path = join_artifact(ctx, filename)

            ensure_dir(os.path.dirname(screenshot_path))
            ctx.driver.save_screenshot(screenshot_path)
            artifacts.append(screenshot_path)

            result = {
                "timestamp": timestamp(),
                "subfolder": subfolder,
                "screenshot_taken": True,
                "file_path": screenshot_path,
            }

            ok = True
            error = None

        except Exception as e:
            result = {
                "timestamp": timestamp(),
                "subfolder": subfolder,
                "screenshot_taken": False,
                "error_details": str(e),
            }

            ok = False
            error = f"Failed to take screenshot: {e}"

        return CapResult(ok=ok, data=result, error=error, artifacts=tuple(artifacts))


# Factory for orchestrator
def build() -> Capability:
    return TakeScreenshot()


if __name__ == "__main__":
    import argparse
    import json as _json
    import sys
    from pathlib import Path

    # Try to attach using qf if available (shares global ctx/driver)
    ctx = None
    driver = None
    artifacts_root = str(Path(__file__).resolve().parents[1] / "screenshots")
    try:
        import qf  # type: ignore
        ok, _res = qf.attach_chrome_session(port=9222, verbose=True)
        if ok:
            ctx = qf.ctx
            driver = qf.driver
            # Override artifacts_root for screenshot saving
            ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=ctx.debug, dry_run=ctx.dry_run, verbose=ctx.verbose)
    except Exception:
        pass

    # Fallback direct attach
    if ctx is None:
        try:
            from selenium import webdriver  # type: ignore
            from selenium.webdriver.chrome.options import Options  # type: ignore
            opts = Options()
            opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
            opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            driver = webdriver.Chrome(options=opts)
            ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=False, dry_run=False, verbose=True)
            print("✅ Attached to Chrome session:", getattr(driver, "current_url", "unknown"))
        except Exception as e:
            print(f"❌ Failed to attach to Chrome session: {e}")
            raise SystemExit(1)

    parser = argparse.ArgumentParser(description="Take a screenshot of the current page.")
    parser.add_argument("--subfolder", help="Optional subfolder within screenshots directory (e.g., 'debug', 'session')")
    args = parser.parse_args()

    cap = TakeScreenshot()
    inputs = {
        "subfolder": args.subfolder,
    }

    res = cap.run(ctx, inputs)
    # Ensure JSON-safe output (no WebElements)
    out = {
        "ok": res.ok,
        "error": res.error,
        "data": res.data,
        "artifacts": list(res.artifacts) if getattr(res, "artifacts", None) else [],
    }
    print(_json.dumps(out, ensure_ascii=False, indent=2))
