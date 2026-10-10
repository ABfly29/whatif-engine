from decimal import Decimal

import pytest

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import project_cashflow


def setup_inputs():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )
    return job, costs


def test_employment_gap_removes_income():
    job, costs = setup_inputs()
    result = project_cashflow(
        job, costs, Decimal("100000"), 3,
        salary_growth_rate=Decimal("0"),
        expense_inflation_rate=Decimal("0"),
        employment_gap_months=1,
    )
    assert result.months[0].income == Decimal("0")
    assert result.months[1].income == Decimal("100000")


def test_lost_and_joining_bonuses():
    job, costs = setup_inputs()
    result = project_cashflow(
        job, costs, Decimal("100000"), 2,
        salary_growth_rate=Decimal("0"),
        expense_inflation_rate=Decimal("0"),
        lost_bonus=Decimal("20000"),
        joining_bonus=Decimal("50000"),
    )

    assert result.months[0].lost_bonus == Decimal("20000")
    assert result.months[0].joining_bonus == Decimal("50000")
    assert result.months[0].ending_cash == Decimal("210000")
    assert result.months[1].lost_bonus == Decimal("0")
    assert result.months[1].joining_bonus == Decimal("0")


def test_gap_cannot_exceed_horizon():
    job, costs = setup_inputs()
    with pytest.raises(ValueError):
        project_cashflow(
            job, costs, Decimal("100000"), 2,
            employment_gap_months=3,
        )
