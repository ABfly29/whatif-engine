import { useEffect, useState } from "react";

export type QueryState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "success"; data: T }
  | { status: "error"; message: string; previous?: T };

const IDLE = { status: "idle" } as const;

/**
 * Runs `fetcher` whenever `key` changes (after `delayMs`), cancelling stale
 * requests. A null key means "inputs not ready": nothing is requested.
 * The previous result stays available while a new one loads so the UI
 * does not flash empty on every keystroke.
 */
export function useApiQuery<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  delayMs = 350,
  enabled = true,
): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ status: "idle" });

  useEffect(() => {
    if (key === null || !enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({
        status: "loading",
        previous: s.status === "success" ? s.data : "previous" in s ? s.previous : undefined,
      }));
      fetcher(controller.signal)
        .then((data) => setState({ status: "success", data }))
        .catch((error: Error) => {
          if (error.name === "AbortError") return;
          setState((s) => ({
            status: "error",
            message: error.message,
            previous: s.status === "loading" ? s.previous : undefined,
          }));
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` encodes every input the fetcher depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, delayMs]);

  return key === null || !enabled ? IDLE : state;
}
