from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class JobOffer:
    annual_take_home: Decimal
    annual_bonus: Decimal = Decimal("0")
    annual_salary_growth_rate: Decimal = Decimal("0.091")

    def __post_init__(self) -> None:
        if self.annual_take_home < 0:
            raise ValueError("Annual take-home cannot be negative.")
        if self.annual_bonus < 0:
            raise ValueError("Annual bonus cannot be negative.")
        if not Decimal("0") <= self.annual_salary_growth_rate <= Decimal("1"):
            raise ValueError("Salary growth rate must be between 0 and 1.")


@dataclass(frozen=True)
class LivingCosts:
    monthly_rent: Decimal
    monthly_utilities: Decimal
    monthly_food: Decimal
    monthly_transport: Decimal
    monthly_other: Decimal = Decimal("0")

    def __post_init__(self) -> None:
        values = (
            self.monthly_rent,
            self.monthly_utilities,
            self.monthly_food,
            self.monthly_transport,
            self.monthly_other,
        )
        if any(value < 0 for value in values):
            raise ValueError("Living costs cannot be negative.")

    @property
    def total_monthly(self) -> Decimal:
        return sum(
            (
                self.monthly_rent,
                self.monthly_utilities,
                self.monthly_food,
                self.monthly_transport,
                self.monthly_other,
            ),
            start=Decimal("0"),
        )


@dataclass(frozen=True)
class FinancialProfile:
    current_job: JobOffer
    current_living_costs: LivingCosts
    current_savings: Decimal

    def __post_init__(self) -> None:
        if self.current_savings < 0:
            raise ValueError("Current savings cannot be negative.")
