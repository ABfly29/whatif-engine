"""Request/response models for the HTTP API.

Money and rates are Decimal so values never pass through binary floats. In
JSON they are sent and returned as strings (numbers are also accepted).
Rates are fractions: 0.091 means 9.1%.
"""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_MONEY = Decimal("10000000000")  # ₹1,000 crore, a sanity ceiling

Money = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, allow_inf_nan=False)]
Rate = Annotated[Decimal, Field(ge=0, le=1, allow_inf_nan=False)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LivingCostsIn(_Model):
    rent: Money = Decimal("0")
    utilities: Money = Decimal("0")
    food: Money = Decimal("0")
    transport: Money = Decimal("0")
    other: Money = Decimal("0")


class JobIn(_Model):
    annual_take_home: Money
    annual_salary_growth_rate: Rate = Decimal("0.091")


class CareerRequest(_Model):
    current_job: JobIn
    new_job: JobIn
    current_costs: LivingCostsIn
    new_costs: LivingCostsIn
    starting_savings: Money = Decimal("0")
    horizon_months: int = Field(36, ge=1, le=120)
    expense_inflation_rate: Rate = Decimal("0.05")
    employment_gap_months: int = Field(0, ge=0, le=120)
    relocation_cost: Money = Decimal("0")
    lost_bonus: Money = Decimal("0")
    joining_bonus: Money = Decimal("0")

    @model_validator(mode="after")
    def gap_within_horizon(self) -> "CareerRequest":
        if self.employment_gap_months > self.horizon_months:
            raise ValueError("Employment gap cannot exceed the projection horizon.")
        return self


class SensitivityRequest(CareerRequest):
    """Grid values are optional; the request's own values are always included."""

    new_salary_growth_rates: list[Rate] | None = Field(None, max_length=7)
    expense_inflation_rates: list[Rate] | None = Field(None, max_length=7)
    employment_gaps: list[Annotated[int, Field(ge=0, le=120)]] | None = Field(
        None, max_length=7
    )


class Summary(_Model):
    stay_ending_cash: Decimal
    switch_ending_cash: Decimal
    ending_cash_difference: Decimal
    break_even_month: int | None
    stay_lowest_cash: Decimal
    switch_lowest_cash: Decimal
    stay_first_negative_month: int | None
    switch_first_negative_month: int | None


class MonthRow(_Model):
    month: int
    stay_income: Decimal
    stay_expenses: Decimal
    stay_cash: Decimal
    switch_income: Decimal
    switch_expenses: Decimal
    switch_cash: Decimal
    switch_relocation: Decimal
    switch_lost_bonus: Decimal
    switch_joining_bonus: Decimal


class AnnualRow(_Model):
    year: int
    total_income: Decimal
    total_expenses: Decimal
    relocation_costs: Decimal
    lost_bonus: Decimal
    joining_bonus: Decimal
    net_savings: Decimal
    ending_cash: Decimal


class CareerResponse(_Model):
    summary: Summary
    months: list[MonthRow]
    stay_annual: list[AnnualRow]
    switch_annual: list[AnnualRow]


class SensitivityRow(_Model):
    new_salary_growth_rate: Decimal
    expense_inflation_rate: Decimal
    employment_gap_months: int
    stay_ending_cash: Decimal
    switch_ending_cash: Decimal
    ending_cash_difference: Decimal
    switch_lowest_cash: Decimal
    switch_first_negative_month: int | None


class SensitivityResponse(_Model):
    rows: list[SensitivityRow]


# ---------- Major expense simulator ----------


class ExpenseRequest(_Model):
    monthly_take_home: Money
    monthly_household_expenses: Money = Decimal("0")
    liquid_savings: Money = Decimal("0")
    emergency_fund: Money = Decimal("0")
    purchase_price: Money
    payment_method: Literal["cash", "loan"] = "loan"
    down_payment: Money = Decimal("0")
    loan_annual_rate: Rate = Decimal("0.09")
    loan_tenure_months: int = Field(60, ge=1, le=240)
    fuel: Money = Decimal("0")
    servicing: Money = Decimal("0")
    parking_tolls: Money = Decimal("0")
    other_running: Money = Decimal("0")
    annual_insurance: Money = Decimal("0")
    annual_salary_growth: Rate = Decimal("0.06")
    expense_inflation: Rate = Decimal("0.05")
    savings_return: Rate = Decimal("0")
    annual_depreciation: Rate = Decimal("0.15")
    annual_price_increase: Rate = Decimal("0.05")
    delay_months: int = Field(12, ge=1, le=36)
    alternative_price: Money
    alternative_running_share: Rate = Decimal("1")
    horizon_years: Literal[1, 3, 5] = 3


class ExpenseSnapshot(_Model):
    year: int
    month: int
    liquid_savings: Decimal
    loan_balance: Decimal
    resale_value: Decimal
    net_worth: Decimal
    liquid_vs_baseline: Decimal
    net_worth_vs_baseline: Decimal
    interest_paid: Decimal
    running_costs_paid: Decimal
    depreciation: Decimal
    ownership_cost: Decimal


class ExpenseWarning(_Model):
    code: str
    month: int | None
    amount: Decimal | None


class ExpenseScenario(_Model):
    key: str
    purchase_month: int | None
    price: Decimal
    upfront_payment: Decimal
    loan_principal: Decimal
    emi: Decimal
    total_interest: Decimal
    total_loan_payments: Decimal
    surplus_before: Decimal
    surplus_after: Decimal
    cash_after_upfront: Decimal
    cover_months: Decimal | None
    emergency_fund_shortfall: Decimal
    purchase_share_of_surplus: Decimal | None
    snapshots: list[ExpenseSnapshot]
    warnings: list[ExpenseWarning]


class ExpenseMonth(_Model):
    month: int
    liquid: dict[str, Decimal]
    net_worth: dict[str, Decimal]


class ExpenseResponse(_Model):
    horizon_years: int
    baseline: ExpenseScenario
    scenarios: list[ExpenseScenario]
    months: list[ExpenseMonth]
