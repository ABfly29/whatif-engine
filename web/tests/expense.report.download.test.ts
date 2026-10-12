import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeReportError, downloadExpenseReport } from "../src/lib/report/download";
import {
  generateExpenseInWorker,
  generateInWorker,
  ReportToolsError,
  resetReportWorker,
} from "../src/lib/report/workerClient";
import { loadExpenseFixture } from "./expense.report.helpers";
import { FIXED_DATE, loadFixture } from "./report.helpers";

const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

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

const input = { ...loadExpenseFixture("expense"), generatedAt: FIXED_DATE };
const last = () => FakeReportWorker.instances.at(-1)!;

let created: Blob[] = [];
let clicks: { download: string; href: string; inDom: boolean }[] = [];
const revoke = vi.fn();

beforeEach(() => {
  created = [];
  clicks = [];
  FakeReportWorker.instances = [];
  revoke.mockClear();
  URL.createObjectURL = ((blob: Blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href, inDom: this.isConnected });
  });
});
afterEach(() => {
  resetReportWorker();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadExpenseReport on the main thread (no Worker available)", () => {
  beforeEach(() => {
    // Generation must be fully local: any network call would fail the test.
    vi.stubGlobal("fetch", () => {
      throw new Error("network request attempted");
    });
  });

  it("builds the real PDF and downloads it automatically under a dated, distinct name", async () => {
    const filename = await downloadExpenseReport(input);
    expect(filename).toBe("whatif-expense-report-2026-10-11.pdf");
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("application/pdf");
    expect(created[0].size).toBeGreaterThan(20_000);
    expect(await readText(created[0].slice(0, 5))).toBe("%PDF-");
    expect(clicks).toEqual([{ download: filename, href: "blob:test/1", inDom: true }]);
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("frees the temporary file after the browser has taken it", async () => {
    vi.useFakeTimers();
    await downloadExpenseReport(input);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
  });

  it("downloads nothing when generation fails", async () => {
    await expect(downloadExpenseReport({ request: undefined, result: undefined } as never)).rejects.toBeInstanceOf(Error);
    expect(clicks).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("works for every scenario fixture", async () => {
    for (const name of ["expense-cash", "expense-strain"] as const) {
      await downloadExpenseReport({ ...loadExpenseFixture(name), generatedAt: FIXED_DATE });
    }
    expect(clicks).toHaveLength(2);
  });
});

describe("downloadExpenseReport with a worker", () => {
  beforeEach(() => vi.stubGlobal("Worker", FakeReportWorker));

  it("sends the calculated request and result to the worker and saves what it returns", async () => {
    const done = downloadExpenseReport(input);
    expect(last().posted).toEqual([{ expense: input }]);
    expect(last().options).toEqual({ type: "module" });
    last().reply({ blob: new Blob(["%PDF-"], { type: "application/pdf" }) });
    await expect(done).resolves.toBe("whatif-expense-report-2026-10-11.pdf");
    expect(clicks).toEqual([
      { download: "whatif-expense-report-2026-10-11.pdf", href: "blob:test/1", inDom: true },
    ]);
    expect(last().terminated).toBe(true);
  });

  it("does not download when the worker cannot load, and reports a loading problem", async () => {
    const done = downloadExpenseReport(input);
    last().fail();
    const error = await done.catch((e) => e);
    expect(error).toBeInstanceOf(ReportToolsError);
    expect(describeReportError(error)).toMatch(/Check your connection/);
    expect(clicks).toHaveLength(0);
  });

  it("reports a failure inside the worker without technical detail", async () => {
    const done = downloadExpenseReport(input);
    last().reply({ error: { name: "RangeError", message: "bad table" } });
    const error = await done.catch((e) => e);
    expect(error).toMatchObject({ name: "RangeError", message: "bad table" });
    expect(describeReportError(error)).toMatch(/Something went wrong/);
    expect(describeReportError(error)).not.toMatch(/bad table/);
    expect(clicks).toHaveLength(0);
  });

  it("retries with a fresh worker, so a failed load can really be tried again", async () => {
    const first = downloadExpenseReport(input);
    last().fail();
    await first.catch(() => {});
    const second = downloadExpenseReport(input);
    expect(FakeReportWorker.instances).toHaveLength(2);
    expect(FakeReportWorker.instances[0]).not.toBe(FakeReportWorker.instances[1]);
    last().reply({ blob: new Blob(["x"]) });
    await expect(second).resolves.toBe("whatif-expense-report-2026-10-11.pdf");
    expect(clicks).toHaveLength(1);
  });
});

describe("the two reports share one worker mechanism without mixing up their messages", () => {
  beforeEach(() => vi.stubGlobal("Worker", FakeReportWorker));

  it("the career report still posts its original message shape", async () => {
    const career = { ...loadFixture("sample"), generatedAt: FIXED_DATE };
    void generateInWorker(career).catch(() => {});
    expect(last().posted).toEqual([{ input: career }]);
  });

  it("the expense report posts its own message shape", async () => {
    void generateExpenseInWorker(input).catch(() => {});
    expect(last().posted).toEqual([{ expense: input }]);
  });

  it("each job gets its own worker and the used worker is discarded", async () => {
    const a = generateExpenseInWorker(input);
    const workerA = last();
    workerA.reply({ blob: new Blob(["a"]) });
    await a;
    expect(workerA.terminated).toBe(true);
    void generateInWorker({ ...loadFixture("sample") }).catch(() => {});
    expect(FakeReportWorker.instances).toHaveLength(2);
    expect(last()).not.toBe(workerA);
  });
});
