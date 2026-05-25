import os
import sys
import json
import asyncio
import logging
import pandas as pd
import subprocess
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from .common import parse_script_json
from backend.utils.history_utils import get_recent_history_file, append_candle_to_history
from backend.utils.data_store import read_candles, upsert_candles
from backend.utils.asset_utils import normalize_asset
from backend.models.errors import (
    HistoryErrorCode, 
    HistoryErrorResponse, 
    HistorySuccessResponse,
    create_error_response
)

router = APIRouter()
logger = logging.getLogger("gateway.history")


def _parse_timeframe_minutes(value: int | str, *, route_name: str) -> int:
    if isinstance(value, int):
        return max(1, int(value))

    tf = str(value).strip().lower()
    if not tf:
        raise HTTPException(status_code=400, detail=f"{route_name}: timeframe required")
    if tf == "ticks" or tf.endswith("s"):
        raise HTTPException(status_code=400, detail=f"{route_name}: unsupported timeframe: {value}")
    if tf.endswith("m"):
        raw = tf[:-1]
        if not raw.isdigit():
            raise HTTPException(status_code=400, detail=f"{route_name}: invalid timeframe: {value}")
        return max(1, int(raw))
    if tf.endswith("h"):
        raw = tf[:-1]
        if not raw.isdigit():
            raise HTTPException(status_code=400, detail=f"{route_name}: invalid timeframe: {value}")
        return max(1, int(raw) * 60)
    if tf.isdigit():
        return max(1, int(tf))
    raise HTTPException(status_code=400, detail=f"{route_name}: invalid timeframe: {value}")


def _error_status_for_code(code: HistoryErrorCode) -> int:
    if code in {HistoryErrorCode.INVALID_ASSET, HistoryErrorCode.INVALID_TIMEFRAME, HistoryErrorCode.INVALID_DURATION, HistoryErrorCode.UNSUPPORTED_TIMEFRAME}:
        return 400
    if code in {HistoryErrorCode.CHROME_NOT_CONNECTED, HistoryErrorCode.COLLECTOR_NOT_RUNNING}:
        return 503
    if code in {HistoryErrorCode.MANUAL_CLICK_TIMEOUT, HistoryErrorCode.MANUAL_CLICK_NOT_DETECTED, HistoryErrorCode.CAPABILITY_TIMEOUT}:
        return 504
    if code in {HistoryErrorCode.SUBPROCESS_SPAWN_FAILED, HistoryErrorCode.FILE_WRITE_FAILED}:
        return 500
    return 500


def _json_error(code: HistoryErrorCode, message: str, details: Dict[str, Any] | None = None) -> JSONResponse:
    resp = create_error_response(error_code=code, error_message=message, details=details)
    return JSONResponse(status_code=_error_status_for_code(code), content=resp.model_dump())


def _history_signature(candles: List[Dict[str, Any]]) -> Tuple[int, Optional[float]]:
    if not candles:
        return (0, None)

    latest_ts: Optional[float] = None
    for candle in candles:
        ts = candle.get("timestamp", candle.get("time"))
        if ts is None:
            continue
        try:
            ts_val = float(ts)
        except (TypeError, ValueError):
            continue
        if latest_ts is None or ts_val > latest_ts:
            latest_ts = ts_val

    return (len(candles), latest_ts)


async def _select_asset_in_ui(asset: str) -> Dict[str, Any]:
    script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../asset_control.py"))
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        script_path,
        "--action",
        "select_asset",
        "--asset",
        asset,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await process.communicate()
    stdout_str = stdout.decode().strip()
    stderr_str = stderr.decode().strip()

    if process.returncode != 0:
        raise RuntimeError(stderr_str or stdout_str or "asset selection process failed")

    output_json = parse_script_json(stdout_str)
    if not output_json.get("ok"):
        raise RuntimeError(str(output_json.get("error") or "asset selection failed"))

    return output_json


