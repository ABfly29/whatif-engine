"""Major expense simulator.

Expected values are derived independently of the engine: closed-form sums, an
exact ``Fraction`` EMI, or a plain month-by-month loop written here.
"""

from decimal import Decimal as D
from fractions import Fraction

import pytest

from whatif_engine.engine.expense import (
    ExpenseInputs,
    amortization,
    monthly_emi,
    simulate_major_expense,
)

TOL = D("0.0001")


def close(a, b, tol=TOL):
    assert abs(D(a) - D(b)) <= tol, f"{a} != {b}"


def make(**over) -> ExpenseInputs:
    """A plain scenario: no growth, inflation, returns or depreciation."""
    base = {
        "monthly_take_home": D("100000"),
        "monthly_household_expenses": D("60000"),
        "liquid_savings": D("500000"),
        "emergency_fund": D("0"),
        "purchase_price": D("1000000"),
        "financed": False,
        "down_payment": D("1000000"),
        "loan_annual_rate": D("0.09"),
        "loan_tenure_months": 60,
        "fuel": D("0"),
        "servicing": D("0"),
        "parking_tolls": D("0"),
        "other_running": D("0"),
        "annual_insurance": D("0"),
        "annual_salary_growth": D("0"),
        "expense_inflation": D("0"),
        "savings_return": D("0"),
        "annual_depreciation": D("0"),
        "annual_price_increase": D("0"),
        "delay_months": 12,
        "alternative_price": D("600000"),
        "alternative_running_share": D("1"),
        "horizon_years": 3,
    }
    base.update(over)
    return ExpenseInputs(**base)


def scenario(result, key):
    return next(s for s in result.scenarios if s.key == key)


def snap(s, year):
    return next(x for x in s.snapshots if x.year == year)


def exact_emi(principal, annual_rate, months):
    """EMI in exact rational arithmetic, to check the Decimal formula."""
    i = Fraction(annual_rate) / 12
    if i == 0:
        return Fraction(principal) / months
    g = (1 + i) ** months
    return Fraction(principal) * i * g / (g - 1)


# ---------- EMI and amortisation ----------


def test_emi_matches_known_value_and_exact_arithmetic():
    emi = monthly_emi(D("800000"), D("0.09"), 60)
    close(emi, D("16606.68"), D("0.01"))  # ₹8,00,000 at 9% for 5 years
    exact = exact_emi(800000, "0.09", 60)
    close(emi, D(exact.numerator) / D(exact.denominator), D("0.000001"))


def test_zero_interest_loan_is_principal_over_tenure():
    assert monthly_emi(D("600000"), D("0"), 48) == D("12500")
    rows = amortization(D("600000"), D("0"), 48)
    assert all(r[0] == 0 for r in rows)
    assert rows[-1][2] == 0


@pytest.mark.parametrize("months", [12, 36, 84])
def test_amortisation_repays_exactly_the_principal(months):
    principal, rate = D("750000"), D("0.105")
    rows = amortization(principal, rate, months)
    emi = monthly_emi(principal, rate, months)
    assert len(rows) == months
    close(sum(r[1] for r in rows), principal, D("0.000001"))
    close(sum(r[0] for r in rows), emi * months - principal, D("0.000001"))
    close(rows[0][0], principal * rate / 12)  # month 1 interest on full balance
    assert rows[-1][2] == 0
    # An independent loop reaches the same balance after 10 payments.
    bal = Fraction(principal)
    i = Fraction(rate) / 12
    e = exact_emi(750000, "0.105", months)
    for _ in range(min(10, months)):
        bal = bal * (1 + i) - e
    close(rows[min(10, months) - 1][2], D(bal.numerator) / D(bal.denominator),
          D("0.000001"))


# ---------- cash purchase ----------


def test_cash_purchase_has_no_loan_and_costs_depreciation_plus_running():
    r = simulate_major_expense(
        make(
            annual_depreciation=D("0.2"),
            fuel=D("5000"),
            servicing=D("1000"),
            annual_insurance=D("24000"),
        )
    )
    s = scenario(r, "buy_now")
    assert (s.emi, s.loan_principal, s.total_interest) == (0, 0, 0)
    assert s.upfront_payment == D("1000000")
    assert s.cash_after_upfront == D("-500000")  # savings 5L < price 10L
    y1 = snap(s, 1)
    assert y1.loan_balance == 0
    # Year one: 12 months of running costs plus one insurance renewal (month 12).
    close(y1.running_costs_paid, 12 * D("6000") + D("24000"))
    close(y1.resale_value, D("800000"))  # 20% off in a year
    close(y1.depreciation, D("200000"))
    base = r.baseline.snapshots[0]
    close(y1.liquid_vs_baseline, -(D("1000000") + y1.running_costs_paid))
    # Net worth only loses depreciation and running costs, not the price.
    close(y1.net_worth_vs_baseline, -(D("200000") + y1.running_costs_paid))
    assert base.liquid_savings == D("500000") + 12 * D("40000")


