import json
import re
import logging
from typing import Any, Dict
from ....utils.asset_utils import normalize_asset

logger = logging.getLogger(__name__)

def parse_script_json(stdout: str) -> Dict[str, Any]:
    """
    Parses the JSON output from a runner.py script.
    Handles potential extra text before/after the JSON block.
    """
    if not stdout or not stdout.strip():
        return {"ok": False, "error": "No output from script"}
        
    try:
        # Try direct parse first
        return json.loads(stdout.strip())
    except json.JSONDecodeError:
        # Look for the last { ... } block in the output
        try:
            match = re.search(r'(\{.*\})', stdout, re.DOTALL)
            if match:
                return json.loads(match.group(1))
        except Exception:
            pass
            
    return {"ok": False, "error": f"Failed to parse script output as JSON: {stdout[:200]}..."}
