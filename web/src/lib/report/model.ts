import { ASSUMPTIONS } from "../assumptions";
import { fractionToPercent, inr, monthsToYears } from "../format";
import type { AnnualRow } from "../types";
import { isZeroAmount, sumAmounts, toPaise } from "./money";
import type { ReportInput, ReportModel, Row2 } from "./types";

const BRAND = "WhatIf Engine";
const DASH = "—";

/** Amount for an optional input: a dash when nothing was entered. */
const optional = (value: string) => (isZeroAmount(value) ? DASH : inr(value));

export const dateParts = (d: Date) => ({
  on: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(d),
  iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
});

/** One-time items for a year, one per line, only when non-zero. */
function oneTimeItems(row: AnnualRow): string {
  const items: string[] = [];
  if (!isZeroAmount(row.relocation_costs)) items.push(`${inr(row.relocation_costs)} relocation`);
  if (!isZeroAmount(row.lost_bonus)) items.push(`${inr(row.lost_bonus)} bonus given up`);
  if (!isZeroAmount(row.joining_bonus)) items.push(`+${inr(row.joining_bonus)} joining bonus`);
  return items.length ? items.join("\n") : DASH;
}

const yearlyRows = (rows: AnnualRow[]): string[][] =>
  rows.map((r) => [
    `Year ${r.year}`,
    inr(r.total_income),
    inr(r.total_expenses),
    oneTimeItems(r),
    inr(r.net_savings),
    inr(r.ending_cash),
  ]);

/** Totals over the whole period: sums of the engine's yearly figures. */
function totalsFor(rows: AnnualRow[]) {
  const sum = (pick: (r: AnnualRow) => string) => sumAmounts(rows.map(pick));
  return {
    income: sum((r) => r.total_income),
    expenses: sum((r) => r.total_expenses),
    oneTime: sumAmounts([...rows.map((r) => r.relocation_costs), ...rows.map((r) => r.lost_bonus)]),
    joining: sum((r) => r.joining_bonus),
    saved: sum((r) => r.net_savings),
  };
}

const signed = (amount: string) => (toPaise(amount) > 0n ? `+${inr(amount)}` : inr(amount));

