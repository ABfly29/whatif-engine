/// <reference lib="webworker" />
// Builds the PDF off the main thread, so the page (and the overlay animation)
// stays responsive. A fresh worker is used for every attempt, which also means
// a retry starts with a clean module cache: browsers remember a failed
// dynamic import() for the life of the page, but not a failed worker.
import type { ExpenseReportInput } from "./expenseModel";
import { generateExpenseReportBlob } from "./expensePdf";
import { generateReportBlob } from "./pdf";
import type { ReportInput } from "./types";

// The career report keeps its original message; the expense report has its own.
export type ReportWorkerRequest = { input: ReportInput } | { expense: ExpenseReportInput };
export type ReportWorkerResponse =
  | { blob: Blob }
  | { error: { name: string; message: string } };

self.onmessage = async (event: MessageEvent<ReportWorkerRequest>) => {
  try {
    const data = event.data;
    const blob =
      "expense" in data
        ? await generateExpenseReportBlob(data.expense)
        : await generateReportBlob(data.input);
    self.postMessage({ blob } satisfies ReportWorkerResponse);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    self.postMessage({ error: { name: e.name, message: e.message } } satisfies ReportWorkerResponse);
  }
};
