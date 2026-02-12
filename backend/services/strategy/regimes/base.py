"""
Base Strategy Module

Defines the abstract base class for all regime-specific entry strategies.
Each strategy implements entry identification logic for a specific market regime.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime
import pandas as pd


@dataclass
class EntrySignal:
    """Represents a potential trade entry signal"""
    timestamp: datetime
    asset: str
    direction: str  # "CALL" or "PUT"
    entry_price: float
    suggested_expiry: str  # "1m", "3m", "5m", etc.
    confidence: float  # 0.0 to 1.0
    regime: str  # Market regime that generated this signal
    confluence_score: int  # 0-100
    technicals: dict  # Supporting technical data
    reason: str  # Human-readable explanation


@dataclass
class StrategyStats:
    """Performance statistics for a strategy"""
    total_signals: int
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    max_drawdown: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    avg_confidence: Optional[float] = None
    regime_distribution: Optional[dict] = None


class BaseStrategy(ABC):
    """
    Abstract base class for regime-specific entry strategies.
    
    Each strategy focuses on identifying high-probability entries
    for a specific market regime (momentum, mean reversion, etc.)
    """
    
    def __init__(self, config: Optional[dict] = None):
        """
        Initialize the strategy with optional configuration.
        
        Args:
            config: Strategy-specific parameters (thresholds, filters, etc.)
        """
        self.config = config or {}
        self.name = self.__class__.__name__
    
    @abstractmethod
    def identify_entries(self, df: pd.DataFrame, regime_result) -> List[EntrySignal]:
        """
        Identify potential entry signals based on the regime and market data.
        
        Args:
            df: DataFrame with OHLC data and calculated indicators
            regime_result: RegimeResult from regime_detector.detect_regime()
            
        Returns:
            List of EntrySignal objects (may be empty if no valid entries)
        """
        pass
    
    @abstractmethod
    def validate_entry(self, signal: EntrySignal, df: pd.DataFrame) -> bool:
        """
        Validate a potential entry signal against strategy rules.
        
        Args:
            signal: The entry signal to validate
            df: DataFrame with market data
            
        Returns:
            True if the signal passes validation, False otherwise
        """
        pass
    
    def calculate_stats(self, entries: List[EntrySignal], df: pd.DataFrame) -> StrategyStats:
        """
        Calculate performance statistics for a set of entry signals.
        
        This is a default implementation. Strategies can override for custom metrics.
        
        Args:
            entries: List of entry signals
            df: DataFrame with market data (for backtesting)
            
        Returns:
            StrategyStats object with performance metrics
        """
        if not entries:
            return StrategyStats(total_signals=0)
        
        total = len(entries)
        avg_conf = sum(e.confidence for e in entries) / total if total > 0 else 0.0
        
        # Regime distribution
        regime_dist = {}
        for entry in entries:
            regime_dist[entry.regime] = regime_dist.get(entry.regime, 0) + 1
        
        return StrategyStats(
            total_signals=total,
            avg_confidence=avg_conf,
            regime_distribution=regime_dist
        )
    
    def __repr__(self):
        return f"{self.name}(config={self.config})"
