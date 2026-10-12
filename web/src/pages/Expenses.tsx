import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { simulateExpense, warmCalculator } from "../lib/api";
import { getEngineStatus, subscribeEngineStatus } from "../lib/engineClient";
import {
  EXPENSE_BLANK,
  EXPENSE_SAMPLE,
  isExpenseSample,
  toExpenseRequest,
  validateExpense,
  type ExpenseForm,
} from "../lib/expenseForm";
import type { ExpenseRequest, ExpenseResponse } from "../lib/types";
import { useCalculation } from "../lib/useCalculation";
import { Button } from "../components/ui/Button";
import { Disclosure } from "../components/ui/Disclosure";
import { ExpenseAssumptions, ExpenseResults } from "../components/expenses/ExpenseResults";
import { ExpenseInputs } from "../components/expenses/ExpenseInputs";
import { ExpenseReportDownload } from "../components/expenses/ExpenseReportDownload";
import {
  CalculateBar,
  CalculatePrompt,
  StaleNotice,
} from "../components/workspace/CalculateBar";
import { EngineProgress } from "../components/workspace/EngineProgress";

export default function Expenses() {
  const [form, setForm] = useState<ExpenseForm>(EXPENSE_SAMPLE);
  const engine = useSyncExternalStore(subscribeEngineStatus, getEngineStatus);
  useEffect(() => warmCalculator(), []);

  const errors = useMemo(() => validateExpense(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const request = useMemo(() => (hasErrors ? null : toExpenseRequest(form)), [form, hasErrors]);
  const key = request ? JSON.stringify(request) : null;

  // Field errors appear once someone has tried to calculate, then follow their edits.
  const [attempted, setAttempted] = useState(false);
  const [focusErrors, setFocusErrors] = useState(0);
  const shownErrors = attempted ? errors : {};

  // Calculation happens only on submit. Editing the form never reaches the engine.
  const calc = useCalculation<ExpenseRequest, ExpenseResponse>((r, signal) =>
    simulateExpense(r, signal),
  );
  const latest = calc.latest;
  const isCurrent = latest !== null && latest.key === key;
  const stale = latest !== null && !isCurrent;

  const calculate = (event?: FormEvent) => {
    event?.preventDefault();
    if (calc.busy) return;
    setAttempted(true);
    if (!request) {
      setFocusErrors((n) => n + 1);
      return;
    }
    calc.submit(request);
  };

  useEffect(() => {
    if (focusErrors === 0) return;
    document.querySelector<HTMLElement>('.ws-inputs [aria-invalid="true"]')?.focus();
  }, [focusErrors]);

  const set = (k: keyof ExpenseForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="workspace container">
      <header className="ws-head">
        <p className="eyebrow">Major expense</p>
        <h1>Can your finances carry this purchase?</h1>
        <p className="muted lead">
          See what buying a vehicle now, buying it later, or buying a cheaper one does to your
          monthly surplus, savings and net worth. We show the numbers and the trade-offs; you
          decide what is comfortable.
        </p>
        {isExpenseSample(form) && (
          <p className="notice notice--info" role="note">
            <strong>These are sample numbers, not yours.</strong> Replace them with your own
            figures, or clear them to start fresh.
          </p>
        )}
        <div className="row">
          <Button variant="ghost" small onClick={() => setForm(EXPENSE_SAMPLE)}>
            Load sample
          </Button>
          <Button variant="ghost" small onClick={() => setForm(EXPENSE_BLANK)}>
            Clear all
          </Button>
        </div>
      </header>

      <div className="ws-layout">
        <form
          className="ws-inputs"
          onSubmit={calculate}
          noValidate
          aria-label="Major expense inputs"
        >
          <ExpenseInputs form={form} errors={shownErrors} set={set} />
          <CalculateBar
            busy={calc.busy}
            state={latest === null ? "none" : stale ? "stale" : "current"}
          />
        </form>

        <section className="ws-results" aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h">Result</h2>

          {attempted && hasErrors && (
            <p className="notice notice--warn">
              Fix the highlighted fields, then press Calculate.
            </p>
          )}
          {calc.error && (
            <p className="notice notice--error" role="alert">
              {calc.error}
            </p>
          )}
          {!latest && engine.phase === "loading" && <EngineProgress status={engine} />}
          {!latest && !calc.busy && !calc.error && !attempted && <CalculatePrompt />}
          {!latest && calc.busy && engine.phase !== "loading" && (
            <p className="muted">Calculating…</p>
          )}

          {latest && (
            <div className="stack" data-stale={stale || calc.busy}>
              {stale && <StaleNotice extra="PDF download is paused until then." />}
              {/* Labels and figures come from the request that was calculated, not the form. */}
              <ExpenseResults data={latest.data} request={latest.request} />
              {/* Only for a result that matches the inputs on screen; built from the calculated request. */}
              {isCurrent && <ExpenseReportDownload request={latest.request} result={latest.data} />}
              <Disclosure title="Assumptions and limitations" defaultOpen>
                <ExpenseAssumptions request={latest.request} />
              </Disclosure>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
