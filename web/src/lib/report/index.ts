// PDF report for a stay-vs-switch comparison.
//
//   const blob = await generateReportBlob({ request, result });
//
// `request` and `result` are the app's existing CareerRequest / CareerResponse.
export { buildReportModel } from "./model";
export { generateReportBlob, generateReportPdf, reportFileName } from "./pdf";
export type { ReportOptions } from "./pdf";
export type { ReportInput, ReportModel } from "./types";
