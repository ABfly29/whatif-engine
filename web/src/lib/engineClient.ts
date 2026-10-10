import type { WorkerRequest, WorkerResponse } from "./engine.worker";

/** Envelope returned by whatif_engine.api.service.handle(). */
export type Envelope =
  | { ok: true; data: unknown }
  | { ok: false; status: number; detail: unknown };

export class EngineStartError extends Error {}

interface Pending {
  resolve: (e: Envelope) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(error: Error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), {
    type: "module",
  });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return; // request was aborted
    pending.delete(msg.id);
    if ("fatal" in msg) p.reject(new EngineStartError(msg.fatal));
    else p.resolve(JSON.parse(msg.out) as Envelope);
  };
  w.onerror = () => failAll(new EngineStartError("The calculation worker failed."));
  worker = w;
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
        if (pending.delete(id)) reject(abortError());
      },
      { once: true },
    );
    const request: WorkerRequest = { id, kind, payload: JSON.stringify(payload) };
    getWorker().postMessage(request);
  });
}

/** Test hook: forget the worker and any in-flight requests. */
export function resetEngineClient() {
  failAll(new EngineStartError("reset"));
  nextId = 1;
}
