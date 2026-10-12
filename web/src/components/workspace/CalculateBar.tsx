import { Button } from "../ui/Button";

type ResultState = "none" | "current" | "stale";

/** The one Calculate button. Lives inside the inputs form, so Enter in any field submits it. */
export function CalculateBar({ busy, state }: { busy: boolean; state: ResultState }) {
  const hint =
    state === "none"
      ? "Nothing is calculated until you press Calculate."
      : state === "stale"
        ? "You changed the inputs. The result shown is out of date."
        : "The result shown matches these inputs.";
  return (
    <div className="calc-actions">
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Calculating…
          </>
        ) : (
          "Calculate"
        )}
      </Button>
      <p className="muted small" role="status">
        {hint}
      </p>
    </div>
  );
}

/** First visit: the form is ready, nothing has been calculated. */
export function CalculatePrompt() {
  return (
    <div className="calc-prompt">
      <p>
        <strong>Ready when you are.</strong> Check the numbers, change any that are not yours,
        then press <strong>Calculate</strong>. Nothing is calculated while you type.
      </p>
    </div>
  );
}

/** Shown above results that no longer match the inputs. */
export function StaleNotice({ extra }: { extra?: string }) {
  return (
    <p className="notice notice--warn" role="status">
      <strong>These results are out of date.</strong> You changed the inputs after they were
      calculated. Press Calculate to update them.
      {extra ? ` ${extra}` : ""}
    </p>
  );
}
