import type { ReportWorkerRequest, ReportWorkerResponse } from "./report.worker";
import type { ExpenseReportInput } from "./expenseModel";
import type { ReportInput } from "./types";

/** The PDF code could not be loaded (offline, blocked, server error). A retry can fix this. */
export class ReportToolsError extends Error {}

const spawn = () =>
  new Worker(new URL("./report.worker.ts", import.meta.url), { type: "module" });

// A worker started early (hover/focus) so its code is already loading by the click.
let warm: Worker | null = null;

export const workersAvailable = () => typeof Worker !== "undefined";

/** Begin loading the PDF code in the background. Safe to call repeatedly. */
export function warmReportWorker(): void {
  if (!workersAvailable() || warm) return;
  warm = spawn();
  // If it fails to start, forget it so the real attempt gets a clean one.
  warm.addEventListener("error", () => {
    warm?.terminate();
    warm = null;
  });
}

/**
 * Run one report job in a worker. Every attempt gets its own worker, which is
 * discarded afterwards, so "Try again" always starts from scratch.
 */
function runInWorker(message: ReportWorkerRequest): Promise<Blob> {
  const worker = warm ?? spawn();
  warm = null;

  return new Promise<Blob>((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<ReportWorkerResponse>) => {
      finish();
      const data = event.data;
      if ("blob" in data) resolve(data.blob);
      else reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
    };
    // A worker-level error with no message means its script or imports failed to load.
    worker.onerror = (event) => {
      finish();
      event.preventDefault?.();
      reject(new ReportToolsError(event.message || "The report worker failed to load."));
    };
    worker.postMessage(message);
  });
}

/** The career report. */
export const generateInWorker = (input: ReportInput): Promise<Blob> => runInWorker({ input });

/** The major expense report. */
export const generateExpenseInWorker = (input: ExpenseReportInput): Promise<Blob> =>
  runInWorker({ expense: input });

/** Test hook: drop any pre-started worker. */
export function resetReportWorker(): void {
  warm?.terminate();
  warm = null;
}
