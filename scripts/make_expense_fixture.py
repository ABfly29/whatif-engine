"""Write web/tests/fixtures/expense.json from the real engine (sample scenario)."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from whatif_engine.api.service import handle

REQUEST = {
    "monthly_take_home": "100000",
    "monthly_household_expenses": "55000",
    "liquid_savings": "600000",
    "emergency_fund": "300000",
    "purchase_price": "1000000",
    "payment_method": "loan",
    "down_payment": "200000",
    "loan_annual_rate": "0.09",
    "loan_tenure_months": 60,
    "fuel": "6000",
    "servicing": "1500",
    "parking_tolls": "1000",
    "other_running": "500",
    "annual_insurance": "30000",
    "annual_salary_growth": "0.06",
    "expense_inflation": "0.05",
    "savings_return": "0",
    "annual_depreciation": "0.15",
    "annual_price_increase": "0.05",
    "delay_months": 12,
    "alternative_price": "700000",
    "alternative_running_share": "1",
    "horizon_years": 3,
}


CASH = {
    **REQUEST,
    "monthly_take_home": "120000",
    "monthly_household_expenses": "60000",
    "liquid_savings": "2500000",
    "emergency_fund": "500000",
    "payment_method": "cash",
    "down_payment": "0",
    "annual_salary_growth": "0.08",
    "savings_return": "0.04",
    "delay_months": 18,
    "horizon_years": 5,
}

# Tight finances: warnings fire, and the loan (84 months) outlasts the 60-month projection.
STRAIN = {
    **REQUEST,
    "monthly_take_home": "60000",
    "monthly_household_expenses": "52000",
    "liquid_savings": "250000",
    "emergency_fund": "200000",
    "purchase_price": "1200000",
    "down_payment": "300000",
    "loan_annual_rate": "0.115",
    "loan_tenure_months": 84,
    "annual_depreciation": "0.2",
    "delay_months": 6,
    "alternative_price": "800000",
    "alternative_running_share": "0.8",
    "horizon_years": 1,
}

FIXTURES = {"expense": REQUEST, "expense-cash": CASH, "expense-strain": STRAIN}


def main() -> int:
    for name, request in FIXTURES.items():
        out = json.loads(handle("expense", json.dumps(request)))
        assert out["ok"], out
        target = ROOT / "web" / "tests" / "fixtures" / f"{name}.json"
        target.write_text(
            json.dumps({"request": request, "response": out["data"]}, indent=1) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
