"""Write real engine output for the PDF report tests.

Each fixture is {"request": ..., "result": ...} produced by the actual service
layer (whatif_engine.api.service.handle), so tests exercise realistic data
without anyone hand-writing figures. Regenerate after engine changes:

    python scripts/make_report_fixtures.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from whatif_engine.api.service import handle

OUT = ROOT / "web" / "tests" / "fixtures"


def costs(rent="0", utilities="0", food="0", transport="0", other="0"):
    return {"rent": rent, "utilities": utilities, "food": food, "transport": transport, "other": other}


SCENARIOS = {
    # Typical case: the sample values shown in the app.
    "sample": {
        "current_job": {"annual_take_home": "1200000", "annual_salary_growth_rate": "0.091"},
        "new_job": {"annual_take_home": "1600000", "annual_salary_growth_rate": "0.091"},
        "current_costs": costs("20000", "3000", "8000", "3000", "5000"),
        "new_costs": costs("25000", "3000", "8000", "4000", "5000"),
        "starting_savings": "300000", "horizon_months": 36, "expense_inflation_rate": "0.05",
        "employment_gap_months": 1, "relocation_cost": "50000", "lost_bonus": "40000", "joining_bonus": "100000",
    },
    # Longest horizon (10 years): forces long tables and page breaks.
    "long": {
        "current_job": {"annual_take_home": "1800000", "annual_salary_growth_rate": "0.08"},
        "new_job": {"annual_take_home": "2400000", "annual_salary_growth_rate": "0.1"},
        "current_costs": costs("30000", "4000", "10000", "5000", "8000"),
        "new_costs": costs("45000", "5000", "12000", "6000", "8000"),
        "starting_savings": "500000", "horizon_months": 120, "expense_inflation_rate": "0.06",
        "employment_gap_months": 4, "relocation_cost": "150000", "lost_bonus": "200000", "joining_bonus": "250000",
    },
    # Spending exceeds income: negative balances and a negative difference.
    "negative": {
        "current_job": {"annual_take_home": "600000", "annual_salary_growth_rate": "0.05"},
        "new_job": {"annual_take_home": "540000", "annual_salary_growth_rate": "0.05"},
        "current_costs": costs("30000", "3000", "9000", "3000", "5000"),
        "new_costs": costs("38000", "3000", "9000", "4000", "5000"),
        "starting_savings": "20000", "horizon_months": 24, "expense_inflation_rate": "0.07",
        "employment_gap_months": 3, "relocation_cost": "80000", "lost_bonus": "60000", "joining_bonus": "0",
    },
    # Optional fields left empty: zero costs, no gap, no bonuses.
    "minimal": {
        "current_job": {"annual_take_home": "900000", "annual_salary_growth_rate": "0.091"},
        "new_job": {"annual_take_home": "900000", "annual_salary_growth_rate": "0.091"},
        "current_costs": costs(rent="15000"),
        "new_costs": costs(rent="15000"),
        "starting_savings": "0", "horizon_months": 12, "expense_inflation_rate": "0.05",
        "employment_gap_months": 0, "relocation_cost": "0", "lost_bonus": "0", "joining_bonus": "0",
    },
}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, request in SCENARIOS.items():
        out = json.loads(handle("compare", json.dumps(request)))
        assert out["ok"], out
        (OUT / f"{name}.json").write_text(
            json.dumps({"request": request, "result": out["data"]}, indent=1) + "\n", encoding="utf-8"
        )
        s = out["data"]["summary"]
        print(f"{name}: difference {s['ending_cash_difference']}, break-even {s['break_even_month']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
