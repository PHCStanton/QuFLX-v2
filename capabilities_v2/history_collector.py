from __future__ import annotations

import csv
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
    from capabilities_v2.base import Capability, Ctx, CapResult


@dataclass
class Candle:
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    def to_csv_row(self) -> List[Any]:
        ts_str = datetime.fromtimestamp(self.timestamp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
        return [ts_str, self.open, self.high, self.low, self.close, self.volume]

    def to_ohlc(self, asset: str, timeframe_min: int) -> Dict[str, Any]:
        return {
            "timestamp": float(self.timestamp),
            "asset": asset,
            "timeframe": f"{int(timeframe_min)}m",
            "open": float(self.open),
            "high": float(self.high),
            "low": float(self.low),
            "close": float(self.close),
            "volume": int(float(self.volume)),
        }


class HistoryCollector(Capability):
    id = "history_collector"
    kind = "data_processing"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        action = inputs.get("action", "save")
        asset = inputs.get("asset")
        if not asset:
            return CapResult(ok=False, error="asset required")

        output_root = inputs.get("output_root")
        output_root_str = str(output_root) if output_root is not None else None

        timeframe_raw = inputs.get("timeframe")
        timeframe_min = self._parse_timeframe_minutes(timeframe_raw)

        if action == "collect":
            duration_s = int(inputs.get("duration", 0))
            return self._collect_only(ctx, asset, duration_s, timeframe_min)

        if action == "collect_and_save":
            duration_s = int(inputs.get("duration", 10))
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
        duration_s: int,
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

        history_candles: List[Candle] = []
        history_deadline = time.time() + 5
        while time.time() < history_deadline:
            events = interceptor.fetch_history_events()
            for ev in events:
                ev_asset = ev.get("asset")
                if not ev_asset and "candles" in ev and ev["candles"]:
                    if isinstance(ev["candles"][0], dict):
                        ev_asset = ev["candles"][0].get("asset")
                if ev_asset and self._normalize_asset(ev_asset) == target:
                    history_candles = self._parse_history_payload(ctx, ev, timeframe_min or 1)
                    if history_candles:
                        break
            if history_candles:
                break
            time.sleep(0.2)

        deadline = time.time() + max(0, duration_s)
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
            return CapResult(ok=False, error=f"no data collected for {asset}")

        candles_ohlc = [c.to_ohlc(asset=asset, timeframe_min=tf) for c in final_candles]
        return CapResult(ok=True, data={"asset": asset, "timeframe": tf, "count": len(candles_ohlc), "candles": candles_ohlc})

    def _collect_and_save(
        self,
        ctx: Ctx,
        asset: str,
        duration_s: int,
        timeframe_min: Optional[int],
        output_root: Optional[str],
    ) -> CapResult:
        if ctx.driver is None:
            return CapResult(ok=False, error="ctx.driver required")

        try:
            from backend.services.collector.interceptor import WebSocketInterceptor
        except Exception as e:
            return CapResult(ok=False, error=f"failed to import WebSocketInterceptor: {type(e).__name__}")

        interceptor = WebSocketInterceptor(ctx.driver)
        target = self._normalize_asset(asset)

        # 1. Attempt to capture initial history (approx 100 candles)
        history_candles: List[Candle] = []
        history_deadline = time.time() + 5  # Wait up to 5s for history load
        
        if ctx.verbose:
            print(f"Waiting for history data for {asset}...")

        while time.time() < history_deadline:
            events = interceptor.fetch_history_events()
            for ev in events:
                # Check asset match
                ev_asset = ev.get("asset")
                if not ev_asset and "candles" in ev and ev["candles"]:
                    if isinstance(ev["candles"][0], dict):
                        ev_asset = ev["candles"][0].get("asset")
                
                if not ev_asset:
                    # Fallback: assume it matches if it's the only one we see right after a click
                    # But safer to require match. Let's try flexible matching.
                    # If target is in the payload string maybe?
                    # For now, stick to explicit asset field.
                    pass

                if ev_asset and self._normalize_asset(ev_asset) == target:
                    history_candles = self._parse_history_payload(ctx, ev, timeframe_min or 1)
                    if history_candles:
                        if ctx.verbose:
                            print(f"Captured {len(history_candles)} historical candles.")
                        break
            if history_candles:
                break
            time.sleep(0.2)

        # 2. Collect real-time ticks
        deadline = time.time() + max(1, duration_s)
        ticks: List[Any] = []
        while time.time() < deadline:
            for t in interceptor.fetch_ticks():
                if getattr(t, "asset", None) == target:
                    ticks.append(t)
            time.sleep(0.25)

        # 3. Merge history and ticks
        tf = timeframe_min if timeframe_min is not None else 1
        
        # Convert ticks to candles
        tick_candles = self._aggregate_ticks_to_candles(ticks, tf)
        
        # Merge: simple dictionary merge by timestamp
        merged_map = {c.timestamp: c for c in history_candles}
        for c in tick_candles:
            if c.timestamp in merged_map:
                # Update existing (simple overwrite for now, or OHLC logic)
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
            return CapResult(ok=False, error=f"no data collected for {asset}")

        filepath = self._save_csv(asset, tf, final_candles, output_root)
        return CapResult(ok=True, data={"filepath": filepath, "count": len(final_candles), "timeframe": tf})

    def _parse_history_payload(self, ctx: Ctx, data: Dict[str, Any], timeframe_min: int) -> List[Candle]:
        candles = []
        
        # Case A: 'candles' list of dicts or lists
        if 'candles' in data and data['candles']:
            raw_list = data['candles']
            # V1 says reversed? "candles = list(reversed(data['candles']))"
            # Let's check timestamp order.
            # Usually latest is first or last.
            pass 
            # I'll reuse _parse_candles but need to be careful about format
            candles = self._parse_candles(ctx, raw_list)

        # Case B: 'history' list of [timestamp, price]
        elif 'history' in data and data['history']:
            # Reconstruct candles from price points
            # This requires grouping by timeframe
            points = data['history']
            bucket_s = timeframe_min * 60
            buckets: Dict[int, Candle] = {}
            
            for item in points:
                if len(item) < 2: continue
                ts = float(item[0])
                price = float(item[1])
                
                bucket_start = int(ts // bucket_s) * bucket_s
                
                if bucket_start not in buckets:
                    buckets[bucket_start] = Candle(bucket_start, price, price, price, price, 1.0)
                else:
                    c = buckets[bucket_start]
                    c.high = max(c.high, price)
                    c.low = min(c.low, price)
                    c.close = price # Assuming chronological order? 
                    # If not sorted, close might be wrong.
                    # V1 assumes: "for tstamp, value in data['history']" -> update close
                    # So yes, it updates close with every new point.
            
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
                    candles.append(
                        Candle(
                            timestamp=float(c.get("timestamp")),
                            open=float(c.get("open")),
                            high=float(c.get("high")),
                            low=float(c.get("low")),
                            close=float(c.get("close")),
                            volume=float(c.get("volume", 0.0)),
                        )
                    )
                    continue

                if isinstance(c, (list, tuple)):
                    if len(c) == 5:
                        candles.append(
                            Candle(
                                timestamp=float(c[0]),
                                open=float(c[1]),
                                high=float(c[3]),
                                low=float(c[4]),
                                close=float(c[2]),
                                volume=0.0,
                            )
                        )
                        continue
                    if len(c) >= 6:
                        candles.append(
                            Candle(
                                timestamp=float(c[0]),
                                open=float(c[1]),
                                high=float(c[2]),
                                low=float(c[3]),
                                close=float(c[4]),
                                volume=float(c[5]),
                            )
                        )
                        continue
            except Exception:
                if ctx.verbose:
                    print(f"Failed to parse candle: {c}")
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

    def _save_csv(self, asset: str, timeframe_min: int, candles: List[Candle], output_root: Optional[str]) -> str:
        base_dir = Path(output_root).resolve() if output_root else self._project_root()
        asset_clean = re.sub(r"[^\w\-_]", "_", asset)
        save_dir = base_dir / "data" / "data_output" / "history" / asset_clean
        save_dir.mkdir(parents=True, exist_ok=True)
        filepath = save_dir / f"{int(timeframe_min)}.csv"

        file_exists = filepath.exists()
        mode = "a" if file_exists else "w"
        with filepath.open(mode, newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
            for c in candles:
                writer.writerow(c.to_csv_row())

        return str(filepath)

    def _parse_timeframe_minutes(self, timeframe: Any) -> Optional[int]:
        if timeframe is None:
            return None
        try:
            return max(1, int(timeframe))
        except Exception:
            return None

    def _normalize_asset(self, asset: str) -> str:
        return asset.replace("_", "").replace("/", "").replace(" ", "").upper()
