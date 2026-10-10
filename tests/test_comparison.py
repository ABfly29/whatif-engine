from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.comparison import compare_scenarios


def test_comparison_against_staying():
    current_job = JobOffer(annual_take_home=Decimal("1200000"))
    new_job = JobOffer(annual_take_home=Decimal("1500000"))

    current_costs = LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("3000"),
    )

    new_costs = LivingCosts(
        monthly_rent=Decimal("20000"),
        monthly_utilities=Decimal("2000"),
        monthly_food=Decimal("5000"),
        monthly_transport=Decimal("4000"),
    )

    results = compare_scenarios(
        current_job=current_job,
        current_costs=current_costs,
        starting_savings=Decimal("100000"),
        horizon_months=12,
        alternatives={
            "Switch + relocate": (
                new_job,
                new_costs,
                Decimal("50000"),
            ),
        },
    )

    stay = next(item for item in results if item.name == "Stay")
    move = next(
        item for item in results if item.name == "Switch + relocate"
    )

    assert stay.difference_vs_staying == Decimal("0")
    assert move.difference_vs_staying == Decimal("118000")
