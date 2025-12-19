#!/usr/bin/env python3
"""
QuantumFlux CLI - Simple command-line interface for trading operations

Usage:
    python qf.py attach --port 9222
    python qf.py stream snapshot --period 1 --mode both
    python qf.py profile
    python qf.py favorites --min-pct 92 --select first
    python qf.py trade --side buy --timeout 5
    python qf.py signal --asset EURUSD --min-candles 30 --types SMA,RSI
"""

import typer
import sys
import json
from pathlib import Path
from typing import Optional, List
from datetime import datetime

# Add capabilities to path
capabilities_dir = Path(__file__).parent / "capabilities_v2"
if str(capabilities_dir) not in sys.path:
    sys.path.insert(0, str(capabilities_dir))

# Import capabilities
# from capabilities.data_streaming import RealtimeDataStreaming
from capabilities_v2.base import Ctx
# from capabilities.session_scan import SessionScan
# from capabilities.profile_scan import ProfileScan
# from capabilities.favorite_select import FavoriteSelect
# from capabilities.trade_click_cap import TradeClick
# from capabilities.signal_generation import SignalGeneration
# from capabilities.TF_dropdown_retract import TF_Dropdown_Retract

# Selenium for Chrome attachment
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

app = typer.Typer(help="QuantumFlux Trading CLI")

# Global state
driver = None
ctx = None

def attach_chrome_session(port: int = 9222, user_data_dir: Optional[str] = None, verbose: bool = True):
    """Attach to existing Chrome session."""
    global driver, ctx
    
    try:
        if driver:
            driver.quit()
            
        # Use workspace Chrome profile if not specified
        if user_data_dir is None:
            user_data_dir = str(Path(__file__).parent / "Chrome_profile")
            
        # Configure Chrome options
        chrome_options = Options()
        chrome_options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
        chrome_options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
        
        # Create driver
        driver = webdriver.Chrome(options=chrome_options)
        
        # Create context
        artifacts_root = str(Path(__file__).parent / "Historical_Data" / "cli_artifacts")
        ctx = Ctx(
            driver=driver,
            artifacts_root=artifacts_root,
            debug=False,
            dry_run=False,
            verbose=verbose
        )
        
        current_url = driver.current_url
        if verbose:
            typer.echo(f"✅ Attached to Chrome session: {current_url}")
            
        return True, current_url
        
    except Exception as e:
        if verbose:
            typer.echo(f"❌ Failed to attach to Chrome: {e}", err=True)
        return False, str(e)

@app.command()
def attach(
    port: int = typer.Option(9222, help="Chrome remote debugging port"),
    user_data_dir: Optional[str] = typer.Option(None, help="Chrome user data directory"),
    verbose: bool = typer.Option(True, help="Verbose output")
):
    """Attach to existing Chrome session."""
    success, result = attach_chrome_session(port, user_data_dir, verbose)
    
    if success:
        typer.echo(f"🔗 Connected to Chrome on port {port}")
        typer.echo(f"📍 Current URL: {result}")
    else:
        typer.echo(f"❌ Connection failed: {result}", err=True)
        raise typer.Exit(1)

