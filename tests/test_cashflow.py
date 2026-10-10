from decimal import Decimal

import pytest

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import project_cashflow


def test_monthly_cashflow_projection():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )

    result = project_cashflow(
        job=job,
        living_costs=costs,
        starting_savings=Decimal("100000"),
        horizon_months=3,
        one_time_costs=Decimal("50000"),
    )

    assert result.months[0].ending_cash == Decimal("130000")
    assert result.months[1].ending_cash == Decimal("210000")
    assert result.months[2].ending_cash == Decimal("290000")
    assert result.lowest_ending_cash == Decimal("130000")
    assert result.first_negative_month is None


def test_detects_negative_cash_balance():
    job = JobOffer(annual_take_home=Decimal("0"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    result = project_cashflow(
        job=job,
        living_costs=costs,
        starting_savings=Decimal("5000"),
        horizon_months=3,
    )

    assert result.first_negative_month == 1
    assert result.lowest_ending_cash == Decimal("-25000")


def test_invalid_horizon_is_rejected():
    job = JobOffer(annual_take_home=Decimal("600000"))
    costs = LivingCosts(
        monthly_rent=Decimal("0"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    with pytest.raises(ValueError):
        project_cashflow(job, costs, Decimal("0"), 0)
