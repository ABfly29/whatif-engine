import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDownload } from "../src/components/workspace/ReportDownload";
import { loadFixture } from "./report.helpers";

// A plain function (not vi.fn) so tests can reject on demand without mock bookkeeping.
let impl: (input: unknown) => Promise<string> = async () => "x.pdf";
let calls: unknown[] = [];
vi.mock("../src/lib/report/download", async (orig) => ({
  ...(await orig<typeof import("../src/lib/report/download")>()),
  downloadReport: (input: unknown) => {
    calls.push(input);
    return impl(input);
  },
  warmReport: () => {},
}));

const { request, result } = loadFixture("sample");

function deferred() {
  let resolve!: (name: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => {});
const button = () => screen.getByRole("button", { name: "Download PDF Report" });

beforeEach(() => {
  calls = [];
  impl = async () => "whatif-report-2026-10-11.pdf";
});
afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = "";
});

describe("Download PDF Report", () => {
  it("shows a visible button and no overlay at rest", () => {
    render(<ReportDownload request={request} result={result} />);
    expect(button()).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("passes the actual inputs and calculated results to the generator", async () => {
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    await flush();
    expect(calls).toHaveLength(1);
    const input = calls[0] as { request: unknown; result: unknown };
    expect(input.request).toBe(request);
    expect(input.result).toBe(result);
  });

  it("shows the branded overlay with the specified copy while generating", async () => {
    const d = deferred();
    impl = () => d.promise;
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Preparing your financial report");
    expect(dialog).toHaveAccessibleDescription(
      "Your scenarios are being formatted into a downloadable report.",
    );
    expect(dialog).toHaveTextContent("WhatIf Engine");
    expect(dialog).toHaveTextContent("Make informed decisions. Understand the trade-offs.");
    expect(button()).toBeDisabled();
    d.resolve("x.pdf");
    await flush();
  });

  it("shows an indeterminate progress indicator and never invents a percentage", async () => {
    const d = deferred();
    impl = () => d.promise;
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const bar = await screen.findByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("%");
    d.resolve("x.pdf");
    await flush();
  });

  it("takes focus and locks page scroll while open, then restores both", async () => {
    const d = deferred();
    impl = () => d.promise;
    document.body.style.overflow = "auto";
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    d.resolve("x.pdf");
    await flush();
    expect(document.body.style.overflow).toBe("auto");
    expect(button()).toHaveFocus();
  });

  it("closes the moment generation finishes, with no artificial delay", async () => {
    vi.useFakeTimers(); // nothing is allowed to wait on a timer
    const d = deferred();
    impl = () => d.promise;
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    await flush();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    d.resolve("whatif-report-2026-10-11.pdf");
    await flush(); // microtasks only; no timers advanced
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded whatif-report-2026-10-11.pdf.");
  });

  it("does not let Escape or Tab leave the overlay while it is working", async () => {
    const d = deferred();
    impl = () => d.promise;
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const tab = fireEvent.keyDown(dialog, { key: "Tab" });
    expect(tab).toBe(false); // default prevented: focus stays put
    d.resolve("x.pdf");
    await flush();
  });
});

describe("when generation fails", () => {
  it("explains the problem and offers Try again and Close", async () => {
    impl = async () => {
      throw new TypeError("boom");
    };
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const dialog = await screen.findByRole("dialog", { name: /couldn’t create your report/i });
    expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong while building the report/);
    expect(screen.getByRole("alert")).toHaveTextContent(/results are unaffected/i);
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("gives a connection-specific message when the report tools cannot load", async () => {
    impl = async () => {
      throw new TypeError("Failed to fetch dynamically imported module: https://x/assets/pdf.js");
    };
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded. Check your connection/);
  });

  it("retries, shows the working state again, and closes on success", async () => {
    let attempts = 0;
    const second = deferred();
    impl = () => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error("first try fails"));
      return second.promise;
    };
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("dialog", { name: "Preparing your financial report" })).toBeInTheDocument();
    expect(attempts).toBe(2);

    second.resolve("whatif-report-2026-10-11.pdf");
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded");
  });

  it("closes on Close or Escape and returns focus to the button", async () => {
    impl = () => Promise.reject(new Error("nope"));
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button()).toHaveFocus();

    fireEvent.click(button());
    await screen.findByRole("alert");
    fireEvent.keyDown(window, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the dialog on the error screen", async () => {
    impl = () => Promise.reject(new Error("nope"));
    render(<ReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const retry = await screen.findByRole("button", { name: "Try again" });
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(retry).toHaveFocus();
    fireEvent.keyDown(retry, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
  });
});
