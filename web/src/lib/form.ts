import { percentToFraction } from "./format";
import type { CareerRequest } from "./types";

/** All inputs are kept as strings so users can type freely. */
export interface FormState {
  savings: string;
  horizon: string;
  inflation: string; // percent
  curPay: string;
  curGrowth: string; // percent
  curRent: string;
  curUtil: string;
  curFood: string;
  curTrans: string;
  curOther: string;
  newPay: string;
  newGrowth: string; // percent
  newRent: string;
  newUtil: string;
  newFood: string;
  newTrans: string;
  newOther: string;
  gap: string;
  reloc: string;
  lost: string;
  join: string;
}

// Engine defaults, shown as editable placeholders — not forecasts.
const DEFAULT_ADVANCED = {
  horizon: "36",
  inflation: "5",
  curGrowth: "9.1",
  newGrowth: "9.1",
};

/** Illustrative values only; the UI labels them as sample data. */
export const SAMPLE: FormState = {
  ...DEFAULT_ADVANCED,
  savings: "300000",
  curPay: "1200000",
  curRent: "20000",
  curUtil: "3000",
  curFood: "8000",
  curTrans: "3000",
  curOther: "5000",
  newPay: "1600000",
  newRent: "25000",
  newUtil: "3000",
  newFood: "8000",
  newTrans: "4000",
  newOther: "5000",
  gap: "1",
  reloc: "50000",
  lost: "40000",
  join: "100000",
};

export const BLANK: FormState = {
  ...DEFAULT_ADVANCED,
  savings: "",
  curPay: "",
  curRent: "",
  curUtil: "",
  curFood: "",
  curTrans: "",
  curOther: "",
  newPay: "",
  newRent: "",
  newUtil: "",
  newFood: "",
  newTrans: "",
  newOther: "",
  gap: "",
  reloc: "",
  lost: "",
  join: "",
};

export function isSample(form: FormState): boolean {
  return (Object.keys(SAMPLE) as (keyof FormState)[]).every(
    (k) => form[k] === SAMPLE[k],
  );
}

const money = (s: string) => (s.trim() === "" ? "0" : s.trim());

/** Convert validated form strings into the API request. */
export function toRequest(f: FormState): CareerRequest {
  return {
    current_job: {
      annual_take_home: money(f.curPay),
      annual_salary_growth_rate: percentToFraction(f.curGrowth),
    },
    new_job: {
      annual_take_home: money(f.newPay),
      annual_salary_growth_rate: percentToFraction(f.newGrowth),
    },
    current_costs: {
      rent: money(f.curRent),
      utilities: money(f.curUtil),
      food: money(f.curFood),
      transport: money(f.curTrans),
      other: money(f.curOther),
    },
    new_costs: {
      rent: money(f.newRent),
      utilities: money(f.newUtil),
      food: money(f.newFood),
      transport: money(f.newTrans),
      other: money(f.newOther),
    },
    starting_savings: money(f.savings),
    horizon_months: Number(f.horizon),
    expense_inflation_rate: percentToFraction(f.inflation),
    employment_gap_months: f.gap.trim() === "" ? 0 : Number(f.gap),
    relocation_cost: money(f.reloc),
    lost_bonus: money(f.lost),
    joining_bonus: money(f.join),
  };
}
