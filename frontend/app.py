"""Streamlit prototype. All calculations live in whatif_engine; this file only
collects inputs and renders results."""

from decimal import Decimal

import pandas as pd
import streamlit as st

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.cashflow import (
    DEFAULT_EXPENSE_INFLATION,
    DEFAULT_SALARY_GROWTH,
)
from whatif_engine.engine.decision import compare_stay_vs_switch
from whatif_engine.engine.sensitivity import run_sensitivity_analysis

st.set_page_config(page_title="Stay or Switch?", layout="wide")

# Illustrative numbers only, so a first-time user sees a working example.
SAMPLE = {
    "savings": 300000.0,
    "cur_pay": 1200000.0,
    "cur_rent": 20000.0,
    "cur_util": 3000.0,
    "cur_food": 8000.0,
    "cur_trans": 3000.0,
    "cur_other": 5000.0,
    "new_pay": 1600000.0,
    "new_rent": 25000.0,
    "new_util": 3000.0,
    "new_food": 8000.0,
    "new_trans": 4000.0,
    "new_other": 5000.0,
    "gap": 1,
    "reloc": 50000.0,
    "lost": 40000.0,
    "join": 100000.0,
}
DEFAULTS = {
    "horizon": 36,
    "infl": float(DEFAULT_EXPENSE_INFLATION * 100),
    "cur_g": float(DEFAULT_SALARY_GROWTH * 100),
    "new_g": float(DEFAULT_SALARY_GROWTH * 100),
}


def load_sample() -> None:
    st.session_state.update(SAMPLE | DEFAULTS)


def clear_all() -> None:
    st.session_state.update({k: type(v)(0) for k, v in SAMPLE.items()} | DEFAULTS)


if "savings" not in st.session_state:
    load_sample()


def inr(value: Decimal) -> str:
    """Format as ₹ with Indian digit grouping (1,23,456)."""
    n = round(value)
    digits = str(abs(n))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join([*groups, tail])
    return f"{'-' if n < 0 else ''}₹{digits}"


def money(label: str, key: str, help: str | None = None) -> Decimal:
    return Decimal(
        str(st.number_input(label, min_value=0.0, step=1000.0, key=key, help=help))
    )


def pct(label: str, key: str, help: str | None = None) -> Decimal:
    value = st.number_input(
        label, min_value=0.0, max_value=100.0, step=0.5, key=key, help=help
    )
    return Decimal(str(value)) / Decimal("100")


def costs_inputs(prefix: str) -> LivingCosts:
    a, b = st.columns(2)
    with a:
        rent = money("Rent / month (₹)", f"{prefix}_rent")
        food = money("Food / month (₹)", f"{prefix}_food")
        other = money("Other / month (₹)", f"{prefix}_other")
    with b:
        util = money("Utilities / month (₹)", f"{prefix}_util")
        trans = money("Transport / month (₹)", f"{prefix}_trans")
    return LivingCosts(rent, util, food, trans, other)


# ---------------------------------------------------------------- header
st.title("Should I stay or switch jobs?")
st.markdown(
    "Compare how much cash you would have over the next few years if you "
    "**stay in your current job** versus **take a new offer**, after "
    "accounting for a possible gap, moving costs and bonuses."
)

is_sample = all(st.session_state.get(k) == v for k, v in SAMPLE.items())
if is_sample:
    st.info(
        "**These are sample numbers, not yours.** Replace them with your own "
        "figures below, or press *Clear all* to start from blank."
    )
b1, b2, _ = st.columns([1, 1, 6])
b1.button("Load sample", on_click=load_sample)
b2.button("Clear all", on_click=clear_all)

# ---------------------------------------------------------------- inputs
st.header("1. Your current job")
c1, c2 = st.columns(2)
with c1:
    cur_pay = money(
        "Annual take-home pay (₹)",
        "cur_pay",
        "Money that reaches your bank account in a year, after tax and PF.",
    )
