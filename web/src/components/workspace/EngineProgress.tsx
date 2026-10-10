import { useId } from "react";
import type { EngineStatus } from "../../lib/engineClient";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/** Progress while the in-browser calculation engine downloads (first visit). */
export function EngineProgress({
  status,
}: {
  status: Extract<EngineStatus, { phase: "loading" }>;
}) {
  const labelId = useId();
  const known = status.total > 0;
  const percent = known ? Math.min(100, Math.round((status.loaded / status.total) * 100)) : 0;

  return (
    <div className="engine-progress" role="status" aria-live="polite">
      <p id={labelId} className="engine-progress__title">
        Loading the calculation engine…
      </p>
      <progress
        aria-labelledby={labelId}
        value={known ? percent : undefined}
        max={100}
      />
      <p className="muted small">
        {known
          ? `${percent}% · ${mb(status.loaded)} of ${mb(status.total)} MB. `
          : "Starting up. "}
        This is a one-time download; your browser keeps it for next time, and
        your numbers never leave your device.
      </p>
    </div>
  );
}