async def _run_history_collector_capability(asset: str, timeframe_str: str, duration_s: float) -> Dict[str, Any]:
    runner_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py")
    )
    
    run_inputs = {
        "action": "collect_and_save",
        "asset": asset,
        "timeframe": timeframe_str,
        "duration": duration_s
    }
    
    args = [
        sys.executable,
        runner_path,
        "history_collector",
        "--inputs",
        json.dumps(run_inputs),
    ]

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await process.communicate()
    return {
        "return_code": process.returncode,
        "stdout": (stdout or b"").decode(errors="replace").strip(),
        "stderr": (stderr or b"").decode(errors="replace").strip(),
    }


async def _poll_for_fresh_candles(
    asset: str,
    timeframe_str: str,
    *,
    baseline_signature: Tuple[int, Optional[float]],
    timeout_s: float,
    limit: int = 100,
    poll_interval_s: float = 0.25,
) -> List[Dict[str, Any]]:
    deadline = asyncio.get_running_loop().time() + timeout_s
    while True:
        candles = await asyncio.to_thread(read_candles, asset, timeframe_str, limit)
        current_signature = _history_signature(candles)
        if candles and current_signature != baseline_signature:
            return candles

        if asyncio.get_running_loop().time() >= deadline:
            return []

        await asyncio.sleep(poll_interval_s)


def _map_bootstrap_selection_error(message: str) -> HistoryErrorCode:
    msg = (message or "").lower()
    if "not found" in msg or "invalid asset" in msg:
        return HistoryErrorCode.INVALID_ASSET
    if "chrome" in msg or "connect" in msg or "session" in msg:
        return HistoryErrorCode.CHROME_NOT_CONNECTED
    return HistoryErrorCode.UNKNOWN_ERROR


def _decorate_history_rows(candles: List[Dict[str, Any]], timeframe_str: str) -> List[Dict[str, Any]]:
    for row in candles:
        if "timeframe" not in row:
            row["timeframe"] = timeframe_str
    return candles

@router.get("/{asset}")
async def get_history(asset: str, timeframe: int = 1, num_candles: int = 100, limit: Optional[int] = None):
    """
    Fetch historical candle data for a specific asset and timeframe from local CSV.
    """
    asset = normalize_asset(asset)
    if not asset:
        raise HTTPException(status_code=400, detail="invalid asset")

    timeframe_min = _parse_timeframe_minutes(timeframe, route_name="get_history")
    target_tf_str = f"{timeframe_min}m"
    logger.info(f"HISTORY: Fetching history for asset={asset}, timeframe={timeframe_min}")
    
    target_limit = limit if limit is not None else num_candles

    try:
        candles = read_candles(asset, target_tf_str, limit=target_limit)
        
        if not candles:
            # Fallback to old utility if new store is empty (backward compatibility during transition)
            csv_path = get_recent_history_file(asset, timeframe_min)
            if not csv_path:
                logger.warning(f"HISTORY: No history file found for {asset} @ {timeframe_min}m")
                raise HTTPException(status_code=404, detail=f"No history found for {asset} @ {timeframe_min}m")
                
            df = pd.read_csv(csv_path)
            if not df.empty:
                # df.tail() gets OLD data in old CSVs because they are reverse-sorted
                rows = df.head(target_limit).to_dict("records")
                for r in rows:
                    if "timeframe" not in r:
                        r["timeframe"] = target_tf_str
                candles = list(rows)
            file_name = csv_path.name
        else:
            file_name = f"{asset}_{target_tf_str}.csv"
            for r in candles:
                if "timeframe" not in r:
                    r["timeframe"] = target_tf_str

        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe_min,
            "count": len(candles),
            "candles": candles,
            "data": candles,
            "file_path": file_name,
            "file": file_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading history for {asset}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bootstrap-history")
