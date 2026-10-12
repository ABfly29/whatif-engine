import { useCallback } from "react";
import { downloadReport } from "../../lib/report/download";
import type { CareerRequest, CareerResponse } from "../../lib/types";
import { ReportCard } from "./ReportCard";

/**
 * "Download PDF Report": builds the report from the inputs and results shown
 * on screen, in the browser, and saves it as soon as it is ready.
 * Render it only when `result` is the engine's answer to `request`.
 */
export function ReportDownload({
  request,
  result,
}: {
  request: CareerRequest;
  result: CareerResponse;
}) {
  const generate = useCallback(() => downloadReport({ request, result }), [request, result]);
  return <ReportCard generate={generate} />;
}
