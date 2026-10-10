from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.annual_summary import (
    AnnualSummary,
    summarize_annual_cashflow,
)
from whatif_engine.engine.cashflow import (
    DEFAULT_EXPENSE_INFLATION,
    CashFlowProjection,
    project_cashflow,
)


@dataclass(frozen=True)
class DecisionComparison:
    stay: CashFlowProjection
    switch: CashFlowProjection
    stay_annual: tuple[AnnualSummary, ...]
    switch_annual: tuple[AnnualSummary, ...]
    ending_cash_difference: Decimal
    break_even_month: int | None


def _sustained_break_even(
    stay: CashFlowProjection, switch: CashFlowProjection
) -> int | None:
    break_even = None
    for s, t in zip(switch.months, stay.months):
        if s.ending_cash >= t.ending_cash:
            if break_even is None:
                break_even = s.month
        else:
            break_even = None
    return break_even


def compare_stay_vs_switch(
    current_job: JobOffer,
    new_job: JobOffer,
    current_costs: LivingCosts,
    new_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    expense_inflation_rate: Decimal = DEFAULT_EXPENSE_INFLATION,
    employment_gap_months: int = 0,
    relocation_cost: Decimal = Decimal("0"),
    lost_bonus: Decimal = Decimal("0"),
    joining_bonus: Decimal = Decimal("0"),
) -> DecisionComparison:
    """Project staying versus switching with the same cash-flow engine.

    break_even_month is the first month from which the switch scenario's cash
    balance stays at or above the stay scenario's through the end of the
    horizon. It is None if the switch is behind in the final month, so a
    temporary lead (e.g. from a joining bonus) is not reported as break-even.
    """
    stay = project_cashflow(
        job=current_job,
        living_costs=current_costs,
        starting_savings=starting_savings,
        horizon_months=horizon_months,
        expense_inflation_rate=expense_inflation_rate,
    )
    switch = project_cashflow(
        job=new_job,
        living_costs=new_costs,
        starting_savings=starting_savings,
        horizon_months=horizon_months,
        one_time_costs=relocation_cost,
        expense_inflation_rate=expense_inflation_rate,
        employment_gap_months=employment_gap_months,
        lost_bonus=lost_bonus,
        joining_bonus=joining_bonus,
    )

    return DecisionComparison(
        stay=stay,
        switch=switch,
        stay_annual=summarize_annual_cashflow(stay),
        switch_annual=summarize_annual_cashflow(switch),
        ending_cash_difference=(
            switch.months[-1].ending_cash - stay.months[-1].ending_cash
        ),
        break_even_month=_sustained_break_even(stay, switch),
    )


@dataclass(frozen=True)
class DecisionSensitivityRow:
    new_salary_growth_rate: Decimal
    expense_inflation_rate: Decimal
    employment_gap_months: int
    stay_ending_cash: Decimal
    switch_ending_cash: Decimal
    ending_cash_difference: Decimal
    switch_lowest_cash: Decimal
    switch_first_negative_month: int | None


def run_decision_sensitivity(
    current_job: JobOffer,
    new_job: JobOffer,
    current_costs: LivingCosts,
    new_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    salary_growth_rates: tuple[Decimal, ...],
    expense_inflation_rates: tuple[Decimal, ...],
    employment_gaps: tuple[int, ...],
    relocation_cost: Decimal = Decimal("0"),
    lost_bonus: Decimal = Decimal("0"),
    joining_bonus: Decimal = Decimal("0"),
) -> tuple[DecisionSensitivityRow, ...]:
    """Stay-vs-switch outcome across alternative assumptions.

    Varies the new job's salary growth, expense inflation (applied to both
    scenarios) and the employment gap. The current job keeps its own growth.
    """
    if not salary_growth_rates or not expense_inflation_rates or not employment_gaps:
        raise ValueError("Each sensitivity input must contain at least one value.")

    rows = []
    for growth in salary_growth_rates:
        for inflation in expense_inflation_rates:
            for gap in employment_gaps:
                comparison = compare_stay_vs_switch(
                    current_job=current_job,
                    new_job=JobOffer(
                        new_job.annual_take_home,
                        new_job.annual_bonus,
                        growth,
                    ),
                    current_costs=current_costs,
                    new_costs=new_costs,
                    starting_savings=starting_savings,
                    horizon_months=horizon_months,
                    expense_inflation_rate=inflation,
                    employment_gap_months=gap,
                    relocation_cost=relocation_cost,
                    lost_bonus=lost_bonus,
                    joining_bonus=joining_bonus,
                )
                rows.append(
                    DecisionSensitivityRow(
                        new_salary_growth_rate=growth,
                        expense_inflation_rate=inflation,
                        employment_gap_months=gap,
                        stay_ending_cash=comparison.stay.months[-1].ending_cash,
                        switch_ending_cash=comparison.switch.months[-1].ending_cash,
                        ending_cash_difference=comparison.ending_cash_difference,
                        switch_lowest_cash=comparison.switch.lowest_ending_cash,
                        switch_first_negative_month=(
                            comparison.switch.first_negative_month
                        ),
                    )
                )
    return tuple(rows)
