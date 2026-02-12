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

from backend.services.strategy.regime_detector import detect_regime, calculate_indicators, MarketCondition
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
        
        # Calculate indicators and detect regime
        df = calculate_indicators(df)
        regime_result = detect_regime(df)
        
        if regime_result is None:
            return {
                "ok": True,
                "regime": "Neutral",
                "message": "No tradeable regime detected",
                "technicals": {}
            }
        
        return {
            "ok": True,
            "regime": regime_result.condition.value,
            "confluence_score": regime_result.confluence_score,
            "direction": regime_result.direction,
            "suggested_expiry": regime_result.suggested_expiry,
            "technicals": regime_result.technicals,
            "is_tradeable": regime_result.is_tradeable
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


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
        
        # Calculate indicators
        df = calculate_indicators(df)
        
        # Detect regime if not provided
        if regime_name is None:
            regime_result = detect_regime(df)
            if regime_result is None:
                return {
                    "ok": True,
                    "entries": [],
                    "message": "No tradeable regime detected"
                }
            regime_name = regime_result.condition.value
        else:
            # Re-detect to get full regime result
            regime_result = detect_regime(df)
            if regime_result is None:
                return {
                    "ok": True,
                    "entries": [],
                    "message": "No tradeable regime detected"
                }
        
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
                "avg_confidence": stats.avg_confidence,
                "regime_distribution": stats.regime_distribution
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Entry identification failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Entry identification failed: {str(e)}")


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
        from backend.utils.history_utils import get_recent_history_file
        
        # Get most recent history file
        history_file = get_recent_history_file(asset)
        
        if history_file is None:
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
