from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.sensitivity import run_sensitivity_analysis


def test_sensitivity_generates_all_combinations():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )

    results = run_sensitivity_analysis(
        job=job,
        living_costs=costs,
        starting_savings=Decimal("100000"),
        horizon_months=12,
    )

    assert len(results) == 27


def test_higher_salary_growth_increases_ending_cash():
    job = JobOffer(annual_take_home=Decimal("1200000"))
    costs = LivingCosts(
        monthly_rent=Decimal("0"),
        monthly_utilities=Decimal("0"),
        monthly_food=Decimal("0"),
        monthly_transport=Decimal("0"),
    )

    results = run_sensitivity_analysis(
        job=job,
        living_costs=costs,
        starting_savings=Decimal("0"),
        horizon_months=24,
        salary_growth_rates=(Decimal("0.05"), Decimal("0.12")),
        expense_inflation_rates=(Decimal("0.05"),),
        employment_gaps=(0,),
    )

    assert results[1].ending_cash > results[0].ending_cash
