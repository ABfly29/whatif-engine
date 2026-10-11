from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.annual_summary import summarize_annual_cashflow
from whatif_engine.engine.cashflow import project_cashflow


def test_annual_summary_matches_monthly_projection():
    job = JobOffer(
        annual_take_home=Decimal("1200000"),
        annual_salary_growth_rate=Decimal("0.06"),
    )
    costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )

    projection = project_cashflow(
        job, costs, Decimal("100000"), 13,
        salary_growth_rate=None,
        expense_inflation_rate=Decimal("0.05"),
        one_time_costs=Decimal("20000"),
    )

    summaries = summarize_annual_cashflow(projection)

    assert len(summaries) == 2
    assert summaries[0].total_income == Decimal("1200000")
    assert summaries[0].total_expenses == Decimal("240000")
    assert summaries[0].relocation_costs == Decimal("20000")
    assert summaries[0].net_savings == Decimal("940000")
    assert summaries[0].ending_cash == Decimal("1040000")
    assert summaries[1].ending_cash == projection.months[12].ending_cash