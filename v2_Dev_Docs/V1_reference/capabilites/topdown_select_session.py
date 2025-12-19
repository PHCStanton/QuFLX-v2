#!/usr/bin/env python3
"""
Topdown Select Test Session
Tests the TopdownSelect capability automation with data streaming.

Behavior:
- Starts data streaming first (background), then tests TopdownSelect automation
- Uses the same connection method as data_streaming.py (qf.attach_chrome_session)
- Tests timeframe selection automation for favorites
- Persistence (CSV saving) is DISABLED by default in this session

Enable persistence explicitly (opt-in):
- Flags:
  --save-candles            Enable candle CSV saving (closed candles only; rotated)
  --save-ticks              Enable tick CSV saving (every tick; rotated)
  --candle-chunk-size N     Closed candle rows per CSV file (default: 100)
  --tick-chunk-size N       Tick rows per CSV file (default: 1000)
- Environment overrides (alternative quick toggle):
  QF_PERSIST=1              Enable both candles and ticks
  QF_PERSIST_CANDLES=1      Enable candles
  QF_PERSIST_TICKS=1        Enable ticks

Destinations (if enabled):
- Candles: data/data_output/assets_data/realtime_stream/1M_candle_data
- Ticks:   data/data_output/assets_data/realtime_stream/1M_tick_data

Usage:
python scripts/custom_sessions/topdown_select_session.py --labels H1 M15 M5 --min-pct 92
"""

import sys
import os
import time
from pathlib import Path
import types
import json

# Add capabilities to path
capabilities_dir = Path(__file__).parent.parent.parent / "capabilities"
if str(capabilities_dir) not in sys.path:
    sys.path.insert(0, str(capabilities_dir))

from data_streaming import RealtimeDataStreaming
from stream_persistence import StreamPersistenceManager
from qf import attach_chrome_session
import qf

# Import TopdownSelect capability
try:
    from topdown_select import TopdownSelect
    from favorite_select import FavoriteSelect
except ImportError:
    # Fallback for direct execution
    import sys
    from pathlib import Path
    this_file = Path(__file__).resolve()
    api_root = this_file.parents[2]  # .../QuFLX
    if str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))
    from capabilities.topdown_select import TopdownSelect
    from capabilities.favorite_select import FavoriteSelect


