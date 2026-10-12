"""The PDF report tests read fixtures written from the real engine.

If the engine's numbers change, these files must be regenerated
(`python scripts/make_expense_fixture.py`); this test fails until they are, so
the report tests never run against stale expectations.
"""

import importlib.util
import json
from pathlib import Path

import pytest

pytest.importorskip("pydantic")

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = ROOT / "web" / "tests" / "fixtures"


def _script():
    spec = importlib.util.spec_from_file_location(
        "make_expense_fixture", ROOT / "scripts" / "make_expense_fixture.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT = _script()


@pytest.mark.parametrize("name", sorted(SCRIPT.FIXTURES))
def test_committed_fixture_matches_the_engine(name):
    from whatif_engine.api.service import handle

    request = SCRIPT.FIXTURES[name]
    fresh = json.loads(handle("expense", json.dumps(request)))
    assert fresh["ok"] is True
    stored = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
    assert stored["request"] == request
    assert stored["response"] == fresh["data"]


def test_fixtures_cover_the_cases_the_report_must_handle():
    stored = {
        name: json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
        for name in SCRIPT.FIXTURES
    }
    codes = {
        w["code"]
        for fixture in stored.values()
        for s in fixture["response"]["scenarios"]
        for w in s["warnings"]
    }
    assert {
        "insufficient_savings",
        "below_emergency_fund",
        "negative_surplus",
        "cash_negative",
        "heavy_share",
        "low_liquidity",
    } <= codes
    assert {f["response"]["horizon_years"] for f in stored.values()} == {1, 3, 5}
    assert any(f["request"]["payment_method"] == "cash" for f in stored.values())
    # A loan longer than the 60-month projection, so a balance remains at year five.
    strained = stored["expense-strain"]["response"]["scenarios"][0]
    assert strained["snapshots"][-1]["loan_balance"] != "0.00"
