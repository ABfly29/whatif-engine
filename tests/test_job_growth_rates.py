from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import project_cashflow


def test_each_job_uses_its_own_growth_rate():
    costs = LivingCosts(
        monthly_rent=Decimal("0"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    current_job = JobOffer(
        annual_take_home=Decimal("1200000"),
        annual_salary_growth_rate=Decimal("0.06"),
    )
    new_job = JobOffer(
        annual_take_home=Decimal("1500000"),
        annual_salary_growth_rate=Decimal("0.091"),
    )

    current = project_cashflow(current_job, costs, Decimal("0"), 13)
    new = project_cashflow(new_job, costs, Decimal("0"), 13)

    assert current.months[12].income == Decimal("100000") * Decimal("1.06")
    assert new.months[12].income == Decimal("125000") * Decimal("1.091")