/** Build the report's content. Pure: no PDF library, no side effects. */
export function buildReportModel(input: ReportInput): ReportModel {
  const { request, result } = input;
  const { summary } = result;
  const when = dateParts(input.generatedAt ?? new Date());
  const names = {
    stay: input.scenarioNames?.stay?.trim() || "Stay",
    switch: input.scenarioNames?.switch?.trim() || "Switch",
  };

  const months = request.horizon_months;
  const period = `${months} months (${monthsToYears(months)})`;

  // ---- Page 1: headline and a neutral summary of the calculated results ----
  const diff = summary.ending_cash_difference;
  const diffPaise = toPaise(diff);
  const higherOrLower = diffPaise > 0n ? "higher" : "lower";

  const sentences: string[] = [
    `Over ${period}, projected ending cash is ${inr(summary.stay_ending_cash)} under ${names.stay} and ${inr(summary.switch_ending_cash)} under ${names.switch}.`,
    diffPaise === 0n
      ? `Ending cash is the same in both scenarios.`
      : `${names.switch} ends ${inr(diffPaise < 0n ? diff.replace("-", "") : diff)} ${higherOrLower} than ${names.stay}.`,
    summary.break_even_month === null
      ? `Within this period, cash under ${names.switch} does not catch up with ${names.stay}.`
      : summary.break_even_month === 1
        ? `Cash under ${names.switch} is at or above ${names.stay} in every month of the period.`
        : `From month ${summary.break_even_month} onward, cash under ${names.switch} stays at or above ${names.stay} through the end of the period.`,
  ];

  const negatives = [
    summary.stay_first_negative_month !== null &&
      `${names.stay} in month ${summary.stay_first_negative_month}`,
    summary.switch_first_negative_month !== null &&
      `${names.switch} in month ${summary.switch_first_negative_month}`,
  ].filter(Boolean);
  sentences.push(
    negatives.length
      ? `Projected cash falls below zero under ${negatives.join(" and ")}.`
      : `Projected cash stays at or above zero in both scenarios. The lowest month-end balances are ${inr(summary.stay_lowest_cash)} (${names.stay}) and ${inr(summary.switch_lowest_cash)} (${names.switch}).`,
  );

  // ---- Page 2: totals and year-by-year ----
  const stayTotals = totalsFor(result.stay_annual);
  const switchTotals = totalsFor(result.switch_annual);
  const totalsRows: Row2[] = [
    ["Starting savings", inr(request.starting_savings), inr(request.starting_savings)],
    ["Total income", inr(stayTotals.income), inr(switchTotals.income)],
    ["Total living costs", inr(stayTotals.expenses), inr(switchTotals.expenses)],
    [
      "Relocation and bonus given up",
      optional(stayTotals.oneTime),
      optional(switchTotals.oneTime),
    ],
    ["Joining bonus", optional(stayTotals.joining), optional(switchTotals.joining)],
    ["Total saved", inr(stayTotals.saved), inr(switchTotals.saved)],
    ["Ending cash", inr(summary.stay_ending_cash), inr(summary.switch_ending_cash)],
  ];

  // ---- Page 3: the user's inputs ----
  const cur = request.current_costs;
  const next = request.new_costs;
  const cost = (label: string, a: string, b: string): Row2 => [label, optional(a), optional(b)];
  const scenarioRows: Row2[] = [
    [
      "Annual take-home pay",
      inr(request.current_job.annual_take_home),
      inr(request.new_job.annual_take_home),
    ],
    [
      "Annual pay growth",
      fractionToPercent(request.current_job.annual_salary_growth_rate),
      fractionToPercent(request.new_job.annual_salary_growth_rate),
    ],
    cost("Rent per month", cur.rent, next.rent),
    cost("Utilities per month", cur.utilities, next.utilities),
    cost("Food per month", cur.food, next.food),
    cost("Transport per month", cur.transport, next.transport),
    cost("Other costs per month", cur.other, next.other),
    [
      "Total monthly living costs",
      inr(sumAmounts([cur.rent, cur.utilities, cur.food, cur.transport, cur.other])),
      inr(sumAmounts([next.rent, next.utilities, next.food, next.transport, next.other])),
    ],
  ];

  const gap = request.employment_gap_months;
  const sharedRows: [string, string][] = [
    ["Savings at the start", inr(request.starting_savings)],
    ["Annual expense inflation (both scenarios)", fractionToPercent(request.expense_inflation_rate)],
    [`Time without a salary (${names.switch} only)`, gap === 0 ? "None" : `${gap} ${gap === 1 ? "month" : "months"}`],
    [`Relocation cost (${names.switch} only)`, optional(request.relocation_cost)],
    [`Bonus given up by leaving (${names.switch} only)`, optional(request.lost_bonus)],
    [`Joining bonus (${names.switch} only)`, optional(request.joining_bonus)],
  ];

  return {
    brand: BRAND,
    generatedOn: when.on,
    generatedIso: when.iso,
    scenarios: names,
    period,
    headline: {
      stayEnding: inr(summary.stay_ending_cash),
      switchEnding: inr(summary.switch_ending_cash),
      difference: signed(diff),
      differenceLabel: `Difference in ending cash (${names.switch} minus ${names.stay})`,
      differenceNote: `A positive figure means higher ending cash under ${names.switch}.`,
    },
    summary: sentences,
    totals: { head: ["Over the full period", names.stay, names.switch], rows: totalsRows },
    yearly: {
      head: ["Year", "Income", "Living costs", "One-time items", "Saved", "Cash at year end"],
      stay: yearlyRows(result.stay_annual),
      switch: yearlyRows(result.switch_annual),
    },
    inputs: {
      head: ["Your inputs", names.stay, names.switch],
      scenarioRows,
      sharedRows,
    },
    methodology: [
      "Each scenario is projected month by month using a deterministic cash-flow model with exact decimal arithmetic. Pay and living costs change in annual steps at the growth and inflation rates above, so the same inputs always give the same result.",
      `Page 2 totals are sums of the yearly figures; Saved = income − living costs − relocation − bonus given up + joining bonus. Amounts are shown to the nearest rupee, so displayed figures may not add up exactly. A dash (${DASH}) means no amount was entered.`,
      "Break-even is the first month from which cash under the new job stays at or above cash under the current job through the end of the period. A temporary lead, such as from a joining bonus, is not counted.",
    ],
    limitations: ASSUMPTIONS,
    disclaimer:
      "This report is a projection based only on the inputs listed above. It is not a forecast or a guarantee, and it is not financial, tax or investment advice. Real outcomes will differ. Consider speaking to a qualified adviser before making a decision.",
  };
}
