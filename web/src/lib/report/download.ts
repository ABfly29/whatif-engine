import type { ExpenseReportInput } from "./expenseModel";
import { expenseReportFileName, reportFileName } from "./filename";
import type { ReportInput } from "./types";
import {
  generateExpenseInWorker,
  generateInWorker,
  ReportToolsError,
  warmReportWorker,
  workersAvailable,
} from "./workerClient";

/**
 * Browser-only "generate and download". The PDF libraries are loaded on demand
 * from this site (same-origin static files) and everything happens on the
 * visitor's device: no server, no external service.
 */

/** Hand a finished file to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has taken a reference by now; free the memory a little later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Build the PDF in a worker when the browser has one (so the page stays
 * responsive and every retry starts clean), otherwise on the main thread.
 */
async function generateBlob(input: ReportInput): Promise<Blob> {
  if (workersAvailable()) return generateInWorker(input);
  const { generateReportBlob } = await import("./pdf");
  return generateReportBlob(input);
}

/** Generate the report and download it as soon as it is ready. Returns the file name. */
export async function downloadReport(input: ReportInput): Promise<string> {
  const blob = await generateBlob(input);
  const filename = reportFileName(input);
  saveBlob(blob, filename);
  return filename;
}

/** Generate the major expense report and download it as soon as it is ready. Returns the file name. */
export async function downloadExpenseReport(input: ExpenseReportInput): Promise<string> {
  let blob: Blob;
  if (workersAvailable()) {
    blob = await generateExpenseInWorker(input);
  } else {
    const { generateExpenseReportBlob } = await import("./expensePdf");
    blob = await generateExpenseReportBlob(input);
  }
  const filename = expenseReportFileName(input);
  saveBlob(blob, filename);
  return filename;
}

/** Start loading the PDF code early (hover, focus, touch) so a click has less to wait for. */
export function warmReport(): void {
  if (workersAvailable()) {
    warmReportWorker();
    return;
  }
  import("./pdf")
    .then((m) => m.preloadReportAssets())
    .catch(() => {
      /* a real attempt will report the problem */
    });
}

/** A message a visitor can act on, without technical detail. */
export function describeReportError(error: unknown): string {
  if (error instanceof ReportToolsError) {
    return "The report tools couldn't be loaded. Check your connection and try again.";
  }
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/dynamically imported module|importing a module script|failed to fetch|chunk|networkerror|load failed/i.test(text)) {
    return "The report tools couldn't be loaded. Check your connection and try again.";
  }
  return "Something went wrong while building the report. Your results are unaffected. Please try again.";
}
