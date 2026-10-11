import { callEngine, EngineStartError, warmEngine } from "./engineClient";
import type {
  CareerRequest,
  CareerResponse,
  ExpenseRequest,
  ExpenseResponse,
  SensitivityResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const BASE = "/api/v1";

/**
 * Two interchangeable transports, same request/response shapes:
 *  - "browser" (default): the Python engine runs in a web worker via Pyodide.
 *    This is what the static GitHub Pages build uses.
 *  - "http": POST to the FastAPI server. Enable with VITE_ENGINE=http.
 */
export const usesBrowserEngine = () => import.meta.env.VITE_ENGINE !== "http";

/** Begin loading the browser engine early. A no-op in HTTP mode. */
export const warmCalculator = () => {
  if (usesBrowserEngine()) warmEngine();
};

/** FastAPI returns `detail` as a string (engine) or a list (schema validation). */
function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = (d.loc ?? []).filter((p) => p !== "body").join(" → ");
        return field ? `${field}: ${d.msg}` : (d.msg ?? "Invalid input");
      })
      .join("; ");
  }
  return "The request was not valid.";
}

const SERVER_PROBLEM = "The calculation service had a problem. Please try again.";

async function postBrowser<T>(kind: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let envelope;
  try {
    envelope = await callEngine(kind, body, signal);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    if (error instanceof EngineStartError) {
      throw new ApiError(
        "Could not start the calculation engine. Check your connection and reload the page.",
        0,
      );
    }
    throw error;
  }
  if (!envelope.ok) {
    throw new ApiError(
      envelope.status === 422 ? describe(envelope.detail) : SERVER_PROBLEM,
      envelope.status,
    );
  }
  return envelope.data as T;
}

async function postHttp<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      "Could not reach the calculation service. Check that the API is running.",
      0,
    );
  }
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = (await response.json()).detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      response.status === 422 ? describe(detail) : SERVER_PROBLEM,
      response.status,
    );
  }
  return (await response.json()) as T;
}

const post = <T>(
  kind: "compare" | "sensitivity" | "expense",
  body: unknown,
  signal?: AbortSignal,
) =>
  usesBrowserEngine()
    ? postBrowser<T>(kind, body, signal)
    : postHttp<T>(
        kind === "expense" ? "/expenses/simulate" : `/career/${kind}`,
        body,
        signal,
      );

export const compareCareer = (req: CareerRequest, signal?: AbortSignal) =>
  post<CareerResponse>("compare", req, signal);

export const careerSensitivity = (req: CareerRequest, signal?: AbortSignal) =>
  post<SensitivityResponse>("sensitivity", req, signal);

export const simulateExpense = (req: ExpenseRequest, signal?: AbortSignal) =>
  post<ExpenseResponse>("expense", req, signal);
