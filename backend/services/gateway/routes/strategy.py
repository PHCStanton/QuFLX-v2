"""
Strategy Lab API Routes

FastAPI routes for the Strategy Lab panel:
- Upload CSV files with historical data
- Analyze market regime
- Identify entry signals
- List available regimes
"""

import os
import sys
import logging
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from fastapi.responses import JSONResponse

# Add project root to path
project_root = Path(__file__).resolve().parents[4]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from backend.services.strategy.regime_detector import detect_regime, detect_regime_series, calculate_indicators, MarketCondition
from backend.services.strategy.regimes import get_strategy_for_regime, list_available_regimes

router = APIRouter()
logger = logging.getLogger("gateway.strategy")

# Temporary storage for uploaded files (in production, use proper session management)
_uploaded_files: Dict[str, Path] = {}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file with historical OHLC data.
    
    Expected CSV columns: timestamp, open, high, low, close, volume (optional)
    
    Returns:
        file_id: Unique identifier for the uploaded file
        rows: Number of rows in the file
        columns: List of column names
    """
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are supported")
        
        # Read file content
        content = await file.read()
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.csv')
        temp_file.write(content)
        temp_file.close()
        
        # Validate CSV structure
        try:
            df = pd.read_csv(temp_file.name)
        except Exception as e:
            os.unlink(temp_file.name)
            raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(e)}")
        
        # Check required columns
        required_cols = ['timestamp', 'open', 'high', 'low', 'close']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            os.unlink(temp_file.name)
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_cols)}"
            )
        
        # Generate file ID
        file_id = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        _uploaded_files[file_id] = Path(temp_file.name)
        
        return {
            "ok": True,
            "file_id": file_id,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "date_range": {
                "start": df['timestamp'].iloc[0] if len(df) > 0 else None,
                "end": df['timestamp'].iloc[-1] if len(df) > 0 else None
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/analyze")
async def analyze_regime(file_id: str = Body(..., embed=True), asset: str = Body(default="UNKNOWN", embed=True)):
    """
    Analyze the market regime for uploaded data.
    
    Args:
        file_id: ID from /upload endpoint
        asset: Asset name (optional, for display purposes)
        
    Returns:
        regime: Detected market regime
        confluence_score: Confidence score (0-100)
        direction: Trade direction (CALL/PUT)
        suggested_expiry: Recommended expiry time
        technicals: Technical indicator values
    """
    try:
        # Get uploaded file
        if file_id not in _uploaded_files:
            raise HTTPException(status_code=404, detail="File not found. Please upload first.")
        
        file_path = _uploaded_files[file_id]
        
        # Load data
        df = pd.read_csv(file_path)
        df = df.sort_values('timestamp').reset_index(drop=True)

        # Use series-based detection for Lab context:
        # Scans the entire dataset for tradeable regimes (not just the last candle)
        series_result = detect_regime_series(df)

        if not series_result.get("is_tradeable"):
            # Fallback: try single-candle detection on the full dataset
            df_ind = calculate_indicators(df)
            regime_result = detect_regime(df_ind)
            if regime_result is None:
                return {
                    "ok": True,
                    "regime": "Neutral",
                    "regime_name": "Neutral",
                    "message": "No tradeable regime detected in this dataset",
                    "is_tradeable": False,
                    "technicals": {},
                    "regime_distribution": {},
                    "regime_timeline": [],
                }
            return {
                "ok": True,
                "regime": regime_result.condition.value,
                "regime_name": regime_result.condition.value,
                "confluence_score": regime_result.confluence_score,
                "direction": regime_result.direction,
                "suggested_expiry": regime_result.suggested_expiry,
                "technicals": regime_result.technicals,
                "is_tradeable": regime_result.is_tradeable,
                "regime_distribution": {},
                "regime_timeline": [],
            }

        return {
            "ok": True,
            "regime": series_result["dominant_regime"],
            "regime_name": series_result["dominant_regime"],
            "confluence_score": series_result["dominant_score"],
            "direction": series_result["dominant_direction"],
            "suggested_expiry": "1m",
            "technicals": series_result["technicals"],
            "is_tradeable": True,
            "regime_distribution": series_result["regime_distribution"],
            "regime_timeline": series_result["regime_timeline"],
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/data/{file_id}")
async def get_strategy_data(file_id: str):
    """
    Get full OHLC data for a strategy lab file.
    """
    try:
        if file_id not in _uploaded_files:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = _uploaded_files[file_id]
        df = pd.read_csv(file_path)
        
        # Ensure timestamp is formatted for JS Date
        if 'timestamp' in df.columns:
            # If it's a number, it might be unix ms
            pass 
            
        candles = df.to_dict('records')
        
        return {
            "ok": True,
            "file_id": file_id,
            "candles": candles,
            "count": len(candles)
        }
    except Exception as e:
        logger.error(f"Failed to fetch strategy data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/entries")
async def identify_entries(
    file_id: str = Body(..., embed=True),
    asset: str = Body(default="UNKNOWN", embed=True),
    regime_name: Optional[str] = Body(default=None, embed=True)
):
    """
    Identify entry signals for the uploaded data.
    
    Args:
        file_id: ID from /upload endpoint
        asset: Asset name
        regime_name: Optional regime name (if None, auto-detect)
        
    Returns:
        entries: List of entry signals
        stats: Performance statistics
    """
    try:
        # Get uploaded file
        if file_id not in _uploaded_files:
            raise HTTPException(status_code=404, detail="File not found. Please upload first.")
        
        file_path = _uploaded_files[file_id]
        
        # Load data
        df = pd.read_csv(file_path)
        df = df.sort_values('timestamp').reset_index(drop=True)

        # Calculate indicators
        df = calculate_indicators(df)

        # Use series-based detection for Lab context (scans full dataset)
        if regime_name is None:
            series_result = detect_regime_series(df)
            if not series_result.get("is_tradeable"):
                return {
                    "ok": True,
                    "entries": [],
                    "message": "No tradeable regime detected in this dataset"
                }
            regime_name = series_result["dominant_regime"]

        # Get single-candle result for strategy entry logic (needs RegimeResult object)
        regime_result = detect_regime(df)
        if regime_result is None:
            # Create a minimal RegimeResult from series data for entry identification
            from backend.services.strategy.regime_detector import RegimeResult, MarketCondition
            # Find the matching condition
            matching_condition = next(
                (c for c in MarketCondition if c.value == regime_name),
                MarketCondition.NEUTRAL
            )
            if matching_condition == MarketCondition.NEUTRAL:
                return {
                    "ok": True,
                    "entries": [],
                    "message": "No tradeable regime detected"
                }
            regime_result = RegimeResult(
                condition=matching_condition,
                confluence_score=70,
                direction="CALL" if "Bullish" in regime_name or "Buy" in regime_name else "PUT",
                suggested_expiry="1m",
                technicals={}
            )
        
        # Get strategy for regime
        strategy = get_strategy_for_regime(regime_name)
        
        if strategy is None:
            return {
                "ok": True,
                "entries": [],
                "message": f"No strategy available for regime: {regime_name}"
            }
        
        # Identify entries
        entries = strategy.identify_entries(df, regime_result)
        
        # Calculate stats
        stats = strategy.calculate_stats(entries, df)
        
        # Convert entries to dict format
        entries_dict = [
            {
                "timestamp": e.timestamp.isoformat() if isinstance(e.timestamp, datetime) else str(e.timestamp),
                "asset": e.asset,
                "direction": e.direction,
                "entry_price": e.entry_price,
                "suggested_expiry": e.suggested_expiry,
                "confidence": e.confidence,
                "regime": e.regime,
                "confluence_score": e.confluence_score,
                "reason": e.reason
            }
            for e in entries
        ]
        
        return {
            "ok": True,
            "regime": regime_name,
            "entries": entries_dict,
            "stats": {
                "total_signals": stats.total_signals,
                "win_rate": stats.win_rate,
                "profit_loss": stats.profit_factor,
                "avg_confidence": stats.avg_confidence,
                "regime_distribution": stats.regime_distribution
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Entry identification failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Entry identification failed: {str(e)}")


import json
import aiohttp
from backend.scripts.otc_alert_dispatch import AIOrchestrator, AlertContext

@router.post("/ai-analyze")
async def ai_analyze_strategy(
    file_id: str = Body(..., embed=True),
    regime_name: str = Body(..., embed=True),
    stats: Dict[str, Any] = Body(..., embed=True)
):
    """
    Provide AI analysis of the backtest results.
    """
    try:
        # Safely coerce stats values — None causes TypeError with arithmetic operators
        win_rate = float(stats.get('win_rate') or 0)
        profit_loss = float(stats.get('profit_loss') or 0)
        avg_confidence = float(stats.get('avg_confidence') or 0)
        total_signals = stats.get('total_signals') or 0

        # Construct summary for AI
        summary = f"""
        Analyze these Strategy Lab backtest results for an OTC Binary Options strategy.
        Regime: {regime_name}
        Total Signals: {total_signals}
        Win Rate: {win_rate * 100:.1f}%
        Net P&L (Stakes): {profit_loss:.2f}
        Avg Confidence: {avg_confidence:.2f}
        
        Provide a brief (2-3 sentence) assessment of the quality and risk level.
        Return JSON ONLY:
        {{
            "risk_level": "Low/Medium/High",
            "assessment": "string",
            "recommendation": "string"
        }}
        """
        
        # We reuse the AIOrchestrator or directly call the AI endpoint
        # For simplicity and consistency with existing AI logic:
        ai_endpoint = os.getenv("QFLX_AI_ENDPOINT")
        if not ai_endpoint:
             return {"ok": False, "message": "AI service not configured"}

        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "gpt-4o", # Or user preference
                "messages": [{"role": "user", "content": summary}],
                "response_format": {"type": "json_object"}
            }
            async with session.post(ai_endpoint, json=payload, headers={"Authorization": f"Bearer {os.getenv('QFLX_API_KEY')}"}) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    ai_content = data['choices'][0]['message']['content']
                    return {
                        "ok": True,
                        "analysis": json.loads(ai_content)
                    }
                else:
                    return {"ok": False, "message": f"AI API Error: {resp.status}"}

    except Exception as e:
        logger.error(f"AI Strategy Analysis failed: {e}")
        return {"ok": False, "message": str(e)}

@router.post("/indicators")
async def calculate_lab_indicators(
    file_id: str = Body(..., embed=True),
    indicators: List[str] = Body(default=[], embed=True),
    params: Dict[str, Any] = Body(default={}, embed=True),
    timeframe: str = Body(default="1m", embed=True)
):
    """
    Calculate technical indicators for a Strategy Lab uploaded CSV file.
    Uses the uploaded file directly instead of the live history store.
    
    Args:
        file_id: ID from /upload endpoint
        indicators: List of indicator keys to calculate
        params: Optional params per indicator key
        timeframe: Timeframe string (for display/context only)
    """
    import asyncio
    import json
    import subprocess
    from .common import parse_script_json

    try:
        if file_id not in _uploaded_files:
            raise HTTPException(status_code=404, detail="File not found. Please upload first.")

        file_path = _uploaded_files[file_id]

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Uploaded file no longer exists on disk.")

        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../../../capabilities_v2/runner.py")
        )

        if not os.path.exists(runner_path):
            raise HTTPException(status_code=500, detail=f"Runner script not found at: {runner_path}")

        # Parse timeframe to minutes
        timeframe_min = 1
        tf = str(timeframe).strip().lower()
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
        elif tf.isdigit():
            timeframe_min = max(1, int(tf))

        inputs = {
            "csv_path": str(file_path),
            "asset": file_id,
            "timeframe": timeframe_min,
            "indicators": indicators,
            "params": params,
            "current_candle": None
        }

        args = [
            sys.executable,
            runner_path,
            "indicator_calculator",
            "--inputs",
            json.dumps(inputs),
        ]

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout, stderr = await process.communicate()
            return_code = process.returncode
        except NotImplementedError:
            def run_sync():
                p = subprocess.run(args, capture_output=True, env=env, text=False)
                return p.stdout, p.stderr, p.returncode
            stdout, stderr, return_code = await asyncio.to_thread(run_sync)

        if return_code != 0:
            err_msg = stderr.decode().strip()
            logger.error(f"Lab indicator calculation failed: {err_msg}")
            raise HTTPException(status_code=500, detail=f"Script execution failed: {err_msg}")

        output_str = stdout.decode().strip()
        try:
            out = parse_script_json(output_str)
        except Exception as e:
            logger.error(f"Invalid lab indicator output: {e} | raw={output_str}")
            raise HTTPException(status_code=502, detail="Invalid script output")

        if not out.get("ok"):
            raise HTTPException(status_code=500, detail=str(out.get("error")))

        data = out.get("data", {})
        return {"ok": True, **data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lab indicators failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/regimes")
async def get_regimes():
    """
    List all available market regimes and their strategies.
    
    Returns:
        regimes: List of regime names with strategy info
    """
    try:
        regimes = list_available_regimes()
        
        return {
            "ok": True,
            "regimes": regimes,
            "count": len(regimes)
        }
        
    except Exception as e:
        logger.error(f"Failed to list regimes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list regimes: {str(e)}")


@router.post("/load-history")
async def load_from_history(asset: str = Body(..., embed=True)):
    """
    Load historical data from the existing history directory.
    
    Args:
        asset: Asset name (e.g., "EURUSD_OTC")
        
    Returns:
        file_id: ID for use with other endpoints
        rows: Number of rows loaded
    """
    try:
        from backend.utils.data_store import get_candle_path
        
        # Get most recent history file (default to 1m for strategy lab base)
        history_file = get_candle_path(asset, "1m")
        
        if not history_file or not history_file.exists():
            raise HTTPException(status_code=404, detail=f"No history found for {asset}")
        
        # Load and validate
        df = pd.read_csv(history_file)
        
        # Generate file ID
        file_id = f"history_{asset}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        _uploaded_files[file_id] = Path(history_file)
        
        return {
            "ok": True,
            "file_id": file_id,
            "asset": asset,
            "rows": len(df),
            "source": "history",
            "file_path": str(history_file)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load history: {str(e)}")


@router.delete("/cleanup/{file_id}")
async def cleanup_file(file_id: str):
    """
    Clean up uploaded temporary file.
    
    Args:
        file_id: ID from /upload endpoint
    """
    try:
        if file_id in _uploaded_files:
            file_path = _uploaded_files[file_id]
            
            # Only delete if it's a temp file (not from history)
            if file_path.parent == Path(tempfile.gettempdir()):
                if file_path.exists():
                    os.unlink(file_path)
            
            del _uploaded_files[file_id]
            
            return {"ok": True, "message": "File cleaned up"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")
