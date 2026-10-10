from decimal import Decimal

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from whatif_engine.api.main import app
from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.decision import compare_stay_vs_switch

client = TestClient(app)

COSTS = {"rent": "20000", "food": "8000"}


def payload(**overrides):
    body = {
        "current_job": {"annual_take_home": "1200000"},
        "new_job": {"annual_take_home": "1800000"},
        "current_costs": COSTS,
        "new_costs": {"rent": "30000", "food": "9000"},
        "starting_savings": "500000",
        "horizon_months": 36,
        "employment_gap_months": 2,
        "relocation_cost": "100000",
        "lost_bonus": "50000",
        "joining_bonus": "30000",
    }
    body.update(overrides)
    return body


def test_health():
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_compare_matches_engine_directly():
    response = client.post("/api/v1/career/compare", json=payload())
    assert response.status_code == 200
    data = response.json()

    z = Decimal(0)
    expected = compare_stay_vs_switch(
        JobOffer(Decimal(1200000)),
        JobOffer(Decimal(1800000)),
        LivingCosts(Decimal(20000), z, Decimal(8000), z),
        LivingCosts(Decimal(30000), z, Decimal(9000), z),
        Decimal(500000),
        36,
        employment_gap_months=2,
        relocation_cost=Decimal(100000),
        lost_bonus=Decimal(50000),
        joining_bonus=Decimal(30000),
    )
    summary = data["summary"]
    assert Decimal(summary["ending_cash_difference"]) == round(
        expected.ending_cash_difference, 2
    )
    assert summary["break_even_month"] == expected.break_even_month
    assert len(data["months"]) == 36
    assert len(data["switch_annual"]) == 3
    assert Decimal(data["switch_annual"][0]["total_income"]) == round(
        expected.switch_annual[0].total_income, 2
    )
    # Money is returned as strings, never floats.
    assert isinstance(summary["stay_ending_cash"], str)


def test_month_rows_show_gap_and_one_time_items():
    months = client.post("/api/v1/career/compare", json=payload()).json()["months"]
    assert Decimal(months[0]["switch_income"]) == 0
    assert Decimal(months[0]["switch_relocation"]) == 100000
    assert Decimal(months[0]["switch_lost_bonus"]) == 50000
    assert Decimal(months[2]["switch_joining_bonus"]) == 30000
    assert Decimal(months[2]["switch_income"]) > 0


def test_break_even_none_serialises_as_null():
    body = payload(new_job={"annual_take_home": "1200000"})
    summary = client.post("/api/v1/career/compare", json=body).json()["summary"]
    assert summary["break_even_month"] is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"starting_savings": "-1"},
        {"horizon_months": 0},
        {"horizon_months": 500},
        {"employment_gap_months": 40},
        {"expense_inflation_rate": "1.5"},
        {"relocation_cost": "abc"},
        {"relocation_cost": "NaN"},
        {"current_job": {"annual_take_home": "-5"}},
        {"new_job": {"annual_take_home": "1", "annual_salary_growth_rate": "2"}},
        {"unexpected_field": 1},
    ],
)
def test_invalid_input_is_rejected(overrides):
    response = client.post("/api/v1/career/compare", json=payload(**overrides))
    assert response.status_code == 422


def test_missing_required_field_is_rejected():
    body = payload()
    del body["new_job"]
    assert client.post("/api/v1/career/compare", json=body).status_code == 422


def test_sensitivity_includes_own_values_and_matches_compare():
    body = payload(
        expense_inflation_rate="0.06",
        new_job={"annual_take_home": "1800000", "annual_salary_growth_rate": "0.08"},
    )
    response = client.post("/api/v1/career/sensitivity", json=body)
    assert response.status_code == 200
    rows = response.json()["rows"]
    # 3 growth x 3 inflation x gaps {0,1,2,3,6}
    assert len(rows) == 3 * 3 * 5
    own = next(
        r
        for r in rows
        if Decimal(r["new_salary_growth_rate"]) == Decimal("0.08")
        and Decimal(r["expense_inflation_rate"]) == Decimal("0.06")
        and r["employment_gap_months"] == 2
    )
    compare = client.post("/api/v1/career/compare", json=body).json()["summary"]
    assert own["ending_cash_difference"] == compare["ending_cash_difference"]


def test_sensitivity_gaps_beyond_horizon_are_dropped():
    body = payload(horizon_months=4, employment_gap_months=0)
    rows = client.post("/api/v1/career/sensitivity", json=body).json()["rows"]
    assert max(r["employment_gap_months"] for r in rows) <= 4


def test_sensitivity_grid_size_is_capped():
    body = payload(employment_gaps=list(range(10)))
    assert client.post("/api/v1/career/sensitivity", json=body).status_code == 422
