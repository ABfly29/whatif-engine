from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts


@dataclass(frozen=True)
class ScenarioResult:
    horizon_months: int
    total_income: Decimal
    total_living_costs: Decimal
    one_time_costs: Decimal
    ending_cash: Decimal
    monthly_surplus: Decimal


def calculate_scenario(
    job: JobOffer,
    living_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    one_time_costs: Decimal = Decimal("0"),
) -> ScenarioResult:
    if starting_savings < 0:
        raise ValueError("Starting savings cannot be negative.")
    if horizon_months <= 0:
        raise ValueError("Horizon must be greater than zero.")
    if one_time_costs < 0:
        raise ValueError("One-time costs cannot be negative.")

    total_income = (
        job.annual_take_home / Decimal("12") * horizon_months
    )
    total_living_costs = (
        living_costs.total_monthly * horizon_months
    )
    monthly_surplus = (
        job.annual_take_home / Decimal("12")
        - living_costs.total_monthly
    )
    ending_cash = (
        starting_savings
        + total_income
        - total_living_costs
        - one_time_costs
    )

    return ScenarioResult(
        horizon_months=horizon_months,
        total_income=total_income,
        total_living_costs=total_living_costs,
        one_time_costs=one_time_costs,
        ending_cash=ending_cash,
        monthly_surplus=monthly_surplus,
    )
