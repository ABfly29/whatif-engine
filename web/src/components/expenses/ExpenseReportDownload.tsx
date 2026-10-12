import { useCallback } from "react";
import { downloadExpenseReport } from "../../lib/report/download";
import type { ExpenseRequest, ExpenseResponse } from "../../lib/types";
import { ReportCard } from "../workspace/ReportCard";

/**
 * "Download PDF Report" for the major expense simulator.
 * Render it only when `result` is the engine's answer to `request`: the report
 * is built from exactly these two, never from the current form.
 */
export function ExpenseReportDownload({
  request,
  result,
}: {
  request: ExpenseRequest;
  result: ExpenseResponse;
}) {
  const generate = useCallback(() => downloadExpenseReport({ request, result }), [request, result]);
  return <ReportCard generate={generate} />;
}
