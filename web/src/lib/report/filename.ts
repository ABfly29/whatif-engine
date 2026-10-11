import { dateParts } from "./model";
import type { ReportInput } from "./types";

/** e.g. whatif-report-2026-10-11.pdf. Kept apart from the renderer so the page can use it without loading any PDF code. */
export function reportFileName(input: Pick<ReportInput, "generatedAt"> = {}): string {
  return `whatif-report-${dateParts(input.generatedAt ?? new Date()).iso}.pdf`;
}
