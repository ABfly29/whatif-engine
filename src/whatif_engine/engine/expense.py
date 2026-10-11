"""Major expense simulator for a vehicle purchase in India.

Compares a no-purchase baseline with three ways of buying, all from the same
starting position:

* ``buy_now``  - buy today at the on-road price.
* ``delay``    - buy ``delay_months`` later at a price raised by the stated
  annual price increase.
* ``cheaper``  - buy today, but a cheaper alternative.

Conventions (all amounts are rupees, ``Decimal``, unrounded inside the engine):

* Months run 1..60. Money moves at month end. A purchase in month ``p`` is
  paid at the end of that month (``p == 0`` means today); running costs and
  EMIs start in month ``p + 1``.
* Salary growth, expense inflation and the price increase are annual and step
  up on each anniversary (months 13, 25, ...). They are separate assumptions.
* Savings earn ``savings_return`` (annual, compounded monthly) on a positive
  opening balance only. The default is 0: nothing is assumed to be invested.
* EMI uses the standard reducing-balance formula with a monthly rate of
  ``annual_rate / 12``. Interest each month is balance x monthly rate; the
  rest of the EMI repays principal. Real lenders round the EMI to the rupee.
* The first year's insurance is part of the on-road price. Insurance renews
  every 12 months after purchase and is paid in that month.
* Resale value falls by ``annual_depreciation`` a year on the on-road price
  (declining balance). It is an estimate, not a quote.
* Net worth here is liquid savings + estimated resale value - loan balance.
  It ignores everything else the household owns or owes.
"""

from dataclasses import dataclass
from decimal import Decimal, localcontext

ZERO = Decimal("0")
ONE = Decimal("1")
TWELVE = Decimal("12")

MAX_MONTHS = 60
SNAPSHOT_YEARS = (1, 3, 5)
MAX_DELAY_MONTHS = 36
MAX_TENURE_MONTHS = 240
# A prompt to look closer, not a verdict: the purchase uses at least this
# share of the monthly amount the person otherwise saves.
STRAIN_SHARE = Decimal("0.5")

SCENARIOS = ("buy_now", "delay", "cheaper")


@dataclass(frozen=True)
class ExpenseInputs:
    monthly_take_home: Decimal
    monthly_household_expenses: Decimal
    liquid_savings: Decimal
    emergency_fund: Decimal
    purchase_price: Decimal  # on-road, all-in
    financed: bool
    down_payment: Decimal  # ignored for a cash purchase
    loan_annual_rate: Decimal
    loan_tenure_months: int
    fuel: Decimal
    servicing: Decimal
    parking_tolls: Decimal
    other_running: Decimal
    annual_insurance: Decimal
    annual_salary_growth: Decimal
    expense_inflation: Decimal
    savings_return: Decimal
    annual_depreciation: Decimal
    annual_price_increase: Decimal
    delay_months: int
    alternative_price: Decimal
    alternative_running_share: Decimal  # 1 = same running costs as the main choice
    horizon_years: int

    def __post_init__(self) -> None:
        money = (
            self.monthly_take_home,
            self.monthly_household_expenses,
            self.liquid_savings,
            self.emergency_fund,
            self.purchase_price,
            self.down_payment,
            self.fuel,
            self.servicing,
            self.parking_tolls,
            self.other_running,
            self.annual_insurance,
            self.alternative_price,
        )
        if any(v < 0 for v in money):
            raise ValueError("Amounts cannot be negative.")
        rates = (
            self.loan_annual_rate,
            self.annual_salary_growth,
            self.expense_inflation,
            self.savings_return,
            self.annual_depreciation,
            self.annual_price_increase,
            self.alternative_running_share,
        )
        if any(not ZERO <= r <= ONE for r in rates):
            raise ValueError("Rates must be between 0% and 100%.")
        if self.purchase_price <= 0:
            raise ValueError("Enter the purchase price.")
        if self.emergency_fund > self.liquid_savings:
            raise ValueError("Emergency fund cannot be more than your liquid savings.")
        if self.alternative_price >= self.purchase_price:
            raise ValueError("The cheaper alternative must cost less than the purchase.")
        if not 1 <= self.delay_months <= MAX_DELAY_MONTHS:
            raise ValueError(f"Delay must be between 1 and {MAX_DELAY_MONTHS} months.")
        if self.horizon_years not in SNAPSHOT_YEARS:
            raise ValueError("Projection horizon must be 1, 3 or 5 years.")
        if self.financed:
            if self.down_payment >= self.purchase_price:
                raise ValueError("Down payment must be less than the purchase price.")
            if not 1 <= self.loan_tenure_months <= MAX_TENURE_MONTHS:
                raise ValueError(
                    f"Loan tenure must be between 1 and {MAX_TENURE_MONTHS} months."
                )


