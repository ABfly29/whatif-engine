import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeReportError, downloadReport } from "../src/lib/report/download";
import {
  generateInWorker,
  ReportToolsError,
  resetReportWorker,
  warmReportWorker,
} from "../src/lib/report/workerClient";
import { FIXED_DATE, loadFixture } from "./report.helpers";

class FakeReportWorker {
  static instances: FakeReportWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  listeners: Record<string, (() => void)[]> = {};
  posted: unknown[] = [];
  terminated = false;
  constructor(public url: URL, public options: WorkerOptions) {
    FakeReportWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail(message = "") {
    this.listeners.error?.forEach((fn) => fn());
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }
}

const input = { ...loadFixture("sample"), generatedAt: FIXED_DATE };
const last = () => FakeReportWorker.instances.at(-1)!;

beforeEach(() => {
  FakeReportWorker.instances = [];
  vi.stubGlobal("Worker", FakeReportWorker);
});
afterEach(() => {
  resetReportWorker();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generating in a worker", () => {
  it("sends the input, resolves with the PDF, and discards the worker", async () => {
    const promise = generateInWorker(input);
    expect(last().posted).toEqual([{ input }]);
    expect(last().options).toEqual({ type: "module" });
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    last().reply({ blob });
    await expect(promise).resolves.toBe(blob);
    expect(last().terminated).toBe(true);
  });

  it("rejects with the real error when generation fails inside the worker", async () => {
    const promise = generateInWorker(input);
    last().reply({ error: { name: "RangeError", message: "bad table" } });
    const error = await promise.catch((e) => e);
    expect(error).toMatchObject({ name: "RangeError", message: "bad table" });
    expect(last().terminated).toBe(true);
  });

  it("reports a worker that cannot load as a loading problem", async () => {
    const promise = generateInWorker(input);
    last().fail();
    const error = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(ReportToolsError);
    expect(last().terminated).toBe(true);
    expect(describeReportError(error)).toMatch(/couldn't be loaded. Check your connection/);
  });

  it("starts every attempt with a fresh worker, so a retry really retries", async () => {
    const first = generateInWorker(input);
    last().fail();
    await first.catch(() => {});
    const second = generateInWorker(input);
    expect(FakeReportWorker.instances).toHaveLength(2);
    expect(FakeReportWorker.instances[0]).not.toBe(FakeReportWorker.instances[1]);
    const blob = new Blob(["x"]);
    last().reply({ blob });
    await expect(second).resolves.toBe(blob);
  });
});

describe("warming up", () => {
  it("starts one worker early and uses it for the next job", async () => {
    warmReportWorker();
    warmReportWorker();
    expect(FakeReportWorker.instances).toHaveLength(1);
    const promise = generateInWorker(input);
    expect(FakeReportWorker.instances).toHaveLength(1); // reused, not a second one
    last().reply({ blob: new Blob(["x"]) });
    await promise;
    // The used worker is gone; the next job needs a new one.
    void generateInWorker(input).catch(() => {});
    expect(FakeReportWorker.instances).toHaveLength(2);
  });

  it("drops a pre-started worker that failed, and gives the job a clean one", () => {
    warmReportWorker();
    const broken = last();
    broken.fail();
    expect(broken.terminated).toBe(true);
    void generateInWorker(input).catch(() => {});
    expect(FakeReportWorker.instances).toHaveLength(2);
    expect(last()).not.toBe(broken);
  });

  it("does nothing where workers are unavailable", () => {
    vi.stubGlobal("Worker", undefined);
    expect(() => warmReportWorker()).not.toThrow();
  });
});

describe("downloadReport with a worker", () => {
  it("downloads the PDF the worker produced under the dated file name", async () => {
    const saved: { download: string; href: string }[] = [];
    URL.createObjectURL = vi.fn(() => "blob:fake/1") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ download: this.download, href: this.href });
    });

    const done = downloadReport(input);
    last().reply({ blob: new Blob(["%PDF-"], { type: "application/pdf" }) });
    await expect(done).resolves.toBe("whatif-report-2026-10-11.pdf");
    expect(saved).toEqual([{ download: "whatif-report-2026-10-11.pdf", href: "blob:fake/1" }]);
  });

  it("does not download when the worker fails", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const done = downloadReport(input);
    last().fail();
    await expect(done).rejects.toBeInstanceOf(ReportToolsError);
    expect(click).not.toHaveBeenCalled();
  });
});
