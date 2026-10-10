export interface Step {
  id: string;
  label: string;
  done: boolean;
  hasError: boolean;
}

/** Progress indicator that doubles as in-page navigation. */
export function Stepper({ steps }: { steps: Step[] }) {
  const completed = steps.filter((s) => s.done).length;
  return (
    <nav className="stepper" aria-label="Progress">
      <p className="stepper__summary">
        <span className="num">{completed}</span> of {steps.length} sections complete
      </p>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              data-done={s.done}
              data-error={s.hasError}
              onClick={(e) => {
                // Hash routing: never let the browser treat this as a route.
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView?.();
              }}
            >
              <span className="stepper__dot" aria-hidden="true">
                {s.hasError ? "!" : s.done ? "✓" : i + 1}
              </span>
              <span>
                {s.label}
                <span className="visually-hidden">
                  {s.hasError ? " (needs attention)" : s.done ? " (complete)" : ""}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
