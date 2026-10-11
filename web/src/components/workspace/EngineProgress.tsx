import { useEffect, useId, useState } from "react";
import { restartEngine, type EngineStatus } from "../../lib/engineClient";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);
const SLOW_AFTER_MS = 25_000;

/** Shown after a stage drags on, with a way to start over. Reset by `key`. */
function SlowHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!slow) return null;
  return (
    <p className="engine-progress__slow small">
      This is taking longer than usual. It depends on your connection.{" "}
      <button type="button" className="link-btn" onClick={restartEngine}>
        Try again
      </button>
    </p>
  );
}

/** Progress while the in-browser calculation engine loads (first visit). */
export function EngineProgress({
  status,
}: {
  status: Extract<EngineStatus, { phase: "loading" }>;
}) {
  const labelId = useId();
  const starting = status.stage === "start";
  const known = !starting && status.total > 0;
  const percent = known ? Math.min(100, Math.round((status.loaded / status.total) * 100)) : 0;

  return (
    <div className="engine-progress" role="status" aria-live="polite">
      <p id={labelId} className="engine-progress__title">
        {starting ? "Starting the calculation engine…" : "Downloading the calculation engine…"}
      </p>
      {/* No value = indeterminate: shown while starting, when no byte count exists. */}
      <progress aria-labelledby={labelId} value={known ? percent : undefined} max={100} />
      <p className="muted small">
        {starting
          ? "Download complete. Setting up now; this takes a few seconds the first time. "
          : known
            ? `${percent}% · ${mb(status.loaded)} of ${mb(status.total)} MB. `
            : "Starting up. "}
        This is a one-time download; your browser keeps it for next time, and
        your numbers never leave your device.
      </p>
      <SlowHint key={status.stage} />
    </div>
  );
}
