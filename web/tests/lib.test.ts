import { describe, expect, it } from "vitest";
import { fractionToPercent, inr, inrCompact, percentToFraction } from "../src/lib/format";
import { BLANK, SAMPLE, isSample, toRequest } from "../src/lib/form";
import { validate } from "../src/lib/validation";

describe("inr formatting", () => {
  it("uses Indian digit grouping", () => {
    expect(inr("1234567")).toBe("₹12,34,567");
    expect(inr("100000")).toBe("₹1,00,000");
    expect(inr("999")).toBe("₹999");
  });
  it("shows negatives with a minus sign and avoids -₹0", () => {
    expect(inr("-250000")).toBe("−₹2,50,000");
    expect(inr("-0.2")).toBe("₹0");
  });
  it("handles bad input", () => {
    expect(inr("abc")).toBe("—");
  });
  it("formats compact axis labels", () => {
    expect(inrCompact(1_200_000)).toBe("₹12L");
    expect(inrCompact(25_000_000)).toBe("₹2.5Cr");
    expect(inrCompact(-5_000)).toBe("−₹5K");
  });
  it("converts percents and fractions", () => {
    expect(percentToFraction("9.1")).toBe("0.091");
    expect(percentToFraction("5")).toBe("0.05");
    expect(fractionToPercent("0.091")).toBe("9.1%");
  });
});

describe("validation", () => {
  it("accepts the sample scenario", () => {
    expect(validate(SAMPLE)).toEqual({});
  });
  it("requires both take-home pay figures", () => {
    const e = validate(BLANK);
    expect(e.curPay).toBeDefined();
    expect(e.newPay).toBeDefined();
  });
  it("rejects negative, non-numeric and absurd money", () => {
    expect(validate({ ...SAMPLE, reloc: "-5" }).reloc).toMatch(/negative/i);
    expect(validate({ ...SAMPLE, reloc: "abc" }).reloc).toMatch(/number/i);
    expect(validate({ ...SAMPLE, savings: "1e12" }).savings).toMatch(/large/i);
  });
  it("rejects a gap that is not shorter than the horizon", () => {
    expect(validate({ ...SAMPLE, gap: "36" }).gap).toBeDefined();
    expect(validate({ ...SAMPLE, gap: "35" }).gap).toBeUndefined();
    expect(validate({ ...SAMPLE, gap: "1.5" }).gap).toBeDefined();
  });
  it("bounds percentages and horizon", () => {
    expect(validate({ ...SAMPLE, inflation: "150" }).inflation).toBeDefined();
    expect(validate({ ...SAMPLE, horizon: "6" }).horizon).toBeDefined();
  });
});

describe("toRequest", () => {
  it("maps form strings to the API contract with fractional rates", () => {
    const req = toRequest(SAMPLE);
    expect(req.current_job.annual_take_home).toBe("1200000");
    expect(req.new_job.annual_salary_growth_rate).toBe("0.091");
    expect(req.expense_inflation_rate).toBe("0.05");
    expect(req.horizon_months).toBe(36);
    expect(req.employment_gap_months).toBe(1);
    expect(req.new_costs.rent).toBe("25000");
    expect(req.current_costs.rent).toBe("20000");
  });
  it("treats blank optional amounts as zero", () => {
    const req = toRequest({ ...SAMPLE, reloc: "", gap: "" });
    expect(req.relocation_cost).toBe("0");
    expect(req.employment_gap_months).toBe(0);
  });
  it("detects sample values", () => {
    expect(isSample(SAMPLE)).toBe(true);
    expect(isSample({ ...SAMPLE, curPay: "1" })).toBe(false);
  });
});