with c2:
    savings = money(
        "Savings today (₹)",
        "savings",
        "Cash you could use. It is the starting balance in both scenarios.",
    )

st.header("2. The new offer")
new_pay = money(
    "Annual take-home pay (₹)",
    "new_pay",
    "After tax and PF. Do not enter the CTC (cost to company).",
)

st.header("3. Monthly living costs")
t1, t2 = st.tabs(["If I stay", "If I switch"])
with t1:
    cur_costs = costs_inputs("cur")
with t2:
    st.caption("Costs in the new city or role, e.g. higher rent after moving.")
    new_costs = costs_inputs("new")

st.header("4. Costs and bonuses of switching")
d1, d2 = st.columns(2)
with d1:
    gap = st.number_input(
        "Months without a salary",
        min_value=0,
        max_value=120,
        step=1,
        key="gap",
        help="Employment gap between leaving and starting the new job.",
    )
    relocation = money(
        "Relocation cost (₹)", "reloc", "One-time moving and setup costs."
    )
with d2:
    lost = money(
        "Bonus you give up by leaving (₹)",
        "lost",
        "A bonus at your current job you would forfeit by leaving.",
    )
    joining = money(
        "Joining bonus (₹)",
        "join",
        "One-time payment from the new employer, received in the first "
        "month you start working there.",
    )

with st.expander("Advanced assumptions"):
    horizon = st.slider(
        "Projection length (months)", 12, 120, step=12, key="horizon"
    )
    inflation = pct(
        "Expense inflation (% per year)",
        "infl",
        "How fast your living costs rise each year. Default is a placeholder.",
    )
    g1, g2 = st.columns(2)
    with g1:
        cur_growth = pct("Current job pay growth (% per year)", "cur_g")
    with g2:
        new_growth = pct("New job pay growth (% per year)", "new_g")
    st.caption(
        "Growth and inflation defaults (9.1% and 5%) are placeholders, not "
        "forecasts. Pay and costs change once a year."
    )

# ---------------------------------------------------------------- checks
problems = []
if cur_pay == 0:
    problems.append("Enter your **current** take-home pay (it is ₹0).")
if new_pay == 0:
    problems.append("Enter the **new offer's** take-home pay (it is ₹0).")
if gap >= horizon:
    problems.append(
        f"The gap ({gap} months) is not shorter than the projection "
        f"({horizon} months). Shorten the gap or extend the projection."
    )
if problems:
    st.header("Result")
    for p in problems:
        st.warning(p)
    st.stop()

if gap >= 12:
    st.warning(
        f"A {gap}-month gap means no new-job income for at least a full year, "
        "so the first year of 'If you switch' will show ₹0 income."
    )

try:
    result = compare_stay_vs_switch(
        current_job=JobOffer(cur_pay, annual_salary_growth_rate=cur_growth),
        new_job=JobOffer(new_pay, annual_salary_growth_rate=new_growth),
        current_costs=cur_costs,
        new_costs=new_costs,
        starting_savings=savings,
        horizon_months=horizon,
        expense_inflation_rate=inflation,
        employment_gap_months=int(gap),
        relocation_cost=relocation,
        lost_bonus=lost,
        joining_bonus=joining,
    )
except ValueError as exc:
    st.error(str(exc))
    st.stop()

# --------------------------------------------------------------- results
years = horizon / 12
st.header("Result")
if is_sample:
    st.caption("Based on the sample numbers above.")

diff = result.ending_cash_difference
if diff > 0:
    st.success(
        f"After {years:g} years, switching leaves you **{inr(diff)} better "
        "off** than staying, under these assumptions."
    )
elif diff < 0:
    st.error(
        f"After {years:g} years, switching leaves you **{inr(-diff)} worse "
        "off** than staying, under these assumptions."
    )
else:
    st.info("Switching and staying end with the same cash.")