def test_net_worth_identity_holds_everywhere():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), annual_depreciation=D("0.15"),
             savings_return=D("0.06"), annual_salary_growth=D("0.08"))
    )
    for s in (r.baseline, *r.scenarios):
        for x in s.snapshots:
            close(x.net_worth, x.liquid_savings + x.resale_value - x.loan_balance)
    for m in r.months:
        assert set(m.liquid) == {"baseline", "buy_now", "delay", "cheaper"}


# ---------- financed purchase ----------


def test_financed_purchase_separates_price_upfront_principal_and_interest():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"),
             liquid_savings=D("600000"))
    )
    s = scenario(r, "buy_now")
    assert s.price == D("1000000")
    assert s.upfront_payment == D("200000")
    assert s.loan_principal == D("800000")
    close(s.emi, D("16606.68"), D("0.01"))
    close(s.total_loan_payments, s.emi * 60)
    close(s.total_interest, s.total_loan_payments - D("800000"), D("0.000001"))
    assert s.cash_after_upfront == D("400000")

    # After 12 payments: independent loop for balance and interest.
    i = Fraction("0.09") / 12
    e = exact_emi(800000, "0.09", 60)
    bal, interest = Fraction(800000), Fraction(0)
    for _ in range(12):
        interest += bal * i
        bal = bal * (1 + i) - e
    y1 = snap(s, 1)
    close(y1.loan_balance, D(bal.numerator) / D(bal.denominator), D("0.000001"))
    close(y1.interest_paid, D(interest.numerator) / D(interest.denominator),
          D("0.000001"))
    # Cash left after the down payment and 12 EMIs.
    close(y1.liquid_savings, D("400000") + 12 * D("40000") - 12 * s.emi)
    # Loan fully repaid at month 60.
    assert snap(s, 5).loan_balance == 0
    close(snap(s, 5).interest_paid, s.total_interest)


def test_zero_interest_financed_purchase():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("400000"), loan_annual_rate=D("0"),
             loan_tenure_months=24, liquid_savings=D("700000"))
    )
    s = scenario(r, "buy_now")
    assert s.emi == D("25000")  # 6,00,000 / 24
    assert s.total_interest == 0
    assert snap(s, 1).loan_balance == D("300000")
    assert snap(s, 3).loan_balance == 0


def test_shorter_tenure_raises_emi_and_lowers_interest():
    short = scenario(simulate_major_expense(make(financed=True, down_payment=D("200000"),
        loan_tenure_months=36)), "buy_now")
    long = scenario(simulate_major_expense(make(financed=True, down_payment=D("200000"),
        loan_tenure_months=84)), "buy_now")
    assert short.emi > long.emi
    assert short.total_interest < long.total_interest
    assert snap(short, 3).loan_balance == 0 < snap(long, 3).loan_balance


def test_horizon_selects_the_headline_year_but_all_snapshots_are_returned():
    for years in (1, 3, 5):
        r = simulate_major_expense(make(horizon_years=years))
        assert r.horizon_years == years
        assert [x.year for x in r.baseline.snapshots] == [1, 3, 5]
        assert len(r.months) == 60


# ---------- monthly surplus, cover, warnings ----------


def test_surplus_cover_and_running_cost_average():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), liquid_savings=D("600000"),
             fuel=D("6000"), annual_insurance=D("12000"))
    )
    s = scenario(r, "buy_now")
    assert s.surplus_before == D("40000")
    # running average = fuel + insurance/12 = 7000
    close(s.surplus_after, D("40000") - D("7000") - s.emi)
    outgoings = D("60000") + D("7000") + s.emi
    close(s.cover_months, D("400000") / outgoings)
    close(s.purchase_share_of_surplus, (D("7000") + s.emi) / D("40000"))


def codes(s):
    return {w.code for w in s.warnings}


def test_insufficient_savings_warns_and_cash_goes_negative():
    r = simulate_major_expense(make(liquid_savings=D("300000")))  # cash price 10L
    s = scenario(r, "buy_now")
    assert "insufficient_savings" in codes(s)
    assert next(w for w in s.warnings if w.code == "insufficient_savings").amount == D("700000")
    assert s.cover_months == 0
    assert "cash_negative" not in codes(s)  # already covered by the shortfall warning


def test_emergency_fund_shortfall():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("300000"), liquid_savings=D("500000"),
             emergency_fund=D("400000"))
    )
    s = scenario(r, "buy_now")
    assert s.cash_after_upfront == D("200000")
    assert s.emergency_fund_shortfall == D("200000")
    assert "below_emergency_fund" in codes(s)
    assert r.baseline.emergency_fund_shortfall == 0


