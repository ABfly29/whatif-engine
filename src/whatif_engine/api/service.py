"""Transport-independent service layer.

FastAPI routes and the in-browser (Pyodide) runtime both call these functions,
so the HTTP API and the static GitHub Pages build return identical results.
This module must not import FastAPI: it has to run inside Pyodide.
"""

import json
from dataclasses import asdict
from decimal import ROUND_HALF_EVEN, Decimal

from pydantic import ValidationError

from whatif_engine.api.schemas import (
    AnnualRow,
    CareerRequest,
    CareerResponse,
    ExpenseRequest,
    ExpenseResponse,
    MonthRow,
    SensitivityRequest,
    SensitivityResponse,
    SensitivityRow,
    Summary,
)
from whatif_engine.domain.models import JobOffer, LivingCosts
from whatif_engine.engine.decision import (
    compare_stay_vs_switch,
    run_decision_sensitivity,
)
from whatif_engine.engine.expense import ExpenseInputs, simulate_major_expense

PAISE = Decimal("0.01")
DEFAULT_GROWTH_GRID = (Decimal("0.05"), Decimal("0.12"))
DEFAULT_INFLATION_GRID = (Decimal("0.04"), Decimal("0.07"))
DEFAULT_GAP_GRID = (0, 1, 3, 6)


def _q(value: Decimal) -> Decimal:
    """Round to paise for the response; engine values are never altered."""
    return value.quantize(PAISE, rounding=ROUND_HALF_EVEN)


def _job(job) -> JobOffer:
    return JobOffer(
        annual_take_home=job.annual_take_home,
        annual_salary_growth_rate=job.annual_salary_growth_rate,
    )


def _costs(costs) -> LivingCosts:
    return LivingCosts(
        monthly_rent=costs.rent,
        monthly_utilities=costs.utilities,
        monthly_food=costs.food,
        monthly_transport=costs.transport,
        monthly_other=costs.other,
    )


def _engine_args(req: CareerRequest) -> dict:
    return {
        "current_job": _job(req.current_job),
        "new_job": _job(req.new_job),
        "current_costs": _costs(req.current_costs),
        "new_costs": _costs(req.new_costs),
        "starting_savings": req.starting_savings,
        "horizon_months": req.horizon_months,
        "relocation_cost": req.relocation_cost,
        "lost_bonus": req.lost_bonus,
        "joining_bonus": req.joining_bonus,
    }


def _annual(rows) -> list[AnnualRow]:
    return [
        AnnualRow(
            year=r.year,
            total_income=_q(r.total_income),
            total_expenses=_q(r.total_expenses),
            relocation_costs=_q(r.relocation_costs),
            lost_bonus=_q(r.lost_bonus),
            joining_bonus=_q(r.joining_bonus),
            net_savings=_q(r.net_savings),
            ending_cash=_q(r.ending_cash),
        )
        for r in rows
    ]


def compare(req: CareerRequest) -> CareerResponse:
    result = compare_stay_vs_switch(
        **_engine_args(req),
        expense_inflation_rate=req.expense_inflation_rate,
        employment_gap_months=req.employment_gap_months,
    )
    return CareerResponse(
        summary=Summary(
            stay_ending_cash=_q(result.stay.months[-1].ending_cash),
            switch_ending_cash=_q(result.switch.months[-1].ending_cash),
            ending_cash_difference=_q(result.ending_cash_difference),
            break_even_month=result.break_even_month,
            stay_lowest_cash=_q(result.stay.lowest_ending_cash),
            switch_lowest_cash=_q(result.switch.lowest_ending_cash),
            stay_first_negative_month=result.stay.first_negative_month,
            switch_first_negative_month=result.switch.first_negative_month,
        ),
        months=[
            MonthRow(
                month=s.month,
                stay_income=_q(t.income),
                stay_expenses=_q(t.expenses),
                stay_cash=_q(t.ending_cash),
                switch_income=_q(s.income),
                switch_expenses=_q(s.expenses),
                switch_cash=_q(s.ending_cash),
                switch_relocation=_q(s.relocation_costs),
                switch_lost_bonus=_q(s.lost_bonus),
                switch_joining_bonus=_q(s.joining_bonus),
            )
            for s, t in zip(result.switch.months, result.stay.months, strict=True)
        ],
        stay_annual=_annual(result.stay_annual),
        switch_annual=_annual(result.switch_annual),
    )


