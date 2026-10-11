// Mirrors src/whatif_engine/api/schemas.py. Money and rates are decimal
// strings on the wire; rates are fractions (0.091 = 9.1%).

export interface LivingCostsIn {
  rent: string;
  utilities: string;
  food: string;
  transport: string;
  other: string;
}

export interface JobIn {
  annual_take_home: string;
  annual_salary_growth_rate: string;
}

export interface CareerRequest {
  current_job: JobIn;
  new_job: JobIn;
  current_costs: LivingCostsIn;
  new_costs: LivingCostsIn;
  starting_savings: string;
  horizon_months: number;
  expense_inflation_rate: string;
  employment_gap_months: number;
  relocation_cost: string;
  lost_bonus: string;
  joining_bonus: string;
}

export interface Summary {
  stay_ending_cash: string;
  switch_ending_cash: string;
  ending_cash_difference: string;
  break_even_month: number | null;
  stay_lowest_cash: string;
  switch_lowest_cash: string;
  stay_first_negative_month: number | null;
  switch_first_negative_month: number | null;
}

export interface MonthRow {
  month: number;
  stay_income: string;
  stay_expenses: string;
  stay_cash: string;
  switch_income: string;
  switch_expenses: string;
  switch_cash: string;
  switch_relocation: string;
  switch_lost_bonus: string;
  switch_joining_bonus: string;
}

export interface AnnualRow {
  year: number;
  total_income: string;
  total_expenses: string;
  relocation_costs: string;
  lost_bonus: string;
  joining_bonus: string;
  net_savings: string;
  ending_cash: string;
}

export interface CareerResponse {
  summary: Summary;
  months: MonthRow[];
  stay_annual: AnnualRow[];
  switch_annual: AnnualRow[];
}

export interface SensitivityRow {
  new_salary_growth_rate: string;
  expense_inflation_rate: string;
  employment_gap_months: number;
  stay_ending_cash: string;
  switch_ending_cash: string;
  ending_cash_difference: string;
  switch_lowest_cash: string;
  switch_first_negative_month: number | null;
}

export interface SensitivityResponse {
  rows: SensitivityRow[];
}

// ---------- Major expense simulator (mirrors ExpenseRequest / ExpenseResponse) ----------

export interface ExpenseRequest {
  monthly_take_home: string;
  monthly_household_expenses: string;
  liquid_savings: string;
  emergency_fund: string;
  purchase_price: string;
  payment_method: "cash" | "loan";
  down_payment: string;
  loan_annual_rate: string;
  loan_tenure_months: number;
  fuel: string;
  servicing: string;
  parking_tolls: string;
  other_running: string;
  annual_insurance: string;
  annual_salary_growth: string;
  expense_inflation: string;
  savings_return: string;
  annual_depreciation: string;
  annual_price_increase: string;
  delay_months: number;
  alternative_price: string;
  alternative_running_share: string;
  horizon_years: 1 | 3 | 5;
}

export type ExpenseScenarioKey = "baseline" | "buy_now" | "delay" | "cheaper";

export interface ExpenseSnapshot {
  year: number;
  month: number;
  liquid_savings: string;
  loan_balance: string;
  resale_value: string;
  net_worth: string;
  liquid_vs_baseline: string;
  net_worth_vs_baseline: string;
  interest_paid: string;
  running_costs_paid: string;
  depreciation: string;
  ownership_cost: string;
}

export interface ExpenseWarning {
  code:
    | "insufficient_savings"
    | "below_emergency_fund"
    | "negative_surplus"
    | "heavy_share"
    | "cash_negative";
  month: number | null;
  amount: string | null;
}

export interface ExpenseScenario {
  key: ExpenseScenarioKey;
  purchase_month: number | null;
  price: string;
  upfront_payment: string;
  loan_principal: string;
  emi: string;
  total_interest: string;
  total_loan_payments: string;
  surplus_before: string;
  surplus_after: string;
  cash_after_upfront: string;
  cover_months: string | null;
  emergency_fund_shortfall: string;
  purchase_share_of_surplus: string | null;
  snapshots: ExpenseSnapshot[];
  warnings: ExpenseWarning[];
}

export interface ExpenseMonth {
  month: number;
  liquid: Record<ExpenseScenarioKey, string>;
  net_worth: Record<ExpenseScenarioKey, string>;
}

export interface ExpenseResponse {
  horizon_years: 1 | 3 | 5;
  baseline: ExpenseScenario;
  scenarios: ExpenseScenario[];
  months: ExpenseMonth[];
}
