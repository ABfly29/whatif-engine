import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWorker } from "./fakeWorker";
import {
  callEngine,
  EngineStartError,
  getEngineStatus,
  resetEngineClient,
  subscribeEngineStatus,
  restartEngine,
  warmEngine,
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

describe("engine status and warm-up", () => {
  it("starts idle, and warmEngine starts a single warm-up request", () => {
    expect(getEngineStatus()).toEqual({ phase: "idle" });
    warmEngine();
    warmEngine();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(last().posted).toHaveLength(1);
    expect(last().posted[0].kind).toBe("__warmup");
    expect(getEngineStatus()).toEqual({ phase: "loading", stage: "download", loaded: 0, total: 0 });
  });

  it("tracks progress and readiness and notifies subscribers", () => {
    const seen: string[] = [];
    subscribeEngineStatus(() => seen.push(getEngineStatus().phase));
    warmEngine();
    last().reply({ type: "progress", loaded: 100, total: 400 });
    expect(getEngineStatus()).toEqual({ phase: "loading", stage: "download", loaded: 100, total: 400 });
    last().reply({ type: "ready" });
    expect(getEngineStatus()).toEqual({ phase: "ready" });
    expect(seen).toContain("ready");
  });

  it("does not restart once ready", async () => {
    warmEngine();
    last().reply({ type: "ready" });
    warmEngine();
    expect(last().posted).toHaveLength(1);
  });

  it("marks an error, then allows warming again", () => {
    warmEngine();
    last().onerror?.();
    expect(getEngineStatus()).toEqual({ phase: "error" });
    warmEngine();
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("becomes ready when a real request completes", async () => {
    const promise = callEngine("compare", {});
    last().reply({ id: last().posted[0].id, out: '{"ok":true,"data":1}' });
    await promise;
    expect(getEngineStatus()).toEqual({ phase: "ready" });
  });

  it("moves to the starting stage after the download, keeping the byte counts", () => {
    warmEngine();
    last().reply({ type: "progress", loaded: 400, total: 400 });
    last().reply({ type: "stage", stage: "start" });
    expect(getEngineStatus()).toEqual({ phase: "loading", stage: "start", loaded: 400, total: 400 });
  });
});

describe("restarting a stalled engine", () => {
  it("replaces the worker and re-sends the request that was waiting", async () => {
    const promise = callEngine("compare", { a: 1 });
    const old = last();
    const sent = old.posted[0];
    restartEngine();
    expect(old.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(last().posted).toEqual([sent]); // same id and payload
    last().reply({ id: sent.id, out: '{"ok":true,"data":"after restart"}' });
    await expect(promise).resolves.toMatchObject({ data: "after restart" });
  });

  it("does not re-send requests that were aborted", () => {
    const controller = new AbortController();
    callEngine("compare", {}, controller.signal).catch(() => {});
    controller.abort();
    restartEngine();
    // Nothing was waiting, so only a fresh warm-up goes to the new worker.
    expect(last().posted.map((m) => m.kind)).toEqual(["__warmup"]);
  });

  it("starts a warm-up on a new worker when nothing was pending", () => {
    warmEngine();
    last().reply({ id: last().posted[0].id, out: '{"ok":true,"data":null}' });
    restartEngine();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(last().posted[0].kind).toBe("__warmup");
    expect(getEngineStatus()).toMatchObject({ phase: "loading" });
  });
});