def test_negative_monthly_surplus_warns():
    r = simulate_major_expense(
        make(monthly_take_home=D("70000"), financed=True, down_payment=D("300000"),
             liquid_savings=D("2000000"))
    )
    s = scenario(r, "buy_now")
    assert s.surplus_after < 0
    assert "negative_surplus" in codes(s)
    assert r.baseline.surplus_after == D("10000")


def test_heavy_share_is_relative_to_the_persons_own_surplus():
    big = simulate_major_expense(make(financed=True, down_payment=D("200000"),
        liquid_savings=D("600000"), monthly_take_home=D("80000")))
    small = simulate_major_expense(make(financed=True, down_payment=D("200000"),
        liquid_savings=D("600000"), monthly_take_home=D("400000")))
    assert "heavy_share" in codes(scenario(big, "buy_now"))
    assert "heavy_share" not in codes(scenario(small, "buy_now"))


def test_baseline_already_spending_more_than_it_earns():
    r = simulate_major_expense(make(monthly_take_home=D("50000")))
    assert "negative_surplus" in codes(r.baseline)
    assert "cash_negative" in codes(r.baseline)


# ---------- delay and cheaper alternative ----------


def test_delay_raises_price_and_postpones_ownership():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), liquid_savings=D("600000"),
             annual_price_increase=D("0.05"), annual_insurance=D("12000"),
             delay_months=12)
    )
    now, later = scenario(r, "buy_now"), scenario(r, "delay")
    assert later.purchase_month == 12
    close(later.price, D("1050000"))
    close(later.upfront_payment, D("210000"))  # same 20% share of the new price
    close(later.loan_principal, D("840000"))
    assert later.cash_after_upfront == D("600000") + 12 * D("40000") - D("210000")
    # Nothing owned yet at the one-year mark: only the purchase itself moved money.
    y1 = snap(later, 1)
    assert y1.running_costs_paid == 0 and y1.interest_paid == 0
    close(y1.net_worth_vs_baseline, 0)
    # Insurance renews 12 months after purchase: month 24 and 36 by year three.
    close(snap(later, 3).running_costs_paid, D("24000"))
    close(snap(now, 3).running_costs_paid, D("36000"))
    assert later.emi > now.emi


def test_delay_beyond_the_horizon_leaves_the_horizon_unaffected():
    r = simulate_major_expense(make(delay_months=30, horizon_years=1))
    later = scenario(r, "delay")
    assert later.purchase_month == 30
    close(snap(later, 1).net_worth_vs_baseline, 0)
    assert snap(later, 1).ownership_cost == 0


def test_cheaper_alternative_uses_its_price_and_running_share():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), liquid_savings=D("600000"),
             alternative_price=D("600000"), alternative_running_share=D("0.5"),
             fuel=D("8000"))
    )
    c = scenario(r, "cheaper")
    assert c.price == D("600000")
    assert c.upfront_payment == D("120000")  # same 20% share
    assert c.loan_principal == D("480000")
    close(snap(c, 1).running_costs_paid, 12 * D("4000"))
    assert c.emi < scenario(r, "buy_now").emi


# ---------- growth, inflation, returns ----------


def test_salary_growth_steps_up_each_anniversary():
    r = simulate_major_expense(make(annual_salary_growth=D("0.10")))
    b = r.baseline
    # Pay is 1,00,000 / 1,10,000 / 1,21,000 a month in years 1-3; costs stay 60,000.
    close(b.snapshots[0].liquid_savings, D("500000") + 12 * D("40000"))
    close(b.snapshots[1].liquid_savings,
          D("500000") + 12 * (D("40000") + D("50000") + D("61000")))


def test_savings_return_is_optional_and_compounds_on_positive_balances_only():
    none = simulate_major_expense(make()).baseline.snapshots[0].liquid_savings
    some = simulate_major_expense(make(savings_return=D("0.06"))).baseline
    assert some.snapshots[0].liquid_savings > none
    # Independent monthly loop at (1.06)^(1/12) - 1.
    mr = D("1.06") ** (D(1) / 12) - 1
    cash = D("500000")
    for _ in range(12):
        cash = cash + cash * mr + D("40000")
    close(some.snapshots[0].liquid_savings, cash, D("0.000001"))
    # A negative balance earns nothing.
    broke = simulate_major_expense(
        make(liquid_savings=D("0"), monthly_take_home=D("50000"),
             savings_return=D("0.10"))
    ).baseline
    close(broke.snapshots[0].liquid_savings, -12 * D("10000"))


def test_expense_inflation_applies_to_running_costs_but_not_the_emi():
    r = simulate_major_expense(
        make(expense_inflation=D("0.10"), fuel=D("1000"), financed=True,
             down_payment=D("200000"), liquid_savings=D("900000"))
    )
    s = scenario(r, "buy_now")
    close(snap(s, 3).running_costs_paid,
          12 * D("1000") + 12 * D("1100") + 12 * D("1210"))


