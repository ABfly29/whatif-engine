from decimal import Decimal

import pytest

from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.decision import compare_stay_vs_switch

ZERO = Decimal("0")


def costs():
    return LivingCosts(
        monthly_rent=Decimal("10000"),
        monthly_utilities=ZERO,
        monthly_food=ZERO,
        monthly_transport=ZERO,
    )


def run(**overrides):
    args = {
        "current_job": JobOffer(Decimal("1200000"), annual_salary_growth_rate=ZERO),
        "new_job": JobOffer(Decimal("1800000"), annual_salary_growth_rate=ZERO),
        "current_costs": costs(),
        "new_costs": costs(),
        "starting_savings": Decimal("100000"),
        "horizon_months": 12,
        "expense_inflation_rate": ZERO,
    }
    args.update(overrides)
    return compare_stay_vs_switch(**args)


def test_difference_is_switch_minus_stay():
    result = run()
    # +50,000/month extra income for 12 months
    assert result.ending_cash_difference == Decimal("600000")
    assert result.break_even_month == 1


def test_gap_and_one_time_items_delay_break_even():
    result = run(
        employment_gap_months=2,
        relocation_cost=Decimal("100000"),
        lost_bonus=Decimal("50000"),
        joining_bonus=Decimal("30000"),
    )
    # 10 employed months * 150,000 vs 12 * 100,000, then one-time items
    assert result.ending_cash_difference == Decimal("1500000") - Decimal(
        "1200000"
    ) - Decimal("100000") - Decimal("50000") + Decimal("30000")
    # deficit 420k (2 gap months, relocation, lost - joining bonus), +50k/month
    assert result.break_even_month == 9
    assert result.switch_annual[0].joining_bonus == Decimal("30000")


def test_never_breaks_even():
    result = run(new_job=JobOffer(Decimal("1200000"), annual_salary_growth_rate=ZERO),
                 relocation_cost=Decimal("10000"))
    assert result.break_even_month is None
    assert result.ending_cash_difference == Decimal("-10000")


def test_invalid_inputs_propagate():
    with pytest.raises(ValueError):
        run(employment_gap_months=13)


def test_temporary_lead_is_not_break_even():
    # Same pay, but a joining bonus puts the switch ahead in month 1 only if
    # the new job pays less afterwards.
    result = run(
        new_job=JobOffer(Decimal("1140000"), annual_salary_growth_rate=ZERO),
        joining_bonus=Decimal("20000"),
    )
    assert result.switch.months[0].ending_cash > result.stay.months[0].ending_cash
    assert result.ending_cash_difference < 0
    assert result.break_even_month is None


def test_break_even_requires_staying_ahead_after_dip():
    # Behind during a 2-month gap, ahead from month 3 onward.
    result = run(employment_gap_months=2)
    assert result.break_even_month == 6
    assert all(
        s.ending_cash >= t.ending_cash
        for s, t in zip(
            result.switch.months[result.break_even_month - 1 :],
            result.stay.months[result.break_even_month - 1 :],
        )
    )


def test_break_even_none_when_horizon_ends_first():
    result = run(employment_gap_months=2, relocation_cost=Decimal("5000000"))
    assert result.break_even_month is None


def test_negative_cash_does_not_affect_break_even_definition():
    result = run(starting_savings=ZERO, employment_gap_months=3)
    assert result.switch.first_negative_month is not None
    assert result.break_even_month is not None


def test_switch_annual_income_is_positive_unless_gap_covers_the_year():
    # Regression: Switch annual income is only zero when the gap spans the
    # whole year; a short gap reduces year 1 but never zeroes it.
    short_gap = run(employment_gap_months=2, horizon_months=36)
    assert all(a.total_income > 0 for a in short_gap.switch_annual)
    assert short_gap.switch_annual[0].total_income == Decimal("1500000")

    year_long_gap = run(employment_gap_months=12, horizon_months=36)
    assert year_long_gap.switch_annual[0].total_income == 0
    assert year_long_gap.switch_annual[1].total_income > 0


def test_decision_sensitivity_matches_direct_comparison():
    from whatif_engine.engine.decision import run_decision_sensitivity

    base = run(horizon_months=24, employment_gap_months=3,
               relocation_cost=Decimal("20000"))
    rows = run_decision_sensitivity(
        current_job=JobOffer(Decimal("1200000"), annual_salary_growth_rate=ZERO),
        new_job=JobOffer(Decimal("1800000"), annual_salary_growth_rate=ZERO),
        current_costs=costs(),
        new_costs=costs(),
        starting_savings=Decimal("100000"),
        horizon_months=24,
        salary_growth_rates=(ZERO, Decimal("0.1")),
        expense_inflation_rates=(ZERO,),
        employment_gaps=(0, 3),
        relocation_cost=Decimal("20000"),
    )
    assert len(rows) == 4
    match = next(
        r for r in rows
        if r.new_salary_growth_rate == 0 and r.employment_gap_months == 3
    )
    assert match.ending_cash_difference == base.ending_cash_difference
    assert match.stay_ending_cash == base.stay.months[-1].ending_cash
    higher = next(
        r for r in rows
        if r.new_salary_growth_rate == Decimal("0.1")
        and r.employment_gap_months == 3
    )
    assert higher.ending_cash_difference > match.ending_cash_difference


def test_decision_sensitivity_requires_values():
    from whatif_engine.engine.decision import run_decision_sensitivity

    with pytest.raises(ValueError):
        run_decision_sensitivity(
            JobOffer(Decimal(1)), JobOffer(Decimal(1)), costs(), costs(),
            ZERO, 12, (), (ZERO,), (0,),
        )
