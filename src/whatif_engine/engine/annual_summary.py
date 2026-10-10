from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.engine.cashflow import CashFlowProjection


@dataclass(frozen=True)
class AnnualSummary:
    year: int
    total_income: Decimal
    total_expenses: Decimal
    relocation_costs: Decimal
    lost_bonus: Decimal
    joining_bonus: Decimal
    net_savings: Decimal
    ending_cash: Decimal


def summarize_annual_cashflow(
    projection: CashFlowProjection,
) -> tuple[AnnualSummary, ...]:
    yearly: dict[int, list] = {}

    for month in projection.months:
        year = (month.month - 1) // 12 + 1
        yearly.setdefault(year, []).append(month)

    summaries = []

    for year, months in sorted(yearly.items()):
        total_income = sum(
            (m.income for m in months), Decimal("0")
        )
        total_expenses = sum(
            (m.expenses for m in months), Decimal("0")
        )
        relocation = sum(
            (m.relocation_costs for m in months), Decimal("0")
        )
        lost_bonus = sum(
            (m.lost_bonus for m in months), Decimal("0")
        )
        joining_bonus = sum(
            (m.joining_bonus for m in months), Decimal("0")
        )

        net_savings = (
            total_income
            - total_expenses
            - relocation
            - lost_bonus
            + joining_bonus
        )

        summaries.append(
            AnnualSummary(
                year=year,
                total_income=total_income,
                total_expenses=total_expenses,
                relocation_costs=relocation,
                lost_bonus=lost_bonus,
                joining_bonus=joining_bonus,
                net_savings=net_savings,
                ending_cash=months[-1].ending_cash,
            )
        )

    return tuple(summaries)