async def bootstrap_history(payload: Dict[str, Any] = Body(...)):
    """
    Trigger asset selection in Pocket Option UI, then poll the collector-owned
    CSV/data-store path until fresh history appears.
    """
    asset = payload.get("asset")
    if not isinstance(asset, str) or not asset.strip():
        return _json_error(HistoryErrorCode.INVALID_ASSET, "asset required")
    asset_norm = normalize_asset(asset)
    if not asset_norm:
        return _json_error(HistoryErrorCode.INVALID_ASSET, f"invalid asset: {asset}")

    timeframe = payload.get("timeframe", "1m")
    try:
        timeframe_min = _parse_timeframe_minutes(timeframe, route_name="bootstrap_history")
    except HTTPException as exc:
        detail = str(exc.detail)
        if "unsupported timeframe" in detail:
            return _json_error(HistoryErrorCode.UNSUPPORTED_TIMEFRAME, detail)
        return _json_error(HistoryErrorCode.INVALID_TIMEFRAME, detail)

    # In Manual Mode, we increase the duration to give the user time to click
    # We'll wait up to 3 seconds for the payload to appear
    duration_raw = payload.get("duration", 3)
    try:
        duration_s = float(duration_raw)
    except Exception:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_raw}")

    if duration_s < 0.5:
        return _json_error(HistoryErrorCode.INVALID_DURATION, f"invalid duration: {duration_s}")

    timeframe_str = f"{timeframe_min}m"
    num_candles = payload.get("num_candles", 100)

    try:
        baseline_candles = await asyncio.to_thread(read_candles, asset_norm, timeframe_str, num_candles)
        baseline_signature = _history_signature(baseline_candles)

        started_at = asyncio.get_running_loop().time()
        logger.info(
            "BOOTSTRAP: selecting asset=%s timeframe=%s and polling collector-owned store",
            asset_norm,
            timeframe_str,
        )

        selection_error_msg: Optional[str] = None
        selection_error_code: Optional[HistoryErrorCode] = None
        try:
            await _select_asset_in_ui(asset)
        except Exception as exc:
            selection_error_msg = f"asset selection failed for {asset_norm}: {exc}"
            selection_error_code = _map_bootstrap_selection_error(str(exc))
            logger.warning(
                "Bootstrap asset selection failed; continuing to poll collector-owned store: %s",
                selection_error_msg,
            )

        candles = await _poll_for_fresh_candles(
            asset_norm,
            timeframe_str,
            baseline_signature=baseline_signature,
            timeout_s=duration_s,
            limit=num_candles,
        )
        if not candles:
            logger.info("BOOTSTRAP: CSV not updated by background collector. Triggering on-demand collection fallback via runner.")
            try:
                proc_result = await _run_history_collector_capability(
                    asset=asset_norm,
                    timeframe_str=timeframe_str,
                    duration_s=max(5.0, duration_s)
                )
                if proc_result.get("return_code") == 0:
                    logger.info("BOOTSTRAP: On-demand collection fallback succeeded. Reading candles again.")
                    candles = await asyncio.to_thread(read_candles, asset_norm, timeframe_str, num_candles)
                else:
                    logger.error("BOOTSTRAP: On-demand collection fallback failed: %s", proc_result.get("stderr"))
            except Exception as fallback_exc:
                logger.error("BOOTSTRAP: Exception during on-demand collection fallback: %s", fallback_exc, exc_info=True)

        if not candles:
            if selection_error_msg and selection_error_code:
                logger.error(
                    "Bootstrap history failed after asset selection error and no fresh candles: %s",
                    selection_error_msg,
                )
                return _json_error(
                    selection_error_code,
                    selection_error_msg,
                    details={
                        "asset": asset_norm,
                        "timeframe": timeframe_min,
                        "duration": duration_s,
                    },
                )
            logger.error(
                "Bootstrap history timed out waiting for collector-owned history update: asset=%s timeframe=%s baseline=%s",
                asset_norm,
                timeframe_str,
                baseline_signature,
            )
            return _json_error(
                HistoryErrorCode.CAPABILITY_TIMEOUT,
                f"Timed out waiting for fresh history for {asset_norm} @ {timeframe_str}",
                details={"asset": asset_norm, "timeframe": timeframe_min, "duration": duration_s},
            )

        candles = _decorate_history_rows(candles, timeframe_str)
        collection_time_ms = int((asyncio.get_running_loop().time() - started_at) * 1000)

        return {
            "ok": True,
            "asset": asset_norm,
            "timeframe": timeframe_min,
            "candles": candles,
            "file_path": f"{asset_norm}_{timeframe_str}.csv",
            "collection_time_ms": collection_time_ms,
        }

    except Exception as e:
        logger.error(f"Bootstrap history failed: {type(e).__name__}: {e}", exc_info=True)
        return _json_error(
            HistoryErrorCode.UNKNOWN_ERROR,
            f"Bootstrap failed: {type(e).__name__}: {str(e)}",
            details={"asset": asset_norm, "timeframe": timeframe_min},
        )

