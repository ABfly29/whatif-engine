from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts

DEFAULT_SALARY_GROWTH = Decimal("0.091")
DEFAULT_EXPENSE_INFLATION = Decimal("0.05")


@dataclass(frozen=True)
class MonthlyCashFlow:
    month: int
    income: Decimal
    expenses: Decimal
    relocation_costs: Decimal
    lost_bonus: Decimal
    joining_bonus: Decimal
    ending_cash: Decimal


@dataclass(frozen=True)
class CashFlowProjection:
    months: tuple[MonthlyCashFlow, ...]
    lowest_ending_cash: Decimal
    first_negative_month: int | None


def project_cashflow(
    job: JobOffer,
    living_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    one_time_costs: Decimal = Decimal("0"),
    salary_growth_rate: Decimal | None = None,
    expense_inflation_rate: Decimal = DEFAULT_EXPENSE_INFLATION,
    employment_gap_months: int = 0,
    lost_bonus: Decimal = Decimal("0"),
    joining_bonus: Decimal = Decimal("0"),
) -> CashFlowProjection:
    if starting_savings < 0:
        raise ValueError("Starting savings cannot be negative.")
    if horizon_months <= 0:
        raise ValueError("Horizon must be greater than zero.")
    if not 0 <= employment_gap_months <= horizon_months:
        raise ValueError("Employment gap must be within the projection horizon.")
    if min(one_time_costs, lost_bonus, joining_bonus) < 0:
        raise ValueError("Costs and bonuses cannot be negative.")

    growth_rate = (
        job.annual_salary_growth_rate
        if salary_growth_rate is None
        else salary_growth_rate
    )

    if not Decimal("-1") < growth_rate <= Decimal("1"):
        raise ValueError("Salary growth must be greater than -100% and at most 100%.")
    if not Decimal("0") <= expense_inflation_rate <= Decimal("1"):
        raise ValueError("Expense inflation must be between 0% and 100%.")

    monthly_income_base = job.annual_take_home / Decimal("12")
    monthly_expenses_base = living_costs.total_monthly
    balance = starting_savings
    months = []
    employed_months = 0

    for month in range(1, horizon_months + 1):
        income = Decimal("0")

        if month > employment_gap_months:
            completed_years = employed_months // 12
            income = monthly_income_base * (
                (Decimal("1") + growth_rate) ** completed_years
            )
            employed_months += 1

        completed_years = (month - 1) // 12
        expenses = monthly_expenses_base * (
            (Decimal("1") + expense_inflation_rate) ** completed_years
        )

        relocation = one_time_costs if month == 1 else Decimal("0")
        forfeited = lost_bonus if month == 1 else Decimal("0")
        joining = (
            joining_bonus
            if month == employment_gap_months + 1
            else Decimal("0")
        )

        balance += income - expenses - relocation - forfeited + joining

        months.append(
            MonthlyCashFlow(
                month=month,
                income=income,
                expenses=expenses,
                relocation_costs=relocation,
                lost_bonus=forfeited,
                joining_bonus=joining,
                ending_cash=balance,
            )
        )

    return CashFlowProjection(
        months=tuple(months),
        lowest_ending_cash=min(item.ending_cash for item in months),
        first_negative_month=next(
            (item.month for item in months if item.ending_cash < 0),
            None,
        ),
    )