@app.command()
def status():
    """Get connection and system status."""
    if not driver or not ctx:
        typer.echo("❌ Not connected to Chrome session", err=True)
        typer.echo("Run: python qf.py attach --port 9222")
        raise typer.Exit(1)
    
    try:
        current_url = driver.current_url
        typer.echo("📊 QuantumFlux Status")
        typer.echo("=" * 30)
        typer.echo(f"🔗 Connected: ✅")
        typer.echo(f"📍 URL: {current_url}")
        typer.echo(f"⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Test capabilities
        typer.echo("\n🔧 Capabilities Status:")
        capabilities_status = {
            "SessionScan": SessionScan,
            "ProfileScan": ProfileScan,
            "FavoriteSelect": FavoriteSelect,
            "TradeClick": TradeClick,
            "SignalGeneration": SignalGeneration,
            "RealtimeDataStreaming": RealtimeDataStreaming
        }
        
        for name, cap_class in capabilities_status.items():
            status = "✅" if cap_class else "❌"
            typer.echo(f"  {status} {name}")
            
    except Exception as e:
        typer.echo(f"❌ Status check failed: {e}", err=True)
        raise typer.Exit(1)

# Stream commands
stream_app = typer.Typer(help="Data streaming operations")
app.add_typer(stream_app, name="stream")

@stream_app.command()
def snapshot(
    period: int = typer.Option(1, help="Timeframe period in minutes"),
    mode: str = typer.Option("candle", help="Stream mode: candle, tick, or both"),
    asset_focus: bool = typer.Option(False, help="Focus on currently selected asset only"),
    verbose: bool = typer.Option(True, help="Verbose output")
):
    """Collect a data snapshot."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    try:
        # Initialize data streaming
        data_streaming = RealtimeDataStreaming()
        
        # Configure streaming mode
        data_streaming.PERIOD = period * 60
        data_streaming.CANDLE_ONLY_MODE = mode in ["candle", "both"]
        data_streaming.TICK_ONLY_MODE = mode == "tick"
        data_streaming.ASSET_FOCUS_MODE = asset_focus
        data_streaming.TICK_DATA_MODE = mode in ["tick", "both"]
        
        typer.echo(f"📊 Collecting data snapshot (period: {period}m, mode: {mode})")
        if asset_focus:
            typer.echo("🎯 Asset focus mode enabled")
        
        # Run data collection
        inputs = {"period": period * 60}
        result = data_streaming.run(ctx, inputs)
        
        if result.ok:
            typer.echo("✅ Data snapshot collected successfully")
            
            # Display summary
            data = result.data
            typer.echo(f"📈 Current asset: {data.get('current_asset', 'Unknown')}")
            typer.echo(f"⏱️ Period: {data.get('period_minutes', 'Unknown')} minutes")
            typer.echo(f"📊 Real-time updates: {data.get('total_realtime_updates', 0)}")
            
            # Show candles summary
            candles_summary = data.get('candles_summary', {})
            if candles_summary:
                typer.echo("\n🕯️ Candles Summary:")
                for asset, info in candles_summary.items():
                    typer.echo(f"  {asset}: {info.get('total_candles', 0)} candles")
            
            # Show artifacts
            if result.artifacts:
                typer.echo(f"\n💾 Artifacts saved: {len(result.artifacts)}")
                for artifact in result.artifacts:
                    typer.echo(f"  📄 {artifact}")
                    
        else:
            typer.echo(f"❌ Data collection failed: {result.error}", err=True)
            raise typer.Exit(1)
            
    except Exception as e:
        typer.echo(f"❌ Snapshot failed: {e}", err=True)
        raise typer.Exit(1)

@stream_app.command()
def continuous(
    period: int = typer.Option(1, help="Timeframe period in minutes"),
    mode: str = typer.Option("candle", help="Stream mode: candle, tick, or both"),
    asset_focus: bool = typer.Option(False, help="Focus on currently selected asset only")
):
    """Start continuous data streaming (press Ctrl+C to stop)."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    try:
        # Initialize data streaming
        data_streaming = RealtimeDataStreaming()
        
        # Configure and start continuous streaming
        inputs = {"period": period * 60}
        typer.echo(f"🚀 Starting continuous streaming (period: {period}m, mode: {mode})")
        typer.echo("💡 Press Ctrl+C to stop")
        
        data_streaming.stream_continuous(ctx, inputs)
        
    except KeyboardInterrupt:
        typer.echo("\n⏹️ Streaming stopped by user")
    except Exception as e:
        typer.echo(f"❌ Streaming failed: {e}", err=True)
        raise typer.Exit(1)

# Operations commands
@app.command()
def profile():
    """Scan user profile and account information."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    try:
        profile_scan = ProfileScan()
        result = profile_scan.run(ctx, {})
        
        if result.ok:
            data = result.data
            typer.echo("👤 Profile Information")
            typer.echo("=" * 30)
            typer.echo(f"Account: {data.get('account', 'Unknown')}")
            typer.echo(f"Balance: {data.get('balance', 'Unknown')}")
            typer.echo(f"Display Name: {data.get('display_name', 'Unknown')}")
            typer.echo(f"Email: {data.get('email', 'Unknown')}")
            typer.echo(f"User ID: {data.get('user_id', 'Unknown')}")
            typer.echo(f"Currency: {data.get('currency', 'Unknown')}")
            
            if data.get('level_label'):
                typer.echo(f"Level: {data.get('level_label')}")
                
            if data.get('xp_current') is not None and data.get('xp_total') is not None:
                typer.echo(f"XP: {data.get('xp_current')}/{data.get('xp_total')}")
                
        else:
            typer.echo(f"❌ Profile scan failed: {result.error}", err=True)
            raise typer.Exit(1)
            
    except Exception as e:
        typer.echo(f"❌ Profile scan error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def favorites(
    min_pct: int = typer.Option(92, help="Minimum payout percentage"),
    select: Optional[str] = typer.Option(None, help="Select first or last eligible asset")
):
    """Scan favorites bar for eligible assets."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    if select and select not in ["first", "last"]:
        typer.echo("❌ Select must be 'first' or 'last'", err=True)
        raise typer.Exit(1)
    
    try:
        favorite_select = FavoriteSelect()
        inputs = {"min_pct": min_pct}
        if select:
            inputs["select"] = select
            
        result = favorite_select.run(ctx, inputs)
        
        if result.ok:
            data = result.data
            eligible = data.get('eligible', [])
            selected = data.get('selected')
            
            typer.echo("⭐ Favorites Scan Results")
            typer.echo("=" * 30)
            typer.echo(f"Minimum payout: {min_pct}%")
            typer.echo(f"Eligible assets: {len(eligible)}")
            
            if eligible:
                typer.echo("\n📋 Eligible Assets:")
                for asset in eligible:
                    marker = "👉" if asset == selected else "  "
                    typer.echo(f"{marker} {asset}")
            else:
                typer.echo("⚠️ No eligible assets found")
                
            if selected:
                typer.echo(f"\n✅ Selected: {selected}")
                
        else:
            typer.echo(f"❌ Favorites scan failed: {result.error}", err=True)
            raise typer.Exit(1)
            
    except Exception as e:
        typer.echo(f"❌ Favorites scan error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def session():
    """Scan current session state."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    try:
        session_scan = SessionScan()
        result = session_scan.run(ctx, {})
        
        if result.ok:
            data = result.data
            typer.echo("📊 Session Information")
            typer.echo("=" * 30)
            typer.echo(f"Account: {data.get('account', 'Unknown')}")
            typer.echo(f"Balance: {data.get('balance', 'Unknown')}")
            typer.echo(f"Amount: {data.get('amount', 'Unknown')}")
            typer.echo(f"Strategy: {data.get('strategy', 'Unknown')}")
            
            if data.get('viewport_scale'):
                typer.echo(f"Viewport Scale: {data.get('viewport_scale'):.2f}")
                
        else:
            typer.echo(f"❌ Session scan failed: {result.error}", err=True)
            raise typer.Exit(1)
            
    except Exception as e:
        typer.echo(f"❌ Session scan error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def trade(
    side: str = typer.Argument(..., help="Trade direction: buy or sell"),
    timeout: int = typer.Option(5, help="Timeout in seconds"),
    dry_run: bool = typer.Option(False, help="Dry run mode (no actual trade)")
):
    """Execute a trade."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    if side.lower() not in ["buy", "sell"]:
        typer.echo("❌ Side must be 'buy' or 'sell'", err=True)
        raise typer.Exit(1)
    
    if dry_run:
        typer.echo(f"🧪 DRY RUN: Would execute {side.upper()} trade (timeout: {timeout}s)")
        return
    
    # Confirm trade execution
    confirm = typer.confirm(f"⚠️ Execute {side.upper()} trade? This will place a real trade!")
    if not confirm:
        typer.echo("❌ Trade cancelled by user")
        return
    
    try:
        trade_click = TradeClick()
        inputs = {"side": side.lower(), "timeout": timeout}
        
        typer.echo(f"🎯 Executing {side.upper()} trade...")
        result = trade_click.run(ctx, inputs)
        
        if result.ok:
            typer.echo("✅ Trade executed successfully")
            
            # Display trade result details
            data = result.data
            if data.get('ok'):
                typer.echo("📈 Trade confirmation received")
            
            # Show artifacts if available
            if result.artifacts:
                typer.echo(f"📄 Artifacts saved: {len(result.artifacts)}")
                for artifact in result.artifacts:
                    typer.echo(f"  💾 {artifact}")
                    
        else:
            typer.echo(f"❌ Trade execution failed: {result.error}", err=True)
            raise typer.Exit(1)
            
    except Exception as e:
        typer.echo(f"❌ Trade error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def signal(
    asset: str = typer.Argument(..., help="Asset symbol (e.g., EURUSD)"),
    min_candles: int = typer.Option(30, help="Minimum candles required"),
    types: Optional[str] = typer.Option(None, help="Signal types (comma-separated): SMA,RSI,MACD")
):
    """Generate trading signals for an asset."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)

    try:
        # Parse signal types
        signal_types = None
        if types:
            signal_types = [t.strip() for t in types.split(",")]

        signal_gen = SignalGeneration()
        inputs = {"asset": asset.upper(), "min_candles": min_candles}
        if signal_types:
            inputs["signal_types"] = signal_types

        typer.echo(f"🔍 Generating signals for {asset.upper()}...")
        result = signal_gen.run(ctx, inputs)

        if result.ok:
            data = result.data
            signals = data.get('signals', {})

            typer.echo(f"📊 Signals for {asset.upper()}")
            typer.echo("=" * 30)
            typer.echo(f"Candles analyzed: {data.get('candles_analyzed', 0)}")
            typer.echo(f"Data source: {data.get('data_source', 'unknown')}")

            if signals:
                typer.echo("\n🎯 Generated Signals:")
                for signal_type, signal_data in signals.items():
                    if isinstance(signal_data, dict):
                        signal_value = signal_data.get('signal', 'unknown')
                        confidence = signal_data.get('confidence', 0)
                        typer.echo(f"  {signal_type}: {signal_value} (confidence: {confidence:.2f})")
                    else:
                        typer.echo(f"  {signal_type}: {signal_data}")
            else:
                typer.echo("⚠️ No signals generated")

        else:
            typer.echo(f"❌ Signal generation failed: {result.error}", err=True)
            raise typer.Exit(1)

    except Exception as e:
        typer.echo(f"❌ Signal generation error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def tf_dropdown(
    action: str = typer.Argument(..., help="Action: open, close, or toggle"),
    selectors: Optional[str] = typer.Option(None, help="CSS selectors for dropdown toggle button")
):
    """Open and retract the timeframe dropdown menu."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)

    if action not in ["open", "close", "toggle"]:
        typer.echo("❌ Action must be 'open', 'close', or 'toggle'", err=True)
        raise typer.Exit(1)

    try:
        tf_dropdown_cap = TF_Dropdown_Retract()
        inputs = {"action": action}
        if selectors:
            inputs["menu_toggle_selectors"] = [s.strip() for s in selectors.split(",")]

        typer.echo(f"🔄 Executing TF dropdown {action}...")
        result = tf_dropdown_cap.run(ctx, inputs)

        if result.ok:
            data = result.data
            typer.echo("✅ TF Dropdown Operation Successful")
            typer.echo("=" * 35)

            if action == "open":
                typer.echo(f"📂 Dropdown opened: {data.get('opened', False)}")
                if data.get('selector_used'):
                    typer.echo(f"🎯 Selector used: {data.get('selector_used')}")
                typer.echo(f"💾 Button stored: {data.get('button_stored', False)}")

            elif action == "close":
                typer.echo(f"📁 Dropdown closed: {data.get('closed', False)}")
                typer.echo(f"🔧 Method: {data.get('method', 'unknown')}")

            elif action == "toggle":
                typer.echo(f"🔄 Toggle completed: {data.get('toggle_success', False)}")
                typer.echo(f"📂 Opened: {data.get('opened', False)}")
                typer.echo(f"📁 Closed: {data.get('closed', False)}")

        else:
            typer.echo(f"❌ TF dropdown operation failed: {result.error}", err=True)
            # Show additional error details if available
            data = result.data
            if data.get('attempts'):
                typer.echo("📋 Attempt details:")
                for attempt in data['attempts']:
                    typer.echo(f"  ❌ {attempt.get('selector', 'unknown')}: {attempt.get('success', False)}")
            raise typer.Exit(1)

    except Exception as e:
        typer.echo(f"❌ TF dropdown error: {e}", err=True)
        raise typer.Exit(1)

@app.command()
def disconnect():
    """Disconnect from Chrome session."""
    global driver, ctx
    
    try:
        if driver:
            driver.quit()
            driver = None
            ctx = None
            typer.echo("🔌 Disconnected from Chrome session")
        else:
            typer.echo("⚠️ No active connection to disconnect")
            
    except Exception as e:
        typer.echo(f"⚠️ Error during disconnect: {e}", err=True)

# Quick commands for common workflows
@app.command()
def quick_scan():
    """Quick scan: profile + favorites + session."""
    if not driver or not ctx:
        typer.echo("❌ Not connected. Run: python qf.py attach", err=True)
        raise typer.Exit(1)
    
    typer.echo("🔍 Running quick scan...")
    
    # Profile scan
    try:
        profile_scan = ProfileScan()
        result = profile_scan.run(ctx, {})
        if result.ok:
            data = result.data
            typer.echo(f"👤 Account: {data.get('account')} | Balance: {data.get('balance')}")
        else:
            typer.echo(f"⚠️ Profile scan failed: {result.error}")
    except Exception as e:
        typer.echo(f"⚠️ Profile scan error: {e}")
    
    # Session scan
    try:
        session_scan = SessionScan()
        result = session_scan.run(ctx, {})
        if result.ok:
            data = result.data
            typer.echo(f"📊 Session: {data.get('account')} | Amount: {data.get('amount')}")
        else:
            typer.echo(f"⚠️ Session scan failed: {result.error}")
    except Exception as e:
        typer.echo(f"⚠️ Session scan error: {e}")
    
    # Favorites scan
    try:
        favorite_select = FavoriteSelect()
        result = favorite_select.run(ctx, {"min_pct": 92})
        if result.ok:
            eligible = result.data.get('eligible', [])
            typer.echo(f"⭐ Favorites: {len(eligible)} eligible assets (≥92%)")
            if eligible:
                typer.echo(f"  Top assets: {', '.join(eligible[:3])}")
        else:
            typer.echo(f"⚠️ Favorites scan failed: {result.error}")
    except Exception as e:
        typer.echo(f"⚠️ Favorites scan error: {e}")

if __name__ == "__main__":
    app()
