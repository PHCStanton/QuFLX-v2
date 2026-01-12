import pandas as pd
import numpy as np

from backend.services.strategy.indicators import TechnicalIndicatorsPipeline


def _make_basic_df(n: int = 100) -> pd.DataFrame:
    idx = range(n)
    return pd.DataFrame(
        {
            "open": np.linspace(1.0, 2.0, n),
            "high": np.linspace(1.1, 2.1, n),
            "low": np.linspace(0.9, 1.9, n),
            "close": np.linspace(1.0, 2.0, n),
        },
        index=idx,
    )


def _make_flat_df(n: int = 100) -> pd.DataFrame:
    idx = range(n)
    return pd.DataFrame(
        {
            "open": np.ones(n),
            "high": np.ones(n),
            "low": np.ones(n),
            "close": np.ones(n),
        },
        index=idx,
    )


def test_adx_columns_and_basic_properties():
    df = _make_basic_df(200)
    pipe = TechnicalIndicatorsPipeline()
    out = pipe.calculate_indicators(df)

    assert "adx" in out.columns
    assert "plus_di" in out.columns
    assert "minus_di" in out.columns

    adx = out["adx"].dropna()
    plus_di = out["plus_di"].dropna()
    minus_di = out["minus_di"].dropna()

    assert not adx.empty
    assert not plus_di.empty
    assert not minus_di.empty

    assert (adx >= 0).all()
    assert (plus_di >= 0).all()
    assert (minus_di >= 0).all()


def test_cci_vectorized_and_uses_kb_period():
    df = _make_basic_df(200)
    pipe = TechnicalIndicatorsPipeline()
    out = pipe.calculate_indicators(df)

    assert "cci" in out.columns

    period = pipe.params.get("cci_period")
    assert period == 14

    cci = out["cci"]
    assert cci.isna().sum() >= period - 1
    assert not cci.dropna().empty


def test_adx_respects_configured_period():
    df = _make_basic_df(200)
    pipe = TechnicalIndicatorsPipeline(config={"indicator_params": {"adx_period": 10}})
    out = pipe.calculate_indicators(df)

    assert "adx" in out.columns
    adx = out["adx"].dropna()
    assert not adx.empty


def test_supertrend_uses_kb_defaults_and_produces_values():
    df = _make_basic_df(200)
    pipe = TechnicalIndicatorsPipeline()
    out = pipe.calculate_indicators(df)

    assert pipe.params.get("supertrend_period") == 7
    assert pipe.params.get("supertrend_multiplier") == 3.0

    assert "supertrend" in out.columns
    supertrend = out["supertrend"].dropna()
    assert not supertrend.empty


def test_demarker_and_schaff_tc_basic_ranges():
    df = _make_basic_df(200)
    pipe = TechnicalIndicatorsPipeline()
    out = pipe.calculate_indicators(df)

    assert "demarker" in out.columns
    assert "schaff_tc" in out.columns

    dem = out["demarker"].dropna()
    stc = out["schaff_tc"].dropna()

    assert not dem.empty
    assert not stc.empty

    assert ((dem >= 0) & (dem <= 1)).all()
    assert ((stc >= 0) & (stc <= 100)).all()


def test_flat_market_does_not_produce_infinite_values():
    df = _make_flat_df(200)
    pipe = TechnicalIndicatorsPipeline()
    out = pipe.calculate_indicators(df)

    numeric_cols = [
        "adx",
        "plus_di",
        "minus_di",
        "cci",
        "demarker",
        "schaff_tc",
    ]

    for col in numeric_cols:
        if col in out.columns:
            series = out[col]
            assert not series.isin([np.inf, -np.inf]).any()