def start_data_streaming(stream_mode, asset_focus, csv_output, output_dir, save_candles=False, save_ticks=False, candle_chunk_size=100, tick_chunk_size=1000):
    """Initialize data streaming configuration - no longer runs in background thread."""
    try:
        print(f"📈 [STREAM] Configuring {stream_mode} data streaming...")

        # Configure data streaming
        streamer = RealtimeDataStreaming()
        streamer.enable_csv_saving = csv_output

        # Set streaming mode
        if stream_mode == "candle":
            streamer.CANDLE_ONLY_MODE = True
            streamer.TICK_ONLY_MODE = False
            streamer.TICK_DATA_MODE = False
        elif stream_mode == "tick":
            streamer.CANDLE_ONLY_MODE = False
            streamer.TICK_ONLY_MODE = True
            streamer.TICK_DATA_MODE = True
        else:  # both
            streamer.CANDLE_ONLY_MODE = False
            streamer.TICK_ONLY_MODE = False
            streamer.TICK_DATA_MODE = False

        streamer.ASSET_FOCUS_MODE = asset_focus

        # Enable CSV saving for historical data collection
        streamer.enable_csv_saving = True
        
        return streamer

    except Exception as e:
        print(f"❌ [STREAM] Data streaming configuration failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_topdown_select_capability(labels=None, min_pct=92, delay_ms=300, save_screenshots=False):
    """Test the TopdownSelect capability automation."""
    try:
        print("\n🔄 [TOPDOWN_TEST] Testing TopdownSelect Capability Automation...")

        # Default labels if not provided
        if labels is None:
            labels = ["H1", "M15", "M5", "M1"]

        print(f"🎯 [TOPDOWN_TEST] Testing with labels: {labels}, min_pct: {min_pct}, delay_ms: {delay_ms}")

        # Get eligible favorites
        fav_select = FavoriteSelect()
        fav_result = fav_select.run(qf.ctx, {"min_pct": min_pct, "select": None})

        if not fav_result.ok:
            print(f"⚠️ [TOPDOWN_TEST] FavoriteSelect failed: {fav_result.error}")
            return False

        eligible_favorites = fav_result.data.get("eligible", [])
        if not eligible_favorites:
            print(f"⚠️ [TOPDOWN_TEST] No favorites found with payout >= {min_pct}%")
            return False

        print(f"⭐ [TOPDOWN_TEST] Found {len(eligible_favorites)} eligible favorites: {eligible_favorites[:3]}{'...' if len(eligible_favorites) > 3 else ''}")

        # Test TopdownSelect on first favorite
        test_favorite = eligible_favorites[0]
        print(f"\n🎯 [TOPDOWN_TEST] Testing TopdownSelect on favorite: {test_favorite}")

        # Click the favorite first
        clicked = fav_select._click_favorite_by_label(qf.ctx, test_favorite)
        if not clicked:
            print(f"❌ [TOPDOWN_TEST] Failed to click favorite: {test_favorite}")
            return False

        print(f"✅ [TOPDOWN_TEST] Successfully clicked favorite: {test_favorite}")

        # Now test TopdownSelect
        topdown = TopdownSelect()

        # Test with 1m stack (default)
        inputs = {
            "stack": "1m",
            "labels": labels,
            "delay_ms": delay_ms,
            "save": save_screenshots,  # Disable screenshots by default
            "screenshots_subdir": "topdown_test",
            "reopen_each": True,
        }

        print(f"🔄 [TOPDOWN_TEST] Running TopdownSelect with inputs: {inputs}")

        # Actually perform the automation - this is where the real work happens
        result = topdown.run(qf.ctx, inputs)

        if result.ok:
            data = result.data
            attempts = data.get("attempts", [])
            successful_attempts = sum(1 for a in attempts if a.get("ok"))

            print("✅ [TOPDOWN_TEST] TopdownSelect completed successfully!")
            print("   📊 Results:")
            print(f"   🎯 Stack: {data.get('stack', 'unknown')}")
            print(f"   📋 Labels: {data.get('labels', [])}")
            print(f"   ✅ Successful selections: {successful_attempts}/{len(attempts)}")
            print(f"   📸 Screenshots saved: {len(data.get('screenshots', {}))}")

            if attempts:
                print("   📋 Attempt details:")
                for attempt in attempts[:3]:  # Show first 3 attempts
                    status = "✅" if attempt.get("ok") else "❌"
                    label = attempt.get("label", "unknown")
                    strategy = attempt.get("strategy_used", "none")
                    selector = attempt.get("selector", "none")[:50]  # Truncate long selectors
                    print(f"      {status} {label}: {strategy} -> {selector}")

            return True
        else:
            print(f"❌ [TOPDOWN_TEST] TopdownSelect failed: {result.error}")

            # Show attempt details if available
            data = result.data
            if data.get("attempts"):
                print("   📋 Attempt details:")
                for attempt in data["attempts"]:
                    status = "✅" if attempt.get("ok") else "❌"
                    label = attempt.get("label", "unknown")
                    error = attempt.get("error", "")
                    print(f"      {status} {label}: {error}")

            return False

    except Exception as e:
        print(f"❌ [TOPDOWN_TEST] TopdownSelect test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def topdown_select_test_session(
    stream_mode="both",  # "candle", "tick", or "both"
    asset_focus=True,   # True = focus on current asset, False = all assets
    csv_output=True,     # Enable CSV saving
    output_dir=None,
    test_delay=3,        # Seconds to wait after starting streaming before testing
    labels=None,         # Timeframe labels to test
    min_pct=92,          # Minimum payout percentage for favorites
    delay_ms=300,        # Delay between operations
    save_screenshots=False,  # Save screenshots during testing
    save_candles=False,
    save_ticks=False,
    candle_chunk_size=100,
    tick_chunk_size=1000
):
    """TopdownSelect test session with data streaming."""

    # Calculate correct output directory if not specified
    if output_dir is None:
        project_root = Path(__file__).parent.parent.parent
        output_dir = str(project_root / "data" / "Historical_Data" / "data_stream")

    print("🎯 QuantumFlux TopdownSelect Test Session")
    print("=" * 50)
    print(f"Mode: {stream_mode}")
    print(f"Asset Focus: {asset_focus}")
    print(f"CSV Output: {csv_output}")
    print(f"Output Directory: {output_dir}")
    print(f"Test Delay: {test_delay}s")
    print(f"Labels: {labels or ['H1', 'M15', 'M5', 'M1']}")
    print(f"Min Payout %: {min_pct}")
    print(f"Delay MS: {delay_ms}")
    print(f"Save Screenshots: {save_screenshots}")

    try:
        # Attach to Chrome using same method as data_streaming.py
        print("\n🔗 Attaching to Chrome session...")
        success, url = attach_chrome_session(port=9222, verbose=True)

        if not success:
            print(f"❌ Failed to attach: {url}")
            return

        print("✅ Connected successfully!")

        # Step 1: Initialize Data Streaming (no background thread)
        print("\n📈 Step 1: Initializing Data Streaming...")
        
        streamer = start_data_streaming(stream_mode, asset_focus, csv_output, output_dir, save_candles, save_ticks, candle_chunk_size, tick_chunk_size)
        
        if streamer is None:
            print("❌ Failed to initialize data streaming")
            return

        # Give a moment for initial setup
        time.sleep(1)

        print("\n🔄 Step 2: Testing TopdownSelect with Data Collection...")

        # Direct test of TopdownSelect capability
        print("🎯 [DIRECT_TEST] Creating TopdownSelect instance...")
        topdown = TopdownSelect()
        print(f"✅ [DIRECT_TEST] TopdownSelect created: {topdown.id}")

        # Process each timeframe individually with proper data collection
        test_labels = labels or ["H1", "M15", "M5", "M1"]
        all_successful = True
        
        for label in test_labels:
            print(f"\n📊 Processing timeframe: {label}")
            
            # Reset streamer state for new timeframe
            streamer.CANDLES = {}
            streamer.SESSION_TIMEFRAME_DETECTED = False
            
            # Select the timeframe
            test_inputs = {
                "stack": "1m",
                "labels": [label],
                "delay_ms": delay_ms,
                "save": save_screenshots,
                "screenshots_subdir": "topdown_analysis",
                "reopen_each": True,
            }
            
            result = topdown.run(qf.ctx, test_inputs)
            
            if result.ok:
                print(f"✅ Selected timeframe: {label}")
                print(f"📈 Collecting data for {label} (waiting for chart to update)...")
                
                # Wait for chart update and collect data using the run() method
                time.sleep(2)  # Give chart time to reload
                
                # Collect data via run() which processes WebSocket logs
                collection_result = streamer.run(qf.ctx, {"period": 60})
                
                if collection_result.ok:
                    data = collection_result.data
                    print(f"📊 Collected data: {data.get('total_realtime_updates', 0)} updates")
                else:
                    print(f"⚠️ Data collection warning: {collection_result.error}")
            else:
                print(f"❌ Failed to select: {label}")
                all_successful = False

        test_success = all_successful
        print(f"\n📊 [DIRECT_TEST] Completed processing {len(test_labels)} timeframes")

        # Summary
        print("\n" + "="*50)
        if test_success:
            print("🎉 TopdownSelect automation test completed successfully!")
            print("✅ TopdownSelect automation test passed")
        else:
            print("⚠️ TopdownSelect automation test completed with issues")
            print("❌ TopdownSelect automation test failed")

        return

    except KeyboardInterrupt:
        print("\n⏹️ Session stopped by user")
    except Exception as e:
        print(f"❌ Session failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        try:
            if qf.driver:
                qf.driver.quit()
                print("\n🔌 Chrome session closed")
        except:
            pass


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TopdownSelect Test Session")
    parser.add_argument("--mode", choices=["candle", "tick", "both"], default="both",
                        help="Streaming mode (default: both)")
    parser.add_argument("--asset-focus", action="store_true",
                        help="Focus on currently selected asset only (default: enabled)")
    parser.add_argument("--no-csv", action="store_true",
                        help="Disable CSV output")
    parser.add_argument("--output-dir", default=None,
                        help="CSV output directory (auto-calculated if not specified)")
    parser.add_argument("--test-delay", type=int, default=3,
                        help="Seconds to wait before testing TopdownSelect (default: 3)")
    parser.add_argument("--labels", nargs="+",
                        help="Timeframe labels to test, e.g. H1 M15 M5 M1")
    parser.add_argument("--min-pct", type=int, default=92,
                        help="Minimum payout percentage for favorites (default: 92)")
    parser.add_argument("--delay-ms", type=int, default=300,
                        help="Delay between timeframe selections (milliseconds, default: 300)")
    parser.add_argument("--save-screenshots", action="store_true",
                        help="Save screenshots during TopdownSelect testing (default: disabled)")
    parser.add_argument("--save-candles", action="store_true",
                        help="Enable candle persistence (default: disabled)")
    parser.add_argument("--save-ticks", action="store_true",
                        help="Enable tick persistence (default: disabled)")
    parser.add_argument("--candle-chunk-size", type=int, default=100,
                        help="Closed candle rows per CSV file (default: 100)")
    parser.add_argument("--tick-chunk-size", type=int, default=1000,
                        help="Tick rows per CSV file (default: 1000)")

    args = parser.parse_args()

    # Run with defaults if no args provided, or use command line args
    topdown_select_test_session(
        stream_mode=args.mode,
        asset_focus=True if not args.asset_focus and len(sys.argv) == 1 else args.asset_focus,
        csv_output=not args.no_csv,
        output_dir=args.output_dir,
        test_delay=args.test_delay,
        labels=args.labels,
        min_pct=args.min_pct,
        delay_ms=args.delay_ms,
        save_screenshots=args.save_screenshots,
        save_candles=args.save_candles,
        save_ticks=args.save_ticks,
        candle_chunk_size=args.candle_chunk_size,
        tick_chunk_size=args.tick_chunk_size
    )