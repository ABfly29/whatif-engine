import { describe, expect, it } from "vitest";
import { scenarioLabels, warningText, type WarningContext } from "../src/lib/expenseLabels";
import type { ExpenseWarning } from "../src/lib/types";
import { loadExpenseFixture } from "./expense.report.helpers";

const warn = (over: Partial<ExpenseWarning> & Pick<ExpenseWarning, "code">): ExpenseWarning => ({
  month: null,
  amount: null,
  cover_months: null,
  ...over,
});

const immediate: WarningContext = {
  purchase_month: 0,
  peak_shortfall: "0.00",
  peak_shortfall_month: null,
  months_negative: 0,
  negative_at_end: false,
};

describe("heavy-share percentage precision (B2)", () => {
  it.each([
    ["0.9948", "99.48%"],
    ["0.7845", "78.45%"],
    ["0.6246", "62.46%"],
    ["0.5139", "51.39%"],
    ["0.5000", "50%"], // the existing formatter drops trailing zeros
  ])("%s is shown as %s", (amount, percent) => {
    const text = warningText(warn({ code: "heavy_share", amount }), "Buy now", immediate);
    expect(text).toContain(`take ${percent} of what`);
  });
});

describe("heavy-share wording for immediate and delayed purchases (B1)", () => {
  const w = warn({ code: "heavy_share", amount: "0.9948" });

  it("an immediate purchase compares with what you save today", () => {
    for (const context of [immediate, undefined]) {
      expect(warningText(w, "Buy now", context)).toBe(
        "Buy now: the purchase costs would take 99.48% of what you currently save each month.",
      );
    }
  });

  it("a delayed purchase compares with what you would save then, never 'currently'", () => {
    for (const month of [12, 24, 36]) {
      const text = warningText(w, "Buy in 24 months", { ...immediate, purchase_month: month });
      expect(text).toBe(
        "Buy in 24 months: the purchase costs would take 99.48% of what you would save then (per month).",
      );
      expect(text).not.toContain("currently");
    }
  });

  it("the cheaper option is bought today, so it keeps the 'currently' wording", () => {
    const text = warningText(warn({ code: "heavy_share", amount: "0.7845" }), "Cheaper option now", immediate);
    expect(text).toBe("Cheaper option now: the purchase costs would take 78.45% of what you currently save each month.");
  });
});

describe("low liquid cash (B3)", () => {
  it.each([
    ["0.00", "0", "₹0", "0 months"],
    ["1000.00", "0.02", "₹1,000", "0 months"],
    ["20000.00", "0.33", "₹20,000", "0.3 months"],
    ["45000.00", "0.75", "₹45,000", "0.8 months"],
  ])("cash left %s (%s months) is stated with the amount and the months of cover", (amount, cover, cash, months) => {
    const text = warningText(warn({ code: "low_liquidity", amount, cover_months: cover }), "Buy now", immediate);
    expect(text).toBe(
      `Buy now: after the upfront payment you would have ${cash} in liquid savings, about ${months} of your monthly spending (household expenses, running costs and EMI). Under one month is critically low.`,
    );
  });

  it("a low point later in the projection names the month", () => {
    const text = warningText(warn({ code: "low_liquidity", amount: "40000.00", cover_months: "0.67", month: 60 }), "Buy now", immediate);
    expect(text).toBe(
      "Buy now: your liquid savings would fall to ₹40,000 in month 60, about 0.7 months of your monthly spending (household expenses, running costs and EMI). Under one month is critically low.",
    );
  });

  it("is worded in terms of spending, not salary", () => {
    const text = warningText(warn({ code: "low_liquidity", amount: "5000.00", cover_months: "0.07" }), "Buy now", immediate);
    expect(text).toMatch(/monthly spending/);
    expect(text).not.toMatch(/salary|income|take-home/i);
  });
});

