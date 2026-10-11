import { describe, expect, it } from "vitest";
import { ASSUMPTIONS } from "../src/lib/assumptions";
import { inr } from "../src/lib/format";
import { buildReportModel } from "../src/lib/report/model";
import { fromPaise, isZeroAmount, sumAmounts, toPaise } from "../src/lib/report/money";
import { FIXED_DATE, FIXTURES, loadFixture, type FixtureName } from "./report.helpers";

const model = (name: FixtureName, extra = {}) =>
  buildReportModel({ ...loadFixture(name), generatedAt: FIXED_DATE, ...extra });

describe("exact money helpers", () => {
  it("adds without floating-point drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem this avoids
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(sumAmounts(["1234567.89", "0.11"])).toBe("1234568.00");
  });
  it("handles negatives and missing decimals", () => {
    expect(sumAmounts(["-100.50", "40"])).toBe("-60.50");
    expect(fromPaise(toPaise("-0.05"))).toBe("-0.05");
    expect(toPaise("12")).toBe(1200n);
    expect(toPaise("12.5")).toBe(1250n);
  });
  it("rejects anything that is not a plain decimal", () => {
    for (const bad of ["", "abc", "1e5", "1,000", "NaN", "--1", "1.2.3"]) {
      expect(() => toPaise(bad)).toThrow();
    }
  });
  it("detects zero", () => {
    expect(isZeroAmount("0")).toBe(true);
    expect(isZeroAmount("0.00")).toBe(true);
    expect(isZeroAmount("0.01")).toBe(false);
  });
});

describe("report model uses only the real inputs and results", () => {
  it.each(FIXTURES)("%s: headline figures come from the engine output", (name) => {
    const { result } = loadFixture(name);
    const m = model(name);
    expect(m.headline.stayEnding).toBe(inr(result.summary.stay_ending_cash));
    expect(m.headline.switchEnding).toBe(inr(result.summary.switch_ending_cash));
  });

  it.each(FIXTURES)("%s: totals reconcile with the engine (start + saved = ending cash)", (name) => {
    const { request, result } = loadFixture(name);
    for (const [rows, ending] of [
      [result.stay_annual, result.summary.stay_ending_cash],
      [result.switch_annual, result.summary.switch_ending_cash],
    ] as const) {
      const saved = sumAmounts(rows.map((r) => r.net_savings));
      const drift = toPaise(request.starting_savings) + toPaise(saved) - toPaise(ending);
      // The engine rounds each yearly figure to the paisa on its own, so a sum of
      // yearly values can differ from the ending balance by at most 1 paisa a year.
      expect((drift < 0n ? -drift : drift) <= BigInt(rows.length)).toBe(true);
    }
  });

  it("totals table shows the same ending cash as the headline", () => {
    const m = model("sample");
    const ending = m.totals.rows.find((r) => r[0] === "Ending cash")!;
    expect(ending[1]).toBe(m.headline.stayEnding);
    expect(ending[2]).toBe(m.headline.switchEnding);
  });

  it.each(FIXTURES)("%s: one year-by-year row per engine year, for both scenarios", (name) => {
    const { result } = loadFixture(name);
    const m = model(name);
    expect(m.yearly.stay).toHaveLength(result.stay_annual.length);
    expect(m.yearly.switch).toHaveLength(result.switch_annual.length);
    expect(m.yearly.stay[0][0]).toBe("Year 1");
    expect(m.yearly.switch.at(-1)![0]).toBe(`Year ${result.switch_annual.at(-1)!.year}`);
  });

  it("lists one-time items only where they apply", () => {
    const { request } = loadFixture("sample");
    const m = model("sample");
    const firstYear = m.yearly.switch[0][3];
    expect(firstYear).toContain(`${inr(request.relocation_cost)} relocation`);
    expect(firstYear).toContain(`${inr(request.lost_bonus)} bonus given up`);
    expect(firstYear).toContain(`+${inr(request.joining_bonus)} joining bonus`);
    expect(m.yearly.switch[1][3]).toBe("—");
    expect(m.yearly.stay.every((r) => r[3] === "—")).toBe(true);
  });
});

describe("headline difference", () => {
  it("is signed and labelled", () => {
    const m = model("sample");
    expect(m.headline.difference.startsWith("+₹")).toBe(true);
    expect(m.headline.differenceLabel).toBe("Difference in ending cash (Switch minus Stay)");
    expect(m.headline.differenceNote).toMatch(/higher ending cash under Switch/);
  });
  it("shows a true minus sign for a negative difference", () => {
    const m = model("negative");
    expect(m.headline.difference.startsWith("−₹")).toBe(true);
    expect(m.headline.difference).not.toContain("-");
  });
  it("has no sign when the scenarios end level", () => {
    expect(model("minimal").headline.difference).toBe("₹0");
  });
});

