import { useCallback, useEffect, useRef, useState } from "react";
import { describeReportError, warmReport } from "../../lib/report/download";
import { Button } from "../ui/Button";
import { ReportOverlay } from "./ReportOverlay";

type State =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "error"; message: string }
  | { phase: "done"; filename: string };

/**
 * The "Download PDF Report" card: button, overlay while working, retry on
 * failure, and a short confirmation. `generate` builds and saves the report and
 * resolves with the file name. Used by both the career and the expense report.
 */
export function ReportCard({ generate }: { generate: () => Promise<string> }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const button = useRef<HTMLButtonElement>(null);
  const attempt = useRef(0);

  const run = useCallback(async () => {
    const mine = ++attempt.current;
    setState({ phase: "working" });
    try {
      const filename = await generate();
      if (mine === attempt.current) setState({ phase: "done", filename });
    } catch (error) {
      if (mine === attempt.current) setState({ phase: "error", message: describeReportError(error) });
    }
  }, [generate]);

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
        onClick={run}
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
          onRetry={run}
          onClose={dismiss}
        />
      )}
    </section>
  );
}
