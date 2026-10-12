import { describe, expect, it } from "vitest";
import { expenseAssumptionItems, scenarioLabels, warningText } from "../src/lib/expenseLabels";
import { inr } from "../src/lib/format";
import { buildExpenseReportModel, type ExpenseReportModel } from "../src/lib/report/expenseModel";
import type { ExpenseScenario } from "../src/lib/types";
import { EXPENSE_FIXTURES, loadExpenseFixture, type ExpenseFixtureName } from "./expense.report.helpers";
import { FIXED_DATE } from "./report.helpers";

const model = (name: ExpenseFixtureName) =>
  buildExpenseReportModel({ ...loadExpenseFixture(name), generatedAt: FIXED_DATE });

/** Every string the report will print. */
function allText(m: ExpenseReportModel): string[] {
  const tables = [m.monthly, m.outcome, m.horizons];
  return [
    m.brand, m.generatedOn, m.horizon.label, m.payment,
    ...Object.values(m.labels),
    ...m.summary, ...m.warnings, m.noWarningsNote,
    ...tables.flatMap((t) => [t.caption, ...t.head, ...t.rows.flat(), t.note ?? ""]),
    ...m.inputs.flatMap((g) => [g.title, ...g.rows.flat()]),
    m.hero.netWorthLabel, ...m.hero.netWorth.flatMap((x) => [x.label, x.value]),
    m.hero.differenceLabel, ...m.hero.difference.flatMap((x) => [x.label, x.value]), m.hero.differenceNote,
    ...m.assumptions, ...m.methodology, ...m.limitations, m.disclaimer,
  ];
}

const row = (t: { rows: string[][] }, label: string) => {
  const found = t.rows.find((r) => r[0] === label);
  if (!found) throw new Error(`no row "${label}"`);
  return found;
};

