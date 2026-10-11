import type { CareerRequest, CareerResponse } from "../types";

/**
 * Everything the report needs, using the app's existing data structures:
 * the request that was sent to the engine and the engine's response.
 * Nothing in the report is invented; every figure comes from these two.
 */
export interface ReportInput {
  request: CareerRequest;
  result: CareerResponse;
  /** Defaults to now. Injectable so output is reproducible in tests. */
  generatedAt?: Date;
  /** Optional display names; default to "Stay" and "Switch". */
  scenarioNames?: { stay?: string; switch?: string };
}

export type Row2 = [label: string, stay: string, switchValue: string];

export interface ReportModel {
  brand: string;
  generatedOn: string; // e.g. "11 October 2026"
  generatedIso: string; // e.g. "2026-10-11"
  scenarios: { stay: string; switch: string };
  period: string; // e.g. "36 months (3 years)"

  headline: {
    stayEnding: string;
    switchEnding: string;
    difference: string; // signed, e.g. "+₹9,36,828" or "−₹1,000"
    differenceLabel: string;
    differenceNote: string;
  };
  /** Neutral sentences derived from the calculated results. */
  summary: string[];

  totals: { head: [string, string, string]; rows: Row2[] };
  yearly: { head: string[]; stay: string[][]; switch: string[][] };

  inputs: {
    head: [string, string, string];
    scenarioRows: Row2[];
    sharedRows: [label: string, value: string][];
  };

  methodology: string[];
  limitations: string[];
  disclaimer: string;
}
