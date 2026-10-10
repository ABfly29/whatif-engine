import type { FormState } from "./form";

export type Errors = Partial<Record<keyof FormState, string>>;

const MAX_MONEY = 10_000_000_000; // matches the API ceiling (₹1,000 crore)

const MONEY_FIELDS: (keyof FormState)[] = [
  "savings",
  "curPay",
  "curRent",
  "curUtil",
  "curFood",
  "curTrans",
  "curOther",
  "newPay",
  "newRent",
  "newUtil",
  "newFood",
  "newTrans",
  "newOther",
  "reloc",
  "lost",
  "join",
];

const PERCENT_FIELDS: (keyof FormState)[] = ["inflation", "curGrowth", "newGrowth"];

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/**
 * Fast feedback only. The API re-validates everything and is the authority;
 * these limits mirror its schema so users see problems before a round trip.
 */
export function validate(f: FormState): Errors {
  const errors: Errors = {};

  for (const key of MONEY_FIELDS) {
    const v = f[key];
    if (v.trim() === "") continue; // blank means 0, except required fields below
    if (!isNumber(v)) errors[key] = "Enter a number.";
    else if (Number(v) < 0) errors[key] = "Cannot be negative.";
    else if (Number(v) > MAX_MONEY) errors[key] = "That amount is too large.";
  }

  for (const key of PERCENT_FIELDS) {
    const v = f[key];
    if (!isNumber(v)) errors[key] = "Enter a percentage.";
    else if (Number(v) < 0 || Number(v) > 100)
      errors[key] = "Must be between 0 and 100.";
  }

  if (!errors.curPay && !(Number(f.curPay) > 0))
    errors.curPay = "Enter your current take-home pay.";
  if (!errors.newPay && !(Number(f.newPay) > 0))
    errors.newPay = "Enter the new offer's take-home pay.";

  const horizon = Number(f.horizon);
  if (!Number.isInteger(horizon) || horizon < 12 || horizon > 120)
    errors.horizon = "Choose between 12 and 120 months.";

  if (f.gap.trim() !== "") {
    const gap = Number(f.gap);
    if (!Number.isInteger(gap) || gap < 0) errors.gap = "Enter whole months, 0 or more.";
    else if (!errors.horizon && gap >= horizon)
      errors.gap = "Must be shorter than the projection length.";
  }

  return errors;
}

export const SECTION_FIELDS = {
  current: ["curPay", "savings"],
  offer: ["newPay"],
  costs: [
    "curRent",
    "curUtil",
    "curFood",
    "curTrans",
    "curOther",
    "newRent",
    "newUtil",
    "newFood",
    "newTrans",
    "newOther",
  ],
  transition: ["gap", "reloc", "lost", "join"],
} as const satisfies Record<string, readonly (keyof FormState)[]>;

export type SectionId = keyof typeof SECTION_FIELDS;
