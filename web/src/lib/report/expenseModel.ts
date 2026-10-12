import {
  expenseAssumptionItems,
  scenarioLabels,
  warningText,
} from "../expenseLabels";
import { fractionToPercent, inr, monthsLabel } from "../format";
import type {
  ExpenseRequest,
  ExpenseResponse,
  ExpenseScenario,
  ExpenseScenarioKey,
  ExpenseSnapshot,
} from "../types";
import { dateParts } from "./model";
import { isZeroAmount, toPaise } from "./money";

const BRAND = "WhatIf Engine";
const DASH = "—";

/**
 * Everything the expense report needs: the request that was calculated and the
 * engine's answer to it. Nothing is invented; every figure comes from these two.
 */
export interface ExpenseReportInput {
  request: ExpenseRequest;
  result: ExpenseResponse;
  /** Defaults to now. Injectable so output is reproducible in tests. */
  generatedAt?: Date;
}

export interface ReportTable {
  caption: string;
  head: string[];
  rows: string[][];
  note?: string;
}

export interface ExpenseReportModel {
  brand: string;
  generatedOn: string;
  generatedIso: string;
  horizon: { years: number; label: string };
  /** Display names for the four columns. */
  labels: Record<ExpenseScenarioKey, string>;
  payment: string;
  /** The large figures on the first page. */
  hero: {
    netWorthLabel: string;
    netWorth: { label: string; value: string }[];
    differenceLabel: string;
    difference: { label: string; value: string }[];
    differenceNote: string;
  };
  /** Neutral sentences derived from the calculated results. */
  summary: string[];
  warnings: string[];
  noWarningsNote: string;
  monthly: ReportTable;
  /** Everything at the selected horizon, in one table; the caption is also its header. */
  outcome: ReportTable;
  horizons: ReportTable;
  inputs: { title: string; rows: [label: string, value: string][] }[];
  assumptions: string[];
  methodology: string[];
  limitations: string[];
  disclaimer: string;
}

const COLUMNS: ExpenseScenarioKey[] = ["baseline", "buy_now", "delay", "cheaper"];

const optional = (value: string) => (isZeroAmount(value) ? DASH : inr(value));
const signed = (value: string) => (toPaise(value) > 0n ? `+${inr(value)}` : inr(value));
const yearsLabel = (years: number) => `${years} ${years === 1 ? "year" : "years"}`;

function snapshot(s: ExpenseScenario, year: number): ExpenseSnapshot {
  const found = s.snapshots.find((x) => x.year === year);
  if (!found) throw new Error(`No ${year}-year projection for ${s.key}.`);
  return found;
}