m1, m2, m3, m4 = st.columns(4)
m1.metric("Cash if you stay", inr(result.stay.months[-1].ending_cash))
m2.metric("Cash if you switch", inr(result.switch.months[-1].ending_cash))
m3.metric("Difference (switch − stay)", inr(diff), help="Positive favours switching.")
m4.metric(
    "Break-even",
    f"Month {result.break_even_month}" if result.break_even_month else "Not reached",
    help="First month after which switching stays at least level with "
    "staying, up to the end of the projection.",
)
if result.break_even_month is None:
    st.caption(f"Switching does not catch up with staying within {horizon} months.")

for label, proj in (("stay", result.stay), ("switch", result.switch)):
    if proj.first_negative_month:
        st.warning(
            f"If you {label}, your cash balance drops below zero in month "
            f"{proj.first_negative_month}."
        )

st.subheader("Cash balance over time")
st.line_chart(
    pd.DataFrame(
        {
            "Month": [m.month for m in result.stay.months],
            "Stay": [float(m.ending_cash) for m in result.stay.months],
            "Switch": [float(m.ending_cash) for m in result.switch.months],
        }
    ).set_index("Month")
)


def annual_table(rows) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Year": f"Year {r.year}",
            "Income": inr(r.total_income),
            "Living expenses": inr(r.total_expenses),
            "One-time costs": inr(r.relocation_costs + r.lost_bonus),
            "Joining bonus": inr(r.joining_bonus),
            "Saved this year": inr(r.net_savings),
            "Cash at year end": inr(r.ending_cash),
        }
        for r in rows
    )


st.subheader("Year by year")
left, right = st.columns(2)
left.markdown("**If you stay**")
left.dataframe(annual_table(result.stay_annual), hide_index=True)
right.markdown("**If you switch**")
right.dataframe(annual_table(result.switch_annual), hide_index=True)
st.caption(
    "One-time costs = relocation + the bonus you give up. "
    "Saved this year = income − living expenses − one-time costs + joining bonus."
)

with st.expander("How sensitive is this result? (advanced)"):
    st.caption(
        "Cash you would have at the end if you switch, under other growth, "
        "inflation and gap assumptions. Values besides yours are examples."
    )
    grid = run_sensitivity_analysis(
        job=JobOffer(new_pay, annual_salary_growth_rate=new_growth),
        living_costs=new_costs,
        starting_savings=savings,
        horizon_months=horizon,
        salary_growth_rates=tuple(
            sorted({Decimal("0.05"), Decimal("0.12"), new_growth})
        ),
        expense_inflation_rates=tuple(
            sorted({Decimal("0.04"), Decimal("0.07"), inflation})
        ),
        employment_gaps=tuple(
            sorted({0, 1, 3, 6, int(gap)} & set(range(horizon + 1)))
        ),
        one_time_costs=relocation,
        lost_bonus=lost,
        joining_bonus=joining,
    )
    st.dataframe(
        pd.DataFrame(
            {
                "Pay growth": f"{r.salary_growth_rate * 100:.1f}%",
                "Expense inflation": f"{r.expense_inflation_rate * 100:.1f}%",
                "Months without salary": r.employment_gap_months,
                "Cash at end": inr(r.ending_cash),
                "Lowest cash": inr(r.lowest_ending_cash),
                "Goes negative in month": r.first_negative_month or "never",
            }
            for r in grid
        ),
        hide_index=True,
    )

with st.expander("Assumptions and limitations", expanded=True):
    st.markdown(
        """
- This is a **projection based on the numbers you enter, not a forecast,
  guarantee or financial advice.**
- Pay is **take-home**: tax, PF and other deductions are not modelled.
- Pay growth and expense inflation change once a year. The defaults are
  placeholders.
- No investment returns or interest on savings, and no unexpected expenses.
- Relocation cost and the bonus you give up are charged in month 1; the
  joining bonus arrives in the first month at the new job.
- Regular annual bonuses are not modelled except through the two bonus fields.
- Gap, relocation and bonus inputs apply only to the switch scenario.
"""
    )
