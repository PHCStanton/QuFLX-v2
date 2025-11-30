from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple, Protocol, runtime_checkable, List
import os
import json
import datetime
import sys


@dataclass
class Ctx:
    driver: Any
    artifacts_root: str
    debug: bool
    dry_run: bool
    verbose: bool = False


@dataclass
class CapResult:
    ok: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    artifacts: Tuple[str, ...] = tuple()


@runtime_checkable
class Capability(Protocol):
    id: str
    kind: str  # "read" | "control" | "trade" | "control-read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        ...


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def join_artifact(ctx: Ctx, *parts: str) -> str:
    base = ensure_dir(ctx.artifacts_root)
    return os.path.join(base, *parts)


def save_json(ctx: Ctx, rel_filename: str, data: Dict[str, Any], subfolder: str = None) -> str:
    """Save JSON data to artifacts directory.
    
    Args:
        ctx: Context object containing artifacts_root
        rel_filename: Name of the JSON file to save
        data: Dictionary data to save as JSON
        subfolder: Optional subfolder within artifacts_root to save the file
    
    Returns:
        str: Full path to the saved file
    """
    if subfolder:
        out_path = join_artifact(ctx, subfolder, rel_filename)
    else:
        out_path = join_artifact(ctx, rel_filename)
    ensure_dir(os.path.dirname(out_path))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return out_path


def timestamp() -> str:
    return datetime.datetime.now().strftime("%Y%m%d_%H%M%S")


def add_utils_to_syspath():
    """
    Add API-test-space/utils to sys.path so we can import selenium_ui_controls/trade_clicker
    despite the hyphen in the parent directory name (not a valid Python package name).
    """
    here = os.path.dirname(os.path.abspath(__file__))  # .../API-test-space/capabilities
    api_space_dir = os.path.dirname(here)              # .../API-test-space
    utils_dir = os.path.join(api_space_dir, "utils")
    for p in [api_space_dir, utils_dir]:
        if p not in sys.path:
            sys.path.insert(0, p)


def take_screenshot_if(ctx: Ctx, rel_path: str) -> Optional[str]:
    """
    Save a screenshot relative to artifacts_root if ctx.debug is True.
    Returns the absolute path or None if not saved.
    """
    if not ctx.debug:
        return None
    try:
        abs_path = join_artifact(ctx, rel_path)
        ensure_dir(os.path.dirname(abs_path))
        ctx.driver.save_screenshot(abs_path)
        return abs_path
    except Exception:
        return None


def first_non_empty(*vals: Optional[str]) -> Optional[str]:
    for v in vals:
        if v:
            return v
    return None




