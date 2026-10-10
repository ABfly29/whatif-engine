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