def sensitivity(req: SensitivityRequest) -> SensitivityResponse:
    growth = req.new_salary_growth_rates or list(DEFAULT_GROWTH_GRID)
    inflation = req.expense_inflation_rates or list(DEFAULT_INFLATION_GRID)
    gaps = req.employment_gaps or list(DEFAULT_GAP_GRID)

    growth_axis = sorted({*growth, req.new_job.annual_salary_growth_rate})
    inflation_axis = sorted({*inflation, req.expense_inflation_rate})
    gap_axis = sorted(
        {g for g in (*gaps, req.employment_gap_months) if g <= req.horizon_months}
    )

    rows = run_decision_sensitivity(
        **_engine_args(req),
        salary_growth_rates=tuple(growth_axis),
        expense_inflation_rates=tuple(inflation_axis),
        employment_gaps=tuple(gap_axis),
    )
    return SensitivityResponse(
        rows=[
            SensitivityRow(
                new_salary_growth_rate=r.new_salary_growth_rate,
                expense_inflation_rate=r.expense_inflation_rate,
                employment_gap_months=r.employment_gap_months,
                stay_ending_cash=_q(r.stay_ending_cash),
                switch_ending_cash=_q(r.switch_ending_cash),
                ending_cash_difference=_q(r.ending_cash_difference),
                switch_lowest_cash=_q(r.switch_lowest_cash),
                switch_first_negative_month=r.switch_first_negative_month,
            )
            for r in rows
        ]
    )


_SHARE = Decimal("0.0001")


def _round_tree(value, key: str = ""):
    """Round every Decimal in a nested result to paise (shares to 0.01%)."""
    if isinstance(value, Decimal):
        return value.quantize(_SHARE if key == "purchase_share_of_surplus" else PAISE,
                              rounding=ROUND_HALF_EVEN)
    if isinstance(value, dict):
        return {k: _round_tree(v, k) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round_tree(v, key) for v in value]
    return value


def expense(req: ExpenseRequest) -> ExpenseResponse:
    financed = req.payment_method == "loan"
    result = simulate_major_expense(
        ExpenseInputs(
            monthly_take_home=req.monthly_take_home,
            monthly_household_expenses=req.monthly_household_expenses,
            liquid_savings=req.liquid_savings,
            emergency_fund=req.emergency_fund,
            purchase_price=req.purchase_price,
            financed=financed,
            down_payment=req.down_payment if financed else req.purchase_price,
            loan_annual_rate=req.loan_annual_rate,
            loan_tenure_months=req.loan_tenure_months,
            fuel=req.fuel,
            servicing=req.servicing,
            parking_tolls=req.parking_tolls,
            other_running=req.other_running,
            annual_insurance=req.annual_insurance,
            annual_salary_growth=req.annual_salary_growth,
            expense_inflation=req.expense_inflation,
            savings_return=req.savings_return,
            annual_depreciation=req.annual_depreciation,
            annual_price_increase=req.annual_price_increase,
            delay_months=req.delay_months,
            alternative_price=req.alternative_price,
            alternative_running_share=req.alternative_running_share,
            horizon_years=req.horizon_years,
        )
    )
    return ExpenseResponse.model_validate(_round_tree(asdict(result)))


_HANDLERS = {
    "expense": (ExpenseRequest, expense),
    "compare": (CareerRequest, compare),
    "sensitivity": (SensitivityRequest, sensitivity),
}


def handle(kind: str, payload_json: str) -> str:
    """JSON in, JSON out. The entry point used by the browser runtime.

    Returns ``{"ok": true, "data": ...}`` on success, or
    ``{"ok": false, "status": 4xx, "detail": ...}`` where ``detail`` has the
    same shape FastAPI uses (a string for engine errors, a list for schema
    errors), so the frontend treats both transports identically.
    """
    try:
        model, func = _HANDLERS[kind]
        response = func(model.model_validate_json(payload_json))
        return '{"ok":true,"data":' + response.model_dump_json() + "}"
    except KeyError:
        return json.dumps({"ok": False, "status": 404, "detail": "Unknown request."})
    except ValidationError as exc:
        detail = json.loads(
            exc.json(include_url=False, include_context=False, include_input=False)
        )
        return json.dumps({"ok": False, "status": 422, "detail": detail})
    except ValueError as exc:
        return json.dumps({"ok": False, "status": 422, "detail": str(exc)})
