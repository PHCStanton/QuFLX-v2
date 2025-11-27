import csv
import os
import re
import time
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple, List

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By

# Thread synchronization
period_lock = threading.Lock()

# Script import path
import sys
import os
from pathlib import Path

# Add project root to Python path (when run from scripts/custom_sessions/)
script_dir = Path(__file__).resolve().parent  # scripts/custom_sessions
project_root = script_dir.parent.parent  # .../QuFLX
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Debug: Print paths
# print(f"Project root: {project_root}")
# print(f"Current dir: {current_dir}")
# print(f"Sys path: {sys.path[:5]}")  # First 5 entries

from capabilities.base import CapResult, Capability, Ctx, add_utils_to_syspath, save_json, timestamp  # type: ignore
from capabilities.data_streaming import RealtimeDataStreaming  # type: ignore
from capabilities.favorite_select import FavoriteSelect  # type: ignore
from capabilities.topdown_select import TopdownSelect  # type: ignore

add_utils_to_syspath()


def minutes_to_folder_suffix(minutes: int) -> Tuple[Optional[str], Optional[str]]:
    """
    Map minutes to (folder_name, tf_suffix) for filenames.
    60 -> ("1H_candles", "1h")
    15 -> ("15M_candles", "15m")
    5  -> ("5M_candles",  "5m")
    1  -> ("1M_candles",  "1m")
    """
    table = {
        1440: ("1D_candles", "1d"),
        240: ("4H_candles", "4h"),
        60: ("1H_candles", "1h"),
        30: ("30M_candles", "30m"),
        15: ("15M_candles", "15m"),
        10: ("10M_candles", "10m"),
        5: ("5M_candles", "5m"),
        3: ("3M_candles", "3m"),
        2: ("2M_candles", "2m"),
        1: ("1M_candles", "1m"),
    }
    return table.get(int(minutes), (None, None))


def label_to_minutes(label: str) -> Optional[int]:
    """
    Convert timeframe label like 'H1','M15','M5','M1','1h','15m' into minutes.
    """
    if not label:
        return None
    s = label.strip().lower()
    try:
        # variants like "h1", "m15"
        if s[0] in ("h", "m"):
            n = int(s[1:])
            return n * 60 if s[0] == "h" else n
        # variants like "1h", "15m"
        if s.endswith("h"):
            return int(s[:-1]) * 60
        if s.endswith("m"):
            return int(s[:-1])
        # pure number -> minutes
        if s.isdigit():
            return int(s)
    except Exception:
        return None
    return None


def sanitize_asset(name: str) -> str:
    return re.sub(r"[^\w\-_]", "_", str(name or "unknown"))


