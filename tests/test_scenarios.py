from decimal import Decimal

import pytest

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.scenarios import calculate_scenario


def test_scenario_calculation():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )

    result = calculate_scenario(
        job=job,
        living_costs=costs,
        starting_savings=Decimal("100000"),
        horizon_months=12,
        one_time_costs=Decimal("20000"),
    )

    assert result.total_income == Decimal("1200000")
    assert result.total_living_costs == Decimal("240000")
    assert result.monthly_surplus == Decimal("80000")
    assert result.ending_cash == Decimal("1040000")


def test_invalid_horizon_is_rejected():
    job = JobOffer(annual_take_home=Decimal("600000"))
    costs = LivingCosts(
        monthly_rent=Decimal("0"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    with pytest.raises(ValueError):
        calculate_scenario(job, costs, Decimal("0"), 0)