/** Build the report's content. Pure: no PDF library, no side effects. */
export function buildExpenseReportModel(input: ExpenseReportInput): ExpenseReportModel {
  const { request, result } = input;
  const when = dateParts(input.generatedAt ?? new Date());
  const labels = scenarioLabels(request.delay_months);
  const columns: ExpenseScenario[] = [result.baseline, ...result.scenarios];
  const byKey = Object.fromEntries(columns.map((s) => [s.key, s])) as Record<
    ExpenseScenarioKey,
    ExpenseScenario
  >;
  const years = result.horizon_years;
  const financed = request.payment_method === "loan";
  const hasLoan = (s: ExpenseScenario) => !isZeroAmount(s.loan_principal);
  const isBaseline = (s: ExpenseScenario) => s.key === "baseline";
  const money = (v: string) => (isZeroAmount(v) ? DASH : inr(v));
  const row = (label: string, cell: (s: ExpenseScenario) => string) => [
    label,
    ...columns.map(cell),
  ];
  const at = (s: ExpenseScenario, year: number = years) => snapshot(s, year);

  const buy = byKey.buy_now;
  const later = byKey.delay;
  const cheap = byKey.cheaper;
  const base = byKey.baseline;

  // ---- Page 1: large figures and a neutral summary ----
  const purchases = [buy, later, cheap];
  const hero: ExpenseReportModel["hero"] = {
    netWorthLabel: `Projected net worth after ${yearsLabel(years)}`,
    netWorth: columns.map((s) => ({ label: labels[s.key], value: inr(at(s).net_worth) })),
    differenceLabel: "Difference in net worth versus not buying",
    difference: purchases.map((s) => ({
      label: labels[s.key],
      value: signed(at(s).net_worth_vs_baseline),
    })),
    differenceNote: "A negative figure means lower net worth than not buying.",
  };

  const lowerOrHigher = (v: string) => (toPaise(v) < 0n ? "lower" : "higher");
  const gap = (v: string) => inr(toPaise(v) < 0n ? v.replace("-", "") : v);

  const summary: string[] = [
    `Compared with not buying, net worth is ${gap(at(buy).net_worth_vs_baseline)} ${lowerOrHigher(at(buy).net_worth_vs_baseline)} if you buy now, ${gap(at(later).net_worth_vs_baseline)} ${lowerOrHigher(at(later).net_worth_vs_baseline)} if you ${labels.delay.toLowerCase()}, and ${gap(at(cheap).net_worth_vs_baseline)} ${lowerOrHigher(at(cheap).net_worth_vs_baseline)} with the cheaper option. Liquid savings are ${gap(at(buy).liquid_vs_baseline)} ${lowerOrHigher(at(buy).liquid_vs_baseline)}, ${gap(at(later).liquid_vs_baseline)} ${lowerOrHigher(at(later).liquid_vs_baseline)} and ${gap(at(cheap).liquid_vs_baseline)} ${lowerOrHigher(at(cheap).liquid_vs_baseline)} respectively, because the money goes into the vehicle.`,
    financed
      ? `Monthly EMI is ${inr(buy.emi)} (buy now), ${inr(later.emi)} (${labels.delay.toLowerCase()}) and ${inr(cheap.emi)} (cheaper option). Interest over the full loan is ${inr(buy.total_interest)}, ${inr(later.total_interest)} and ${inr(cheap.total_interest)} respectively.`
      : "The purchase is paid in cash, so there is no EMI and no loan interest.",
    `Monthly surplus after household expenses, running costs and EMI is ${inr(buy.surplus_after)} (buy now), ${inr(later.surplus_after)} (${labels.delay.toLowerCase()}) and ${inr(cheap.surplus_after)} (cheaper option), against ${inr(base.surplus_after)} with no purchase. The delayed figure is for the first month after buying, in future rupees.`,
  ];

  const warnings = [
    ...base.warnings.map((w) => warningText(w, "Even without a purchase", base)),
    ...result.scenarios.flatMap((s) => s.warnings.map((w) => warningText(w, labels[s.key], s))),
  ];

  // ---- Page 2: comparison tables ----
  const monthly: ReportTable = {
    caption: "Monthly picture",
    head: ["Monthly picture", ...COLUMNS.map((k) => labels[k])],
    rows: [
      row("Price paid (on-road)", (s) => (isBaseline(s) ? DASH : inr(s.price))),
      row("Paid upfront", (s) => (isBaseline(s) ? DASH : inr(s.upfront_payment))),
      row("Loan amount", (s) => money(s.loan_principal)),
      row("Monthly EMI", (s) => money(s.emi)),
      row("Total interest over the loan", (s) => money(s.total_interest)),
      row("Monthly surplus before the purchase", (s) => inr(s.surplus_before)),
      row("Monthly surplus after the purchase", (s) => inr(s.surplus_after)),
      row("Cash left after the upfront payment", (s) => inr(s.cash_after_upfront)),
      row("Months of expenses that cash covers", (s) =>
        s.cover_months === null ? DASH : monthsLabel(s.cover_months),
      ),
      row("Short of your emergency fund by", (s) => money(s.emergency_fund_shortfall)),
    ],
    note: `The ${labels.delay.toLowerCase()} column shows the first month after it is bought, in future rupees after the growth and inflation you entered. Running costs include insurance spread evenly over 12 months.`,
  };

  const afterYears = `After ${yearsLabel(years)}`;
  const outcome: ReportTable = {
    caption: afterYears,
    head: [afterYears, ...COLUMNS.map((k) => labels[k])],
    rows: [
      row("Liquid savings", (s) => inr(at(s).liquid_savings)),
      row("Loan still owed", (s) => (hasLoan(s) ? inr(at(s).loan_balance) : DASH)),
      row("Estimated resale value", (s) => money(at(s).resale_value)),
      row("Net worth (savings + resale − loan)", (s) => inr(at(s).net_worth)),
      row("Net worth vs no purchase", (s) =>
        isBaseline(s) ? DASH : signed(at(s).net_worth_vs_baseline),
      ),
      row("Liquid savings vs no purchase", (s) =>
        isBaseline(s) ? DASH : signed(at(s).liquid_vs_baseline),
      ),
      row("Interest paid so far", (s) => (hasLoan(s) ? inr(at(s).interest_paid) : DASH)),
      row("Running costs paid so far", (s) => money(at(s).running_costs_paid)),
      row("Estimated depreciation", (s) => money(at(s).depreciation)),
      row("Ownership cost (interest + running + depreciation)", (s) =>
        money(at(s).ownership_cost),
      ),
    ],
    note:
      later.purchase_month !== null && later.purchase_month > years * 12
        ? `${labels.delay}: the purchase happens after this period, so it shows no ownership yet.`
        : undefined,
  };

  // ---- Page 3: every horizon ----
  const allYears = [1, 3, 5];
  const horizons: ReportTable = {
    caption: "Projected position at each horizon",
    head: ["Option", "After", "Liquid savings", "Loan still owed", "Resale value", "Net worth", "Net worth vs no purchase"],
    rows: columns.flatMap((s) =>
      allYears.map((y) => {
        const x = at(s, y);
        return [
          labels[s.key],
          yearsLabel(y),
          inr(x.liquid_savings),
          hasLoan(s) ? inr(x.loan_balance) : DASH,
          money(x.resale_value),
          inr(x.net_worth),
          isBaseline(s) ? DASH : signed(x.net_worth_vs_baseline),
        ];
      }),
    ),
  };

  // ---- The user's inputs ----
  const loanLabel = `${fractionToPercent(request.loan_annual_rate)} a year over ${request.loan_tenure_months} months`;
  const payment = financed ? `Loan at ${loanLabel}` : "Paid in cash";
  const inputs: ExpenseReportModel["inputs"] = [
    {
      title: "Your starting position",
      rows: [
        ["Monthly take-home salary", inr(request.monthly_take_home)],
        ["Monthly household expenses (without the purchase)", inr(request.monthly_household_expenses)],
        ["Liquid savings", inr(request.liquid_savings)],
        ["Of which: emergency fund", optional(request.emergency_fund)],
      ],
    },
    {
      title: "The purchase",
      rows: [
        ["On-road price", inr(request.purchase_price)],
        ["How it is paid", payment],
        ...(financed
          ? ([
              ["Down payment", optional(request.down_payment)],
              ["Loan amount", inr(buy.loan_principal)],
            ] as [string, string][])
          : []),
        ["Cheaper alternative: on-road price", inr(request.alternative_price)],
        ["Cheaper option's running costs", `${fractionToPercent(request.alternative_running_share)} of the main choice`],
        ["Delay the purchase by", `${request.delay_months} ${request.delay_months === 1 ? "month" : "months"}`],
      ],
    },
    {
      title: "Running costs (today's rupees)",
      rows: [
        ["Fuel per month", optional(request.fuel)],
        ["Servicing and maintenance per month", optional(request.servicing)],
        ["Parking and tolls per month", optional(request.parking_tolls)],
        ["Other per month", optional(request.other_running)],
        ["Insurance renewal per year", optional(request.annual_insurance)],
      ],
    },
  ];

  return {
    brand: BRAND,
    generatedOn: when.on,
    generatedIso: when.iso,
    horizon: { years, label: yearsLabel(years) },
    labels,
    payment,
    hero,
    summary,
    warnings,
    noWarningsNote:
      "No warnings were triggered. That is not a verdict: compare the figures against your own comfort level.",
    monthly,
    outcome,
    horizons,
    inputs,
    assumptions: expenseAssumptionItems(request),
    methodology: [
      "Four futures are projected month by month for 60 months with exact decimal arithmetic: no purchase, buying now, buying after the delay you chose, and buying a cheaper option now. All start from the same salary, expenses and savings, so the same inputs always give the same result.",
      "EMI, the Equated Monthly Instalment, is the fixed amount paid to the lender each month. It uses the standard reducing-balance formula, EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1), where P is the loan amount, n the number of months and i the yearly rate divided by 12. Each month's interest is the balance times i; the rest of the EMI repays principal, so the loan still owed (the outstanding principal) falls with every payment. The price, the upfront payment, the loan, the principal repaid and the interest are kept separate so nothing is counted twice.",
      "Resale value falls by the yearly depreciation rate on the on-road price. Net worth is liquid savings (money you can reach quickly) plus the vehicle's estimated resale value, minus the loan still owed. Ownership cost is interest + running costs + depreciation; the principal you repay is not a cost, because you keep it as the vehicle's value. Monthly surplus is what is left after household expenses, running costs and EMI. Amounts are shown to the nearest rupee, so displayed figures may not add up exactly. A dash (—) means not applicable or nothing entered.",
    ],
    limitations: [
      "Every figure is an estimate. Resale values in particular are uncertain and depend on the model, its condition and the market.",
      "Loan fees, processing charges, prepayment, floating rates, tax benefits and the purchase of other assets are not modelled. A lender may round the EMI.",
      "There are no surprise expenses, job changes, changes in family circumstances or other large purchases.",
      "The report describes trade-offs between options. It does not say whether any option is safe or affordable for you.",
    ],
    disclaimer:
      "This report is a projection based only on the inputs listed above. It is not a forecast, quote or guarantee, and it does not establish whether a purchase is safe or affordable. It is not financial, tax, lending or investment advice. Real outcomes will differ. Consider speaking to a qualified adviser before making a decision.",
  };
}