describe("expense report model", () => {
  it("states the branding, date, horizon and how the purchase is paid", () => {
    const m = model("expense");
    expect(m.brand).toBe("WhatIf Engine");
    expect(m.generatedOn).toBe("11 October 2026");
    expect(m.generatedIso).toBe("2026-10-11");
    expect(m.horizon).toEqual({ years: 3, label: "3 years" });
    expect(m.payment).toBe("Loan at 9% a year over 60 months");
    expect(model("expense-cash").payment).toBe("Paid in cash");
  });

  it("compares all four options in the same order, named from the calculated request", () => {
    const { request } = loadExpenseFixture("expense-cash");
    const m = model("expense-cash");
    // The horizon is the title of the outcome table, in its header, as the career report titles its tables.
    expect(m.outcome.head).toEqual([
      "After 5 years", "No purchase", "Buy now", "Buy in 18 months", "Cheaper option now",
    ]);
    expect(m.outcome.head.slice(1)).toEqual(
      ["baseline", "buy_now", "delay", "cheaper"].map(
        (k) => scenarioLabels(request.delay_months)[k as keyof ReturnType<typeof scenarioLabels>],
      ),
    );
    expect(m.monthly.head).toEqual(["Monthly picture", ...m.outcome.head.slice(1)]);
  });

  it("prints exactly the engine's figures for the selected horizon", () => {
    for (const name of EXPENSE_FIXTURES) {
      const { result } = loadExpenseFixture(name);
      const m = model(name);
      const all: ExpenseScenario[] = [result.baseline, ...result.scenarios];
      const at = (s: ExpenseScenario) => s.snapshots.find((x) => x.year === result.horizon_years)!;
      expect(row(m.outcome, "Liquid savings").slice(1)).toEqual(all.map((s) => inr(at(s).liquid_savings)));
      expect(row(m.outcome, "Net worth (savings + resale − loan)").slice(1)).toEqual(
        all.map((s) => inr(at(s).net_worth)),
      );
      expect(row(m.monthly, "Monthly surplus after the purchase").slice(1)).toEqual(
        all.map((s) => inr(s.surplus_after)),
      );
      expect(row(m.monthly, "Cash left after the upfront payment").slice(1)).toEqual(
        all.map((s) => inr(s.cash_after_upfront)),
      );
    }
  });

  it("net worth equals liquid savings + resale − loan for every printed figure", () => {
    // Checks the engine data the report prints, with arithmetic done here rather than by the engine.
    for (const name of EXPENSE_FIXTURES) {
      const { result } = loadExpenseFixture(name);
      for (const s of [result.baseline, ...result.scenarios]) {
        for (const x of s.snapshots) {
          const expected = Number(x.liquid_savings) + Number(x.resale_value) - Number(x.loan_balance);
          expect(Math.abs(Number(x.net_worth) - expected)).toBeLessThan(0.011);
          // Net worth lost = interest + running costs + depreciation when savings earn nothing.
          if (name === "expense" && s.key !== "baseline") {
            expect(Math.abs(Number(x.net_worth_vs_baseline) + Number(x.ownership_cost))).toBeLessThan(0.02);
          }
        }
      }
    }
  });

  it("EMI and loan balance agree with an independent reducing-balance calculation", () => {
    const { request, result } = loadExpenseFixture("expense");
    const m = model("expense");
    const principal = Number(request.purchase_price) - Number(request.down_payment);
    const i = Number(request.loan_annual_rate) / 12;
    const n = request.loan_tenure_months;
    const growth = (1 + i) ** n;
    const emi = (principal * i * growth) / (growth - 1);
    expect(row(m.monthly, "Monthly EMI")[2]).toBe(inr(emi)); // ₹8,00,000 at 9% over 60 months

    // Walk the loan month by month, as a lender's schedule would.
    let balance = principal;
    let interest = 0;
    for (let k = 0; k < 12; k++) {
      interest += balance * i;
      balance = balance * (1 + i) - emi;
    }
    const buy = result.scenarios[0].snapshots[0];
    expect(Math.abs(Number(buy.loan_balance) - balance)).toBeLessThan(0.05);
    expect(Math.abs(Number(buy.interest_paid) - interest)).toBeLessThan(0.05);
    expect(m.horizons.rows.find((r) => r[0] === "Buy now" && r[1] === "1 year")![3]).toBe(inr(balance));
    // Total interest over the whole tenure, as printed.
    expect(row(m.monthly, "Total interest over the loan")[2]).toBe(inr(emi * n - principal));
  });

  it("delayed purchase: later price, same down-payment share, ownership from the purchase month", () => {
    const { request, result } = loadExpenseFixture("expense");
    const later = result.scenarios[1];
    const price = Number(request.purchase_price) * (1 + Number(request.annual_price_increase)) ** (request.delay_months / 12);
    expect(later.purchase_month).toBe(12);
    expect(Math.abs(Number(later.price) - price)).toBeLessThan(0.01);
    const share = Number(request.down_payment) / Number(request.purchase_price);
    expect(Math.abs(Number(later.upfront_payment) - price * share)).toBeLessThan(0.01);
    const m = model("expense");
    expect(row(m.monthly, "Price paid (on-road)")[3]).toBe(inr(price));
    // Nothing is owned or owed one year in: only the delay shows.
    const y1 = m.horizons.rows.find((r) => r[0] === "Buy in 12 months" && r[1] === "1 year")!;
    expect(y1[4]).toBe(inr(price)); // resale value at the instant of purchase
    expect(y1[6]).toBe("₹0"); // net worth is unchanged by the purchase itself
  });

  it("a cash purchase shows no loan, EMI or interest", () => {
    const m = model("expense-cash");
    expect(row(m.monthly, "Monthly EMI").slice(1)).toEqual(["—", "—", "—", "—"]);
    expect(row(m.monthly, "Loan amount").slice(1)).toEqual(["—", "—", "—", "—"]);
    expect(m.summary.join(" ")).toContain("paid in cash, so there is no EMI");
    expect(m.inputs.find((g) => g.title === "The purchase")!.rows.map((r) => r[0])).not.toContain("Down payment");
    expect(row(m.outcome, "Loan still owed").slice(1)).toEqual(["—", "—", "—", "—"]);
  });

  it("a repaid loan shows ₹0 owed, not a dash", () => {
    const m = model("expense"); // 60-month loan, bought now: repaid by year 5
    const y5 = m.horizons.rows.find((r) => r[0] === "Buy now" && r[1] === "5 years")!;
    expect(y5[3]).toBe("₹0");
    expect(m.horizons.rows.find((r) => r[0] === "No purchase" && r[1] === "5 years")![3]).toBe("—");
  });

  it("a loan longer than the projection still shows a balance at five years", () => {
    const m = model("expense-strain"); // 84-month loan
    const y5 = m.horizons.rows.find((r) => r[0] === "Buy now" && r[1] === "5 years")!;
    expect(y5[3]).not.toBe("₹0");
    expect(y5[3]).toMatch(/^₹/);
  });

  it("lists every warning the engine raised, worded as on screen, and never a verdict", () => {
    const { request, result } = loadExpenseFixture("expense-strain");
    const m = model("expense-strain");
    const labels = scenarioLabels(request.delay_months);
    // The same function the results screen uses, given the same scenario, so the PDF and the screen agree.
    const expected = result.scenarios.flatMap((s) => s.warnings.map((w) => warningText(w, labels[s.key], s)));
    expect(m.warnings).toEqual(expected);
    const joined = m.warnings.join(" ");
    for (const phrase of [
      "more than your liquid savings",
      "below the emergency fund",
      "a month more than you earn",
      "drops below zero in month",
    ]) {
      expect(joined).toContain(phrase);
    }
    // The calm case says so, without calling it safe.
    expect(model("expense-cash").warnings).toEqual([]);
    expect(model("expense-cash").noWarningsNote).toMatch(/not a verdict/);
  });

  it("discloses the assumptions that were actually calculated, the same list as on screen", () => {
    const { request } = loadExpenseFixture("expense-cash");
    const m = model("expense-cash");
    expect(m.assumptions).toEqual(expenseAssumptionItems(request));
    expect(m.assumptions.join(" ")).toContain("8% a year"); // salary growth in this fixture
    expect(m.assumptions.join(" ")).toContain("Positive savings earn 4% a year");
    expect(m.horizon.label).toBe("5 years");
    // Every editable assumption is stated with the value that was calculated.
    const text = m.assumptions.join(" ");
    for (const phrase of ["Salary grows 8% a year", "rise 5% a year", "loses 15% of its value", "price rises 5% a year"]) {
      expect(text).toContain(phrase);
    }
    expect(model("expense").assumptions.join(" ")).toContain("no interest or investment return is assumed");
  });

  it("covers methodology, limitations and a disclaimer that does not claim affordability", () => {
    const m = model("expense");
    expect(m.methodology.join(" ")).toContain("reducing-balance");
    expect(m.methodology.join(" ")).toContain("EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1)");
    expect(m.limitations.join(" ")).toMatch(/estimate/i);
    expect(m.limitations.join(" ")).toMatch(/Resale values/);
    expect(m.disclaimer).toContain("does not establish whether a purchase is safe or affordable");
    expect(m.disclaimer).toContain("not financial, tax, lending or investment advice");
    for (const text of allText(m)) {
      if (/affordable|safe to|can afford/i.test(text)) expect(text).toMatch(/not|nor|prompts|trade-offs/i);
    }
  });

  it("uses rupees with Indian digit grouping and a true minus everywhere", () => {
    for (const name of EXPENSE_FIXTURES) {
      const text = allText(model(name)).join("\n");
      const amounts = text.match(/[+−]?₹\d+(?:,\d+)*/g) ?? [];
      expect(amounts.length).toBeGreaterThan(20);
      for (const a of amounts) {
        expect(a).toMatch(/^[+−]?₹(?:\d{1,3}|\d{1,2}(?:,\d{2})*,\d{3})$/);
      }
      expect(text).not.toMatch(/-₹/);
      expect(text).not.toMatch(/\$|USD/);
    }
    expect(allText(model("expense-strain")).join(" ")).toContain("−₹");
  });

  it("includes the starting position and purchase details the user entered", () => {
    const { request } = loadExpenseFixture("expense");
    const m = model("expense");
    const flat = Object.fromEntries(m.inputs.flatMap((g) => g.rows));
    expect(flat["Monthly take-home salary"]).toBe(inr(request.monthly_take_home));
    expect(flat["Liquid savings"]).toBe(inr(request.liquid_savings));
    expect(flat["Of which: emergency fund"]).toBe(inr(request.emergency_fund));
    expect(flat["On-road price"]).toBe(inr(request.purchase_price));
    expect(flat["Down payment"]).toBe(inr(request.down_payment));
    expect(flat["Loan amount"]).toBe("₹8,00,000");
    expect(flat["Insurance renewal per year"]).toBe(inr(request.annual_insurance));
    expect(flat["Delay the purchase by"]).toBe("12 months");
  });

  it("is deterministic and follows the horizon the calculation used", () => {
    expect(model("expense")).toEqual(model("expense"));
    expect(model("expense").outcome.caption).toBe("After 3 years");
    expect(model("expense-cash").outcome.caption).toBe("After 5 years");
    expect(model("expense-strain").outcome.caption).toBe("After 1 year");
    expect(buildExpenseReportModel(loadExpenseFixture("expense")).generatedOn).toMatch(/^\d{1,2} \w+ \d{4}$/);
  });
});

