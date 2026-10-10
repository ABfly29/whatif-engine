from dataclasses import dataclass
from decimal import Decimal
from itertools import product

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import project_cashflow


@dataclass(frozen=True)
class SensitivityResult:
    salary_growth_rate: Decimal
    expense_inflation_rate: Decimal
    employment_gap_months: int
    ending_cash: Decimal
    lowest_ending_cash: Decimal
    first_negative_month: int | None


def run_sensitivity_analysis(
    job: JobOffer,
    living_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    salary_growth_rates: tuple[Decimal, ...] = (
        Decimal("0.05"),
        Decimal("0.091"),
        Decimal("0.12"),
    ),
    expense_inflation_rates: tuple[Decimal, ...] = (
        Decimal("0.04"),
        Decimal("0.05"),
        Decimal("0.07"),
    ),
    employment_gaps: tuple[int, ...] = (0, 1, 3),
    one_time_costs: Decimal = Decimal("0"),
    lost_bonus: Decimal = Decimal("0"),
    joining_bonus: Decimal = Decimal("0"),
) -> tuple[SensitivityResult, ...]:
    if not salary_growth_rates or not expense_inflation_rates or not employment_gaps:
        raise ValueError("Each sensitivity input must contain at least one value.")

    results = []

    for growth, inflation, gap in product(
        salary_growth_rates,
        expense_inflation_rates,
        employment_gaps,
    ):
        projection = project_cashflow(
            job=job,
            living_costs=living_costs,
            starting_savings=starting_savings,
            horizon_months=horizon_months,
            one_time_costs=one_time_costs,
            salary_growth_rate=growth,
            expense_inflation_rate=inflation,
            employment_gap_months=gap,
            lost_bonus=lost_bonus,
            joining_bonus=joining_bonus,
        )

        results.append(
            SensitivityResult(
                salary_growth_rate=growth,
                expense_inflation_rate=inflation,
                employment_gap_months=gap,
                ending_cash=projection.months[-1].ending_cash,
                lowest_ending_cash=projection.lowest_ending_cash,
                first_negative_month=projection.first_negative_month,
            )
        )

    return tuple(results)
