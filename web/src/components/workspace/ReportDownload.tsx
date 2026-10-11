import { useCallback, useEffect, useRef, useState } from "react";
import { describeReportError, downloadReport, warmReport } from "../../lib/report/download";
import type { CareerRequest, CareerResponse } from "../../lib/types";
import { Button } from "../ui/Button";
import { ReportOverlay } from "./ReportOverlay";

type State =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "error"; message: string }
  | { phase: "done"; filename: string };

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
  const [state, setState] = useState<State>({ phase: "idle" });
  const button = useRef<HTMLButtonElement>(null);
  const attempt = useRef(0);

  const generate = useCallback(async () => {
    const mine = ++attempt.current;
    setState({ phase: "working" });
    try {
      const filename = await downloadReport({ request, result });
      if (mine === attempt.current) setState({ phase: "done", filename });
    } catch (error) {
      if (mine === attempt.current) setState({ phase: "error", message: describeReportError(error) });
    }
  }, [request, result]);

  const dismiss = useCallback(() => {
    attempt.current++;
    setState({ phase: "idle" });
  }, []);

  // Return focus to the button once the overlay has gone.
  const overlayOpen = state.phase === "working" || state.phase === "error";
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !overlayOpen) button.current?.focus();
    wasOpen.current = overlayOpen;
  }, [overlayOpen]);

  return (
    <section className="report-card" aria-labelledby="report-h">
      <div>
        <h3 id="report-h">Take this with you</h3>
        <p className="muted small">
          A PDF report built in your browser from the numbers above. Nothing is uploaded.
        </p>
      </div>
      <Button
        ref={button}
        onClick={generate}
        disabled={state.phase === "working"}
        onPointerEnter={warmReport}
        onFocus={warmReport}
        onTouchStart={warmReport}
      >
        Download PDF Report
      </Button>
      <p className="muted small report-card__status" role="status">
        {state.phase === "done" ? `Downloaded ${state.filename}.` : ""}
      </p>

      {overlayOpen && (
        <ReportOverlay
          state={state.phase === "error" ? "error" : "working"}
          message={state.phase === "error" ? state.message : undefined}
          onRetry={generate}
          onClose={dismiss}
        />
      )}
    </section>
  );
}
