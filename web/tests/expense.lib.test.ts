import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateExpense } from "../src/lib/api";
import {
  EXPENSE_BLANK,
  EXPENSE_SAMPLE,
  isExpenseSample,
  toExpenseRequest,
  validateExpense,
  type ExpenseForm,
} from "../src/lib/expenseForm";
import { inr, inrWords, monthsLabel } from "../src/lib/format";

const form = (over: Partial<ExpenseForm> = {}): ExpenseForm => ({ ...EXPENSE_SAMPLE, ...over });

describe("Indian currency formatting", () => {
  it("groups digits the Indian way", () => {
    expect(inr(1250000)).toBe("₹12,50,000");
    expect(inr("85000")).toBe("₹85,000");
    expect(inr(123456789)).toBe("₹12,34,56,789");
    expect(inr(-1250000)).toBe("−₹12,50,000");
  });

  it("writes lakhs and crores in readable summaries", () => {
    expect(inrWords(1250000)).toBe("₹12.5 lakh");
    expect(inrWords("1000000")).toBe("₹10 lakh");
    expect(inrWords(100000)).toBe("₹1 lakh");
    expect(inrWords(12500000)).toBe("₹1.25 crore");
    expect(inrWords(25000000)).toBe("₹2.5 crore");
    expect(inrWords(1230000000)).toBe("₹123 crore");
    expect(inrWords(85000)).toBe("₹85,000");
    expect(inrWords(-1250000)).toBe("−₹12.5 lakh");
    expect(inrWords(0)).toBe("₹0");
    expect(inrWords("abc")).toBe("—");
  });

  it("labels months", () => {
    expect(monthsLabel("4.81")).toBe("4.8 months");
    expect(monthsLabel(1)).toBe("1 month");
    expect(monthsLabel("10.66")).toBe("10.7 months");
  });
});

describe("expense form validation", () => {
  it("accepts the sample and a cash purchase", () => {
    expect(validateExpense(EXPENSE_SAMPLE)).toEqual({});
    expect(validateExpense(form({ method: "cash", down: "", tenure: "" }))).toEqual({});
  });

  it("requires pay, price and the cheaper price, without piling on follow-on errors", () => {
    const errors = validateExpense(EXPENSE_BLANK);
    expect(Object.keys(errors).sort()).toEqual(["altPrice", "price", "takeHome"]);
  });

  it("rejects negatives, text, absurd amounts and bad percentages", () => {
    const e = validateExpense(form({ fuel: "-5", servicing: "abc", insurance: "99999999999", rate: "101", inflation: "" }));
    expect(e.fuel).toBeDefined();
    expect(e.servicing).toBeDefined();
    expect(e.insurance).toBeDefined();
    expect(e.rate).toBeDefined();
    expect(e.inflation).toBeDefined();
  });

  it("checks the relationships between amounts", () => {
    expect(validateExpense(form({ altPrice: "1000000" })).altPrice).toMatch(/lower/);
    expect(validateExpense(form({ down: "1000000" })).down).toMatch(/less than the price/);
    expect(validateExpense(form({ emergency: "700000" })).emergency).toMatch(/liquid savings/);
  });

  it("checks tenure and delay as whole numbers in range", () => {
    expect(validateExpense(form({ tenure: "0" })).tenure).toBeDefined();
    expect(validateExpense(form({ tenure: "241" })).tenure).toBeDefined();
    expect(validateExpense(form({ tenure: "12.5" })).tenure).toBeDefined();
    expect(validateExpense(form({ delay: "0" })).delay).toBeDefined();
    expect(validateExpense(form({ delay: "37" })).delay).toBeDefined();
    expect(validateExpense(form({ delay: "36", tenure: "240" }))).toEqual({});
  });

  it("ignores loan fields for a cash purchase", () => {
    expect(validateExpense(form({ method: "cash", down: "9999999", tenure: "x" }))).toEqual({});
  });
});

describe("toExpenseRequest", () => {
  it("maps percents to fractions and keeps money as exact strings", () => {
    const r = toExpenseRequest(EXPENSE_SAMPLE);
    expect(r).toMatchObject({
      monthly_take_home: "100000",
      purchase_price: "1000000",
      payment_method: "loan",
      down_payment: "200000",
      loan_annual_rate: "0.09",
      loan_tenure_months: 60,
      annual_salary_growth: "0.06",
      expense_inflation: "0.05",
      savings_return: "0",
      annual_depreciation: "0.15",
      annual_price_increase: "0.05",
      delay_months: 12,
      alternative_running_share: "1",
      horizon_years: 3,
    });
  });

  it("does not send a down payment for a cash purchase", () => {
    const r = toExpenseRequest(form({ method: "cash", down: "500000" }));
    expect(r.payment_method).toBe("cash");
    expect(r.down_payment).toBe("0");
  });

  it("treats blank optional amounts as zero and detects the sample", () => {
    expect(toExpenseRequest(form({ fuel: "", emergency: "" })).fuel).toBe("0");
    expect(isExpenseSample(EXPENSE_SAMPLE)).toBe(true);
    expect(isExpenseSample(form({ price: "1100000" }))).toBe(false);
  });

  it("carries a decimal rate without float noise", () => {
    expect(toExpenseRequest(form({ rate: "8.45" })).loan_annual_rate).toBe("0.0845");
  });
});

describe("expense transport", () => {
  beforeEach(() => vi.stubEnv("VITE_ENGINE", "http"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts to the expenses endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await simulateExpense(toExpenseRequest(EXPENSE_SAMPLE));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/expenses/simulate");
  });
});
