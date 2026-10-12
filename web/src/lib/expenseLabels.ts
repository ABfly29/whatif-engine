// Wording shared by the on-screen results and the PDF report, so the two never drift apart.
// Pure: no React and no PDF library, so it is safe to load inside the report worker.
import { fractionToPercent, inr, monthsLabel } from "./format";
import type {
  ExpenseRequest,
  ExpenseScenario,
  ExpenseScenarioKey,
  ExpenseWarning,
} from "./types";

export function scenarioLabels(delayMonths: number): Record<ExpenseScenarioKey, string> {
  return {
    baseline: "No purchase",
    buy_now: "Buy now",
    delay: `Buy in ${delayMonths} ${delayMonths === 1 ? "month" : "months"}`,
    cheaper: "Cheaper option now",
  };
}

/** The parts of a scenario its warnings refer to. */
export type WarningContext = Pick<
  ExpenseScenario,
  "purchase_month" | "peak_shortfall" | "peak_shortfall_month" | "months_negative" | "negative_at_end"
>;

/**
 * When cash goes below zero: how far, for how long, and that no interest is counted on it.
 * The model does not charge borrowing costs on a negative balance, so the real cost is higher.
 */
function negativeCashNote(s?: WarningContext): string {
  if (!s || Number(s.peak_shortfall) <= 0) return "";
  const peak = inr(s.peak_shortfall);
  const when = s.peak_shortfall_month === 0 ? "right after the upfront payment" : `in month ${s.peak_shortfall_month}`;
  const duration =
    s.months_negative === 0
      ? " and is cleared within the first month"
      : `, and cash stays below zero for ${s.months_negative} ${s.months_negative === 1 ? "month" : "months"}${
          s.negative_at_end ? " (still below zero at the end of the 5-year projection)" : ""
        }`;
  return ` The shortfall peaks at ${peak} ${when}${duration}. This model charges no interest on a negative balance, so real borrowing costs would be higher.`;
}

/**
 * The sentence for one warning. `context` is the scenario the warning belongs to: it says whether
 * the purchase is immediate or delayed, and how deep and long any negative cash is.
 */
export function warningText(w: ExpenseWarning, label: string, context?: WarningContext): string {
  const amount = Number(w.amount ?? 0);
  switch (w.code) {
    case "insufficient_savings":
      return `${label}: the upfront payment is ${inr(amount)} more than your liquid savings.${negativeCashNote(context)}`;
    case "below_emergency_fund":
      return `${label}: paying upfront leaves you ${inr(amount)} below the emergency fund you set aside.`;
    case "negative_surplus":
      return `${label}: after the purchase costs you would spend ${inr(-amount)} a month more than you earn.`;
    case "heavy_share": {
      // For a delayed purchase the share is measured against the saving at the purchase date
      // (after the pay and cost changes entered), not today's.
      const delayed = (context?.purchase_month ?? 0) > 0;
      return `${label}: the purchase costs would take ${fractionToPercent(String(amount))} of what you ${
        delayed ? "would save then (per month)" : "currently save each month"
      }.`;
    }
    case "cash_negative":
      return `${label}: your cash balance drops below zero in month ${w.month}.${negativeCashNote(context)}`;
    case "low_liquidity": {
      const cover = monthsLabel(w.cover_months ?? 0);
      const where =
        w.month === null ? "after the upfront payment you would have" : `your liquid savings would fall to`;
      const when = w.month === null ? "" : ` in month ${w.month}`;
      return `${label}: ${where} ${inr(amount)}${w.month === null ? " in liquid savings" : ""}${when}, about ${cover} of your monthly spending (household expenses, running costs and EMI). Under one month is critically low.`;
    }
  }
}

/** The assumptions behind a result, in plain English, using the rates that were actually calculated. */
export function expenseAssumptionItems(request: ExpenseRequest): string[] {
  const pct = fractionToPercent;
  return [
    `Salary grows ${pct(request.annual_salary_growth)} a year; household and running costs rise ${pct(request.expense_inflation)} a year. Both step up once a year, and the EMI stays fixed.`,
    Number(request.savings_return) === 0
      ? "Your savings earn nothing: no interest or investment return is assumed."
      : `Positive savings earn ${pct(request.savings_return)} a year, compounded monthly. Money you owe earns nothing.`,
    `The vehicle loses ${pct(request.annual_depreciation)} of its value each year (declining balance) from the on-road price. Real resale values vary a lot by model, condition and market.`,
    `If you delay, the price rises ${pct(request.annual_price_increase)} a year, and the down payment stays the same share of the price. Your savings keep building meanwhile.`,
    "The first year's insurance is inside the on-road price. It renews every 12 months after you buy.",
    "Pay is take-home. Tax, PF, bonuses and other income or expenses are not modelled.",
    "Net worth here is only liquid savings plus the vehicle's estimated resale value minus the loan. It leaves out everything else you own or owe.",
    "EMI uses the standard reducing-balance formula with the yearly rate divided by 12. A lender may round it or charge fees, so your actual EMI can differ slightly.",
    "These figures are a projection from the numbers you entered. They are not a forecast, an offer or financial advice, and they do not say whether you can afford the purchase.",
  ];
}

export const EXPENSE_GLOSSARY: [term: string, meaning: string][] = [
  ["EMI", "Equated Monthly Instalment: the fixed amount you pay your lender each month. It covers some interest and some of the loan itself."],
  ["Outstanding principal", "How much of the loan you still owe. It falls with every EMI you pay."],
  ["Depreciation", "The value a vehicle loses as it ages. You do not pay it as a bill, but it is a real cost when you sell."],
  ["Liquid savings", "Money you can reach quickly, such as a savings account. A car is not liquid."],
  ["Net worth", "Here: liquid savings, plus what the vehicle could sell for, minus the loan still owed."],
  ["Monthly surplus", "What is left each month after household expenses, running costs and EMI."],
  ["Months covered", "How many months of your expenses your remaining cash could pay for if your income stopped."],
  ["Ownership cost", "Interest + running costs + depreciation. The principal you repay is not counted, because you keep it as the vehicle's value. Returns your money could have earned elsewhere are not counted either."],
];