describe("negative cash disclosure", () => {
  const draining: WarningContext = {
    purchase_month: 0,
    peak_shortfall: "105504.00",
    peak_shortfall_month: 48,
    months_negative: 60,
    negative_at_end: true,
  };

  it("says how deep, for how long, whether it ends, and that no interest is charged", () => {
    const text = warningText(warn({ code: "insufficient_savings", amount: "40000.00" }), "Buy now", draining);
    expect(text).toBe(
      "Buy now: the upfront payment is ₹40,000 more than your liquid savings. The shortfall peaks at ₹1,05,504 in month 48, and cash stays below zero for 60 months (still below zero at the end of the 5-year projection). This model charges no interest on a negative balance, so real borrowing costs would be higher.",
    );
  });

  it("the same disclosure follows a cash_negative warning", () => {
    const text = warningText(warn({ code: "cash_negative", month: 6 }), "Buy now", draining);
    expect(text).toContain("your cash balance drops below zero in month 6.");
    expect(text).toContain("The shortfall peaks at ₹1,05,504 in month 48");
    expect(text).toContain("charges no interest on a negative balance");
  });

  it("a shortfall that recovers says when it ends, and a one-day shortfall says it is cleared", () => {
    const recovers = warningText(
      warn({ code: "insufficient_savings", amount: "100000.00" }),
      "Buy now",
      { ...immediate, peak_shortfall: "100000.00", peak_shortfall_month: 0, months_negative: 2, negative_at_end: false },
    );
    expect(recovers).toContain("peaks at ₹1,00,000 right after the upfront payment, and cash stays below zero for 2 months.");
    expect(recovers).not.toContain("end of the 5-year projection");
    const cleared = warningText(
      warn({ code: "insufficient_savings", amount: "5000.00" }),
      "Buy now",
      { ...immediate, peak_shortfall: "5000.00", peak_shortfall_month: 0, months_negative: 0 },
    );
    expect(cleared).toContain("peaks at ₹5,000 right after the upfront payment and is cleared within the first month.");
    expect(
      warningText(warn({ code: "insufficient_savings", amount: "1.00" }), "Buy now", {
        ...immediate, peak_shortfall: "1.00", peak_shortfall_month: 3, months_negative: 1,
      }),
    ).toContain("below zero for 1 month");
  });

  it("adds nothing when cash never goes negative or no scenario is given", () => {
    const w = warn({ code: "insufficient_savings", amount: "40000.00" });
    expect(warningText(w, "Buy now", immediate)).toBe("Buy now: the upfront payment is ₹40,000 more than your liquid savings.");
    expect(warningText(w, "Buy now")).toBe("Buy now: the upfront payment is ₹40,000 more than your liquid savings.");
  });

  it("does not claim an interest charge anywhere: it says there is none", () => {
    const text = warningText(warn({ code: "insufficient_savings", amount: "1.00" }), "Buy now", draining);
    expect(text).not.toMatch(/overdraft|interest of|charged at/i);
    expect(text).toContain("charges no interest");
  });
});

describe("unchanged warnings", () => {
  it("keeps the other messages exactly as before", () => {
    expect(warningText(warn({ code: "below_emergency_fund", amount: "200000.00" }), "Buy now", immediate)).toBe(
      "Buy now: paying upfront leaves you ₹2,00,000 below the emergency fund you set aside.",
    );
    expect(warningText(warn({ code: "negative_surplus", amount: "-598.11" }), "Buy now", immediate)).toBe(
      "Buy now: after the purchase costs you would spend ₹598 a month more than you earn.",
    );
  });
});

describe("with the real engine's output", () => {
  it("the low-cash fixture produces the low-liquidity messages for exactly the scenarios the engine flagged", () => {
    const { request, result } = loadExpenseFixture("expense-lowcash");
    const labels = scenarioLabels(request.delay_months);
    const texts = Object.fromEntries(
      result.scenarios.map((s) => [s.key, s.warnings.map((w) => warningText(w, labels[s.key], s))]),
    );
    expect(texts.buy_now).toContain(
      "Buy now: after the upfront payment you would have ₹5,000 in liquid savings, about 0.1 months of your monthly spending (household expenses, running costs and EMI). Under one month is critically low.",
    );
    expect(texts.cheaper.join(" ")).toContain("you would have ₹65,000 in liquid savings, about 0.8 months");
    expect(texts.delay.join(" ")).not.toContain("critically low");
    // The delayed purchase compares with future saving; the immediate ones with today's.
    expect(texts.delay.join(" ")).toContain("would save then (per month)");
    expect(texts.buy_now.join(" ")).toContain("currently save each month");
  });

  it("the strained fixture states the depth and length of its negative cash and the no-interest caveat", () => {
    const { request, result } = loadExpenseFixture("expense-strain");
    const labels = scenarioLabels(request.delay_months);
    const buy = result.scenarios[0];
    const text = buy.warnings.map((w) => warningText(w, labels[buy.key], buy)).join(" ");
    expect(text).toContain("The shortfall peaks at ₹11,40,693 in month 60");
    expect(text).toContain("cash stays below zero for 60 months (still below zero at the end of the 5-year projection)");
    expect(text).toContain("charges no interest on a negative balance");
  });
});