# ---------- validation ----------


@pytest.mark.parametrize(
    "over",
    [
        {"purchase_price": D("0")},
        {"monthly_take_home": D("-1")},
        {"emergency_fund": D("600000")},  # more than savings of 5L
        {"alternative_price": D("1000000")},
        {"delay_months": 0},
        {"delay_months": 37},
        {"horizon_years": 2},
        {"annual_depreciation": D("1.5")},
        {"financed": True, "down_payment": D("1000000")},
        {"financed": True, "down_payment": D("1"), "loan_tenure_months": 0},
        {"financed": True, "down_payment": D("1"), "loan_tenure_months": 241},
    ],
)
def test_invalid_inputs_are_rejected(over):
    with pytest.raises(ValueError):
        make(**over)


# ---------- final review: edge cases and double-counting ----------


def test_total_depreciation_does_not_crash_and_values_the_vehicle_at_zero():
    r = simulate_major_expense(
        make(annual_depreciation=D("1"), financed=True, down_payment=D("200000"),
             liquid_savings=D("900000"))
    )
    later = scenario(r, "delay")
    # Worth the full price at the instant of purchase, nothing a year on.
    assert snap(later, 1).resale_value == D("1000000")
    assert snap(later, 3).resale_value == 0
    assert snap(scenario(r, "buy_now"), 1).resale_value == 0


def test_nothing_is_double_counted_across_scenarios_and_years():
    """With no savings return, what you lose in net worth is exactly interest +
    running costs + depreciation: the principal you repay is not a cost."""
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), liquid_savings=D("900000"),
             annual_depreciation=D("0.15"), annual_salary_growth=D("0.08"),
             expense_inflation=D("0.06"), fuel=D("5000"), annual_insurance=D("30000"),
             annual_price_increase=D("0.05"), loan_tenure_months=84)
    )
    for s in r.scenarios:
        for x in s.snapshots:
            close(x.net_worth_vs_baseline, -x.ownership_cost, D("0.000001"))
            close(x.ownership_cost, x.interest_paid + x.running_costs_paid + x.depreciation)


def test_loan_longer_than_the_projection_keeps_its_balance_and_full_interest():
    r = simulate_major_expense(make(financed=True, down_payment=D("200000"),
                                    loan_tenure_months=84, liquid_savings=D("900000")))
    s = scenario(r, "buy_now")
    i = Fraction("0.09") / 12
    e = exact_emi(800000, "0.09", 84)
    bal = Fraction(800000)
    for _ in range(60):
        bal = bal * (1 + i) - e
    close(snap(s, 5).loan_balance, D(bal.numerator) / D(bal.denominator), D("0.000001"))
    assert snap(s, 5).loan_balance > 0
    # The headline interest covers the whole 84 months, not just the 60 shown.
    close(s.total_interest, s.emi * 84 - D("800000"), D("0.000001"))
    assert s.total_interest > snap(s, 5).interest_paid


def test_zero_interest_delayed_loan_and_insurance_timing():
    r = simulate_major_expense(
        make(financed=True, down_payment=D("200000"), loan_annual_rate=D("0"),
             loan_tenure_months=40, liquid_savings=D("900000"), annual_insurance=D("12000"))
    )
    later = scenario(r, "delay")
    assert later.total_interest == 0
    assert later.emi == D("20000")  # 8,00,000 / 40
    # Paid 40 EMIs from month 13, so 36 - 12 = 24 paid by month 36.
    close(snap(later, 3).loan_balance, D("800000") - 24 * D("20000"))
    assert snap(later, 5).loan_balance == 0  # 12 + 40 = 52 <= 60


def test_negative_monthly_savings_for_the_whole_projection_compounds_the_shortfall():
    r = simulate_major_expense(make(monthly_take_home=D("50000"), liquid_savings=D("100000")))
    b = r.baseline
    assert b.surplus_after == D("-10000")
    close(b.snapshots[0].liquid_savings, D("100000") - 12 * D("10000"))
    close(b.snapshots[2].liquid_savings, D("100000") - 60 * D("10000"))
    assert next(w for w in b.warnings if w.code == "cash_negative").month == 11


def test_price_rise_applies_for_exactly_the_delay_period():
    r = simulate_major_expense(make(annual_price_increase=D("0.10"), delay_months=24))
    close(scenario(r, "delay").price, D("1210000"))  # 10,00,000 * 1.1^2
    r6 = simulate_major_expense(make(annual_price_increase=D("0.10"), delay_months=6))
    close(scenario(r6, "delay").price, D("1000000") * D("1.1") ** (D(1) / 2), D("0.000001"))
