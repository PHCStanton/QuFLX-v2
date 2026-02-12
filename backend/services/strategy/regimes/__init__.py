"""
Strategy Registry Module

Central registry for all regime-specific strategies.
Maps market regimes to their corresponding strategy implementations.
"""

from .base import BaseStrategy, EntrySignal, StrategyStats
from .momentum import MomentumStrategy
from .mean_reversion import MeanReversionStrategy
from .breakout import BreakoutStrategy


# Strategy Registry: Maps regime conditions to strategy classes
STRATEGY_REGISTRY = {
    "Strong Momentum Trending (Bullish)": MomentumStrategy,
    "Strong Momentum Trending (Bearish)": MomentumStrategy,
    "Trending Pullback (Buy Dip)": MomentumStrategy,
    "Trending Pullback (Sell Rally)": MomentumStrategy,
    "Ranging – Overbought (Sell)": MeanReversionStrategy,
    "Ranging – Oversold (Buy)": MeanReversionStrategy,
    "Breakout (Bullish)": BreakoutStrategy,
    "Breakout (Bearish)": BreakoutStrategy,
    # Note: Reversal strategies are high-risk and not included by default
}


def get_strategy_for_regime(regime_name: str, config=None) -> BaseStrategy:
    """
    Get the appropriate strategy instance for a given market regime.
    
    Args:
        regime_name: Name of the market regime (from MarketCondition enum)
        config: Optional configuration dict for the strategy
        
    Returns:
        Strategy instance for the regime, or None if no strategy available
    """
    strategy_class = STRATEGY_REGISTRY.get(regime_name)
    
    if strategy_class is None:
        return None
    
    return strategy_class(config=config)


def list_available_regimes():
    """
    List all market regimes that have strategy implementations.
    
    Returns:
        List of regime names
    """
    return list(STRATEGY_REGISTRY.keys())


__all__ = [
    'BaseStrategy',
    'EntrySignal',
    'StrategyStats',
    'MomentumStrategy',
    'MeanReversionStrategy',
    'BreakoutStrategy',
    'get_strategy_for_regime',
    'list_available_regimes',
    'STRATEGY_REGISTRY'
]
