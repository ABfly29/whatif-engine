// Real PDF generation plus the automatic browser download, with no mocks of our own code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeReportError, downloadReport, saveBlob } from "../src/lib/report/download";
import { FIXED_DATE, loadFixture } from "./report.helpers";

/** Read a jsdom Blob (Node's Response does not understand it). */
const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

let created: Blob[] = [];
let clicks: { download: string; href: string; inDom: boolean }[] = [];
const revoke = vi.fn();

beforeEach(() => {
  created = [];
  clicks = [];
  revoke.mockClear();
  URL.createObjectURL = ((blob: Blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href, inDom: this.isConnected });
  });
  // Generation must be fully local: any network call would fail this test.
  vi.stubGlobal("fetch", () => {
    throw new Error("network request attempted");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadReport (real generator)", () => {
  it("builds the PDF from the real results and downloads it automatically", async () => {
    const filename = await downloadReport({ ...loadFixture("sample"), generatedAt: FIXED_DATE });

    expect(filename).toBe("whatif-report-2026-10-11.pdf");
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("application/pdf");
    expect(created[0].size).toBeGreaterThan(20_000);
    expect(await readText(created[0].slice(0, 5))).toBe("%PDF-");

    expect(clicks).toEqual([{ download: filename, href: "blob:test/1", inDom: true }]);
    expect(document.querySelector("a[download]")).toBeNull(); // cleaned up
  });

  it("frees the temporary file after the browser has taken it", async () => {
    vi.useFakeTimers();
    await downloadReport({ ...loadFixture("sample"), generatedAt: FIXED_DATE });
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
  });

  it("does not download anything when generation fails", async () => {
    const broken = { request: undefined, result: undefined } as never;
    await expect(downloadReport(broken)).rejects.toBeInstanceOf(Error);
    expect(clicks).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("works for the longest projection too", async () => {
    await downloadReport({ ...loadFixture("long"), generatedAt: FIXED_DATE });
    expect(clicks).toHaveLength(1);
  });
});

describe("saveBlob", () => {
  it("downloads under the given file name", () => {
    saveBlob(new Blob(["x"], { type: "application/pdf" }), "a.pdf");
    expect(clicks[0].download).toBe("a.pdf");
  });
});

describe("describeReportError", () => {
  it.each([
    "Failed to fetch dynamically imported module",
    "Importing a module script failed.",
    "Loading chunk 12 failed",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
  ])("treats %j as a loading problem", (message) => {
    expect(describeReportError(new TypeError(message))).toMatch(/Check your connection/);
  });
  it("uses a general message otherwise, without technical detail", () => {
    const text = describeReportError(new RangeError("Invalid array length"));
    expect(text).toMatch(/Something went wrong/);
    expect(text).not.toMatch(/Invalid array length/);
    expect(describeReportError("string error")).toMatch(/Something went wrong/);
  });
});
