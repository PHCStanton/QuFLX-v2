from __future__ import annotations

import csv
import logging
import re
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .base import Capability, Ctx, CapResult
except ImportError:
    import os as _os
    import sys as _sys
    root_dir = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), ".."))
    if root_dir not in _sys.path:
        _sys.path.insert(0, root_dir)
    from capabilities_v2.base import Capability, Ctx, CapResult

from backend.utils.asset_utils import normalize_asset
from backend.utils.data_store import upsert_candles, generate_session_id, log_session

logger = logging.getLogger(__name__)


@dataclass
class Candle:
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    def to_csv_row(self) -> List[Any]:
        return [self.timestamp, self.open, self.high, self.low, self.close, self.volume]

    def to_ohlc(self, asset: str, timeframe: Any) -> Dict[str, Any]:
        tf_str = str(timeframe).lower().strip()
        if tf_str.isdigit():
            tf_str = f"{tf_str}m"
            
        return {
            "timestamp": float(self.timestamp),
            "asset": asset,
            "timeframe": tf_str,
            "open": float(self.open),
            "high": float(self.high),
            "low": float(self.low),
            "close": float(self.close),
            "volume": int(float(self.volume)),
        }


class HistoryCollector(Capability):
    id = "history_collector"
    kind = "data_processing"

    def _normalize_asset(self, asset: str) -> str:
        return normalize_asset(asset)

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        action = inputs.get("action", "save")
        asset = inputs.get("asset")
        if not asset:
            return CapResult(ok=False, error="asset required")

        output_root = inputs.get("output_root")
        output_root_str = str(output_root) if output_root is not None else None

        timeframe_raw = inputs.get("timeframe")
        try:
            timeframe_min = self._parse_timeframe_minutes(timeframe_raw)
        except ValueError as exc:
            return CapResult(ok=False, error=str(exc), error_code="unsupported_timeframe")

        if action == "collect":
            duration_s = float(inputs.get("duration", 0))
            return self._collect_only(ctx, asset, duration_s, timeframe_min)

        if action == "collect_and_save":
            duration_s = float(inputs.get("duration", 10))
            return self._collect_and_save(ctx, asset, duration_s, timeframe_min, output_root_str)

        raw_candles = inputs.get("candles")
        if not raw_candles:
            return CapResult(ok=False, error="candles required")

        candles = self._parse_candles(ctx, raw_candles)
        if not candles:
            return CapResult(ok=False, error="no valid candles parsed")

        candles.sort(key=lambda c: c.timestamp)
        detected_tf = self._detect_timeframe_minutes(candles)
        tf = timeframe_min if timeframe_min is not None else detected_tf

        filepath = self._save_csv(asset, tf, candles, output_root_str)
        return CapResult(ok=True, data={"filepath": filepath, "count": len(candles), "timeframe": tf})

    def _collect_only(
        self,
        ctx: Ctx,
        asset: str,
        duration_s: float,
        timeframe_min: Optional[int],
    ) -> CapResult:
        if ctx.driver is None:
            return CapResult(ok=False, error="ctx.driver required")

        try:
            from backend.services.collector.interceptor import WebSocketInterceptor
        except Exception as e:
            return CapResult(ok=False, error=f"failed to import WebSocketInterceptor: {type(e).__name__}")

        interceptor = WebSocketInterceptor(ctx.driver)
        target = self._normalize_asset(asset)

        # Poll data store first to see if background collector updated it
        from backend.utils.data_store import read_candles
        tf_str = f"{timeframe_min or 1}m"
        baseline_candles = read_candles(target, tf_str)
        baseline_sig = (len(baseline_candles), max([c.get("timestamp", 0) for c in baseline_candles]) if baseline_candles else None)

        history_candles: List[Candle] = []
        wait_time = max(3.0, float(duration_s)) if duration_s > 0 else 3.0
        history_deadline = time.time() + wait_time
        while time.time() < history_deadline:
            # Poll data store first
            current_candles = read_candles(target, tf_str)
            current_sig = (len(current_candles), max([c.get("timestamp", 0) for c in current_candles]) if current_candles else None)
            if current_candles and current_sig != baseline_sig:
                logger.info("HistoryCollector: Detected data store update from background collector.")
                history_candles = [Candle(
                    timestamp=float(c["timestamp"]),
                    open=float(c["open"]),
                    high=float(c["high"]),
                    low=float(c["low"]),
                    close=float(c["close"]),
                    volume=float(c.get("volume", 0.0))
                ) for c in current_candles]
                break

            events = interceptor.fetch_history_events()
            if events:
                logger.info(f"HistoryCollector: Checking {len(events)} events for {asset}...")
            for ev in events:
                # Resilient Asset Matching (Fuzzy)
                # 1. Check explicit fields
                ev_asset = ev.get("asset") or ev.get("symbol") or ev.get("active")
                
                # 2. Check nested candle fields
                if not ev_asset and "candles" in ev and ev["candles"]:
                    first_candle = ev["candles"][0]
                    if isinstance(first_candle, dict):
                        ev_asset = first_candle.get("asset") or first_candle.get("symbol")
                
                # 3. Fuzzy Match Logic
                is_match = False
                if ev_asset:
                    norm_ev_asset = normalize_asset(ev_asset)
                    if norm_ev_asset == target:
                        is_match = True
                else:
                    # 4. Deep Search: If no explicit asset field, check if target is anywhere in the raw event string
                    # This is the "functional backup" logic for catching payloads with missing fields
                    ev_str = str(ev).upper()
                    if target in ev_str:
                        logger.info(f"HistoryCollector: Fuzzy match found for {target} in event payload")
                        is_match = True
                    elif target.endswith("OTC") and target[:-3] in ev_str and "OTC" in ev_str:
                        logger.info(f"HistoryCollector: Split fuzzy match found for {target} in event payload")
                        is_match = True

                if is_match:
                    history_candles = self._parse_history_payload(ctx, ev, timeframe_min or 1)
                    if history_candles:
                        logger.info(f"HistoryCollector: SUCCESS! Captured {len(history_candles)} history candles for {asset}")
                        break
                elif ev_asset:
                    logger.info(f"HistoryCollector: ignoring event for {ev_asset} (target: {asset}/{target})")
                
            if history_candles:
                break
            time.sleep(0.5)

        deadline = time.time() + max(0.0, float(duration_s))
        ticks: List[Any] = []
        while time.time() < deadline:
            for t in interceptor.fetch_ticks():
                if getattr(t, "asset", None) == target:
                    ticks.append(t)
            time.sleep(0.25)

        tf = timeframe_min if timeframe_min is not None else 1
        tick_candles = self._aggregate_ticks_to_candles(ticks, tf)

        merged_map = {c.timestamp: c for c in history_candles}
        for c in tick_candles:
            if c.timestamp in merged_map:
                existing = merged_map[c.timestamp]
                existing.high = max(existing.high, c.high)
                existing.low = min(existing.low, c.low)
                existing.close = c.close
                existing.volume += c.volume
            else:
                merged_map[c.timestamp] = c

        final_candles = list(merged_map.values())
        final_candles.sort(key=lambda c: c.timestamp)

        if not final_candles:
            err = f"no data collected for {asset} (history_captured={len(history_candles)}, ticks_captured={len(ticks)})"
            logger.error(err)
            return CapResult(ok=False, error=err)

        candles_ohlc = [c.to_ohlc(asset=asset, timeframe=tf) for c in final_candles]
        return CapResult(ok=True, data={"asset": asset, "timeframe": tf, "count": len(candles_ohlc), "candles": candles_ohlc})

    def _collect_and_save(
        self,
        ctx: Ctx,
        asset: str,
        duration_s: float,
        timeframe_min: Optional[int],
        output_root: Optional[str],
    ) -> CapResult:
        if ctx.driver is None:
            return CapResult(
                ok=False, 
                error="Chrome browser not connected",
                error_code="chrome_not_connected"
            )

        try:
            from backend.services.collector.interceptor import WebSocketInterceptor
        except Exception as e:
            return CapResult(
                ok=False, 
                error=f"Failed to import WebSocketInterceptor: {type(e).__name__}",
                error_code="collector_not_running"
            )

        interceptor = WebSocketInterceptor(ctx.driver)
        target = self._normalize_asset(asset)

        history_candles: List[Candle] = []
        wait_time = max(3.0, float(duration_s)) if duration_s > 0 else 3.0
        history_deadline = time.time() + wait_time
        
        logger.info(f"Waiting for history data for {asset} (timeout: {wait_time}s)...")

        from backend.utils.data_store import read_candles
        tf_str = f"{timeframe_min or 1}m"
        baseline_candles = read_candles(target, tf_str)
        baseline_sig = (len(baseline_candles), max([c.get("timestamp", 0) for c in baseline_candles]) if baseline_candles else None)

        while time.time() < history_deadline:
            current_candles = read_candles(target, tf_str)
            current_sig = (len(current_candles), max([c.get("timestamp", 0) for c in current_candles]) if current_candles else None)
            if current_candles and current_sig != baseline_sig:
                logger.info("HistoryCollector: Detected data store update from background collector.")
                history_candles = [Candle(
                    timestamp=float(c["timestamp"]),
                    open=float(c["open"]),
                    high=float(c["high"]),
                    low=float(c["low"]),
                    close=float(c["close"]),
                    volume=float(c.get("volume", 0.0))
                ) for c in current_candles]
                break

            events = interceptor.fetch_history_events()
            if events:
                logger.info(f"HistoryCollector: Checking {len(events)} events for {asset}...")
            for ev in events:
                ev_asset = ev.get("asset") or ev.get("symbol") or ev.get("active")
                
                if not ev_asset and "candles" in ev and ev["candles"]:
                    first_candle = ev["candles"][0]
                    if isinstance(first_candle, dict):
                        ev_asset = first_candle.get("asset") or first_candle.get("symbol")
                
                is_match = False
                if ev_asset:
                    norm_ev_asset = normalize_asset(ev_asset)
                    if norm_ev_asset == target:
                        is_match = True
                else:
                    ev_str = str(ev).upper()
                    if target in ev_str:
                        logger.info(f"HistoryCollector: Fuzzy match found for {target} in event payload")
                        is_match = True
                    elif target.endswith("OTC") and target[:-3] in ev_str and "OTC" in ev_str:
                        logger.info(f"HistoryCollector: Split fuzzy match found for {target} in event payload")
                        is_match = True

                if is_match:
                    history_candles = self._parse_history_payload(ctx, ev, timeframe_min or 1)
                    if history_candles:
                        logger.info(f"HistoryCollector: SUCCESS! Captured {len(history_candles)} historical candles for {asset}.")
                        break
                elif ev_asset:
                    logger.info(f"HistoryCollector: ignoring event for {ev_asset} (target: {asset}/{target})")
            if history_candles:
                break
            time.sleep(0.5)

        if history_candles:
            tick_duration = min(2.0, float(duration_s)) if duration_s > 0 else 0.0
            logger.info(f"History captured ({len(history_candles)} candles), collecting ticks for {tick_duration}s only")
        else:
            tick_duration = max(1.0, float(duration_s))
            logger.info(f"No history captured, collecting ticks for full {tick_duration}s")
        
        deadline = time.time() + tick_duration
        ticks: List[Any] = []
        while time.time() < deadline:
            for t in interceptor.fetch_ticks():
                if getattr(t, "asset", None) == target:
                    ticks.append(t)
            time.sleep(0.25)

        tf = timeframe_min if timeframe_min is not None else 1
        tick_candles = self._aggregate_ticks_to_candles(ticks, tf)
        
        merged_map = {c.timestamp: c for c in history_candles}
        for c in tick_candles:
            if c.timestamp in merged_map:
                existing = merged_map[c.timestamp]
                existing.high = max(existing.high, c.high)
                existing.low = min(existing.low, c.low)
                existing.close = c.close
                existing.volume += c.volume
            else:
                merged_map[c.timestamp] = c
                
        final_candles = list(merged_map.values())
        final_candles.sort(key=lambda c: c.timestamp)
        
        if not final_candles:
            if not history_candles and not ticks:
                error_code = "manual_click_timeout"
                error_msg = f"No history data received for {asset} within {wait_time}s. Manual click may not have been detected."
            elif not history_candles:
                error_code = "no_history_data_received"
                error_msg = f"No history payload captured for {asset}, though {len(ticks)} ticks were collected."
            else:
                error_code = "history_payload_empty"
                error_msg = f"History data captured but no valid candles could be parsed for {asset}."
            
            return CapResult(
                ok=False, 
                error=error_msg,
                error_code=error_code
            )

        filepath = self._save_csv(asset, tf, final_candles, output_root)
        candles_ohlc = [c.to_ohlc(asset=asset, timeframe=tf) for c in final_candles]
        
        return CapResult(
            ok=True, 
            data={
                "filepath": filepath, 
                "count": len(final_candles), 
                "timeframe": tf,
                "candles": candles_ohlc,
                "asset": asset
            }
        )

    def _parse_history_payload(self, ctx: Ctx, data: Dict[str, Any], timeframe_min: int) -> List[Candle]:
        candles = []
        
        if 'candles' in data and data['candles']:
            raw_list = data['candles']
            candles = self._parse_candles(ctx, raw_list)

        elif 'history' in data and data['history']:
            points = data['history']
            bucket_s = timeframe_min * 60
            buckets: Dict[int, Candle] = {}
            
            for item in points:
                if len(item) < 2: continue
                ts = float(item[0])
                price = float(item[1])
                
                if ts < 1000000000:
                    continue

                bucket_start = int(ts // bucket_s) * bucket_s
                
                if bucket_start not in buckets:
                    buckets[bucket_start] = Candle(bucket_start, price, price, price, price, 1.0)
                else:
                    c = buckets[bucket_start]
                    c.high = max(c.high, price)
                    c.low = min(c.low, price)
                    c.close = price
            
            candles = list(buckets.values())

        return candles

    def _aggregate_ticks_to_candles(self, ticks: List[Any], timeframe_min: int) -> List[Candle]:
        bucket_s = max(1, int(timeframe_min)) * 60
        buckets: Dict[int, Candle] = {}
        for t in ticks:
            ts = float(getattr(t, "timestamp"))
            price = float(getattr(t, "price"))
            bucket_start = int(ts // bucket_s) * bucket_s
            c = buckets.get(bucket_start)
            if c is None:
                buckets[bucket_start] = Candle(
                    timestamp=float(bucket_start),
                    open=price,
                    high=price,
                    low=price,
                    close=price,
                    volume=1.0,
                )
                continue
            c.high = max(c.high, price)
            c.low = min(c.low, price)
            c.close = price
            c.volume += 1.0
        return list(buckets.values())

    def _parse_candles(self, ctx: Ctx, raw_candles: Any) -> List[Candle]:
        candles: List[Candle] = []
        for c in raw_candles:
            try:
                if isinstance(c, dict):
                    ts = float(c.get("timestamp"))
                    if ts < 1000000000:
                        continue
                    candles.append(
                        Candle(
                            timestamp=ts,
                            open=float(c.get("open")),
                            high=float(c.get("high")),
                            low=float(c.get("low")),
                            close=float(c.get("close")),
                            volume=float(c.get("volume", 0.0)),
                        )
                    )
                    continue

                if isinstance(c, (list, tuple)):
                    ts = float(c[0])
                    if ts < 1000000000:
                        continue
                    if len(c) == 5:
                        # Format [ts, open, close, high, low]
                        candles.append(
                            Candle(
                                timestamp=ts,
                                open=float(c[1]),
                                high=float(c[3]),
                                low=float(c[4]),
                                close=float(c[2]),
                                volume=0.0,
                            )
                        )
                        continue
                    if len(c) >= 6:
                        # Format [ts, open, close, high, low, volume]
                        candles.append(
                            Candle(
                                timestamp=ts,
                                open=float(c[1]),
                                high=float(c[3]),
                                close=float(c[2]),
                                low=float(c[4]),
                                volume=float(c[5]),
                            )
                        )
                        continue
            except Exception:
                logger.debug(f"Failed to parse candle: {c}")
                continue

        return candles

    def _detect_timeframe_minutes(self, candles: List[Candle]) -> int:
        if len(candles) < 2:
            return 1

        diffs_s: List[int] = []
        for i in range(1, min(len(candles), 200)):
            diff = candles[i].timestamp - candles[i - 1].timestamp
            if diff > 0:
                diffs_s.append(int(round(diff)))

        if not diffs_s:
            return 1

        rounded = [max(60, int(round(d / 60.0)) * 60) for d in diffs_s]
        seconds = Counter(rounded).most_common(1)[0][0]
        return max(1, int(seconds // 60))

    def _project_root(self) -> Path:
        return Path(__file__).resolve().parents[1]

    def _save_csv(self, asset: str, timeframe: Any, candles: List[Candle], output_root: Optional[str]) -> str:
        asset_clean = self._normalize_asset(asset)
        tf_str = str(timeframe).lower().strip()
        if tf_str.isdigit():
            tf_str = f"{tf_str}m"
            
        candles_dicts = []
        for c in candles:
            candles_dicts.append({
                "timestamp": float(c.timestamp),
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": float(c.volume)
            })
            
        session_id = generate_session_id()
        
        log_data = {
            "session_id": session_id,
            "asset": asset_clean,
            "timeframe": tf_str,
            "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "candle_count": len(candles_dicts),
            "source": "history_capture_subprocess",
            "status": "complete"
        }
        log_session(log_data)
        
        upsert_candles(
            asset=asset_clean,
            timeframe_str=tf_str,
            candles=candles_dicts,
            session_id=session_id,
            source="history_capture_subprocess"
        )
        
        from backend.utils.data_store import get_candle_path
        return str(get_candle_path(asset_clean, tf_str))

    def _parse_timeframe_minutes(self, timeframe: Any) -> Optional[int]:
        if timeframe is None:
            return None
        tf_str = str(timeframe).lower().strip()
        if tf_str == "ticks":
            raise ValueError(f"unsupported timeframe: {timeframe}")
        if tf_lower := tf_str:
            if tf_lower.endswith("s"):
                raise ValueError(f"unsupported timeframe: {timeframe}")
            if tf_lower.endswith("m"):
                try: return int(tf_lower[:-1])
                except: pass
            if tf_lower.endswith("h"):
                try: return int(tf_lower[:-1]) * 60
                except: pass
        try:
            return max(1, int(timeframe))
        except Exception:
            return None


if __name__ == "__main__":
    import argparse
    import json as _json
    import sys as _sys
    from pathlib import Path as _Path

    parser = argparse.ArgumentParser(description="HistoryCollector test harness")
    parser.add_argument("--asset", required=True, help="Asset label as shown in PocketOption")
    parser.add_argument("--timeframe", default="1m", help="Timeframe, e.g. 1m")
    parser.add_argument("--duration", type=float, default=0, help="Extra seconds to collect ticks")
    args = parser.parse_args()

    ctx = None
    driver = None
    try:
        import qf
        ok, _res = qf.attach_chrome_session(port=9222, verbose=True)
        if ok:
            ctx = qf.ctx
            driver = qf.driver
    except Exception:
        ctx = None

    if ctx is None:
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            opts = Options()
            opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
            driver = webdriver.Chrome(options=opts)
            artifacts_root = str(_Path(__file__).resolve().parents[1] / "data" / "artifacts")
            ctx = Ctx(driver=driver, artifacts_root=artifacts_root, debug=True, dry_run=False, verbose=True)
            logger.info(f"Attached to Chrome session for HistoryCollector test: {getattr(driver, 'current_url', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to attach to Chrome session for HistoryCollector test: {e}")
            raise SystemExit(1)

    cap = HistoryCollector()
    inputs = {
        "action": "collect_and_save",
        "asset": args.asset,
        "timeframe": args.timeframe,
        "duration": args.duration,
    }
    result = cap.run(ctx, inputs)
    _out = {
        "ok": result.ok,
        "error": result.error,
        "data": result.data,
    }
    print(_json.dumps(_out, indent=2))
    _sys.exit(0 if result.ok else 1)
