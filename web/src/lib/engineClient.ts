import { WARMUP, type WorkerRequest, type WorkerResponse } from "./engine.worker";

/** Envelope returned by whatif_engine.api.service.handle(). */
export type Envelope =
  | { ok: true; data: unknown }
  | { ok: false; status: number; detail: unknown };

export class EngineStartError extends Error {}

/** What the UI can show about the in-browser engine. */
export type EngineStatus =
  | { phase: "idle" }
  | { phase: "loading"; stage: "download" | "start"; loaded: number; total: number }
  | { phase: "ready" }
  | { phase: "error" };

interface Pending {
  resolve: (e: Envelope) => void;
  reject: (e: Error) => void;
}

const IDLE: EngineStatus = { phase: "idle" };

let worker: Worker | null = null;
let nextId = 1;
let status: EngineStatus = IDLE;
const pending = new Map<number, Pending>();
// Kept so a restart can re-send whatever is still waiting.
const requests = new Map<number, WorkerRequest>();
const listeners = new Set<() => void>();

function setStatus(next: EngineStatus) {
  status = next;
  listeners.forEach((l) => l());
}

// Shaped for React's useSyncExternalStore.
export const getEngineStatus = () => status;
export const subscribeEngineStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function failAll(error: Error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  requests.clear();
  worker?.terminate();
  worker = null;
  setStatus({ phase: "error" });
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), {
    type: "module",
  });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if ("type" in msg) {
      if (msg.type === "progress") {
        setStatus({ phase: "loading", stage: "download", loaded: msg.loaded, total: msg.total });
      } else if (msg.type === "stage") {
        const prev = status.phase === "loading" ? status : { loaded: 0, total: 0 };
        setStatus({ phase: "loading", stage: "start", loaded: prev.loaded, total: prev.total });
      } else {
        setStatus({ phase: "ready" });
      }
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return; // request was aborted
    pending.delete(msg.id);
    requests.delete(msg.id);
    if ("fatal" in msg) {
      setStatus({ phase: "error" });
      p.reject(new EngineStartError(msg.fatal));
    } else {
      if (status.phase !== "ready") setStatus({ phase: "ready" });
      p.resolve(JSON.parse(msg.out) as Envelope);
    }
  };
  w.onerror = () => failAll(new EngineStartError("The calculation worker failed."));
  worker = w;
  setStatus({ phase: "loading", stage: "download", loaded: 0, total: 0 });
  return w;
}

const abortError = () => new DOMException("Aborted", "AbortError");

/** Run one request in the Python engine. Rejects with AbortError if aborted. */
export function callEngine(
  kind: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<Envelope> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<Envelope>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    signal?.addEventListener(
      "abort",
      () => {
        requests.delete(id);
        if (pending.delete(id)) reject(abortError());
      },
      { once: true },
    );
    const request: WorkerRequest = { id, kind, payload: JSON.stringify(payload) };
    requests.set(id, request);
    getWorker().postMessage(request);
  });
}

/**
 * Start loading the engine in the background, e.g. when someone is about to
 * open the calculator. Safe to call repeatedly; does nothing once started.
 */
export function warmEngine(): void {
  if (status.phase !== "idle" && status.phase !== "error") return;
  callEngine(WARMUP, null).catch(() => {
    /* a real request will surface the error */
  });
}

/**
 * Start the engine over again, e.g. after a stalled download. Anything still
 * waiting is re-sent to the new worker, so callers just keep waiting.
 */
export function restartEngine(): void {
  const inflight = [...requests.values()];
  worker?.terminate();
  worker = null;
  setStatus(IDLE);
  if (inflight.length === 0) {
    warmEngine();
    return;
  }
  const w = getWorker();
  for (const request of inflight) w.postMessage(request);
}

/** Test hook: forget the worker and any in-flight requests. */
export function resetEngineClient() {
  failAll(new EngineStartError("reset"));
  nextId = 1;
  status = IDLE;
  listeners.clear();
}
