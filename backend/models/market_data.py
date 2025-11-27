from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Tick(BaseModel):
    """
    Represents a single price update for an asset.
    """
    timestamp: float = Field(..., description="Unix timestamp of the tick")
    asset: str = Field(..., description="Asset symbol (e.g., 'EURUSD')")
    price: float = Field(..., description="Price value")
    source: str = Field(..., description="Source of the data (e.g., 'pocketoption', 'simulation')")
    
    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": 1678886400.123,
                "asset": "EURUSD",
                "price": 1.0543,
                "source": "pocketoption"
            }
        }

class Candle(BaseModel):
    """
    Represents an aggregated OHLCV candle.
    """
    timestamp: float = Field(..., description="Unix timestamp of the candle open time")
    asset: str = Field(..., description="Asset symbol")
    open: float
    high: float
    low: float
    close: float
    volume: int = Field(default=0)
    timeframe: str = Field(default="1m", description="Timeframe of the candle (e.g., '1m', '5m')")
    is_closed: bool = Field(default=False, description="Whether the candle is finalized")

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": 1678886400,
                "asset": "EURUSD",
                "open": 1.0540,
                "high": 1.0550,
                "low": 1.0530,
                "close": 1.0545,
                "volume": 100,
                "timeframe": "1m",
                "is_closed": True
            }
        }
