import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import { useApiQuery } from "../lib/useApiQuery";
import { Button } from "../components/ui/Button";
import { Disclosure } from "../components/ui/Disclosure";
import { ExpenseAssumptions, ExpenseResults } from "../components/expenses/ExpenseResults";
import { ExpenseInputs } from "../components/expenses/ExpenseInputs";
import { EngineProgress } from "../components/workspace/EngineProgress";

export default function Expenses() {
  const [form, setForm] = useState<ExpenseForm>(EXPENSE_SAMPLE);
  const engine = useSyncExternalStore(subscribeEngineStatus, getEngineStatus);
  useEffect(() => warmCalculator(), []);

  const errors = useMemo(() => validateExpense(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const request = useMemo(() => (hasErrors ? null : toExpenseRequest(form)), [form, hasErrors]);
  const key = request ? JSON.stringify(request) : null;
  const simulation = useApiQuery(key, (s) => simulateExpense(request!, s));

  const set = (k: keyof ExpenseForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const result =
    simulation.status === "success"
      ? simulation.data
      : simulation.status === "loading" || simulation.status === "error"
        ? simulation.previous
        : undefined;

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
        <div className="ws-inputs">
          <ExpenseInputs form={form} errors={errors} set={set} />
        </div>

        <section className="ws-results" aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h">Result</h2>

          {hasErrors && (
            <p className="notice notice--warn">Fix the highlighted fields to see a result.</p>
          )}
          {simulation.status === "error" && (
            <p className="notice notice--error" role="alert">
              {simulation.message}
            </p>
          )}
          {!result && !hasErrors && engine.phase === "loading" && <EngineProgress status={engine} />}
          {!result && simulation.status === "loading" && engine.phase !== "loading" && (
            <p className="muted">Calculating…</p>
          )}

          {result && request && (
            <div className="stack" data-stale={simulation.status !== "success" || hasErrors}>
              <ExpenseResults data={result} request={request} />
              <Disclosure title="Assumptions and limitations" defaultOpen>
                <ExpenseAssumptions request={request} />
              </Disclosure>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
