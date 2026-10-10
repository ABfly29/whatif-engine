import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, compareCareer } from "../src/lib/api";
import { SAMPLE, toRequest } from "../src/lib/form";

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

// These cover the HTTP transport (VITE_ENGINE=http); the browser transport is
// covered in browserTransport.test.ts.
beforeEach(() => vi.stubEnv("VITE_ENGINE", "http"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api client", () => {
  it("posts JSON to the compare endpoint", async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await compareCareer(toRequest(SAMPLE));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/career/compare");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).current_job.annual_take_home).toBe("1200000");
  });

  it("surfaces engine validation messages", async () => {
    vi.stubGlobal("fetch", respond(422, { detail: "Costs and bonuses cannot be negative." }));
    await expect(compareCareer(toRequest(SAMPLE))).rejects.toThrow(
      "Costs and bonuses cannot be negative.",
    );
  });

  it("formats schema validation lists", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, {
        detail: [{ loc: ["body", "relocation_cost"], msg: "Input should be a valid decimal" }],
      }),
    );
    await expect(compareCareer(toRequest(SAMPLE))).rejects.toThrow(/relocation_cost/);
  });

  it("gives a friendly message when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await compareCareer(toRequest(SAMPLE)).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/calculation service/i);
  });

  it("hides server error internals", async () => {
    vi.stubGlobal("fetch", respond(500, { detail: "Traceback ..." }));
    await expect(compareCareer(toRequest(SAMPLE))).rejects.toThrow(/try again/i);
  });
});