describe("expense report summary figures and outcome table", () => {
  it("the large figures are the engine's net worth for all four options, in column order", () => {
    for (const name of EXPENSE_FIXTURES) {
      const { result } = loadExpenseFixture(name);
      const m = model(name);
      const all = [result.baseline, ...result.scenarios];
      const at = (s: ExpenseScenario) => s.snapshots.find((x) => x.year === result.horizon_years)!;
      expect(m.hero.netWorth.map((x) => x.value)).toEqual(all.map((s) => inr(at(s).net_worth)));
      expect(m.hero.netWorth.map((x) => x.label)).toEqual(Object.values(m.labels));
      expect(m.hero.netWorthLabel).toBe(`Projected net worth after ${m.horizon.label}`);
    }
  });

  it("the difference figures are signed, use a true minus, and match the outcome table", () => {
    for (const name of EXPENSE_FIXTURES) {
      const { result } = loadExpenseFixture(name);
      const m = model(name);
      const at = (s: ExpenseScenario) => s.snapshots.find((x) => x.year === result.horizon_years)!;
      const expected = result.scenarios.map((s) => {
        const v = at(s).net_worth_vs_baseline;
        return Number(v) > 0 ? `+${inr(v)}` : inr(v);
      });
      expect(m.hero.difference.map((x) => x.value)).toEqual(expected);
      expect(m.hero.difference.map((x) => x.value)).toEqual(row(m.outcome, "Net worth vs no purchase").slice(2));
      expect(m.hero.difference.map((x) => x.label)).toEqual(Object.values(m.labels).slice(1));
    }
    expect(model("expense").hero.difference[0].value).toBe("−₹9,82,267");
    expect(model("expense").hero.differenceNote).toMatch(/negative figure means lower net worth/);
  });

  it("one outcome table carries the savings, debt, resale, net worth and ownership-cost rows", () => {
    const m = model("expense");
    expect(m.outcome.rows.map((r) => r[0])).toEqual([
      "Liquid savings",
      "Loan still owed",
      "Estimated resale value",
      "Net worth (savings + resale − loan)",
      "Net worth vs no purchase",
      "Liquid savings vs no purchase",
      "Interest paid so far",
      "Running costs paid so far",
      "Estimated depreciation",
      "Ownership cost (interest + running + depreciation)",
    ]);
    // Same engine figures as before the tables were merged.
    expect(row(m.outcome, "Estimated depreciation")[2]).toBe("₹3,85,875");
    expect(row(m.outcome, "Ownership cost (interest + running + depreciation)")[2]).toBe("₹9,82,267");
    expect(row(m.outcome, "Loan still owed")[2]).toBe("₹3,63,506");
  });

  it("the summary gives EMI, interest, surplus and the savings difference, and no longer repeats the large figures", () => {
    const { result } = loadExpenseFixture("expense");
    const m = model("expense");
    expect(m.summary).toHaveLength(3);
    const text = m.summary.join(" ");
    expect(text).toContain("Monthly EMI is ₹16,607");
    expect(text).toContain("Interest over the full loan is ₹1,96,401");
    expect(text).toContain("Monthly surplus after household expenses, running costs and EMI is ₹16,893");
    const buy = result.scenarios[0].snapshots[1];
    expect(text).toContain(`Liquid savings are ${inr(buy.liquid_vs_baseline.replace("-", ""))} lower`);
    expect(text).not.toContain("projected net worth is");
  });

  it("definitions live in the methodology, and the glossary field is gone", () => {
    const m = model("expense");
    expect("glossary" in m).toBe(false);
    const text = m.methodology.join(" ");
    for (const phrase of ["Equated Monthly Instalment", "outstanding principal", "Net worth is liquid savings", "Ownership cost is interest + running costs + depreciation", "Monthly surplus is what is left"]) {
      expect(text).toContain(phrase);
    }
  });
});