class DataCollectTopdownSelect(RealtimeDataStreaming):
    """
    Reuse RealtimeDataStreaming but route CSVs into:
      data/data_output/assets_data/data_collect/<timeframe_folder>
    All WebSocket parsing and history detection remain unchanged.
    """

    def save_to_csv(self, asset: str, ctx: Ctx) -> None:
        """Save collected candle data to CSV file into data_collect directory."""
        try:
            if asset not in self.CANDLES or not self.CANDLES[asset]:
                if ctx.verbose:
                    print(f"⚠️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] No candle data available for {asset}")
                return

            # Determine timeframe minutes based on session-synced period (thread-safe)
            with period_lock:
                period_minutes = int(self.PERIOD // 60) if self.PERIOD else 1
            minutes = period_minutes
            folder, tf_suffix = minutes_to_folder_suffix(minutes)
            if not folder or not tf_suffix:
                folder, tf_suffix = "1M_candles", "1m"

            # Use project root resolved at module import time (for consistent path resolution when run from anywhere)
            import scripts.custom_sessions.data_collect_topdown_select as this_script
            project_root = this_script.project_root

            # Ensure we're using the same path construction approach throughout
            dest_dir = project_root / "data" / "data_output" / "assets_data" / "data_collect" / folder
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Filename
            now = datetime.now(timezone.utc)
            filename = f"{sanitize_asset(asset)}_{tf_suffix}_{now.strftime('%Y_%m_%d_%H_%M_%S')}.csv"
            filepath = dest_dir / filename

            # Write CSV with enhanced error handling
            try:
                with filepath.open("w", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerow(["timestamp", "open", "close", "high", "low"])
                    # Validate candle data before writing
                    if not isinstance(self.CANDLES[asset], list):
                        if ctx.verbose:
                            print(f"⚠️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Invalid candle data format for {asset}")
                        return
                        
                    for candle in self.CANDLES[asset]:
                        # candle = [ts, open, close, high, low]
                        if not isinstance(candle, (list, tuple)) or len(candle) < 5:
                            if ctx.verbose:
                                print(f"⚠️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Invalid candle format for {asset}: {candle}")
                            continue
                            
                        try:
                            ts_val = int(float(candle[0]))
                            ts_str = datetime.fromtimestamp(ts_val, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
                        except (ValueError, TypeError, IndexError):
                            ts_str = str(candle[0]) if len(candle) > 0 else "unknown_timestamp"
                        try:
                            # Validate numeric values
                            open_val = float(candle[1]) if candle[1] is not None else 0.0
                            close_val = float(candle[2]) if candle[2] is not None else 0.0
                            high_val = float(candle[3]) if candle[3] is not None else 0.0
                            low_val = float(candle[4]) if candle[4] is not None else 0.0
                            w.writerow([ts_str, open_val, close_val, high_val, low_val])
                        except (ValueError, TypeError, IndexError) as e:
                            if ctx.verbose:
                                print(f"⚠️ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error processing candle data for {asset}: {e}")
                            # Write with fallback values
                            w.writerow([ts_str, 0.0, 0.0, 0.0, 0.0])

                if ctx.verbose:
                    print(
                        f"💾 [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] "
                        f"Saved {len(self.CANDLES[asset])} candles for {asset} @ {tf_suffix} → {folder}: {filename}"
                    )
            except PermissionError:
                if ctx.verbose:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Permission denied writing CSV for {asset}")
                raise
            except OSError as e:
                if ctx.verbose:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] OS error writing CSV for {asset}: {e}")
                raise
            except Exception as e:
                if ctx.verbose:
                    print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Unexpected error writing CSV for {asset}: {e}")
                raise
                
        except Exception as e:
            if ctx.verbose:
                print(f"❌ [{datetime.now(timezone.utc).strftime('%H:%M:%SZ')}] Error saving CSV for {asset}: {e}")


def build() -> Capability:
    """Factory function to create DataCollectTopdownSelect capability instance."""
    return DataCollectTopdownSelect()


def auto_topdown_worker(ctx: Ctx,
                        cap: DataCollectTopdownSelect,
                        labels: List[str],
                        min_pct: int,
                        tf_wait_s: float,
                        delay_ms: int,
                        verbose: bool) -> None:
    """
    Automation loop:
      - Enumerate favorites with FavoriteSelect (min_pct filter, or 0 to use all visible)
      - For each favorite: click it
      - For each label: set cap.PERIOD, open timeframe menu, click timeframe, wait tf_wait_s
      - Streamer running in parallel will persist CSVs routed by cap.PERIOD
    """
    try:
        fav = FavoriteSelect()
        tsel = TopdownSelect()

        # Get eligible favorites
        favs_result = fav.run(ctx, {"min_pct": int(min_pct), "select": None})
        # Extract eligible favorites from CapResult properly
        if hasattr(favs_result, 'data') and favs_result.data:
            eligible = favs_result.data.get("eligible", [])
        else:
            eligible = []

        if not eligible and verbose:
            print(f"⚠️ No favorites discovered by FavoriteSelect (min_pct={min_pct}).")

        if verbose:
            print(f"⭐ Topdown automation: processing {len(eligible)} favorites, labels={labels}, tf_wait_s={tf_wait_s}, delay_ms={delay_ms}")

        # Temporarily disable asset focus mode for the automation process
        original_asset_focus_mode = cap.ASSET_FOCUS_MODE
        cap.ASSET_FOCUS_MODE = False

        for fav_label in eligible:
            try:
                # Click favorite in top bar
                clicked_fav = fav._click_favorite_by_label(ctx, fav_label)
                if verbose:
                    print(f"{'✅' if clicked_fav else '⚠️'} Favorite select: {fav_label}")

                if not clicked_fav:
                    if verbose:
                        print(f"⚠️ Skipping {fav_label} - favorite selection failed, cannot verify asset change")
                    continue

                # Walk labels
                for label in labels:
                    minutes = label_to_minutes(label)
                    if not minutes:
                        if verbose:
                            print(f"⚠️ Skip unknown label '{label}'")
                        continue

                    # Set PERIOD for routing before WS history arrives - use thread-safe approach
                    # Use lock to prevent race conditions with the streaming thread
                    local_period = int(minutes) * 60
                    with period_lock:
                        cap.PERIOD = local_period

                    folder, tf_suffix = minutes_to_folder_suffix(int(minutes))
                    folder = folder or "1M_candles"
                    tf_suffix = tf_suffix or "1m"

                    if verbose:
                        print(f"🕒 Switching {fav_label} @ {label} → {folder} (PERIOD={minutes}m)")

                    # Open timeframe menu and click target label with enhanced error handling
                    timeframe_success = False

                    # Try multiple attempts to set timeframe successfully
                    for attempt in range(3):  # Up to 3 attempts
                        try:
                            # Attempt to open timeframe menu with fallback
                            menu_opened = False
                            try:
                                _ = tsel._open_timeframe_menu(ctx, selectors=None)
                                menu_opened = True
                            except Exception as open_e:
                                if verbose:
                                    print(f"⚠️ Attempt {attempt + 1}: Failed to open timeframe menu: {open_e}")
                                # Try clicking asset first to ensure focus
                                if hasattr(ctx, 'driver') and attempt < 2:
                                    try:
                                        # Click on chart area to ensure focus
                                        ctx.driver.find_element(By.CSS_SELECTOR, "canvas, .chart, .trading-chart").click()
                                        time.sleep(0.5)
                                        _ = tsel._open_timeframe_menu(ctx, selectors=None)
                                        menu_opened = True
                                        if verbose:
                                            print(f"✅ Menu opened after chart focus on attempt {attempt + 1}")
                                    except Exception:
                                        pass
                                if not menu_opened:
                                    time.sleep(1.0)  # Longer wait before retry
                                    continue

                            # Try to click the timeframe label
                            clicked, strategy, sel = tsel._click_timeframe(ctx, label)
                            if clicked:
                                timeframe_success = True
                                if verbose:
                                    print(f"{'✅' if clicked else '⚠️'} Click timeframe {label} via {strategy or 'n/a'} {sel or ''}".strip())
                                break
                            else:
                                if verbose:
                                    print(f"⚠️ Attempt {attempt + 1}: Failed to click timeframe {label}")
                                time.sleep(0.5)  # Brief wait before retry

                        except Exception as e:
                            if verbose:
                                print(f"⚠️ Attempt {attempt + 1} error for timeframe {label}: {e}")
                            time.sleep(0.5)

                    # Final status reporting
                    if not timeframe_success:
                        if verbose:
                            print(f"❌ All attempts failed for timeframe {label} - proceeding anyway")

                    # Let UI settle a bit, then wait for history load
                    try:
                        tsel._sleep_ms(int(delay_ms))
                    except Exception:
                        time.sleep(max(0, delay_ms) / 1000.0)

                    time.sleep(max(0.0, float(tf_wait_s)))

                    # Force save CSV for this asset/timeframe combination
                    try:
                        if hasattr(cap, 'CURRENT_ASSET') and cap.CURRENT_ASSET:
                            cap.save_to_csv(cap.CURRENT_ASSET, ctx)
                    except Exception as save_error:
                        if verbose:
                            print(f"⚠️ Error saving CSV for {fav_label} @ {label}: {save_error}")

            except Exception as e:
                if verbose:
                    print(f"❌ Favorite loop error for {fav_label}: {e}")

        # Restore original asset focus mode
        cap.ASSET_FOCUS_MODE = original_asset_focus_mode

        if verbose:
            print("✅ Topdown automation completed")
    except Exception as e:
        if verbose:
            print(f"❌ Topdown automation failed: {e}")


if __name__ == "__main__":
    import argparse
    import json as _json

    def attach_existing_chrome_session(verbose: bool = False):
        """
        Attach to an existing Chrome instance started with --remote-debugging-port=9222.
        Returns a selenium webdriver.Chrome instance or raises on failure.
        """
        try:
            if verbose:
                print("[attach] Preparing to attach to existing Chrome session at 127.0.0.1:9222")
            from selenium import webdriver  # type: ignore
            from selenium.webdriver.chrome.options import Options  # type: ignore

            options = Options()
            # Enable performance log to read WebSocket frames
            options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
            options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

            # Compatibility flags (non-invasive)
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--disable-web-security")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--no-first-run")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-popup-blocking")

            driver = webdriver.Chrome(options=options)
            if verbose:
                print(f"[attach] Attached. Current URL: {getattr(driver, 'current_url', 'unknown')}")
            return driver
        except Exception as e:
            raise RuntimeError(
                "Failed to attach to existing Chrome session at 127.0.0.1:9222. "
                "Ensure Chrome is started with --remote-debugging-port=9222. "
                f"Underlying error: {e}"
            )

    parser = argparse.ArgumentParser(
        description="Stream WebSocket data with candle formation and export to data_collect folders."
    )
    parser.add_argument("--period", type=int, default=1, help="Timeframe period in minutes (default: 1)")
    parser.add_argument(
        "--output-dir",
        type=str,
        default=os.path.abspath(os.path.join("data", "data_output", "assets_data", "data_collect")),
        help="Artifacts root directory (for debug JSON if enabled)",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug artifacts")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--stream", action="store_true", help="Enable continuous streaming mode (recommended)")
    parser.add_argument("--tick_data", action="store_true", help="Enable raw tick data mode (no candle aggregation)")
    # Streaming mode options consistent with data_streaming.py
    parser.add_argument("--candle_only", action="store_true", help="Stream only OHLC candle data")
    parser.add_argument("--tick_only", action="store_true", help="Stream only tick data")
    parser.add_argument("--asset_focus", action="store_true", help="Focus on currently selected asset only")
    parser.add_argument("--stream_mode", type=str, choices=["candle", "tick", "both"], help="Streaming mode selector")

    # Automation flags
    parser.add_argument("--auto-topdown", action="store_true", help="Run automated topdown selection alongside stream")
    parser.add_argument("--labels", nargs="+", default=None, help="Labels to iterate e.g. H1 M15 M5 M1")
    parser.add_argument("--min-pct", type=int, default=92, help="Minimum payout percent (0 to use all visible favorites)")
    parser.add_argument("--tf-wait-s", type=float, default=1.0, help="Seconds to wait after timeframe switch for history to load")
    parser.add_argument("--delay-ms", type=int, default=200, help="UI settle delay between operations (milliseconds)")
    args = parser.parse_args()

    # Validate options with enhanced checking
    if args.candle_only and args.tick_only:
        print("❌ Error: Cannot use both --candle_only and --tick_only simultaneously")
        raise SystemExit(1)
    if args.stream_mode:
        if args.stream_mode == "candle" and args.tick_only:
            print("❌ Error: --stream_mode=candle conflicts with --tick_only")
            raise SystemExit(1)
        if args.stream_mode == "tick" and args.candle_only:
            print("❌ Error: --stream_mode=tick conflicts with --candle_only")
            raise SystemExit(1)
    
    # Validate numeric arguments
    if args.min_pct < 0:
        print("⚠️ Warning: --min-pct should be non-negative, using 0")
        args.min_pct = 0
    if args.tf_wait_s < 0:
        print("⚠️ Warning: --tf-wait-s should be non-negative, using 0")
        args.tf_wait_s = 0
    if args.delay_ms < 0:
        print("⚠️ Warning: --delay-ms should be non-negative, using 0")
        args.delay_ms = 0

    # Validate labels
    if args.labels is not None and len(args.labels) == 0:
        print("⚠️ Warning: Empty --labels list, using default labels")
        args.labels = ["H1", "M15", "M5", "M1"]

    # Attach to running Hybrid Chrome session
    driver = attach_existing_chrome_session(verbose=args.verbose)

    # Build context and capability
    ctx = Ctx(driver=driver, artifacts_root=args.output_dir, debug=args.debug, dry_run=False, verbose=args.verbose)
    cap = DataCollectTopdownSelect()

    # Set streaming modes (match semantics of data_streaming.py)
    cap.TICK_DATA_MODE = args.tick_data
    cap.CANDLE_ONLY_MODE = bool(args.candle_only) or (args.stream_mode == "candle")
    cap.TICK_ONLY_MODE = bool(args.tick_only) or (args.stream_mode == "tick")
    cap.ASSET_FOCUS_MODE = bool(args.asset_focus)

    # Override TICK_DATA_MODE derived from new modes
    if cap.TICK_ONLY_MODE:
        cap.TICK_DATA_MODE = True
    elif cap.CANDLE_ONLY_MODE:
        cap.TICK_DATA_MODE = False

    # Inputs
    inputs: Dict[str, Any] = {}
    if args.period is not None:
        inputs["period"] = int(args.period) * 60  # seconds

    # Resolve labels
    labels_seq = args.labels if args.labels else ["H1", "M15", "M5", "M1"]

    # Execution
    try:
        threads: List[threading.Thread] = []

        if args.stream:
            if args.tick_data:
                print("🎯 Starting tick data streaming mode...")
                print("Format: TICK|timestamp|asset|price|direction")
            else:
                print("📊 Starting OHLC candle streaming mode (session-synced)...")
                print(
                    "Format: OHLC|timestamp|asset|timeframe|O:open|H:high|L:low|C:close|V:volume|direction"
                )
            print("💡 Press Ctrl+C to stop the stream")

            t_stream = threading.Thread(target=cap.stream_continuous, args=(ctx, inputs), daemon=True)
            t_stream.start()
            threads.append(t_stream)

        if args.auto_topdown:
            if args.verbose:
                print(f"🤖 Auto-topdown enabled: labels={labels_seq}, min_pct={args.min_pct}, tf_wait_s={args.tf_wait_s}, delay_ms={args.delay_ms}")
            t_auto = threading.Thread(
                target=auto_topdown_worker,
                args=(ctx, cap, labels_seq, int(args.min_pct), float(args.tf_wait_s), int(args.delay_ms), bool(args.verbose)),
                daemon=True,
            )
            t_auto.start()
            threads.append(t_auto)

        # If neither stream nor auto-topdown, fall back to one-shot run (batch mode)
        if not threads:
            # Batch processing mode (not typically used for manual topdown steps)
            res = cap.run(ctx, inputs)
            print(
                _json.dumps(
                    {"ok": res.ok, "data": res.data, "error": res.error, "artifacts": res.artifacts},
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            # Keep main thread alive while workers run
            try:
                while any(t.is_alive() for t in threads):
                    time.sleep(0.25)
            except KeyboardInterrupt:
                print("\n⏹️ Streaming/automation interrupted by user")

    except WebDriverException as e:
        print(f"❌ WebDriver error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        try:
            if driver and hasattr(driver, 'quit'):
                driver.quit()
        except Exception:
            pass