@dataclass(frozen=True)
class Snapshot:
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
    ownership_cost: Decimal  # interest + running costs + depreciation so far


@dataclass(frozen=True)
class Caution:
    code: str
    month: int | None = None
    amount: Decimal | None = None


@dataclass(frozen=True)
class ScenarioResult:
    key: str
    purchase_month: int | None  # None for the baseline
    price: Decimal
    upfront_payment: Decimal
    loan_principal: Decimal
    emi: Decimal
    total_interest: Decimal  # over the whole loan tenure
    total_loan_payments: Decimal
    surplus_before: Decimal  # monthly take-home minus household expenses
    surplus_after: Decimal  # ... minus running costs and EMI
    cash_after_upfront: Decimal
    cover_months: Decimal | None
    emergency_fund_shortfall: Decimal
    purchase_share_of_surplus: Decimal | None
    snapshots: tuple[Snapshot, ...]
    warnings: tuple[Caution, ...]


@dataclass(frozen=True)
class MonthPoint:
    month: int
    liquid: dict[str, Decimal]
    net_worth: dict[str, Decimal]


@dataclass(frozen=True)
class ExpenseResult:
    horizon_years: int
    baseline: ScenarioResult
    scenarios: tuple[ScenarioResult, ...]
    months: tuple[MonthPoint, ...]


def monthly_emi(principal: Decimal, annual_rate: Decimal, months: int) -> Decimal:
    """Equal monthly instalment: P*i*(1+i)^n / ((1+i)^n - 1), i = annual_rate / 12."""
    if principal <= 0:
        return ZERO
    with localcontext() as ctx:
        ctx.prec = 40
        i = annual_rate / TWELVE
        if i == 0:
            return principal / months
        growth = (ONE + i) ** months
        return principal * i * growth / (growth - ONE)


def amortization(
    principal: Decimal, annual_rate: Decimal, months: int
) -> list[tuple[Decimal, Decimal, Decimal]]:
    """Per month: (interest, principal repaid, balance after the payment)."""
    if principal <= 0:
        return []
    with localcontext() as ctx:
        ctx.prec = 40
        emi = monthly_emi(principal, annual_rate, months)
        i = annual_rate / TWELVE
        balance = principal
        rows = []
        for k in range(months):
            interest = balance * i
            repaid = emi - interest
            balance = ZERO if k == months - 1 else balance - repaid
            rows.append((interest, repaid, balance))
        return rows


@dataclass(frozen=True)
class _Plan:
    key: str
    month: int | None
    price: Decimal
    down_payment: Decimal
    running_share: Decimal


@dataclass
class _Run:
    plan: _Plan
    upfront: Decimal
    principal: Decimal
    emi: Decimal
    rows: list
    cash: list  # index 0..MAX_MONTHS
    loan: list
    resale: list
    interest_cum: list
    running_cum: list


