// @vitest-environment node
// Runs the REAL Python engine in Pyodide and checks it against known results
// from the native Python engine. Skipped when the Pyodide assets have not been
// built (run `npm run prepare:engine` first; CI always does).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

const root = join(process.cwd(), "public");
const have =
  existsSync(join(root, "pyodide", "pyodide.asm.wasm")) &&
  existsSync(join(root, "engine", "whatif_engine.zip"));

// Sample scenario; expected values come from native Python
// (whatif_engine.api.service.handle), verified identical on 2026-10-10.
const REQUEST = {
  current_job: { annual_take_home: "1200000" },
  new_job: { annual_take_home: "1600000" },
  current_costs: { rent: "20000", utilities: "3000", food: "8000", transport: "3000", other: "5000" },
  new_costs: { rent: "25000", utilities: "3000", food: "8000", transport: "4000", other: "5000" },
  starting_savings: "300000",
  horizon_months: 36,
  employment_gap_months: 1,
  relocation_cost: "50000",
  lost_bonus: "40000",
  joining_bonus: "100000",
};

describe.skipIf(!have)("engine in Pyodide", () => {
  let handle: (kind: string, payload: string) => string;

  beforeAll(async () => {
    const { loadPyodide } = await import("pyodide");
    const py = await loadPyodide({ indexURL: join(root, "pyodide") + "/" });
    await py.loadPackage("pydantic");
    const zip = await readFile(join(root, "engine", "whatif_engine.zip"));
    py.unpackArchive(new Uint8Array(zip), "zip", { extractDir: "/engine" });
    py.runPython("import sys; sys.path.insert(0, '/engine')");
    handle = py.runPython("from whatif_engine.api.service import handle\nhandle") as typeof handle;
  }, 120_000);

  it("matches the native Python engine", () => {
    const out = JSON.parse(handle("compare", JSON.stringify(REQUEST)));
    expect(out.ok).toBe(true);
    expect(out.data.summary).toEqual({
      stay_ending_cash: "2762167.20",
      switch_ending_cash: "3698995.47",
      ending_cash_difference: "936828.27",
      break_even_month: 5,
      stay_lowest_cash: "361000.00",
      switch_lowest_cash: "165000.00",
      stay_first_negative_month: null,
      switch_first_negative_month: null,
    });
    expect(out.data.months).toHaveLength(36);
    expect(out.data.switch_annual).toHaveLength(3);
  });

  it("matches the native Python engine for the major expense simulator", () => {
    const request = {
      monthly_take_home: "100000",
      monthly_household_expenses: "55000",
      liquid_savings: "600000",
      emergency_fund: "300000",
      purchase_price: "1000000",
      payment_method: "loan",
      down_payment: "200000",
      loan_annual_rate: "0.09",
      loan_tenure_months: 60,
      fuel: "6000",
      servicing: "1500",
      parking_tolls: "1000",
      other_running: "500",
      annual_insurance: "30000",
      alternative_price: "700000",
    };
    const out = JSON.parse(handle("expense", JSON.stringify(request)));
    expect(out.ok).toBe(true);
    const [buyNow, delay, cheaper] = out.data.scenarios;
    // Expected values from native Python (whatif_engine.api.service.handle).
    expect(buyNow.emi).toBe("16606.68");
    expect(buyNow.total_interest).toBe("196401.05");
    expect(buyNow.surplus_after).toBe("16893.32");
    expect(buyNow.snapshots[0].loan_balance).toBe("667335.98");
    expect(buyNow.snapshots[0].net_worth_vs_baseline).toBe("-354616.19");
    expect(delay.price).toBe("1050000.00");
    expect(delay.emi).toBe("17437.02");
    expect(cheaper.emi).toBe("11624.68");
    expect(out.data.baseline.snapshots[0].liquid_savings).toBe("1140000.00");
    expect(out.data.months).toHaveLength(60);
  });

  it("runs the QA fixes in the browser engine exactly as native Python does", () => {
    // Early-career profile: Rs 35,000 take-home, Rs 22,000 expenses, Rs 1,50,000 saved, Rs 8,00,000 car at 10%.
    const request = {
      monthly_take_home: "35000",
      monthly_household_expenses: "22000",
      liquid_savings: "150000",
      purchase_price: "800000",
      payment_method: "loan",
      down_payment: "160000",
      loan_annual_rate: "0.10",
      delay_months: 24,
      alternative_price: "600000",
      horizon_years: 5,
    };
    const out = JSON.parse(handle("expense", JSON.stringify(request)));
    expect(out.ok).toBe(true);
    const [buyNow, delay, cheaper] = out.data.scenarios;
    // Values from native Python (whatif_engine.api.service.handle).
    expect(delay.purchase_share_of_surplus).toBe("0.9948");
    expect(delay.warnings.find((w: { code: string }) => w.code === "heavy_share").amount).toBe("0.9948");
    expect(cheaper.warnings.find((w: { code: string }) => w.code === "heavy_share").amount).toBe("0.7845");
    const low = cheaper.warnings.find((w: { code: string }) => w.code === "low_liquidity");
    expect(low).toMatchObject({ amount: "30000.00", cover_months: "0.93", month: null });
    expect(buyNow.warnings.map((w: { code: string }) => w.code)).toEqual(["insufficient_savings", "negative_surplus"]);
    expect(buyNow).toMatchObject({ peak_shortfall: "17177.30", peak_shortfall_month: 12, months_negative: 32, negative_at_end: false });
  });

  it("rejects an invalid expense request with the same shape of error", () => {
    const out = JSON.parse(handle("expense", JSON.stringify({ purchase_price: "-1" })));
    expect(out.ok).toBe(false);
    expect(out.status).toBe(422);
  });

  it("runs sensitivity", () => {
    const out = JSON.parse(handle("sensitivity", JSON.stringify(REQUEST)));
    expect(out.ok).toBe(true);
    // 3 growth x 3 inflation x gaps {0,1,3,6}
    expect(out.data.rows).toHaveLength(36);
  });

  it("rejects invalid input with the same messages as the API", () => {
    const bad = { ...REQUEST, relocation_cost: "-5" };
    const out = JSON.parse(handle("compare", JSON.stringify(bad)));
    expect(out.ok).toBe(false);
    expect(out.status).toBe(422);
    expect(out.detail[0].loc).toEqual(["relocation_cost"]);
  });
});
