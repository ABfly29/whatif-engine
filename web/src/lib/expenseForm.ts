import { percentToFraction } from "./format";
import type { ExpenseRequest } from "./types";

/** All inputs are kept as strings so people can type freely. */
export interface ExpenseForm {
  takeHome: string; // monthly
  household: string; // monthly, excluding the purchase
  savings: string;
  emergency: string;
  price: string; // on-road
  method: "loan" | "cash";
  down: string;
  rate: string; // percent a year
  tenure: string; // months
  fuel: string;
  servicing: string;
  parking: string;
  otherRunning: string;
  insurance: string; // a year
  salaryGrowth: string; // percent
  inflation: string; // percent
  savingsReturn: string; // percent
  depreciation: string; // percent a year
  priceIncrease: string; // percent a year
  delay: string; // months
  altPrice: string;
  altRunning: string; // percent of the main running costs
  horizon: "1" | "3" | "5";
}

// Editable assumptions, shown in the form and listed in the results. Not forecasts.
const ASSUMPTION_DEFAULTS = {
  salaryGrowth: "6",
  inflation: "5",
  savingsReturn: "0",
  depreciation: "15",
  priceIncrease: "5",
  delay: "12",
  altRunning: "100",
  horizon: "3" as const,
  method: "loan" as const,
  rate: "9",
  tenure: "60",
};

/** Illustrative numbers only; the page labels them as a sample. */
export const EXPENSE_SAMPLE: ExpenseForm = {
  ...ASSUMPTION_DEFAULTS,
  takeHome: "100000",
  household: "55000",
  savings: "600000",
  emergency: "300000",
  price: "1000000",
  down: "200000",
  fuel: "6000",
  servicing: "1500",
  parking: "1000",
  otherRunning: "500",
  insurance: "30000",
  altPrice: "700000",
};

export const EXPENSE_BLANK: ExpenseForm = {
  ...ASSUMPTION_DEFAULTS,
  takeHome: "",
  household: "",
  savings: "",
  emergency: "",
  price: "",
  down: "",
  fuel: "",
  servicing: "",
  parking: "",
  otherRunning: "",
  insurance: "",
  altPrice: "",
};

export function isExpenseSample(form: ExpenseForm): boolean {
  return (Object.keys(EXPENSE_SAMPLE) as (keyof ExpenseForm)[]).every(
    (k) => form[k] === EXPENSE_SAMPLE[k],
  );
}

export type ExpenseErrors = Partial<Record<keyof ExpenseForm, string>>;

const MAX_MONEY = 10_000_000_000; // matches the API ceiling (₹1,000 crore)

const MONEY: (keyof ExpenseForm)[] = [
  "takeHome",
  "household",
  "savings",
  "emergency",
  "price",
  "down",
  "fuel",
  "servicing",
  "parking",
  "otherRunning",
  "insurance",
  "altPrice",
];
const PERCENT: (keyof ExpenseForm)[] = [
  "rate",
  "salaryGrowth",
  "inflation",
  "savingsReturn",
  "depreciation",
  "priceIncrease",
  "altRunning",
];

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

/** Fast feedback only; the engine re-validates and is the authority. */
export function validateExpense(f: ExpenseForm): ExpenseErrors {
  const e: ExpenseErrors = {};

  for (const key of MONEY) {
    const v = f[key];
    if (v.trim() === "") continue; // blank means 0, except the required fields below
    if (!isNumber(v)) e[key] = "Enter a number.";
    else if (Number(v) < 0) e[key] = "Cannot be negative.";
    else if (Number(v) > MAX_MONEY) e[key] = "That amount is too large.";
  }
  for (const key of PERCENT) {
    const v = f[key];
    if (!isNumber(v)) e[key] = "Enter a percentage.";
    else if (Number(v) < 0 || Number(v) > 100) e[key] = "Must be between 0 and 100.";
  }

  if (!e.takeHome && !(num(f.takeHome) > 0)) e.takeHome = "Enter your monthly take-home pay.";
  if (!e.price && !(num(f.price) > 0)) e.price = "Enter the on-road price.";
  if (!e.altPrice && !(num(f.altPrice) > 0)) e.altPrice = "Enter the cheaper option's price.";
  else if (!e.altPrice && !e.price && num(f.altPrice) >= num(f.price))
    e.altPrice = "Must be lower than the purchase price.";

  if (!e.emergency && !e.savings && num(f.emergency) > num(f.savings))
    e.emergency = "Cannot be more than your liquid savings.";

  if (f.method === "loan") {
    if (!e.down && !e.price && num(f.down) >= num(f.price))
      e.down = "Must be less than the price. Choose “Pay in cash” if you are not borrowing.";
    const tenure = Number(f.tenure);
    if (!Number.isInteger(tenure) || tenure < 1 || tenure > 240)
      e.tenure = "Enter whole months, 1 to 240.";
  }

  const delay = Number(f.delay);
  if (!Number.isInteger(delay) || delay < 1 || delay > 36)
    e.delay = "Enter whole months, 1 to 36.";

  return e;
}

const money = (s: string) => (s.trim() === "" ? "0" : s.trim());

/** Convert validated form strings into the API request. */
export function toExpenseRequest(f: ExpenseForm): ExpenseRequest {
  const cash = f.method === "cash";
  return {
    monthly_take_home: money(f.takeHome),
    monthly_household_expenses: money(f.household),
    liquid_savings: money(f.savings),
    emergency_fund: money(f.emergency),
    purchase_price: money(f.price),
    payment_method: f.method,
    down_payment: cash ? "0" : money(f.down),
    loan_annual_rate: percentToFraction(f.rate),
    loan_tenure_months: cash ? 60 : Number(f.tenure),
    fuel: money(f.fuel),
    servicing: money(f.servicing),
    parking_tolls: money(f.parking),
    other_running: money(f.otherRunning),
    annual_insurance: money(f.insurance),
    annual_salary_growth: percentToFraction(f.salaryGrowth),
    expense_inflation: percentToFraction(f.inflation),
    savings_return: percentToFraction(f.savingsReturn),
    annual_depreciation: percentToFraction(f.depreciation),
    annual_price_increase: percentToFraction(f.priceIncrease),
    delay_months: Number(f.delay),
    alternative_price: money(f.altPrice),
    alternative_running_share: percentToFraction(f.altRunning),
    horizon_years: Number(f.horizon) as 1 | 3 | 5,
  };
}
