from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts


@dataclass(frozen=True)
class MonthlyCashFlow:
    month: int
    income: Decimal
    expenses: Decimal
    one_time_costs: Decimal
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
) -> CashFlowProjection:
    if starting_savings < 0:
        raise ValueError("Starting savings cannot be negative.")
    if horizon_months <= 0:
        raise ValueError("Horizon must be greater than zero.")
    if one_time_costs < 0:
        raise ValueError("One-time costs cannot be negative.")

    monthly_income = job.annual_take_home / Decimal("12")
    monthly_expenses = living_costs.total_monthly
    balance = starting_savings
    months = []

    for month in range(1, horizon_months + 1):
        upfront = one_time_costs if month == 1 else Decimal("0")
        balance += monthly_income - monthly_expenses - upfront

        months.append(
            MonthlyCashFlow(
                month=month,
                income=monthly_income,
                expenses=monthly_expenses,
                one_time_costs=upfront,
                ending_cash=balance,
            )
        )

    lowest = min(item.ending_cash for item in months)
    first_negative = next(
        (
            item.month
            for item in months
            if item.ending_cash < 0
        ),
        None,
    )

    return CashFlowProjection(
        months=tuple(months),
        lowest_ending_cash=lowest,
        first_negative_month=first_negative,
    )
