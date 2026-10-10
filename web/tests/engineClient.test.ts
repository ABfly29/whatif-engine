import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWorker } from "./fakeWorker";
import {
  callEngine,
  EngineStartError,
  resetEngineClient,
} from "../src/lib/engineClient";

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  resetEngineClient();
  vi.unstubAllGlobals();
});

const last = FakeWorker.last;

describe("engine client", () => {
  it("sends a JSON payload and resolves with the parsed envelope", async () => {
    const promise = callEngine("compare", { a: 1 });
    const sent = last().posted[0];
    expect(sent.kind).toBe("compare");
    expect(JSON.parse(sent.payload)).toEqual({ a: 1 });
    last().reply({ id: sent.id, out: '{"ok":true,"data":{"x":2}}' });
    await expect(promise).resolves.toEqual({ ok: true, data: { x: 2 } });
  });

  it("reuses a single worker and matches replies by id", async () => {
    const first = callEngine("compare", {});
    const second = callEngine("sensitivity", {});
    expect(FakeWorker.instances).toHaveLength(1);
    const [a, b] = last().posted;
    last().reply({ id: b.id, out: '{"ok":true,"data":"second"}' });
    last().reply({ id: a.id, out: '{"ok":true,"data":"first"}' });
    await expect(first).resolves.toMatchObject({ data: "first" });
    await expect(second).resolves.toMatchObject({ data: "second" });
  });

  it("rejects with AbortError when aborted and ignores the late reply", async () => {
    const controller = new AbortController();
    const promise = callEngine("compare", {}, controller.signal);
    const { id } = last().posted[0];
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(() => last().reply({ id, out: '{"ok":true,"data":1}' })).not.toThrow();
  });

  it("rejects immediately if already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(callEngine("compare", {}, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("surfaces a failed engine start", async () => {
    const promise = callEngine("compare", {});
    last().reply({ id: last().posted[0].id, fatal: "Error: boom" });
    await expect(promise).rejects.toBeInstanceOf(EngineStartError);
  });

  it("fails pending requests if the worker crashes, then recovers", async () => {
    const promise = callEngine("compare", {});
    const crashed = last();
    crashed.onerror?.();
    await expect(promise).rejects.toBeInstanceOf(EngineStartError);
    expect(crashed.terminated).toBe(true);
    void callEngine("compare", {}).catch(() => {});
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
