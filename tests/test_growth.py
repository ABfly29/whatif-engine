from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import project_cashflow


def test_salary_growth_starts_in_month_13():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("0"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    result = project_cashflow(
        job, costs, Decimal("0"), 13
    )

    assert result.months[0].income == Decimal("100000")
    assert result.months[11].income == Decimal("100000")
    assert result.months[12].income == Decimal("100000") * Decimal("1.091")


def test_expense_inflation_starts_in_month_13():
    job = JobOffer(annual_take_home=Decimal("0"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    result = project_cashflow(
        job, costs, Decimal("1000000"), 13
    )

    assert result.months[11].expenses == Decimal("10000")
    assert result.months[12].expenses == Decimal("10000") * Decimal("1.05")
