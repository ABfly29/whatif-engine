"""Major expense simulator over HTTP and through the browser entry point."""

import json
from decimal import Decimal

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from whatif_engine.api import service
from whatif_engine.api.main import app

client = TestClient(app)
URL = "/api/v1/expenses/simulate"


def payload(**overrides):
    body = {
        "monthly_take_home": "100000",
        "monthly_household_expenses": "55000",
        "liquid_savings": "600000",
        "emergency_fund": "300000",
        "purchase_price": "1000000",
        "payment_method": "loan",
        "down_payment": "200000",
        "loan_annual_rate": "0.09",
        "loan_tenure_months": 60,
        "fuel": "6000",
        "servicing": "1500",
        "parking_tolls": "1000",
        "other_running": "500",
        "annual_insurance": "30000",
        "alternative_price": "700000",
    }
    body.update(overrides)
    return body


def test_http_and_browser_entry_points_agree():
    body = payload()
    http = client.post(URL, json=body).json()
    browser = json.loads(service.handle("expense", json.dumps(body)))
    assert browser["ok"] is True
    assert browser["data"] == http


def test_response_shape_and_values_are_rounded_to_paise():
    data = client.post(URL, json=payload()).json()
    assert [s["key"] for s in data["scenarios"]] == ["buy_now", "delay", "cheaper"]
    assert data["baseline"]["key"] == "baseline"
    assert len(data["months"]) == 60
    buy = data["scenarios"][0]
    assert buy["emi"] == "16606.68"  # ₹8,00,000 at 9% over 60 months
    assert Decimal(buy["total_interest"]).as_tuple().exponent == -2
    assert [x["year"] for x in buy["snapshots"]] == [1, 3, 5]
    assert buy["loan_principal"] == "800000.00"
    assert buy["snapshots"][2]["loan_balance"] == "0.00"
    assert data["baseline"]["snapshots"][0]["liquid_savings"] == "1140000.00"
    assert set(data["months"][0]["liquid"]) == {
        "baseline", "buy_now", "delay", "cheaper"
    }


def test_cash_purchase_ignores_loan_fields():
    body = payload(payment_method="cash", down_payment="5", loan_tenure_months=7,
                   liquid_savings="2000000")
    buy = client.post(URL, json=body).json()["scenarios"][0]
    assert buy["upfront_payment"] == "1000000.00"
    assert buy["emi"] == "0.00" and buy["loan_principal"] == "0.00"


def test_warnings_are_reported_with_codes():
    body = payload(liquid_savings="150000", emergency_fund="100000")
    buy = client.post(URL, json=body).json()["scenarios"][0]
    assert {w["code"] for w in buy["warnings"]} >= {"insufficient_savings"}


@pytest.mark.parametrize(
    "override",
    [
        {"purchase_price": "0"},
        {"monthly_take_home": "-1"},
        {"horizon_years": 2},
        {"payment_method": "barter"},
        {"loan_annual_rate": "1.5"},
        {"loan_tenure_months": 0},
        {"delay_months": 99},
        {"down_payment": "1000000"},  # not less than the price
        {"alternative_price": "1000000"},  # not cheaper
        {"emergency_fund": "700000"},  # more than savings
        {"surprise": "1"},
    ],
)
def test_invalid_requests_are_rejected_on_both_transports(override):
    body = payload(**override)
    assert client.post(URL, json=body).status_code == 422
    out = json.loads(service.handle("expense", json.dumps(body)))
    assert out["ok"] is False and out["status"] == 422


def test_amounts_above_the_ceiling_are_rejected():
    assert client.post(URL, json=payload(purchase_price="99999999999")).status_code == 422


def test_total_depreciation_is_accepted():
    body = payload(annual_depreciation="1", delay_months=6)
    assert client.post(URL, json=body).status_code == 200
    out = json.loads(service.handle("expense", json.dumps(body)))
    assert out["ok"] is True


# ---------- fixes confirmed by the adversarial QA pass ----------


