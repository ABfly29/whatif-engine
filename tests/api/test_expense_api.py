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
