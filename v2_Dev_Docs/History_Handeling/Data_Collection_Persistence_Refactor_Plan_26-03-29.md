# Data Collection & Persistence Refactor — Implementation Plan
**Date:** 2026-03-29 | **Plan Type:** @Coder Implementation Plan  
**Source Report:** `@reports_2026-03/Data_Collection_Persistence_Refactor_Report_26-03-29.md`  
**Delegated Agents:** @Coder (implementation), @Reviewer (phase-gate), @Tester (verification)  
**Status:** ✅ Complete — All phases implemented, reviewed, and closed

---

## Executive Summary

This plan converts the forensic findings from the 2026-03-29 report into a concrete, phase-gated implementation. The goal is to eliminate the subprocess-per-request history loading bottleneck, redirect all data persistence to `data/supabase_migration_data/`, and add frontend chart persistence so users can switch assets without re-triggering bootstrap collection.

**No code changes are made until the user issues an explicit phase command.**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0 — Directory Bootstrap (Pre-work)](#2-phase-0--directory-bootstrap-pre-work)
3. [Phase 1 — Data Layer Foundation (`data_store.py`)](#3-phase-1--data-layer-foundation-data_storepy)
4. [Phase 2 — History Route Refactor (Core Bug Fix)](#4-phase-2--history-route-refactor-core-bug-fix)
5. [Phase 3 — Update All Backend Consumers](#5-phase-3--update-all-backend-consumers)
6. [Phase 4 — Deprecate Old Utilities](#6-phase-4--deprecate-old-utilities)
7. [Phase 5 — Frontend Chart Persistence & Stabilization](#7-phase-5--frontend-chart-persistence--stabilization)
8. [Phase 6 — Verification & Hardening](#8-phase-6--verification--hardening)
9. [Files Touched Summary](#9-files-touched-summary)
10. [Risk Register](#10-risk-register)
11. [CORE_PRINCIPLES Compliance Map](#11-core_principles-compliance-map)
12. [Phase Review Protocol](#12-phase-review-protocol)

---

## 1. Architecture Overview

### 1.1 New Data Flow (Post-Refactor)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROPOSED DATA PIPELINE (POST-REFACTOR)              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks asset (Ticker Panel — has cached data)                    │
│       → historyCandles[asset] exists + historyStatus[asset] === 'loaded'│
│       → Chart renders immediately — NO backend call                    │
│                                                                         │
│  User clicks asset (Payout List — no cached data)                      │
│       → loadHistory(asset)                                             │
│       → GET /api/v1/history/{asset}?timeframe=1&limit=200              │
│            → data_store.read_candles(asset, "1m", 200)                 │
│            → Single file read: candles/AUDNZDOTC_1m.csv               │
│       → If 404: POST /api/v1/history/bootstrap-history                 │
│            → IN-PROCESS HistoryCollector (asyncio.to_thread)           │
│            → Uses collector's existing interceptor (no log contention) │
│            → data_store.upsert_candles(asset, "1m", candles, session)  │
│            → Returns candles + session_id directly                     │
│                                                                         │
│  CollectorService (continuous)                                         │
│       → fetch_ticks() → Redis publish → frontend                      │
│       → fetch_history_events() → data_store.upsert_candles()          │
│                                                                         │
│  Alert Dispatcher                                                      │
│       → data_store.read_candles(asset, "1m") → single file read       │
│       → Stale check against last candle timestamp                      │
│                                                                         │
│  Indicator Route (already in-process — OPT-1)                         │
│       → data_store.get_candle_path(asset, "1m") → cache key           │
│       → asyncio.to_thread(pipeline.calculate_indicators)               │
│                                                                         │
│  SINGLE SOURCE OF TRUTH: backend/utils/data_store.py                  │
│       → All path resolution                                           │
│       → All read/write/upsert operations                              │
│       → Session ID generation                                          │
│       → Deduplication by timestamp                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 New Directory Structure

```
data/supabase_migration_data/
├── candles/                              ← Maps to future `candles` Supabase table
│   ├── AUDNZDOTC_1m.csv                 ← One file per asset+timeframe (append-only, deduped)
│   ├── AUDNZDOTC_5m.csv
│   ├── AUDNZDOTC_15m.csv
│   ├── EURUSDOTC_1m.csv
│   └── ...
├── sessions/                             ← Maps to future `collection_sessions` table
│   └── sessions.jsonl                    ← JSONL (one JSON object per line)
└── _metadata/
    └── schema_version.json               ← Schema version for migration tooling
```

### 1.3 Candle CSV Schema (Supabase-Ready)

```csv
timestamp,open,high,low,close,volume,session_id,source,created_at
1774638900,1.18412,1.18454,1.18366,1.18454,97,sess_abc123,history_capture,2026-03-29T11:00:00Z
1774638960,1.18454,1.18470,1.18440,1.18465,12,sess_abc123,collector_intercept,2026-03-29T11:01:00Z
```

| Column | Type | Supabase Type | Notes |
|--------|------|---------------|-------|
| `timestamp` | int (unix seconds) | `BIGINT` | Candle open time — **PRIMARY KEY** (with asset+tf) |
| `open` | float | `DOUBLE PRECISION` | Open price |
| `high` | float | `DOUBLE PRECISION` | High price |
| `low` | float | `DOUBLE PRECISION` | Low price |
| `close` | float | `DOUBLE PRECISION` | Close price |
| `volume` | float | `DOUBLE PRECISION` | Tick volume |
| `session_id` | string | `TEXT` | Links to collection session |
| `source` | string | `TEXT` | `history_capture` / `tick_aggregation` / `collector_intercept` |
| `created_at` | ISO8601 | `TIMESTAMPTZ` | Row write time |

**Invariants:**
- Sorted ascending by `timestamp` at all times
- Deduplicated by `timestamp` (upsert: update if exists, append if new)
- `source` tracks data provenance for quality auditing

### 1.4 Supported Timeframes

| Timeframe | File Suffix | Interval (seconds) |
|-----------|-------------|-------------------|
| 1 minute  | `_1m.csv`   | 60 |
| 3 minutes | `_3m.csv`   | 180 |
| 5 minutes | `_5m.csv`   | 300 |
| 15 minutes| `_15m.csv`  | 900 |
| 30 minutes| `_30m.csv`  | 1800 |
| 1 hour    | `_1h.csv`   | 3600 |
| 4 hours   | `_4h.csv`   | 14400 |
| 1 day     | `_1d.csv`   | 86400 |

---

## 2. Phase 0 — Directory Bootstrap (Pre-work)

**Executor:** @Coder  
**Effort:** 5 minutes  
**Risk:** None — creates empty directories and a metadata file only

### 2.1 What to Create

```
data/supabase_migration_data/
data/supabase_migration_data/candles/          ← empty, ready for CSV files
data/supabase_migration_data/sessions/         ← empty, ready for sessions.jsonl
data/supabase_migration_data/_metadata/
data/supabase_migration_data/_metadata/schema_version.json
```

### 2.2 `schema_version.json` Content

```json
{
  "version": 1,
  "created_at": "2026-03-29T11:00:00Z",
  "description": "Initial Supabase-ready local schema for QuFLX-v2 candle data",
  "supported_timeframes": ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"],
  "tables": {
    "candles": {
      "path": "candles/{ASSET}_{TF}.csv",
      "primary_key": ["asset", "timeframe", "timestamp"],
      "columns": ["timestamp", "open", "high", "low", "close", "volume", "session_id", "source", "created_at"]
    },
    "sessions": {
      "path": "sessions/sessions.jsonl",
      "primary_key": ["session_id"]
    }
  }
}
```

### 2.3 Verification

```bash
# Verify directories exist
dir data\supabase_migration_data
dir data\supabase_migration_data\candles
dir data\supabase_migration_data\sessions
dir data\supabase_migration_data\_metadata
```

**Phase 0 complete when:** All directories exist and `schema_version.json` is readable.

---

## 3. Phase 1 — Data Layer Foundation (`data_store.py`)

**Executor:** @Coder  
**Effort:** 2-3 hours  
**Risk:** Low — new file, no existing code touched  
**Reviewer gate:** @Reviewer must sign off before Phase 2 begins

### 3.1 New File: `backend/utils/data_store.py`

This is the **Single Source of Truth** for all data path resolution and read/write operations. Every other module will import from here.

```python
"""
backend/utils/data_store.py
===========================
Single Source of Truth for QuFLX-v2 local data persistence.

Replaces the scattered path logic in history_utils.py with a clean,
Supabase-ready local schema under data/supabase_migration_data/.

Schema:
  candles/{ASSET}_{TF}.csv   — one file per asset+timeframe, append-only, deduped
  sessions/sessions.jsonl    — JSONL session metadata
  _metadata/schema_version.json

All functions are synchronous (safe for asyncio.to_thread() callers).
"""

import csv
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from backend.utils.asset_utils import normalize_asset

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

# Project root: this file is at backend/utils/data_store.py → parents[2] = project root
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_STORE_ROOT = _PROJECT_ROOT / "data" / "supabase_migration_data"

# Timeframe minutes → canonical string suffix
_TF_MINUTES_TO_STR: Dict[int, str] = {
    1: "1m",
    3: "3m",
    5: "5m",
    15: "15m",
    30: "30m",
    60: "1h",
    240: "4h",
    1440: "1d",
}

# Canonical string → minutes (reverse map)
_TF_STR_TO_MINUTES: Dict[str, int] = {v: k for k, v in _TF_MINUTES_TO_STR.items()}

# CSV columns for candle files
_CANDLE_COLUMNS = [
    "timestamp", "open", "high", "low", "close", "volume",
    "session_id", "source", "created_at",
]


# ── Timeframe helpers ────────────────────────────────────────────────────────

def timeframe_to_str(timeframe_minutes: int) -> str:
    """
    Convert timeframe in minutes to canonical string suffix.

    Examples:
        1  → "1m"
        60 → "1h"
        240 → "4h"
        1440 → "1d"

    Falls back to "{n}m" for non-standard values (e.g. 45 → "45m").
    """
    if not isinstance(timeframe_minutes, int) or timeframe_minutes < 1:
        raise ValueError(f"timeframe_minutes must be a positive int, got: {timeframe_minutes!r}")
    return _TF_MINUTES_TO_STR.get(timeframe_minutes, f"{timeframe_minutes}m")


def timeframe_str_to_minutes(tf_str: str) -> int:
    """
    Convert canonical timeframe string to minutes.

    Examples:
        "1m"  → 1
        "1h"  → 60
        "4h"  → 240
        "1d"  → 1440
    """
    tf = str(tf_str).strip().lower()
    if tf in _TF_STR_TO_MINUTES:
        return _TF_STR_TO_MINUTES[tf]
    # Parse dynamically: "45m" → 45, "2h" → 120
    if tf.endswith("m"):
        try:
            return max(1, int(tf[:-1]))
        except ValueError:
            pass
    if tf.endswith("h"):
        try:
            return max(1, int(tf[:-1]) * 60)
        except ValueError:
            pass
    if tf.endswith("d"):
        try:
            return max(1, int(tf[:-1]) * 1440)
        except ValueError:
            pass
    raise ValueError(f"Cannot parse timeframe string: {tf_str!r}")


# ── Path resolution ──────────────────────────────────────────────────────────

def get_candle_path(asset: str, timeframe_str: str) -> Path:
    """
    Return the canonical Path for a candle CSV file.

    Path: data/supabase_migration_data/candles/{ASSET}_{TF}.csv

    The file may or may not exist yet — callers must check with .exists().
    """
    asset_clean = normalize_asset(asset)
    if not asset_clean:
        raise ValueError(f"Cannot normalize asset: {asset!r}")
    tf = str(timeframe_str).strip().lower()
    return _STORE_ROOT / "candles" / f"{asset_clean}_{tf}.csv"


def get_session_path() -> Path:
    """Return the canonical Path for the sessions JSONL file."""
    return _STORE_ROOT / "sessions" / "sessions.jsonl"


def get_store_root() -> Path:
    """Return the root of the supabase_migration_data directory."""
    return _STORE_ROOT


# ── Session helpers ──────────────────────────────────────────────────────────

def generate_session_id() -> str:
    """Generate a unique session ID with a human-readable prefix."""
    short = uuid.uuid4().hex[:8]
    return f"sess_{short}"


def log_session(session_data: Dict[str, Any]) -> None:
    """
    Append a session record to sessions/sessions.jsonl.

    session_data must include at minimum: session_id, asset, timeframe, source.
    Additional fields (started_at, candle_count, status, error_code, duration_ms)
    are optional but recommended.

    Raises:
        ValueError: if session_data is missing required fields.
        IOError: if the file cannot be written.
    """
    required = {"session_id", "asset", "timeframe", "source"}
    missing = required - set(session_data.keys())
    if missing:
        raise ValueError(f"log_session: missing required fields: {missing}")

    session_path = get_session_path()
    session_path.parent.mkdir(parents=True, exist_ok=True)

    record = {
        "session_id": session_data["session_id"],
        "asset": session_data["asset"],
        "timeframe": session_data["timeframe"],
        "source": session_data["source"],
        "started_at": session_data.get("started_at", datetime.now(timezone.utc).isoformat()),
        "candle_count": session_data.get("candle_count", 0),
        "status": session_data.get("status", "complete"),
        "error_code": session_data.get("error_code"),
        "duration_ms": session_data.get("duration_ms"),
    }

    with session_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    logger.debug(f"Session logged: {record['session_id']} ({record['asset']} {record['timeframe']})")


# ── Read operations ──────────────────────────────────────────────────────────

def read_candles(
    asset: str,
    timeframe_str: str,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """
    Read the most recent `limit` candles for an asset+timeframe.

    Returns a list of dicts with keys: timestamp, open, high, low, close, volume,
    session_id, source, created_at.

    Returns an empty list if the file does not exist or is empty.
    Data is sorted ascending by timestamp (oldest first).
    """
    csv_path = get_candle_path(asset, timeframe_str)
    if not csv_path.exists():
        logger.debug(f"read_candles: no file at {csv_path}")
        return []

    try:
        df = pd.read_csv(csv_path)
        if df.empty:
            return []

        # Ensure ascending sort (invariant: file should already be sorted)
        df = df.sort_values("timestamp", ascending=True)

        # Take last N rows (most recent candles)
        df = df.tail(limit)

        return df.to_dict("records")

    except Exception as e:
        logger.error(f"read_candles: failed to read {csv_path}: {e}", exc_info=True)
        return []


def get_last_candle_timestamp(asset: str, timeframe_str: str) -> Optional[float]:
    """
    Return the timestamp of the most recent candle, or None if no data exists.
    Used for stale-data checks in the alert dispatcher.
    """
    csv_path = get_candle_path(asset, timeframe_str)
    if not csv_path.exists():
        return None

    try:
        df = pd.read_csv(csv_path, usecols=["timestamp"])
        if df.empty:
            return None
        return float(df["timestamp"].max())
    except Exception as e:
        logger.error(f"get_last_candle_timestamp: failed for {csv_path}: {e}")
        return None


# ── Write operations ─────────────────────────────────────────────────────────

def upsert_candles(
    asset: str,
    timeframe_str: str,
    candles: List[Dict[str, Any]],
    session_id: Optional[str] = None,
    source: str = "history_capture",
) -> int:
    """
    Upsert candles into the canonical CSV file for asset+timeframe.

    Upsert semantics:
      - If a candle with the same timestamp already exists → update it.
      - If the timestamp is new → append it.
      - Result is always sorted ascending by timestamp.

    Args:
        asset:         Asset name (will be normalized internally).
        timeframe_str: Timeframe string, e.g. "1m", "5m", "1h".
        candles:       List of dicts with keys: timestamp, open, high, low, close, volume.
                       Extra keys are ignored.
        session_id:    Optional session ID to tag rows with.
        source:        Data source label for provenance tracking.

    Returns:
        Number of rows written (total rows in file after upsert).

    Raises:
        ValueError: if candles is not a list or asset/timeframe are invalid.
        IOError: if the file cannot be written.
    """
    if not isinstance(candles, list):
        raise ValueError(f"upsert_candles: candles must be a list, got {type(candles)}")
    if not candles:
        return 0

    csv_path = get_candle_path(asset, timeframe_str)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    now_iso = datetime.now(timezone.utc).isoformat()
    sid = session_id or generate_session_id()

    # Parse incoming candles into a DataFrame
    rows = []
    for c in candles:
        try:
            ts = float(c.get("timestamp") or c.get("time"))
            o = float(c.get("open"))
            h = float(c.get("high"))
            lo = float(c.get("low"))
            cl = float(c.get("close"))
            vol = float(c.get("volume", 0.0))
        except (TypeError, ValueError) as e:
            logger.debug(f"upsert_candles: skipping malformed candle {c}: {e}")
            continue

        rows.append({
            "timestamp": ts,
            "open": o,
            "high": h,
            "low": lo,
            "close": cl,
            "volume": vol,
            "session_id": sid,
            "source": source,
            "created_at": now_iso,
        })

    if not rows:
        logger.warning(f"upsert_candles: no valid candles to write for {asset} {timeframe_str}")
        return 0

    new_df = pd.DataFrame(rows, columns=_CANDLE_COLUMNS)

    # Load existing data if file exists
    if csv_path.exists():
        try:
            existing_df = pd.read_csv(csv_path)
            # Merge: new rows override existing rows with same timestamp
            combined = pd.concat([existing_df, new_df], ignore_index=True)
            # Keep last occurrence of each timestamp (new data wins)
            combined = combined.drop_duplicates(subset=["timestamp"], keep="last")
        except Exception as e:
            logger.warning(f"upsert_candles: could not read existing file {csv_path}, overwriting: {e}")
            combined = new_df
    else:
        combined = new_df

    # Sort ascending by timestamp (invariant)
    combined = combined.sort_values("timestamp", ascending=True).reset_index(drop=True)

    # Write atomically (write to temp, then rename — avoids partial writes)
    tmp_path = csv_path.with_suffix(".tmp")
    try:
        combined.to_csv(tmp_path, index=False)
        tmp_path.replace(csv_path)
    except Exception as e:
        # Clean up temp file if rename failed
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise IOError(f"upsert_candles: failed to write {csv_path}: {e}") from e

    row_count = len(combined)
    logger.info(
        f"upsert_candles: {asset} {timeframe_str} → {row_count} rows "
        f"(+{len(rows)} new/updated) [{source}]"
    )
    return row_count
```

### 3.2 New File: `backend/tests/test_data_store.py`

```python
"""
Unit tests for backend/utils/data_store.py
Run with: conda run -n QuFLX-v2 python -m pytest backend/tests/test_data_store.py -v
"""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

# Patch _STORE_ROOT to a temp directory for all tests
import backend.utils.data_store as ds


@pytest.fixture(autouse=True)
def temp_store(tmp_path):
    """Redirect all data_store operations to a temp directory."""
    with patch.object(ds, "_STORE_ROOT", tmp_path / "supabase_migration_data"):
        yield tmp_path / "supabase_migration_data"


# ── timeframe_to_str ─────────────────────────────────────────────────────────

def test_timeframe_to_str_standard():
    assert ds.timeframe_to_str(1) == "1m"
    assert ds.timeframe_to_str(60) == "1h"
    assert ds.timeframe_to_str(240) == "4h"
    assert ds.timeframe_to_str(1440) == "1d"


def test_timeframe_to_str_nonstandard():
    assert ds.timeframe_to_str(45) == "45m"


def test_timeframe_to_str_invalid():
    with pytest.raises(ValueError):
        ds.timeframe_to_str(0)
    with pytest.raises(ValueError):
        ds.timeframe_to_str(-1)


# ── timeframe_str_to_minutes ─────────────────────────────────────────────────

def test_timeframe_str_to_minutes():
    assert ds.timeframe_str_to_minutes("1m") == 1
    assert ds.timeframe_str_to_minutes("1h") == 60
    assert ds.timeframe_str_to_minutes("4h") == 240
    assert ds.timeframe_str_to_minutes("1d") == 1440


def test_timeframe_str_to_minutes_invalid():
    with pytest.raises(ValueError):
        ds.timeframe_str_to_minutes("xyz")


# ── get_candle_path ───────────────────────────────────────────────────────────

def test_get_candle_path():
    path = ds.get_candle_path("AUDNZDOTC", "1m")
    assert path.name == "AUDNZDOTC_1m.csv"
    assert "candles" in str(path)


def test_get_candle_path_normalizes_asset():
    path = ds.get_candle_path("AUDNZD_otc", "1m")
    assert path.name == "AUDNZDOTC_1m.csv"


# ── upsert_candles ────────────────────────────────────────────────────────────

SAMPLE_CANDLES = [
    {"timestamp": 1000, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "volume": 10},
    {"timestamp": 1060, "open": 1.15, "high": 1.25, "low": 1.1, "close": 1.20, "volume": 8},
    {"timestamp": 1120, "open": 1.20, "high": 1.30, "low": 1.15, "close": 1.25, "volume": 12},
]


def test_upsert_candles_creates_file():
    count = ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES, session_id="sess_test")
    path = ds.get_candle_path("AUDNZDOTC", "1m")
    assert path.exists()
    assert count == 3


def test_upsert_candles_sorted_ascending():
    reversed_candles = list(reversed(SAMPLE_CANDLES))
    ds.upsert_candles("AUDNZDOTC", "1m", reversed_candles)
    df = pd.read_csv(ds.get_candle_path("AUDNZDOTC", "1m"))
    assert list(df["timestamp"]) == [1000, 1060, 1120]


def test_upsert_candles_deduplicates():
    ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    # Upsert same candles again — should not duplicate
    count = ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    assert count == 3  # Still 3 rows, not 6


def test_upsert_candles_updates_existing():
    ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    updated = [{"timestamp": 1000, "open": 1.1, "high": 1.99, "low": 1.0, "close": 1.99, "volume": 99}]
    ds.upsert_candles("AUDNZDOTC", "1m", updated)
    df = pd.read_csv(ds.get_candle_path("AUDNZDOTC", "1m"))
    row = df[df["timestamp"] == 1000].iloc[0]
    assert float(row["high"]) == 1.99


def test_upsert_candles_empty_list():
    count = ds.upsert_candles("AUDNZDOTC", "1m", [])
    assert count == 0


def test_upsert_candles_skips_malformed():
    bad_candles = [{"timestamp": "bad", "open": "x"}]
    count = ds.upsert_candles("AUDNZDOTC", "1m", bad_candles)
    assert count == 0


# ── read_candles ──────────────────────────────────────────────────────────────

def test_read_candles_returns_empty_when_no_file():
    result = ds.read_candles("NONEXISTENT", "1m")
    assert result == []


def test_read_candles_returns_correct_data():
    ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    result = ds.read_candles("AUDNZDOTC", "1m", limit=200)
    assert len(result) == 3
    assert result[0]["timestamp"] == 1000


def test_read_candles_respects_limit():
    ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    result = ds.read_candles("AUDNZDOTC", "1m", limit=2)
    assert len(result) == 2
    # Should return the LAST 2 (most recent)
    assert result[0]["timestamp"] == 1060
    assert result[1]["timestamp"] == 1120


# ── log_session ───────────────────────────────────────────────────────────────

def test_log_session_creates_jsonl():
    ds.log_session({
        "session_id": "sess_test001",
        "asset": "AUDNZDOTC",
        "timeframe": "1m",
        "source": "history_capture",
        "candle_count": 100,
        "status": "complete",
    })
    path = ds.get_session_path()
    assert path.exists()
    with path.open() as f:
        record = json.loads(f.readline())
    assert record["session_id"] == "sess_test001"
    assert record["candle_count"] == 100


def test_log_session_missing_required_fields():
    with pytest.raises(ValueError):
        ds.log_session({"session_id": "sess_x"})  # missing asset, timeframe, source


# ── get_last_candle_timestamp ─────────────────────────────────────────────────

def test_get_last_candle_timestamp_no_file():
    result = ds.get_last_candle_timestamp("NONEXISTENT", "1m")
    assert result is None


def test_get_last_candle_timestamp_returns_max():
    ds.upsert_candles("AUDNZDOTC", "1m", SAMPLE_CANDLES)
    ts = ds.get_last_candle_timestamp("AUDNZDOTC", "1m")
    assert ts == 1120.0
```

### 3.3 Phase 1 Verification Checklist

```bash
# Run unit tests
conda run -n QuFLX-v2 python -m pytest backend/tests/test_data_store.py -v

# Expected: all tests pass
# Verify file structure
python -c "from backend.utils.data_store import get_candle_path, get_session_path; print(get_candle_path('AUDNZDOTC', '1m')); print(get_session_path())"
```

**Phase 1 complete when:** All unit tests pass. @Reviewer signs off.

---

## 4. Phase 2 — History Route Refactor (Core Bug Fix)

**Executor:** @Coder  
**Effort:** 3-4 hours  
**Risk:** Medium — modifies the primary history loading endpoint  
**Reviewer gate:** @Reviewer must sign off before Phase 3 begins  
**Prerequisite:** Phase 1 complete

### 4.1 Modify: `backend/services/gateway/routes/history.py`

#### 4.1.1 Updated Imports

```python
# REPLACE the existing import block at the top of history.py with:

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse

from backend.utils.data_store import (
    read_candles,
    upsert_candles,
    get_candle_path,
    generate_session_id,
    log_session,
    timeframe_to_str,
)
from backend.utils.asset_utils import normalize_asset
from backend.models.errors import (
    HistoryErrorCode,
    HistoryErrorResponse,
    HistorySuccessResponse,
    create_error_response,
)

router = APIRouter()
logger = logging.getLogger("gateway.history")
```

#### 4.1.2 Refactored `get_history()` Route

```python
@router.get("/{asset}")
async def get_history(asset: str, timeframe: int = 1, limit: int = 200):
    """
    Fetch historical candle data for a specific asset and timeframe.
    Reads from data/supabase_migration_data/candles/{ASSET}_{TF}.csv.
    O(1) — single file read, no globbing.
    """
    asset = normalize_asset(asset)
    tf_str = timeframe_to_str(timeframe)

    logger.info(f"HISTORY GET: {asset} @ {tf_str} (limit={limit})")

    csv_path = get_candle_path(asset, tf_str)
    if not csv_path.exists():
        logger.warning(f"HISTORY GET: no file found for {asset} @ {tf_str}")
        raise HTTPException(
            status_code=404,
            detail=f"No history found for {asset} @ {tf_str}"
        )

    candles = read_candles(asset, tf_str, limit=limit)
    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No history found for {asset} @ {tf_str}"
        )

    # Inject timeframe field if missing (backward compat with frontend)
    for c in candles:
        if "timeframe" not in c:
            c["timeframe"] = tf_str

    return {
        "ok": True,
        "asset": asset,
        "timeframe": timeframe,
        "count": len(candles),
        "candles": candles,
        "data": candles,  # backward compat alias
        "file_path": csv_path.name,
        "file": csv_path.name,
    }
```

#### 4.1.3 Refactored `bootstrap_history()` Route — In-Process (No Subprocess)

```python
@router.post("/bootstrap-history")
async def bootstrap_history(payload: Dict[str, Any] = Body(...)):
    """
    Collect initial history for an asset using HistoryCollector in-process.

    REFACTORED: No longer spawns a subprocess. Uses asyncio.to_thread() to run
    HistoryCollector synchronously in a thread pool — same pattern as OPT-1
    in indicators.py. Eliminates Chrome performance log contention.

    If the collector service is not running (no Chrome connection), returns a
    structured 503 error with a user-facing warning message.
    """
    asset = payload.get("asset")
    if not isinstance(asset, str) or not asset.strip():
        return _json_error(HistoryErrorCode.INVALID_ASSET, "asset required")

    asset = normalize_asset(asset)

    # ── Parse timeframe ───────────────────────────────────────────────────────
    timeframe = payload.get("timeframe", "1m")
    timeframe_min = _parse_timeframe_minutes(timeframe)
    if timeframe_min is None:
        return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, f"invalid timeframe: {timeframe}")
    if timeframe_min == 0:
        return _json_error(HistoryErrorCode.UNSUPPORTED_TIMEFRAME, f"unsupported timeframe: {timeframe}")

    tf_str = timeframe_to_str(timeframe_min)

    # ── Parse duration ────────────────────────────────────────────────────────
    duration_raw = payload.get("duration", 3)
    try:
        duration_s = float(duration_raw)
    except Exception:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_raw}")
    if duration_s < 0.5:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"duration too short: {duration_s}")

    session_id = generate_session_id()
    started_at = datetime.now(timezone.utc).isoformat()
    t_start = time.monotonic()

    logger.info(f"BOOTSTRAP: {asset} @ {tf_str} duration={duration_s}s session={session_id}")

    def _run_collector() -> Dict[str, Any]:
        """
        Synchronous collector execution — runs in thread pool via asyncio.to_thread().
        Returns a dict with keys: ok, candles, error, error_code.
        """
        try:
            from capabilities_v2.history_collector import HistoryCollector
            from capabilities_v2.base import Ctx
        except ImportError as e:
            return {"ok": False, "error": f"Import failed: {e}", "error_code": "collector_not_running"}

        # Attempt to get the shared Chrome driver from the collector service
        # If the collector is not running, driver will be None → structured error
        driver = _get_shared_driver()

        if driver is None:
            return {
                "ok": False,
                "error": (
                    "Chrome is not connected. Start the stream collector first, "
                    "then click the asset in Pocket Option to load history."
                ),
                "error_code": "chrome_not_connected",
            }

        ctx = Ctx(driver=driver, debug=False, dry_run=False, verbose=False)
        collector = HistoryCollector()
        result = collector.run(ctx, {
            "action": "collect_and_save",
            "asset": asset,
            "timeframe": timeframe_min,
            "duration": duration_s,
        })

        if not result.ok:
            return {
                "ok": False,
                "error": result.error or "History collection failed",
                "error_code": result.error_code or "unknown_error",
            }

        candles = (result.data or {}).get("candles") or []
        return {"ok": True, "candles": candles}

    try:
        result = await asyncio.to_thread(_run_collector)
    except Exception as e:
        logger.error(f"BOOTSTRAP: thread execution failed: {e}", exc_info=True)
        return _json_error(
            HistoryErrorCode.UNKNOWN_ERROR,
            f"Bootstrap failed: {type(e).__name__}: {str(e)}",
            details={"asset": asset, "timeframe": timeframe_min},
        )

    duration_ms = int((time.monotonic() - t_start) * 1000)

    if not result.get("ok"):
        error_code_str = result.get("error_code", "unknown_error")
        error_msg = result.get("error", "History collection failed")

        try:
            error_code = HistoryErrorCode(error_code_str)
        except ValueError:
            error_code = HistoryErrorCode.UNKNOWN_ERROR

        # Log failed session
        try:
            log_session({
                "session_id": session_id,
                "asset": asset,
                "timeframe": tf_str,
                "source": "history_capture",
                "started_at": started_at,
                "candle_count": 0,
                "status": "failed",
                "error_code": error_code_str,
                "duration_ms": duration_ms,
            })
        except Exception as log_err:
            logger.warning(f"BOOTSTRAP: failed to log session: {log_err}")

        logger.error(f"BOOTSTRAP FAILED: {error_msg} (code: {error_code_str})")
        return _json_error(
            error_code,
            error_msg,
            details={"asset": asset, "timeframe": timeframe_min, "duration": duration_s},
        )

    candles = result.get("candles") or []

    # Persist to new data store
    if candles:
        try:
            upsert_candles(asset, tf_str, candles, session_id=session_id, source="history_capture")
        except Exception as e:
            logger.error(f"BOOTSTRAP: failed to persist candles: {e}", exc_info=True)
            # Don't fail the request — candles are still returned in-memory

    # Log successful session
    try:
        log_session({
            "session_id": session_id,
            "asset": asset,
            "timeframe": tf_str,
            "source": "history_capture",
            "started_at": started_at,
            "candle_count": len(candles),
            "status": "complete",
            "duration_ms": duration_ms,
        })
    except Exception as log_err:
        logger.warning(f"BOOTSTRAP: failed to log session: {log_err}")

    logger.info(f"BOOTSTRAP SUCCESS: {asset} @ {tf_str} → {len(candles)} candles in {duration_ms}ms")

    return {
        "ok": True,
        "asset": asset,
        "timeframe": timeframe_min,
        "candles": candles,
        "session_id": session_id,
        "collection_time_ms": duration_ms,
    }
```

#### 4.1.4 Refactored `append_candle()` Route

```python
@router.post("/append-candle")
async def append_candle(payload: Dict[str, Any] = Body(...)):
    """
    Append or update a single candle in the canonical data store.
    Uses upsert semantics — same timestamp updates, new timestamp appends.
    """
    asset = payload.get("asset")
    timeframe = payload.get("timeframe", 1)
    candle = payload.get("candle")

    if not asset or not candle:
        raise HTTPException(status_code=400, detail="asset and candle required")

    asset = normalize_asset(asset)
    timeframe_min = _parse_timeframe_minutes(timeframe)
    if not timeframe_min:
        raise HTTPException(status_code=400, detail=f"invalid timeframe: {timeframe}")

    tf_str = timeframe_to_str(timeframe_min)

    try:
        count = upsert_candles(asset, tf_str, [candle], source="tick_aggregation")
        return {"status": "success", "asset": asset, "timeframe": tf_str, "total_rows": count}
    except Exception as e:
        logger.error(f"append_candle failed for {asset}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

#### 4.1.5 Helper Functions to Add

```python
# ── Private helpers ───────────────────────────────────────────────────────────

def _error_status_for_code(code: HistoryErrorCode) -> int:
    if code in {HistoryErrorCode.INVALID_ASSET, HistoryErrorCode.INVALID_TIMEFRAME,
                HistoryErrorCode.INVALID_DURATION, HistoryErrorCode.UNSUPPORTED_TIMEFRAME}:
        return 400
    if code in {HistoryErrorCode.CHROME_NOT_CONNECTED, HistoryErrorCode.COLLECTOR_NOT_RUNNING}:
        return 503
    if code in {HistoryErrorCode.MANUAL_CLICK_TIMEOUT, HistoryErrorCode.MANUAL_CLICK_NOT_DETECTED,
                HistoryErrorCode.CAPABILITY_TIMEOUT}:
        return 504
    return 500


def _json_error(
    code: HistoryErrorCode,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    resp = create_error_response(error_code=code, error_message=message, details=details)
    return JSONResponse(status_code=_error_status_for_code(code), content=resp.model_dump())


def _parse_timeframe_minutes(timeframe: Any) -> Optional[int]:
    """Parse timeframe value to integer minutes. Returns None on error, 0 for unsupported."""
    if isinstance(timeframe, int):
        return max(1, timeframe)
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            return 0
        if tf.endswith("s"):
            return 0  # seconds not supported
        if tf.endswith("m"):
            try:
                return max(1, int(tf[:-1]))
            except ValueError:
                return None
        if tf.endswith("h"):
            try:
                return max(1, int(tf[:-1]) * 60)
            except ValueError:
                return None
        if tf.isdigit():
            return max(1, int(tf))
    return None


def _get_shared_driver():
    """
    Attempt to retrieve the shared Chrome WebDriver from the collector service.
    Returns None if the collector is not running or Chrome is not connected.

    This avoids creating a new Selenium session (which would cause Chrome
    performance log contention with the running collector).
    """
    try:
        from backend.services.collector.connection import ChromeConnectionManager
        mgr = ChromeConnectionManager()
        # ChromeConnectionManager.connect() returns existing driver if already connected
        driver = mgr.connect()
        return driver
    except Exception as e:
        logger.warning(f"_get_shared_driver: could not get shared driver: {e}")
        return None
```

### 4.2 Phase 2 Verification Checklist

```bash
# 1. Import smoke test
conda run -n QuFLX-v2 python -c "from backend.services.gateway.routes.history import router; print('Import OK')"

# 2. Backend regression suite
conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short

# 3. Manual API test (gateway must be running)
curl -X GET "http://localhost:8000/api/v1/history/AUDNZDOTC?timeframe=1&limit=10"
# Expected: 404 (no data yet) or 200 with candles if data exists

curl -X POST "http://localhost:8000/api/v1/history/bootstrap-history" \
  -H "Content-Type: application/json" \
  -d '{"asset": "AUDNZDOTC", "timeframe": "1m", "duration": 3}'
# Expected: 503 if Chrome not running, or 200 with candles if Chrome is connected
```

**Phase 2 complete when:** Import smoke test passes, regression suite passes, @Reviewer signs off.

---

## 5. Phase 3 — Update All Backend Consumers

**Executor:** @Coder  
**Effort:** 2-3 hours  
**Risk:** Low-Medium — each consumer is a targeted 1-3 line change  
**Reviewer gate:** @Reviewer must sign off before Phase 4 begins  
**Prerequisite:** Phase 2 complete

### 5.1 Modify: `backend/services/gateway/routes/indicators.py`

**Change:** Replace `get_recent_history_file()` with `get_candle_path()` from `data_store`.

```python
# FIND (line ~20):
from backend.utils.history_utils import get_recent_history_file

# REPLACE WITH:
from backend.utils.data_store import get_candle_path, timeframe_to_str

# FIND (in calculate_indicators route, ~line 195):
csv_path = get_recent_history_file(asset, timeframe_min)
if not csv_path:
    raise HTTPException(
        status_code=404,
        detail=f"History not found for {asset} @ {timeframe_min}m",
    )

# REPLACE WITH:
tf_str = timeframe_to_str(timeframe_min)
csv_path = get_candle_path(asset, tf_str)
if not csv_path.exists():
    raise HTTPException(
        status_code=404,
        detail=f"History not found for {asset} @ {tf_str}",
    )
```

**Note:** The `_df_cache` key uses `str(csv_path)` — this remains valid since `get_candle_path()` returns a deterministic `Path`. No cache logic changes needed.

### 5.2 Modify: `backend/services/gateway/routes/ai.py`

**Change:** Replace `get_recent_history_file()` with `get_candle_path()` in `_inject_backend_indicators()`.

```python
# FIND (in _inject_backend_indicators, ~line 155):
from backend.utils.history_utils import get_recent_history_file
...
csv_path = get_recent_history_file(asset, tf_min)
logger.info('Backend indicator injection: history file lookup for %s %dm -> %s', asset, tf_min, csv_path)
if not csv_path:
    logger.warning('Backend indicator injection: no history file found for %s %dm', asset, tf_min)
    return

# REPLACE WITH:
from backend.utils.data_store import get_candle_path, timeframe_to_str
...
tf_str = timeframe_to_str(tf_min)
csv_path = get_candle_path(asset, tf_str)
logger.info('Backend indicator injection: history file lookup for %s %s -> %s', asset, tf_str, csv_path)
if not csv_path.exists():
    logger.warning('Backend indicator injection: no history file found for %s %s', asset, tf_str)
    return
```

**Note:** The `_inject_backend_indicators` function still uses the subprocess pattern for indicator calculation. This is a separate concern (Finding 8 in the report) and is **not** in scope for this plan. It is noted for a future optimization sprint.

### 5.3 Modify: `backend/services/gateway/routes/strategy.py`

**Change:** Replace `get_recent_history_file()` with `get_candle_path()` in `load_from_history()`.

```python
# FIND (in load_from_history route):
from backend.utils.history_utils import get_recent_history_file

# Get most recent history file
history_file = get_recent_history_file(asset)

if history_file is None:
    raise HTTPException(status_code=404, detail=f"No history found for {asset}")

# REPLACE WITH:
from backend.utils.data_store import get_candle_path

# Default to 1m timeframe for strategy lab history loading
history_file = get_candle_path(asset, "1m")

if not history_file.exists():
    raise HTTPException(status_code=404, detail=f"No history found for {asset}")
```

### 5.4 Modify: `backend/services/collector/main.py`

**Change:** Replace `persist_history_csv()` with `upsert_candles()` in `_process_history_events()`.

```python
# FIND (top of file, ~line 10):
from backend.utils.history_utils import persist_history_csv

# REPLACE WITH:
from backend.utils.data_store import upsert_candles, timeframe_to_str, generate_session_id

# FIND (in _process_history_events, ~line 130):
try:
    persist_history_csv(asset, timeframe_min, candles_out)
except Exception as e:
    logger.error(f"Failed to persist history for {asset}: {e}")

# REPLACE WITH:
try:
    tf_str = timeframe_to_str(timeframe_min)
    upsert_candles(
        asset,
        tf_str,
        candles_out,
        session_id=generate_session_id(),
        source="collector_intercept",
    )
except Exception as e:
    logger.error(f"Failed to persist history for {asset}: {e}", exc_info=True)
```

### 5.5 Modify: `capabilities_v2/history_collector.py`

**Change:** Replace `_save_csv()` to use `upsert_candles()` from `data_store`.

```python
# FIND (in HistoryCollector class):
def _save_csv(self, asset: str, timeframe: Any, candles: List[Candle], output_root: Optional[str]) -> str:
    base_dir = Path(output_root).resolve() if output_root else self._project_root()
    
    asset_clean = self._normalize_asset(asset)
    asset_type = "otc" if "otc" in asset.lower() else "fx"
    asset_base = normalize_asset(asset.split("(")[0])
    tf_str = str(timeframe).lower().strip()
    if tf_str.isdigit():
        tf_str = f"{tf_str}m"
    now_ts = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    filename = f"{asset_base}_{asset_type}_{tf_str}_{now_ts}.csv"
    save_dir = base_dir / "data" / "data_output" / "history" / asset_clean
    save_dir.mkdir(parents=True, exist_ok=True)
    filepath = save_dir / filename

    with filepath.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for c in candles:
            writer.writerow(c.to_csv_row())

    return str(filepath)

# REPLACE WITH:
def _save_csv(self, asset: str, timeframe: Any, candles: List[Candle], output_root: Optional[str]) -> str:
    """
    Persist candles to the canonical data store.
    output_root is ignored — all data goes to data/supabase_migration_data/.
    Returns the canonical CSV path as a string for backward compatibility.
    """
    from backend.utils.data_store import upsert_candles, get_candle_path, timeframe_to_str

    tf_str = str(timeframe).lower().strip()
    if tf_str.isdigit():
        tf_str = f"{tf_str}m"

    candles_dicts = [
        {
            "timestamp": c.timestamp,
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in candles
    ]

    try:
        upsert_candles(asset, tf_str, candles_dicts, source="history_capture")
    except Exception as e:
        logger.error(f"_save_csv: upsert failed for {asset} {tf_str}: {e}", exc_info=True)

    return str(get_candle_path(asset, tf_str))
```

### 5.6 Phase 3 Verification Checklist

```bash
# Import smoke tests for all modified modules
conda run -n QuFLX-v2 python -c "
from backend.services.gateway.routes.indicators import router; print('indicators OK')
from backend.services.gateway.routes.ai import router; print('ai OK')
from backend.services.gateway.routes.strategy import router; print('strategy OK')
from backend.services.collector.main import CollectorService; print('collector OK')
from capabilities_v2.history_collector import HistoryCollector; print('history_collector OK')
"

# Full regression suite
conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short
```

**Phase 3 complete when:** All import smoke tests pass, regression suite passes, @Reviewer signs off.

---

## 6. Phase 4 — Deprecate Old Utilities

**Executor:** @Coder  
**Effort:** 30 minutes  
**Risk:** Very Low — thin wrappers only, no logic changes  
**Reviewer gate:** @Reviewer must sign off before Phase 5 begins  
**Prerequisite:** Phase 3 complete

### 6.1 Modify: `backend/utils/history_utils.py`

Replace the three core functions with thin deprecation wrappers that redirect to `data_store`. This preserves backward compatibility for any code that was missed in Phase 3.

```python
# REPLACE the entire content of history_utils.py with:

"""
backend/utils/history_utils.py
==============================
DEPRECATED — Thin compatibility wrappers around backend.utils.data_store.

These functions are retained for backward compatibility during the transition
period. All new code should import directly from backend.utils.data_store.

Removal target: After all consumers have been updated to use data_store directly.
"""

import logging
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DEPRECATION_MSG = (
    "{func} is deprecated. Use backend.utils.data_store.{replacement} instead."
)


def persist_history_csv(asset: str, timeframe_min: int, candles: List[Dict[str, Any]]) -> None:
    """
    DEPRECATED. Use data_store.upsert_candles() instead.
    Redirects to data_store.upsert_candles() with source='history_capture'.
    """
    warnings.warn(
        _DEPRECATION_MSG.format(func="persist_history_csv", replacement="upsert_candles"),
        DeprecationWarning,
        stacklevel=2,
    )
    from backend.utils.data_store import upsert_candles, timeframe_to_str
    tf_str = timeframe_to_str(timeframe_min)
    try:
        upsert_candles(asset, tf_str, candles, source="history_capture")
    except Exception as e:
        logger.error(f"persist_history_csv (deprecated wrapper): {e}", exc_info=True)


def get_recent_history_file(asset: str, timeframe_min: int = 1) -> Optional[Path]:
    """
    DEPRECATED. Use data_store.get_candle_path() instead.
    Returns the canonical candle CSV path if it exists, else None.
    """
    warnings.warn(
        _DEPRECATION_MSG.format(func="get_recent_history_file", replacement="get_candle_path"),
        DeprecationWarning,
        stacklevel=2,
    )
    from backend.utils.data_store import get_candle_path, timeframe_to_str
    tf_str = timeframe_to_str(timeframe_min)
    path = get_candle_path(asset, tf_str)
    return path if path.exists() else None


def append_candle_to_history(asset: str, timeframe_min: int, candle: Dict[str, Any]) -> bool:
    """
    DEPRECATED. Use data_store.upsert_candles() instead.
    Redirects to data_store.upsert_candles() with source='tick_aggregation'.
    Returns True on success, False on failure.
    """
    warnings.warn(
        _DEPRECATION_MSG.format(func="append_candle_to_history", replacement="upsert_candles"),
        DeprecationWarning,
        stacklevel=2,
    )
    from backend.utils.data_store import upsert_candles, timeframe_to_str
    tf_str = timeframe_to_str(timeframe_min)
    try:
        upsert_candles(asset, tf_str, [candle], source="tick_aggregation")
        return True
    except Exception as e:
        logger.error(f"append_candle_to_history (deprecated wrapper): {e}", exc_info=True)
        return False
```

### 6.2 Phase 4 Verification Checklist

```bash
# Verify deprecation warnings fire correctly
conda run -n QuFLX-v2 python -W all -c "
import warnings
warnings.simplefilter('always', DeprecationWarning)
from backend.utils.history_utils import get_recent_history_file
result = get_recent_history_file('AUDNZDOTC', 1)
print('Wrapper returned:', result)
"
# Expected: DeprecationWarning printed, no crash

# Full regression suite
conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short
```

**Phase 4 complete when:** Deprecation warnings fire, regression suite passes, @Reviewer signs off.

---

## 7. Phase 5 — Frontend Chart Persistence & Stabilization

**Executor:** @Coder  
**Effort:** 2-3 hours  
**Risk:** Medium — modifies core state management  
**Reviewer gate:** @Reviewer must sign off before Phase 6 begins  
**Prerequisite:** Phase 4 complete

### 7.1 Modify: `gui/Dashboard/src/store/marketStore.js`

#### 7.1.1 Chart Persistence — Preserve `historyCandles` on Asset Switch

**Problem:** `setSelectedAsset()` currently clears `marketData: {}` which is correct, but it also triggers `loadHistory()` unconditionally, even when `historyCandles[asset]` already has data.

**Fix:** Add an early-return guard in `loadHistory()` and a cache-hit path in `setSelectedAsset()`.

```javascript
// FIND in setSelectedAsset():
set({
  selectedAsset: asset,
  selectedAssetKey: nextAssetKey,
  selectedAssetLoading: true,
  marketData: {} // Clear old data immediately
});

const { settings } = (await import('./settingsStore')).default.getState();
const dataSourceMode = settings.analysis?.dataSourceMode || 'history_and_streaming';

if (dataSourceMode !== 'streaming_only') {
  try {
    await get().loadHistory(asset);
  } catch (err) {
    console.error('Failed to load history:', err);
    set({ lastError: `Failed to load history: ${getErrorMessage(err)}` });
  }
}

// REPLACE WITH:
set({
  selectedAsset: asset,
  selectedAssetKey: nextAssetKey,
  selectedAssetLoading: true,
  marketData: {} // Clear live ticks only — historyCandles cache is preserved
});

const { settings } = (await import('./settingsStore')).default.getState();
const dataSourceMode = settings.analysis?.dataSourceMode || 'history_and_streaming';

if (dataSourceMode !== 'streaming_only') {
  // Chart persistence: check if we already have cached candles for this asset
  const { historyCandles, historyStatus } = get();
  const cachedCandles = historyCandles && historyCandles[asset];
  const cachedStatus = historyStatus && historyStatus[asset];
  const hasCachedData = Array.isArray(cachedCandles) && cachedCandles.length > 0 && cachedStatus === 'loaded';

  if (hasCachedData) {
    // Cache hit — render immediately, no backend call needed
    console.log(`[SetSelectedAsset] ✓ Cache hit for ${asset} (${cachedCandles.length} candles) — skipping bootstrap`);
    // historyCandles[asset] is already set — useTickAggregation will pick it up
  } else {
    // Cache miss — load from backend (GET first, then bootstrap if needed)
    try {
      await get().loadHistory(asset);
    } catch (err) {
      console.error('Failed to load history:', err);
      set({ lastError: `Failed to load history: ${getErrorMessage(err)}` });
    }
  }
}
```

#### 7.1.2 Retry Logic with Exponential Backoff in `loadHistory()`

```javascript
// FIND at the top of loadHistory():
loadHistory: async (asset) => {
  if (!asset) return;

  set((state) => ({
    historyStatus: {
      ...state.historyStatus,
      [asset]: 'loading'
    }
  }));

// REPLACE WITH:
loadHistory: async (asset, _retryCount = 0) => {
  if (!asset) return;

  // Early return if already loaded (prevents duplicate calls)
  const { historyStatus, historyCandles } = get();
  const currentStatus = historyStatus && historyStatus[asset];
  const currentCandles = historyCandles && historyCandles[asset];
  if (currentStatus === 'loaded' && Array.isArray(currentCandles) && currentCandles.length > 0) {
    console.log(`[LoadHistory] ✓ Already loaded for ${asset} — skipping`);
    return;
  }

  set((state) => ({
    historyStatus: {
      ...state.historyStatus,
      [asset]: 'loading'
    }
  }));
```

```javascript
// FIND at the end of loadHistory() catch block:
  } catch (err) {
    console.error('[LoadHistory] Failed to load history:', err);

    set((state) => ({
      historyCandles: { ...state.historyCandles, [asset]: [] },
      historyStatus: { ...state.historyStatus, [asset]: 'error' },
      lastError: err.message || 'Failed to load history data'
    }));

    // Re-throw for upstream error handling
    throw err;
  }
},

// REPLACE WITH:
  } catch (err) {
    console.error('[LoadHistory] Failed to load history:', err);

    const MAX_RETRIES = 2;
    if (_retryCount < MAX_RETRIES) {
      const delayMs = Math.pow(2, _retryCount) * 1000; // 1s, 2s
      console.log(`[LoadHistory] Retrying in ${delayMs}ms (attempt ${_retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return get().loadHistory(asset, _retryCount + 1);
    }

    set((state) => ({
      historyCandles: { ...state.historyCandles, [asset]: [] },
      historyStatus: { ...state.historyStatus, [asset]: 'error' },
      lastError: err.message || 'Failed to load history data'
    }));

    // Re-throw for upstream error handling
    throw err;
  }
},
```

#### 7.1.3 Add `clearHistoryCache()` Action

```javascript
// ADD to createMarketSlice (after historyStatus: {}):
clearHistoryCache: (asset) => {
  if (asset) {
    // Clear cache for a specific asset
    set((state) => ({
      historyCandles: { ...state.historyCandles, [asset]: undefined },
      historyStatus: { ...state.historyStatus, [asset]: undefined },
    }));
  } else {
    // Clear entire history cache
    set({ historyCandles: {}, historyStatus: {} });
  }
},
```

### 7.2 Modify: `gui/Dashboard/src/hooks/useTickAggregation.js`

#### 7.2.1 Skip Chart Clear When Cached Data Exists

```javascript
// FIND the "Cleanup on Asset Change" useEffect:
// Cleanup on Asset Change
useEffect(() => {
  if (candleSeries) {
    console.log(`Asset changed to: ${selectedAsset}, clearing chart`);
    candleSeries.setData([]);
    if (volumeSeries) volumeSeries.setData([]); // Clear volume
    currentCandleRef.current = null;
    currentVolumeRef.current = 0;
    setIsLoading(true);
  }
}, [selectedAsset, candleSeries, volumeSeries]);

// REPLACE WITH:
// Cleanup on Asset Change
useEffect(() => {
  if (candleSeries) {
    // Chart persistence: only clear if we don't have cached data for this asset
    const hasCachedData = Array.isArray(historyCandles?.[selectedAsset]) &&
                          historyCandles[selectedAsset].length > 0 &&
                          historyStatus?.[selectedAsset] === 'loaded';

    if (hasCachedData) {
      // Cached data exists — don't clear, let the history load effect re-render it
      console.log(`Asset changed to: ${selectedAsset}, using cached data (${historyCandles[selectedAsset].length} candles)`);
      currentCandleRef.current = null;
      currentVolumeRef.current = 0;
      // isLoading stays false — chart will re-render from cache immediately
    } else {
      // No cache — clear chart and show loading state
      console.log(`Asset changed to: ${selectedAsset}, clearing chart (no cache)`);
      candleSeries.setData([]);
      if (volumeSeries) volumeSeries.setData([]);
      currentCandleRef.current = null;
      currentVolumeRef.current = 0;
      setIsLoading(true);
    }
  }
}, [selectedAsset, candleSeries, volumeSeries]);
```

#### 7.2.2 Improve Safety Timeout Message

```javascript
// FIND the safety timeout useEffect:
useEffect(() => {
  let timeoutId;
  if (isLoading) {
    timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn('History load timeout - forcing isLoading(false)');
        setIsLoading(false);
      }
    }, 10000);
  }
  return () => clearTimeout(timeoutId);
}, [isLoading]);

// REPLACE WITH:
useEffect(() => {
  let timeoutId;
  if (isLoading) {
    timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn(
          '[useTickAggregation] History load timeout after 10s. ' +
          'Possible causes: Chrome not connected, collector not running, ' +
          'or asset not clicked in Pocket Option.'
        );
        setIsLoading(false);
        // Notify parent component via onError if provided
        if (onError) {
          onError(
            'History load timed out. Ensure Chrome is running and click the asset in Pocket Option, then try again.'
          );
        }
      }
    }, 10000);
  }
  return () => clearTimeout(timeoutId);
}, [isLoading, onError]);
```

### 7.3 Phase 5 Verification Checklist

```
Manual UI tests (with frontend running):
1. Load asset A → chart renders with candles ✓
2. Switch to asset B → chart clears and loads B ✓
3. Switch back to asset A → chart renders IMMEDIATELY from cache (no backend call) ✓
4. Verify browser console: "[SetSelectedAsset] ✓ Cache hit for {asset}" logged ✓
5. Disconnect Chrome → attempt bootstrap → 503 error with user-friendly message ✓
6. Verify retry: if bootstrap fails, it retries up to 2 times with backoff ✓
```

**Phase 5 complete when:** All manual UI tests pass, @Reviewer signs off.

---

## 8. Phase 6 — Verification & Hardening

**Executor:** @Tester + @Reviewer  
**Effort:** 1-2 hours  
**Risk:** None — read-only verification  
**Prerequisite:** All previous phases complete

### 8.1 Backend Regression Suite

```bash
conda run -n QuFLX-v2 python -m pytest backend/tests/ -q --tb=short
# Expected: all tests pass (127+ tests)
```

### 8.2 Data Store Unit Tests

```bash
conda run -n QuFLX-v2 python -m pytest backend/tests/test_data_store.py -v
# Expected: all 18+ tests pass
```

### 8.3 Integration Verification Script

```python
# Save as: backend/tests/verify_data_store_integration.py
"""
Integration verification for the data store refactor.
Run with: conda run -n QuFLX-v2 python backend/tests/verify_data_store_integration.py
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.utils.data_store import (
    upsert_candles, read_candles, get_candle_path,
    get_last_candle_timestamp, log_session, generate_session_id,
    timeframe_to_str, timeframe_str_to_minutes,
)

ASSET = "TESTASSET"
TF = "1m"

print("=== Data Store Integration Verification ===\n")

# 1. Timeframe conversion
assert timeframe_to_str(1) == "1m", "FAIL: timeframe_to_str(1)"
assert timeframe_to_str(60) == "1h", "FAIL: timeframe_to_str(60)"
assert timeframe_str_to_minutes("1h") == 60, "FAIL: timeframe_str_to_minutes('1h')"
print("✓ Timeframe conversion")

# 2. Path resolution
path = get_candle_path(ASSET, TF)
assert path.name == f"{ASSET}_{TF}.csv", f"FAIL: path name {path.name}"
print(f"✓ Path resolution: {path}")

# 3. Upsert candles
candles = [
    {"timestamp": 1000, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "volume": 10},
    {"timestamp": 1060, "open": 1.15, "high": 1.25, "low": 1.1, "close": 1.20, "volume": 8},
]
count = upsert_candles(ASSET, TF, candles, session_id="sess_verify", source="test")
assert count == 2, f"FAIL: upsert count {count}"
print(f"✓ Upsert candles: {count} rows")

# 4. Read candles
result = read_candles(ASSET, TF, limit=200)
assert len(result) == 2, f"FAIL: read count {len(result)}"
assert result[0]["timestamp"] == 1000, "FAIL: sort order"
print(f"✓ Read candles: {len(result)} rows, ascending order")

# 5. Upsert deduplication
count2 = upsert_candles(ASSET, TF, candles)
assert count2 == 2, f"FAIL: dedup count {count2}"
print(f"✓ Deduplication: still {count2} rows after re-upsert")

# 6. Last candle timestamp
ts = get_last_candle_timestamp(ASSET, TF)
assert ts == 1060.0, f"FAIL: last ts {ts}"
print(f"✓ Last candle timestamp: {ts}")

# 7. Session logging
sid = generate_session_id()
assert sid.startswith("sess_"), f"FAIL: session_id format {sid}"
log_session({
    "session_id": sid,
    "asset": ASSET,
    "timeframe": TF,
    "source": "test",
    "candle_count": 2,
    "status": "complete",
})
print(f"✓ Session logged: {sid}")

# 8. Cleanup
path.unlink(missing_ok=True)
print("\n=== All checks passed ✓ ===")
```

### 8.4 Multi-Asset Sequential Loading Test

```
Manual test sequence:
1. Start gateway + collector
2. Load AUDNZDOTC → verify candles appear in data/supabase_migration_data/candles/AUDNZDOTC_1m.csv
3. Load EURUSDOTC → verify separate file EURUSDOTC_1m.csv created
4. Switch back to AUDNZDOTC → verify cache hit (no new file write)
5. Check sessions.jsonl → verify 2 session records
```

### 8.5 Timeframe Coverage Test

```
For each timeframe [1m, 5m, 15m, 30m, 1h]:
1. Set timeframe in dashboard
2. Load history for AUDNZDOTC
3. Verify file: data/supabase_migration_data/candles/AUDNZDOTC_{tf}.csv exists
4. Verify candles are sorted ascending
```

### 8.6 Final Multi-Agent Review (Per PHASE_REVIEW_PROTOCOL.md)

When all phases are marked complete, @Team_Leader must delegate:

| Agent | Focus |
|-------|-------|
| @Reviewer | Overall correctness, alignment with report, CORE_PRINCIPLES compliance |
| @Debugger | Runtime behavior, edge cases, silent failures |
| @Optimizer | Performance, unnecessary complexity, cache efficiency |
| @Code_Simplifier | Duplication, readability, function length |

---

## 9. Files Touched Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/utils/data_store.py` | **Single Source of Truth** — all data path resolution + read/write |
| `backend/tests/test_data_store.py` | Unit tests for data_store (18+ tests) |
| `backend/tests/verify_data_store_integration.py` | Integration verification script |
| `data/supabase_migration_data/_metadata/schema_version.json` | Schema version metadata |

### Modified Files

| File | Phase | Change Summary |
|------|-------|----------------|
| `backend/utils/history_utils.py` | 4 | Replace with thin deprecation wrappers → `data_store` |
| `backend/services/gateway/routes/history.py` | 2 | In-process bootstrap, `data_store` read/write, session logging |
| `backend/services/gateway/routes/indicators.py` | 3 | `get_candle_path()` replaces `get_recent_history_file()` |
| `backend/services/gateway/routes/ai.py` | 3 | `get_candle_path()` replaces `get_recent_history_file()` |
| `backend/services/gateway/routes/strategy.py` | 3 | `get_candle_path()` replaces `get_recent_history_file()` |
| `backend/services/collector/main.py` | 3 | `upsert_candles()` replaces `persist_history_csv()` |
| `capabilities_v2/history_collector.py` | 3 | `_save_csv()` redirects to `upsert_candles()` |
| `gui/Dashboard/src/store/marketStore.js` | 5 | Chart persistence cache, retry logic, `clearHistoryCache()` |
| `gui/Dashboard/src/hooks/useTickAggregation.js` | 5 | Skip chart clear on cache hit, improved timeout message |

### Untouched Files

| File | Reason |
|------|--------|
| `backend/utils/asset_utils.py` | Already canonical — `normalize_asset()` used by `data_store` |
| `backend/models/errors.py` | Error codes remain valid |
| `gui/Dashboard/src/utils/chartData.js` | `prepareChartData()` is format-agnostic |
| `gui/Dashboard/src/utils/time.js` | `normalizeTimestamp()` unchanged |
| `gui/Dashboard/src/components/ChartWorkspace.jsx` | No changes needed |
| `gui/Dashboard/src/components/ChartWorkspaceOverlays.jsx` | Loading overlay unchanged |
| `backend/scripts/otc_alert_dispatch.py` | Uses `get_recent_history_file()` via `history_utils` wrapper (Phase 4 covers this via deprecation wrapper; direct migration is a follow-up) |

---

## 10. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Indicator cache key changes | HIGH | LOW | `get_candle_path()` returns same `Path` type; `str(csv_path)` cache key unchanged |
| Collector disruption during Phase 3 | HIGH | LOW | `history_utils.py` wrappers remain active until Phase 4; collector continues working |
| In-process bootstrap Chrome contention | MEDIUM | LOW | `_get_shared_driver()` reuses existing connection; no new Selenium session |
| `_get_shared_driver()` returns None | MEDIUM | MEDIUM | Returns structured 503 with user-facing message; user is informed to start stream first |
| Data loss during transition | LOW | VERY LOW | Old data already backed up by user; new store starts fresh |
| Frontend cache memory growth | LOW | LOW | `historyCandles` limited to ~200 candles per asset; typical session has <20 assets |
| Multi-timeframe file naming collision | LOW | VERY LOW | Deterministic naming: `{ASSET}_{TF}.csv` — no timestamp in filename |
| `upsert_candles` partial write | LOW | LOW | Atomic write via temp file + rename; partial writes leave `.tmp` file, not corrupt CSV |

---

## 11. CORE_PRINCIPLES Compliance Map

| Principle | How This Plan Complies |
|-----------|----------------------|
| **1. Functional Simplicity** | One `data_store.py` module replaces 3 scattered functions + 190+ files. O(1) reads replace O(n) glob+sort. |
| **2. Sequential Logic** | Each phase builds on the previous. Phase 1 (data layer) must exist before Phase 2 (routes) can use it. |
| **3. Incremental Testing** | Unit tests in Phase 1, import smoke tests after each phase, regression suite after every phase. |
| **4. Zero Assumptions** | `_get_shared_driver()` returns `None` if Chrome not connected — never assumes it is. Explicit 503 response. |
| **5. Code Integrity** | `history_utils.py` wrappers preserve backward compatibility. No breaking changes until Phase 4. |
| **6. Separation of Concerns** | `data_store.py` = storage only. `history.py` = routing only. `history_collector.py` = capture only. |
| **7. Stop Patching, Start Rewriting** | The subprocess architecture is replaced entirely (not patched). `_save_csv()` is rewritten, not extended. |
| **8. Defensive Error Handling** | `upsert_candles()` uses atomic write (temp+rename). All errors logged with `exc_info=True`. No silent failures. |
| **9. Fail Fast** | `upsert_candles()` validates inputs at entry. `timeframe_to_str()` raises `ValueError` on invalid input. |

---

## 12. Phase Review Protocol

Per `.clinerules/PHASE_REVIEW_PROTOCOL.md`, the following sequence is **mandatory** after each phase:

```
1. @Coder completes phase implementation
2. @Team_Leader delegates: "Phase X completed. Perform full incremental review."
3. @Reviewer conducts line-by-line review:
   - Readability, security (OWASP), maintainability
   - Separation of concerns
   - Fail-fast validation
   - Explicit error handling (no silent failures)
   - Regression suite pass
4. @Reviewer reports: ✅ Passed / ⚠️ Minor issues / 🔴 Blocking issues
5. @Reviewer ends with: "Review complete. Awaiting explicit command to proceed."
6. User issues explicit command: "Proceed with Phase X+1" or "Approved – continue"
```

### Phase Status Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Directory Bootstrap | `[x]` Complete |
| Phase 1 | Data Layer Foundation (`data_store.py`) | `[x]` Complete |
| Phase 2 | History Route Refactor | `[x]` Complete |
| Phase 3 | Update All Backend Consumers | `[x]` Complete |
| Phase 4 | Deprecate Old Utilities | `[x]` Complete |
| Phase 5 | Frontend Chart Persistence | `[x]` Complete |
| Phase 6 | Verification & Hardening | `[x]` Complete |

---

*Plan compiled by @Investigator + @Architect. Implementation completed by @Coder and closed after final review.*  
*Refactor task closed on 2026-04-05.*
