// Error paths of the browser transport, driven through the real engine client
// with a fake worker (no module mocking).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, compareCareer } from "../src/lib/api";
import { resetEngineClient } from "../src/lib/engineClient";
import { SAMPLE, toRequest } from "../src/lib/form";
import { FakeWorker } from "./fakeWorker";

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  resetEngineClient();
  vi.unstubAllGlobals();
});

describe("browser transport errors", () => {
  it("explains when the engine cannot start", async () => {
    const promise = compareCareer(toRequest(SAMPLE));
    FakeWorker.last().reply({ id: FakeWorker.last().posted[0].id, fatal: "Error: offline" });
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/could not start the calculation engine/i);
  });

  it("lets aborts through untouched", async () => {
    const controller = new AbortController();
    const promise = compareCareer(toRequest(SAMPLE), controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns engine data through the real client", async () => {
    const promise = compareCareer(toRequest(SAMPLE));
    const worker = FakeWorker.last();
    expect(JSON.parse(worker.posted[0].payload).current_job.annual_take_home).toBe("1200000");
    worker.reply({ id: worker.posted[0].id, out: '{"ok":true,"data":{"months":[]}}' });
    await expect(promise).resolves.toEqual({ months: [] });
  });
});