describe("neutral summary reflects the calculated results", () => {
  const text = (name: FixtureName) => model(name).summary.join(" ");

  it("states the higher/lower difference without recommending anything", () => {
    expect(text("sample")).toMatch(/Switch ends ₹[\d,]+ higher than Stay/);
    expect(text("negative")).toMatch(/Switch ends ₹[\d,]+ lower than Stay/);
    for (const name of FIXTURES) {
      expect(text(name)).not.toMatch(/should|recommend|better off|worse off|best/i);
    }
  });
  it("reports break-even from the engine", () => {
    const { result } = loadFixture("sample");
    expect(text("sample")).toContain(`From month ${result.summary.break_even_month} onward`);
    expect(text("negative")).toMatch(/does not catch up/);
    expect(text("minimal")).toMatch(/every month/);
  });
  it("reports negative cash when it happens, and the lowest balances when it does not", () => {
    const neg = loadFixture("negative").result.summary;
    expect(text("negative")).toContain("falls below zero");
    if (neg.stay_first_negative_month !== null) {
      expect(text("negative")).toContain(`Stay in month ${neg.stay_first_negative_month}`);
    }
    expect(text("sample")).toContain("stays at or above zero in both scenarios");
    expect(text("sample")).toContain(inr(loadFixture("sample").result.summary.switch_lowest_cash));
  });
  it("covers the projection period", () => {
    expect(model("sample").period).toBe("36 months (3 years)");
    expect(model("long").period).toBe("120 months (10 years)");
    expect(model("minimal").period).toBe("12 months (1 year)");
  });
});

describe("inputs page", () => {
  it("echoes the inputs for each scenario", () => {
    const { request } = loadFixture("sample");
    const rows = Object.fromEntries(model("sample").inputs.scenarioRows.map((r) => [r[0], r]));
    expect(rows["Annual take-home pay"]).toEqual([
      "Annual take-home pay",
      inr(request.current_job.annual_take_home),
      inr(request.new_job.annual_take_home),
    ]);
    expect(rows["Annual pay growth"][1]).toBe("9.1%");
    expect(rows["Rent per month"][2]).toBe(inr(request.new_costs.rent));
  });
  it("handles missing optional fields with dashes, not zeros or errors", () => {
    const m = model("minimal");
    const rows = Object.fromEntries(m.inputs.scenarioRows.map((r) => [r[0], r]));
    expect(rows["Utilities per month"]).toEqual(["Utilities per month", "—", "—"]);
    expect(rows["Total monthly living costs"][1]).toBe(inr("15000"));
    const shared = Object.fromEntries(m.inputs.sharedRows);
    expect(shared["Time without a salary (Switch only)"]).toBe("None");
    expect(shared["Relocation cost (Switch only)"]).toBe("—");
    expect(shared["Joining bonus (Switch only)"]).toBe("—");
    expect(shared["Savings at the start"]).toBe("₹0");
  });
  it("pluralises the gap", () => {
    const gap = (n: number) => {
      const f = loadFixture("sample");
      f.request.employment_gap_months = n;
      return Object.fromEntries(buildReportModel(f).inputs.sharedRows)[
        "Time without a salary (Switch only)"
      ];
    };
    expect(gap(1)).toBe("1 month");
    expect(gap(3)).toBe("3 months");
  });
  it("uses the shared assumptions list and includes a disclaimer", () => {
    const m = model("sample");
    expect(m.limitations).toBe(ASSUMPTIONS);
    expect(m.disclaimer).toMatch(/not a forecast or a guarantee/);
    expect(m.disclaimer).toMatch(/not financial, tax or investment advice/);
  });
});

describe("report metadata", () => {
  it("formats the generation date for India", () => {
    const m = model("sample");
    expect(m.generatedOn).toBe("11 October 2026");
    expect(m.generatedIso).toBe("2026-10-11");
  });
  it("allows custom scenario names and falls back when blank", () => {
    const named = model("sample", { scenarioNames: { stay: "Current role", switch: "Offer from Acme" } });
    expect(named.scenarios).toEqual({ stay: "Current role", switch: "Offer from Acme" });
    expect(named.headline.differenceLabel).toContain("Offer from Acme minus Current role");
    expect(named.summary.join(" ")).toContain("under Current role");
    expect(model("sample", { scenarioNames: { stay: "  " } }).scenarios.stay).toBe("Stay");
  });
});