@router.post("/append-candle")
async def append_candle(payload: Dict[str, Any] = Body(...)):
    """
    Append a newly formed candle to the history data store.
    Used for live streaming data persistence.
    """
    asset = payload.get("asset")
    timeframe = payload.get("timeframe", 1)
    candle = payload.get("candle")

    if not asset or not candle:
        raise HTTPException(status_code=400, detail="asset and candle required")

    # Handle timeframe string if needed
    timeframe_min = 1
    if isinstance(timeframe, str):
        tf = timeframe.strip().lower()
        if tf == "ticks":
            raise HTTPException(status_code=400, detail="append-candle does not support 'ticks' timeframe")
        if tf.endswith("m"):
            try:
                timeframe_min = max(1, int(tf[:-1]))
            except Exception:
                timeframe_min = 1
        elif tf.endswith("h"):
            try:
                timeframe_min = max(1, int(tf[:-1]) * 60)
            except Exception:
                timeframe_min = 1
        elif tf.endswith("s"):
            raise HTTPException(status_code=400, detail=f"append-candle does not support seconds timeframe: {timeframe}")
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))
    else:
        timeframe_min = int(timeframe)

    norm_asset = normalize_asset(asset)
    tf_str = f"{timeframe_min}m"
    
    # Try new data store first
    try:
        written = upsert_candles(
            asset=norm_asset,
            timeframe_str=tf_str,
            candles=[candle],
            session_id="stream_append",
            source="tick_aggregation"
        )
        if written > 0:
            return {"status": "success", "asset": asset, "timeframe": timeframe_min, "store": "new"}
    except Exception as e:
        logger.error(f"Error appending candle via new data store: {e}")

    # Fallback to legacy
    success = append_candle_to_history(asset, timeframe_min, candle)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"No recent history file found for {asset} @ {timeframe_min}m to append to.")

    return {"status": "success", "asset": asset, "timeframe": timeframe_min, "store": "legacy"}


@router.delete("/{asset}")
async def delete_history(asset: str, timeframe: str | None = None):
    """
    Delete historical CSV data for an asset.
    If timeframe is provided, deletes only that timeframe.
    """
    try:
        from backend.utils.data_store import delete_candles
        
        timeframe_str = None
        if timeframe:
            tf_min = _parse_timeframe_minutes(timeframe, route_name="delete_history")
            timeframe_str = f"{tf_min}m"

        files_deleted = delete_candles(asset, timeframe_str)
        return {
            "ok": True,
            "asset": asset,
            "timeframe": timeframe,
            "files_deleted": files_deleted,
            "message": f"Successfully deleted {files_deleted} history cache file(s)"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete history for {asset}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/collect-history")
async def collect_history(payload: Dict[str, Any] = Body(default_factory=dict)):
    """
    Executes V2 capability: CollectHistory
    Iterates through high-payout assets to allow data collection in background.
    """
    try:
        runner_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py"))

        duration = int(payload.get("duration", 10))
        timeframe_min = _parse_timeframe_minutes(payload.get("timeframe", "1m"), route_name="collect_history")
        timeframe = f"{timeframe_min}m"

        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../data/data_output/logs"))
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, f"collect_history_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log")

        # Background process - we use Popen since it's a long-running collection
        # and we return the PID.
        log_f = open(log_path, "w", encoding="utf-8")
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        
        # Note: Popen is still used here because it's meant to be a detached background task
        # and we don't 'await' it to finish.
        import subprocess
        proc = subprocess.Popen(
            [
                sys.executable,
                runner_path,
                "collect_history",
                "--verbose",
                "--inputs",
                json.dumps({"duration": duration, "timeframe": timeframe}),
            ],
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env=env,
        )

        return {
            "status": "started", 
            "message": "History collection started in background", 
            "pid": proc.pid, 
            "log_path": log_path
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Collect history failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
