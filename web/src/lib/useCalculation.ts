import { useCallback, useEffect, useRef, useState } from "react";

/** A finished calculation together with the exact request that produced it. */
export interface Calculated<Req, Res> {
  request: Req;
  /** JSON of `request`, for comparing with what the form says now. */
  key: string;
  data: Res;
}

export interface Calculation<Req, Res> {
  /** True while a calculation is running. */
  busy: boolean;
  /** Message from the last attempt, if it failed. The previous result is kept. */
  error: string | null;
  /** The last successful result; stays available while the inputs are edited. */
  latest: Calculated<Req, Res> | null;
  /** Start a calculation. Ignored while one is already running. */
  submit: (request: Req) => void;
}

/**
 * Runs a calculation only when `submit` is called, never because inputs changed.
 * Keeping the request next to its result lets the page tell whether the result
 * on screen still matches the form.
 */
export function useCalculation<Req, Res>(
  run: (request: Req, signal: AbortSignal) => Promise<Res>,
): Calculation<Req, Res> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Calculated<Req, Res> | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const runRef = useRef(run);
  // Keep the newest `run` without changing `submit`'s identity.
  useEffect(() => {
    runRef.current = run;
  });

  const submit = useCallback((request: Req) => {
    // A ref, not state: this must stop a second click in the same tick, before React re-renders.
    if (inflight.current) return;
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    setError(null);
    runRef
      .current(request, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setLatest({ request, key: JSON.stringify(request), data });
      })
      .catch((e: Error) => {
        if (controller.signal.aborted || e.name === "AbortError") return;
        setError(e.message);
      })
      .finally(() => {
        if (inflight.current === controller) inflight.current = null;
        if (!controller.signal.aborted) setBusy(false);
      });
  }, []);

  // Leaving the page cancels whatever is still running.
  useEffect(
    () => () => {
      inflight.current?.abort();
    },
    [],
  );

  return { busy, error, latest, submit };
}
