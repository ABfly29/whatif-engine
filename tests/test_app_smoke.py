from decimal import Decimal

import pytest

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.decision import compare_stay_vs_switch

APP = "../frontend/app.py"


def load():
    return AppTest.from_file(APP, default_timeout=30).run()


def test_app_runs_with_sample_values_and_labels_them():
    at = load()
    assert not at.exception
    assert any("sample numbers" in i.value for i in at.info)


def test_sample_switch_table_has_income_every_year():
    # Regression: Switch annual summary must not show zero income.
    at = load()
    assert not at.exception
    switch_table = at.dataframe[1].value
    assert "₹0" not in list(switch_table["Income"])


def test_blank_new_offer_pay_is_flagged_not_shown_as_zero_income():
    # Regression root cause: new pay defaulted to 0 with no warning, so the
    # Switch scenario silently showed zero income.
    at = load()
    at.number_input(key="new_pay").set_value(0.0).run()
    assert not at.exception
    assert any("new offer" in w.value for w in at.warning)
    assert len(at.dataframe) == 0


def test_gap_not_shorter_than_horizon_is_rejected():
    at = load()
    at.number_input(key="gap").set_value(40).run()
    assert not at.exception
    assert any("gap" in w.value for w in at.warning)


def test_nonzero_scenario_matches_engine():
    at = load()
    at.button[1].click().run()  # "Clear all"
    values = {
        "savings": 500000.0,
        "cur_pay": 1200000.0,
        "cur_rent": 20000.0,
        "cur_food": 8000.0,
        "new_pay": 1800000.0,
        "new_rent": 30000.0,
        "new_food": 9000.0,
        "reloc": 100000.0,
        "lost": 50000.0,
        "join": 30000.0,
    }
    for key, value in values.items():
        at.number_input(key=key).set_value(value)
    at.number_input(key="gap").set_value(2)
    at.run()
    assert not at.exception

    def costs(rent, food):
        zero = Decimal(0)
        return LivingCosts(Decimal(rent), zero, Decimal(food), zero)

    expected = compare_stay_vs_switch(
        current_job=JobOffer(Decimal(1200000)),
        new_job=JobOffer(Decimal(1800000)),
        current_costs=costs(20000, 8000),
        new_costs=costs(30000, 9000),
        starting_savings=Decimal(500000),
        horizon_months=36,
        employment_gap_months=2,
        relocation_cost=Decimal(100000),
        lost_bonus=Decimal(50000),
        joining_bonus=Decimal(30000),
    )
    metrics = {m.label: m.value for m in at.metric}
    assert metrics["Difference (switch − stay)"] == _inr(
        expected.ending_cash_difference
    )
    assert metrics["Break-even"] == f"Month {expected.break_even_month}"


def _inr(value):
    # Values in this test are < 1 crore; mirror the app's lakh grouping.
    n = int(value)
    digits = str(abs(n))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return f"{'-' if n < 0 else ''}₹{','.join([*groups, tail])}"