def _step(rate: Decimal, month: int) -> Decimal:
    """Annual rate applied in steps: 1 in year one, (1+rate) in year two, ..."""
    return (ONE + rate) ** ((month - 1) // 12)


def _run(inputs: ExpenseInputs, plan: _Plan) -> _Run:
    p = plan.month
    financed = inputs.financed and p is not None
    principal = plan.price - plan.down_payment if financed else ZERO
    upfront = ZERO if p is None else (plan.down_payment if financed else plan.price)
    tenure = inputs.loan_tenure_months
    rows = amortization(principal, inputs.loan_annual_rate, tenure) if financed else []
    emi = monthly_emi(principal, inputs.loan_annual_rate, tenure) if financed else ZERO
    monthly_return = (ONE + inputs.savings_return) ** (ONE / TWELVE) - ONE
    value_factor = (ONE - inputs.annual_depreciation) ** (ONE / TWELVE)
    flat_running = (
        inputs.fuel + inputs.servicing + inputs.parking_tolls + inputs.other_running
    ) * plan.running_share
    insurance = inputs.annual_insurance * plan.running_share

    with localcontext() as ctx:
        ctx.prec = 40
        cash = [inputs.liquid_savings - (upfront if p == 0 else ZERO)]
        loan = [principal if p == 0 else ZERO]
        resale = [plan.price if p == 0 else ZERO]
        interest_cum = [ZERO]
        running_cum = [ZERO]
        for m in range(1, MAX_MONTHS + 1):
            opening = cash[-1]
            gain = opening * monthly_return if opening > 0 else ZERO
            income = inputs.monthly_take_home * _step(inputs.annual_salary_growth, m)
            household = inputs.monthly_household_expenses * _step(
                inputs.expense_inflation, m
            )
            running = ZERO
            payment = ZERO
            owned = p is not None and m > p
            if owned:
                age = m - p
                running = flat_running * _step(inputs.expense_inflation, m)
                if age % 12 == 0:
                    running += insurance * _step(inputs.expense_inflation, m)
                if age <= tenure and financed:
                    payment = emi
            balance = opening + gain + income - household - running - payment
            if p == m:
                balance -= upfront
            cash.append(balance)

            running_cum.append(running_cum[-1] + running)
            if p is None or m < p:
                loan.append(ZERO)
                resale.append(ZERO)
                interest_cum.append(ZERO)
            else:
                age = m - p
                if age == 0:
                    loan.append(principal)
                    interest_cum.append(ZERO)
                else:
                    k = min(age, len(rows))
                    loan.append(rows[k - 1][2] if rows else ZERO)
                    interest_cum.append(sum((r[0] for r in rows[:k]), ZERO))
                # age 0 is the purchase itself; 0 ** 0 is undefined at 100% depreciation.
                resale.append(plan.price * (value_factor**age if age else ONE))
    return _Run(plan, upfront, principal, emi, rows, cash, loan, resale,
                interest_cum, running_cum)


def _snapshots(run: _Run, base: _Run) -> tuple[Snapshot, ...]:
    out = []
    for year in SNAPSHOT_YEARS:
        m = year * 12
        bought = run.plan.month is not None and run.plan.month <= m
        interest = run.interest_cum[m]
        running = run.running_cum[m]
        depreciation = run.plan.price - run.resale[m] if bought else ZERO
        net = run.cash[m] + run.resale[m] - run.loan[m]
        base_net = base.cash[m]
        out.append(
            Snapshot(
                year=year,
                month=m,
                liquid_savings=run.cash[m],
                loan_balance=run.loan[m],
                resale_value=run.resale[m],
                net_worth=net,
                liquid_vs_baseline=run.cash[m] - base.cash[m],
                net_worth_vs_baseline=net - base_net,
                interest_paid=interest,
                running_costs_paid=running,
                depreciation=depreciation,
                ownership_cost=interest + running + depreciation,
            )
        )
    return tuple(out)


def _result(inputs: ExpenseInputs, run: _Run, base: _Run) -> ScenarioResult:
    plan = run.plan
    start = 1 if plan.month is None else plan.month + 1
    with localcontext() as ctx:
        ctx.prec = 40
        income = inputs.monthly_take_home * _step(inputs.annual_salary_growth, start)
        household = inputs.monthly_household_expenses * _step(
            inputs.expense_inflation, start
        )
        surplus_before = income - household
        if plan.month is None:
            running_avg = ZERO
        else:
            flat = (
                inputs.fuel + inputs.servicing + inputs.parking_tolls
                + inputs.other_running + inputs.annual_insurance / TWELVE
            ) * plan.running_share
            running_avg = flat * _step(inputs.expense_inflation, start)
        emi = run.emi
        surplus_after = surplus_before - running_avg - emi
        outgoings = household + running_avg + emi
        at_purchase = run.cash[0 if plan.month is None else plan.month]
        cover = max(ZERO, at_purchase) / outgoings if outgoings > 0 else None
        shortfall = max(ZERO, inputs.emergency_fund - at_purchase)
        share = (
            (running_avg + emi) / surplus_before
            if plan.month is not None and surplus_before > 0
            else None
        )
        total_payments = emi * len(run.rows)
        total_interest = sum((r[0] for r in run.rows), ZERO)

    warnings: list[Caution] = []
    insufficient = plan.month is not None and at_purchase < 0
    if insufficient:
        warnings.append(Caution("insufficient_savings", amount=-at_purchase))
    elif plan.month is not None and shortfall > 0:
        warnings.append(Caution("below_emergency_fund", amount=shortfall))
    if surplus_after < 0:
        warnings.append(Caution("negative_surplus", amount=surplus_after))
    elif share is not None and share >= STRAIN_SHARE:
        warnings.append(Caution("heavy_share", amount=share))
    first_negative = next(
        (m for m in range(1, MAX_MONTHS + 1) if run.cash[m] < 0), None
    )
    if first_negative is not None and not insufficient:
        warnings.append(Caution("cash_negative", month=first_negative))

    return ScenarioResult(
        key=plan.key,
        purchase_month=plan.month,
        price=plan.price if plan.month is not None else ZERO,
        upfront_payment=run.upfront,
        loan_principal=run.principal,
        emi=emi,
        total_interest=total_interest,
        total_loan_payments=total_payments,
        surplus_before=surplus_before,
        surplus_after=surplus_after,
        cash_after_upfront=at_purchase,
        cover_months=cover,
        emergency_fund_shortfall=shortfall,
        purchase_share_of_surplus=share,
        snapshots=_snapshots(run, base),
        warnings=tuple(warnings),
    )


def simulate_major_expense(inputs: ExpenseInputs) -> ExpenseResult:
    """Project the baseline and the three purchase scenarios for 60 months."""
    down_share = (
        inputs.down_payment / inputs.purchase_price if inputs.financed else ZERO
    )
    with localcontext() as ctx:
        ctx.prec = 40
        delayed_price = inputs.purchase_price * (
            (ONE + inputs.annual_price_increase)
            ** (Decimal(inputs.delay_months) / TWELVE)
        )
    plans = {
        "baseline": _Plan("baseline", None, ZERO, ZERO, ZERO),
        "buy_now": _Plan(
            "buy_now", 0, inputs.purchase_price, inputs.down_payment, ONE
        ),
        "delay": _Plan(
            "delay", inputs.delay_months, delayed_price,
            delayed_price * down_share, ONE,
        ),
        "cheaper": _Plan(
            "cheaper", 0, inputs.alternative_price,
            inputs.alternative_price * down_share, inputs.alternative_running_share,
        ),
    }
    runs = {key: _run(inputs, plan) for key, plan in plans.items()}
    base = runs["baseline"]
    results = {key: _result(inputs, run, base) for key, run in runs.items()}

    months = tuple(
        MonthPoint(
            month=m,
            liquid={k: r.cash[m] for k, r in runs.items()},
            net_worth={k: r.cash[m] + r.resale[m] - r.loan[m] for k, r in runs.items()},
        )
        for m in range(1, MAX_MONTHS + 1)
    )
    return ExpenseResult(
        horizon_years=inputs.horizon_years,
        baseline=results["baseline"],
        scenarios=tuple(results[k] for k in SCENARIOS),
        months=months,
    )
