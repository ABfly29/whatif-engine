import { beforeEach, describe, expect, it, vi } from "vitest";
import { careerSensitivity, compareCareer, usesBrowserEngine } from "../src/lib/api";
import { callEngine } from "../src/lib/engineClient";
import { SAMPLE, toRequest } from "../src/lib/form";

vi.mock("../src/lib/engineClient", async (orig) => ({
  ...(await orig<typeof import("../src/lib/engineClient")>()),
  callEngine: vi.fn(),
}));

const call = vi.mocked(callEngine);
const req = toRequest(SAMPLE);

beforeEach(() => call.mockReset());

describe("browser transport (default)", () => {
  it("is the default transport", () => {
    expect(usesBrowserEngine()).toBe(true);
  });

  it("returns the engine data and does not use fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    call.mockResolvedValue({ ok: true, data: { summary: "x" } });
    await expect(compareCareer(req)).resolves.toEqual({ summary: "x" });
    expect(call).toHaveBeenCalledWith("compare", req, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("routes sensitivity requests by kind", async () => {
    call.mockResolvedValue({ ok: true, data: { rows: [] } });
    await careerSensitivity(req);
    expect(call.mock.calls[0][0]).toBe("sensitivity");
  });

  it("shows engine validation messages", async () => {
    call.mockResolvedValue({ ok: false, status: 422, detail: "Costs and bonuses cannot be negative." });
    await expect(compareCareer(req)).rejects.toThrow("Costs and bonuses cannot be negative.");
  });

  it("formats schema validation lists", async () => {
    call.mockResolvedValue({
      ok: false,
      status: 422,
      detail: [{ loc: ["relocation_cost"], msg: "Input should be greater than or equal to 0" }],
    });
    await expect(compareCareer(req)).rejects.toThrow(/relocation_cost: Input should be/);
  });

  it("hides unexpected failures behind a friendly message", async () => {
    call.mockResolvedValue({ ok: false, status: 404, detail: "Unknown request." });
    await expect(compareCareer(req)).rejects.toThrow(/try again/i);
  });
});
