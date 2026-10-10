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
