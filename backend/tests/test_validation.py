import pytest
import sys
import os

# Add the project root to sys.path so we can import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from backend.services.gateway.main import validate_market_data
from backend.models.market_data import Tick, Candle

def test_validate_valid_tick():
    payload = {
        "asset": "EURUSD",
        "price": 1.05,
        "timestamp": 1700000000.0,
        "source": "test"
    }
    assert validate_market_data(payload) is True

def test_validate_valid_candle():
    payload = {
        "asset": "EURUSD",
        "open": 1.05,
        "high": 1.06,
        "low": 1.04,
        "close": 1.055,
        "volume": 100,
        "timestamp": 1700000000.0,
        "source": "test"
    }
    assert validate_market_data(payload) is True

def test_validate_invalid_tick_missing_field():
    payload = {
        "asset": "EURUSD",
        # missing price
        "timestamp": 1700000000.0
    }
    assert validate_market_data(payload) is False

def test_validate_invalid_types():
    payload = {
        "asset": "EURUSD",
        "price": "not-a-number", # invalid type
        "timestamp": 1700000000.0
    }
    assert validate_market_data(payload) is False

def test_validate_garbage():
    payload = {"foo": "bar"}
    assert validate_market_data(payload) is False
