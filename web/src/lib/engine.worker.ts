/// <reference lib="webworker" />
// Hosts the Python engine (via Pyodide) off the main thread so the page stays
// responsive. Everything is loaded from this site; no third-party CDN.
import { loadPyodide } from "pyodide";

type Handle = (kind: string, payload: string) => string;

export interface WorkerRequest {
  id: number;
  kind: string;
  payload: string;
}
export type WorkerResponse =
  | { id: number; out: string }
  | { id: number; fatal: string };

let ready: Promise<Handle> | null = null;

async function start(): Promise<Handle> {
  const base = new URL(import.meta.env.BASE_URL, self.location.href);
  const indexURL = new URL("pyodide/", base).href;

  const pyodide = await loadPyodide({ indexURL });
  await pyodide.loadPackage("pydantic");

  const zip = await fetch(new URL("engine/whatif_engine.zip", base).href);
  if (!zip.ok) throw new Error(`Engine bundle not found (HTTP ${zip.status}).`);
  pyodide.unpackArchive(await zip.arrayBuffer(), "zip", { extractDir: "/engine" });
  pyodide.runPython("import sys; sys.path.insert(0, '/engine')");

  return pyodide.runPython(
    "from whatif_engine.api.service import handle\nhandle",
  ) as Handle;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, payload } = event.data;
  try {
    ready ??= start();
    const handle = await ready;
    const response: WorkerResponse = { id, out: handle(kind, payload) };
    self.postMessage(response);
  } catch (error) {
    ready = null; // allow a retry after a failed start
    const response: WorkerResponse = { id, fatal: String(error) };
    self.postMessage(response);
  }
};