def early_career(**overrides):
    """QA profile 1: Rs 35,000 take-home, Rs 22,000 expenses, Rs 1,50,000 saved, Rs 8,00,000 car at 20% down, 10%."""
    profile = {
        "monthly_take_home": "35000", "monthly_household_expenses": "22000", "liquid_savings": "150000",
        "emergency_fund": "0", "purchase_price": "800000", "down_payment": "160000", "loan_annual_rate": "0.10",
        "fuel": "0", "servicing": "0", "parking_tolls": "0", "other_running": "0", "annual_insurance": "0",
        "delay_months": 24, "alternative_price": "600000", "horizon_years": 5,
    }
    return payload(**{**profile, **overrides})


def scenario_of(data, key):
    return next(x for x in data["scenarios"] if x["key"] == key)


def test_heavy_share_keeps_its_percentage_precision_through_serialization():
    data = client.post(URL, json=early_career()).json()
    delayed, cheaper = scenario_of(data, "delay"), scenario_of(data, "cheaper")
    # 99.48% and 78.45%: the warning carries the same four-decimal fraction as the scenario field,
    # not a paise-rounded 0.99 / 0.78.
    assert delayed["purchase_share_of_surplus"] == "0.9948"
    assert next(w for w in delayed["warnings"] if w["code"] == "heavy_share")["amount"] == "0.9948"
    assert cheaper["purchase_share_of_surplus"] == "0.7845"
    assert next(w for w in cheaper["warnings"] if w["code"] == "heavy_share")["amount"] == "0.7845"


def test_money_is_still_rounded_to_paise_next_to_the_precise_share():
    data = client.post(URL, json=early_career()).json()
    delayed = scenario_of(data, "delay")
    assert Decimal(delayed["emi"]).as_tuple().exponent == -2
    assert Decimal(delayed["surplus_after"]).as_tuple().exponent == -2
    negative = next(w for w in scenario_of(data, "buy_now")["warnings"] if w["code"] == "negative_surplus")
    assert negative["amount"] == "-598.11"  # money, not a share


def test_the_same_precision_over_the_browser_entry_point():
    body = early_career()
    http = client.post(URL, json=body).json()
    browser = json.loads(service.handle("expense", json.dumps(body)))["data"]
    assert browser == http
    delayed = scenario_of(browser, "delay")
    assert next(w for w in delayed["warnings"] if w["code"] == "heavy_share")["amount"] == "0.9948"


def test_the_low_liquidity_warning_carries_the_cash_and_the_months_of_cover():
    data = client.post(URL, json=early_career()).json()
    cheaper = scenario_of(data, "cheaper")  # Rs 30,000 left against Rs 22,000 + an EMI of Rs 10,199
    w = next(w for w in cheaper["warnings"] if w["code"] == "low_liquidity")
    assert w["amount"] == "30000.00"
    assert w["cover_months"] == "0.93"
    assert w["month"] is None  # the low point is right after the upfront payment
    # Both prompts are shown, since they say different things.
    assert {x["code"] for x in cheaper["warnings"]} == {"heavy_share", "low_liquidity"}


def test_low_liquidity_never_shares_a_scenario_with_insufficient_savings():
    data = client.post(URL, json=early_career()).json()
    buy = scenario_of(data, "buy_now")  # Rs 10,000 short on day one
    assert {w["code"] for w in buy["warnings"]} == {"insufficient_savings", "negative_surplus"}


def test_negative_cash_is_described_by_its_depth_duration_and_end_state():
    data = client.post(URL, json=early_career()).json()
    buy = scenario_of(data, "buy_now")
    assert buy["peak_shortfall"] == "17177.30"
    assert buy["peak_shortfall_month"] == 12
    assert buy["months_negative"] == 32
    assert buy["negative_at_end"] is False
    delayed = scenario_of(data, "delay")
    assert (delayed["peak_shortfall"], delayed["peak_shortfall_month"], delayed["months_negative"]) == ("0.00", None, 0)
    assert data["baseline"]["months_negative"] == 0


def test_a_scenario_that_never_recovers_says_so():
    body = early_career(monthly_take_home="22000", liquid_savings="161000")  # no monthly surplus at all
    buy = scenario_of(client.post(URL, json=body).json(), "buy_now")
    assert buy["negative_at_end"] is True
    assert buy["months_negative"] > 0
    assert Decimal(buy["peak_shortfall"]) > 0
