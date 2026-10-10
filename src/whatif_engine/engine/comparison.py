from dataclasses import dataclass
from decimal import Decimal

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.scenarios import (
    ScenarioResult,
    calculate_scenario,
)


@dataclass(frozen=True)
class ScenarioComparison:
    name: str
    result: ScenarioResult
    difference_vs_staying: Decimal


def compare_scenarios(
    current_job: JobOffer,
    current_costs: LivingCosts,
    starting_savings: Decimal,
    horizon_months: int,
    alternatives: dict[str, tuple[JobOffer, LivingCosts, Decimal]],
) -> list[ScenarioComparison]:
    scenarios = {
        "Stay": (current_job, current_costs, Decimal("0")),
        **alternatives,
    }

    results = {
        name: calculate_scenario(
            job=job,
            living_costs=costs,
            starting_savings=starting_savings,
            horizon_months=horizon_months,
            one_time_costs=one_time_costs,
        )
        for name, (job, costs, one_time_costs) in scenarios.items()
    }

    baseline = results["Stay"].ending_cash

    return [
        ScenarioComparison(
            name=name,
            result=result,
            difference_vs_staying=result.ending_cash - baseline,
        )
        for name, result in results.items()
    ]
