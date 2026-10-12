import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseReportDownload } from "../src/components/expenses/ExpenseReportDownload";
import { loadExpenseFixture } from "./expense.report.helpers";

// Plain functions (not vi.fn) so tests can reject on demand without mock bookkeeping.
let impl: (input: unknown) => Promise<string> = async () => "x.pdf";
let calls: unknown[] = [];
let careerCalls = 0;
vi.mock("../src/lib/report/download", async (orig) => ({
  ...(await orig<typeof import("../src/lib/report/download")>()),
  downloadExpenseReport: (input: unknown) => {
    calls.push(input);
    return impl(input);
  },
  downloadReport: () => {
    careerCalls++;
    return Promise.resolve("career.pdf");
  },
  warmReport: () => {},
}));

const { request, result } = loadExpenseFixture("expense");

function deferred() {
  let resolve!: (name: string) => void;
  const promise = new Promise<string>((res) => (resolve = res));
  return { promise, resolve };
}
const flush = () => act(async () => {});
const button = () => screen.getByRole("button", { name: "Download PDF Report" });

beforeEach(() => {
  calls = [];
  careerCalls = 0;
  impl = async () => "whatif-expense-report-2026-10-11.pdf";
});
afterEach(() => {
  document.body.style.overflow = "";
});

describe("Download PDF Report (major expense)", () => {
  it("shows a visible button and no overlay at rest", () => {
    render(<ExpenseReportDownload request={request} result={result} />);
    expect(button()).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
  });

  it("builds the report from the calculated request and result, using the expense generator only", async () => {
    render(<ExpenseReportDownload request={request} result={result} />);
    fireEvent.click(button());
    await flush();
    expect(calls).toHaveLength(1);
    const input = calls[0] as { request: unknown; result: unknown };
    expect(input.request).toBe(request);
    expect(input.result).toBe(result);
    expect(careerCalls).toBe(0);
  });

  it("shows the branded overlay while working, then closes and confirms the file name", async () => {
    const d = deferred();
    impl = () => d.promise;
    render(<ExpenseReportDownload request={request} result={result} />);
    fireEvent.click(button());
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Preparing your financial report");
    expect(dialog).toHaveTextContent("WhatIf Engine");
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    expect(button()).toBeDisabled();

    d.resolve("whatif-expense-report-2026-10-11.pdf");
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded whatif-expense-report-2026-10-11.pdf.");
    expect(button()).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("explains a failure, retries with a second attempt, and then succeeds", async () => {
    let attempts = 0;
    const second = deferred();
    impl = () => {
      attempts++;
      return attempts === 1 ? Promise.reject(new TypeError("Failed to fetch dynamically imported module")) : second.promise;
    };
    render(<ExpenseReportDownload request={request} result={result} />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded. Check your connection/);
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("dialog", { name: "Preparing your financial report" })).toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect((calls[1] as { result: unknown }).result).toBe(result); // same calculated result on retry

    second.resolve("whatif-expense-report-2026-10-11.pdf");
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Downloaded");
  });

  it("can be closed after a failure, with focus back on the button and no download recorded", async () => {
    impl = () => Promise.reject(new Error("nope"));
    render(<ExpenseReportDownload request={request} result={result} />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button()).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
