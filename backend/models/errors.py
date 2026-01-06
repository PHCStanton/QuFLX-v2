"""
Structured error codes and response models for QuFLX v2.
Implements CORE_PRINCIPLE #8: Defensive & Explicit Error Handling (Zero Silent Failures)
Implements CORE_PRINCIPLE #9: Fail Fast, Fail Loud, Fail Predictably
"""

from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class HistoryErrorCode(str, Enum):
    """
    Structured error codes for history data collection.
    These codes enable the frontend to provide specific, actionable feedback to users.
    """
    # Connection-level errors (fail fast)
    CHROME_NOT_CONNECTED = "chrome_not_connected"
    COLLECTOR_NOT_RUNNING = "collector_not_running"
    SUBPROCESS_SPAWN_FAILED = "subprocess_spawn_failed"
    
    # User interaction errors (manual mode workflow)
    MANUAL_CLICK_TIMEOUT = "manual_click_timeout"
    MANUAL_CLICK_NOT_DETECTED = "manual_click_not_detected"
    
    # Data validation errors
    INVALID_ASSET = "invalid_asset"
    INVALID_TIMEFRAME = "invalid_timeframe"
    UNSUPPORTED_TIMEFRAME = "unsupported_timeframe"
    
    # Data collection errors
    NO_HISTORY_DATA_RECEIVED = "no_history_data_received"
    HISTORY_PAYLOAD_EMPTY = "history_payload_empty"
    HISTORY_PAYLOAD_MALFORMED = "history_payload_malformed"
    
    # System/infrastructure errors
    CAPABILITY_TIMEOUT = "capability_timeout"
    FILE_WRITE_FAILED = "file_write_failed"
    UNKNOWN_ERROR = "unknown_error"


class HistoryErrorResponse(BaseModel):
    """
    Standardized error response model for history-related operations.
    Ensures consistent error structure across all history endpoints.
    """
    ok: bool = Field(default=False, description="Always false for error responses")
    error_code: HistoryErrorCode = Field(..., description="Machine-readable error code")
    error_message: str = Field(..., description="Human-readable error message")
    user_message: str = Field(..., description="User-friendly message for UI display")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error context")
    
    class Config:
        json_schema_extra = {
            "example": {
                "ok": False,
                "error_code": "manual_click_timeout",
                "error_message": "Manual click not detected within 15 seconds",
                "user_message": "Please click an asset in Pocket Option within 15 seconds",
                "details": {
                    "timeout_seconds": 15,
                    "asset": "AUDCAD OTC"
                }
            }
        }


class HistorySuccessResponse(BaseModel):
    """
    Standardized success response model for history collection.
    Returns candles directly in the HTTP response (no file polling required).
    """
    ok: bool = Field(default=True, description="Always true for success responses")
    asset: str = Field(..., description="Asset identifier (original format)")
    timeframe: int = Field(..., description="Timeframe in minutes")
    candles: list = Field(..., description="List of OHLCV candle dictionaries")
    file_path: Optional[str] = Field(default=None, description="Path to saved CSV file (if applicable)")
    collection_time_ms: Optional[float] = Field(default=None, description="Collection duration in milliseconds")
    
    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "asset": "AUDCAD OTC",
                "timeframe": 1,
                "candles": [
                    {
                        "time": 1736200800,
                        "open": 0.8945,
                        "high": 0.8950,
                        "low": 0.8943,
                        "close": 0.8948,
                        "volume": 1000
                    }
                ],
                "file_path": "Historical_Data/AUDCADOTC_1m_20260106.csv",
                "collection_time_ms": 21450.5
            }
        }


# User-friendly message mappings for each error code
ERROR_USER_MESSAGES = {
    HistoryErrorCode.CHROME_NOT_CONNECTED: 
        "Chrome browser is not connected. Please start the hybrid session first.",
    
    HistoryErrorCode.COLLECTOR_NOT_RUNNING: 
        "Data collector service is not running. Please restart the hybrid session.",
    
    HistoryErrorCode.SUBPROCESS_SPAWN_FAILED: 
        "Failed to start history collection process. Check system logs.",
    
    HistoryErrorCode.MANUAL_CLICK_TIMEOUT: 
        "No asset click detected in Pocket Option. Please click an asset within the countdown timer.",
    
    HistoryErrorCode.MANUAL_CLICK_NOT_DETECTED: 
        "Manual asset selection not detected. Ensure you clicked directly on an asset chart in Pocket Option.",
    
    HistoryErrorCode.INVALID_ASSET: 
        "Invalid asset identifier. Please select a valid trading asset.",
    
    HistoryErrorCode.INVALID_TIMEFRAME: 
        "Invalid timeframe specified. Supported timeframes: 1, 5, 15, 30, 60 minutes.",
    
    HistoryErrorCode.UNSUPPORTED_TIMEFRAME: 
        "This timeframe is not supported for history collection.",
    
    HistoryErrorCode.NO_HISTORY_DATA_RECEIVED: 
        "No history data was received from Pocket Option. Try selecting the asset again.",
    
    HistoryErrorCode.HISTORY_PAYLOAD_EMPTY: 
        "History data payload was empty. Asset may not have sufficient data.",
    
    HistoryErrorCode.HISTORY_PAYLOAD_MALFORMED: 
        "History data format is invalid. This may indicate a platform change.",
    
    HistoryErrorCode.CAPABILITY_TIMEOUT: 
        "History collection timed out. The process took longer than expected.",
    
    HistoryErrorCode.FILE_WRITE_FAILED: 
        "Failed to save history data to disk. Check file permissions.",
    
    HistoryErrorCode.UNKNOWN_ERROR: 
        "An unexpected error occurred during history collection. Check system logs."
}


def create_error_response(
    error_code: HistoryErrorCode,
    error_message: str,
    details: Optional[Dict[str, Any]] = None
) -> HistoryErrorResponse:
    """
    Factory function to create standardized error responses.
    
    Args:
        error_code: The specific error code from HistoryErrorCode enum
        error_message: Technical error message for logging
        details: Additional context information
        
    Returns:
        HistoryErrorResponse with user-friendly message automatically mapped
    """
    user_message = ERROR_USER_MESSAGES.get(
        error_code, 
        ERROR_USER_MESSAGES[HistoryErrorCode.UNKNOWN_ERROR]
    )
    
    return HistoryErrorResponse(
        error_code=error_code,
        error_message=error_message,
        user_message=user_message,
        details=details
    )
