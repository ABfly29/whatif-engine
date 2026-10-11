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
  | { id: number; fatal: string }
  | { type: "progress"; loaded: number; total: number }
  | { type: "stage"; stage: "start" }
  | { type: "ready" };

/** Request kind that only makes sure the engine is loaded. */
export const WARMUP = "__warmup";

let ready: Promise<Handle> | null = null;

const post = (message: WorkerResponse) => self.postMessage(message);

interface Manifest {
  // load "serve" (default): download, then hand the bytes to Pyodide.
  // load "import": Pyodide loads it with import(), which cannot be intercepted,
  // so we import() the same URL first and the browser reuses that module.
  files: { name: string; size: number; type: string; load?: "serve" | "import" }[];
}

/**
 * Download the large runtime files ourselves so we can report real progress,
 * then serve those exact bytes to Pyodide so nothing is downloaded twice.
 * If the manifest is missing, Pyodide simply downloads normally (no progress).
 */
async function prefetch(base: URL): Promise<void> {
  let manifest: Manifest;
  try {
    const res = await fetch(new URL("pyodide/manifest.json", base).href);
    if (!res.ok) return;
    manifest = (await res.json()) as Manifest;
  } catch {
    return;
  }

  const total = manifest.files.reduce((sum, f) => sum + f.size, 0);
  let loaded = 0;
  let lastPost = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (force || now - lastPost > 100) {
      lastPost = now;
      post({ type: "progress", loaded, total });
    }
  };
  report(true);

  const cache = new Map<string, { bytes: Blob; type: string }>();
  await Promise.all(
    manifest.files.map(async (file) => {
      const url = new URL(`pyodide/${file.name}`, base).href;
      if (file.load === "import") {
        await import(/* @vite-ignore */ url);
        loaded += file.size;
        report();
        return;
      }
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`${file.name}: HTTP ${res.status}`);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        loaded += value.length;
        report();
      }
      cache.set(url, { bytes: new Blob(chunks), type: file.type });
    }),
  );
  report(true);

  // Serve prefetched files to Pyodide; anything else goes to the network.
  const realFetch = self.fetch.bind(self);
  self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const hit = cache.get(url);
    return hit
      ? Promise.resolve(new Response(hit.bytes, { headers: { "Content-Type": hit.type } }))
      : realFetch(input, init);
  }) as typeof fetch;
}

async function start(): Promise<Handle> {
  const base = new URL(import.meta.env.BASE_URL, self.location.href);
  await prefetch(base);
  // Download is done; what remains is compiling the runtime and starting Python.
  post({ type: "stage", stage: "start" });

  const pyodide = await loadPyodide({ indexURL: new URL("pyodide/", base).href });
  await pyodide.loadPackage("pydantic");

  const zip = await fetch(new URL("engine/whatif_engine.zip", base).href);
  if (!zip.ok) throw new Error(`Engine bundle not found (HTTP ${zip.status}).`);
  pyodide.unpackArchive(await zip.arrayBuffer(), "zip", { extractDir: "/engine" });
  pyodide.runPython("import sys; sys.path.insert(0, '/engine')");

  const handle = pyodide.runPython(
    "from whatif_engine.api.service import handle\nhandle",
  ) as Handle;
  post({ type: "ready" });
  return handle;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, payload } = event.data;
  try {
    ready ??= start();
    const handle = await ready;
    const out = kind === WARMUP ? '{"ok":true,"data":null}' : handle(kind, payload);
    post({ id, out });
  } catch (error) {
    ready = null; // allow a retry after a failed start
    post({ id, fatal: String(error) });
  }
};
