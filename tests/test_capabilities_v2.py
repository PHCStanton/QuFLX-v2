from __future__ import annotations

import csv
import tempfile
from pathlib import Path

from capabilities_v2.base import Ctx
from capabilities_v2.history_collector import HistoryCollector


def test_history_collector_writes_expected_csv_from_dicts() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ctx = Ctx(driver=None, artifacts_root=str(tmp), debug=False, dry_run=True, verbose=False)
        cap = HistoryCollector()
        res = cap.run(
            ctx,
            {
                "action": "save",
                "asset": "EUR/USD OTC",
                "timeframe": 1,
                "output_root": tmp,
                "candles": [
                    {"timestamp": 1734567890, "open": 1.0, "high": 1.2, "low": 0.9, "close": 1.1, "volume": 10},
                    {"timestamp": 1734567950, "open": 1.1, "high": 1.3, "low": 1.0, "close": 1.2, "volume": 12},
                ],
            },
        )
        assert res.ok
        filepath = Path(res.data["filepath"])
        assert filepath.exists()

        rows = list(csv.reader(filepath.open("r", encoding="utf-8", newline="")))
        assert rows[0] == ["timestamp", "open", "high", "low", "close", "volume"]
        assert len(rows) == 3


def test_history_collector_parses_v1_list_format() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ctx = Ctx(driver=None, artifacts_root=str(tmp), debug=False, dry_run=True, verbose=False)
        cap = HistoryCollector()
        res = cap.run(
            ctx,
            {
                "action": "save",
                "asset": "EURUSD_otc",
                "output_root": tmp,
                "candles": [
                    [1734567890, 1.0, 1.1, 1.2, 0.9],
                    [1734568190, 1.1, 1.0, 1.15, 0.95],
                ],
            },
        )
        assert res.ok
        assert res.data["timeframe"] == 5
