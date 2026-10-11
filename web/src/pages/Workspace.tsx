import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { careerSensitivity, compareCareer, warmCalculator } from "../lib/api";
import { getEngineStatus, subscribeEngineStatus } from "../lib/engineClient";
import { BLANK, SAMPLE, isSample, toRequest, type FormState } from "../lib/form";
import { decodeForm, scenarioLink } from "../lib/share";
import { SECTION_FIELDS, validate, type SectionId } from "../lib/validation";
import { useApiQuery } from "../lib/useApiQuery";
import { Button } from "../components/ui/Button";
import { Disclosure } from "../components/ui/Disclosure";
import { Stepper, type Step } from "../components/ui/Stepper";
import { EngineProgress } from "../components/workspace/EngineProgress";
import { InputSections } from "../components/workspace/InputSections";
import { ResultSummary } from "../components/workspace/ResultSummary";
import { CashflowChart } from "../components/workspace/CashflowChart";
import { AnnualTables, MonthlyTable } from "../components/workspace/AnnualTables";
import { SensitivityGrid } from "../components/workspace/SensitivityGrid";
import { Assumptions } from "../components/Assumptions";

const LABELS: Record<SectionId, string> = {
  current: "Current job",
  offer: "New offer",
  costs: "Living costs",
  transition: "Switching costs",
};

export default function Workspace() {
  // A shared link (#/app?curPay=...) opens with that scenario; otherwise the sample.
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(() => decodeForm(searchParams) ?? SAMPLE);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "manual">("idle");
  const [sensitivityOpen, setSensitivityOpen] = useState(false);
  const engine = useSyncExternalStore(subscribeEngineStatus, getEngineStatus);
  useEffect(() => warmCalculator(), []);

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const request = useMemo(() => (hasErrors ? null : toRequest(form)), [form, hasErrors]);
  const key = request ? JSON.stringify(request) : null;

  const comparison = useApiQuery(key, (s) => compareCareer(request!, s));
  const sensitivity = useApiQuery(
    key,
    (s) => careerSensitivity(request!, s),
    500,
    sensitivityOpen,
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(scenarioLink(form, window.location));
      setLinkState("copied");
    } catch {
      setLinkState("manual");
    }
  };

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const steps: Step[] = (Object.keys(SECTION_FIELDS) as SectionId[]).map((id) => {
    const fields = SECTION_FIELDS[id] as readonly (keyof FormState)[];
    const hasError = fields.some((f) => errors[f]);
    const required = id === "current" ? form.curPay : id === "offer" ? form.newPay : "x";
    return { id, label: LABELS[id], hasError, done: !hasError && required.trim() !== "" };
  });

  const result =
    comparison.status === "success"
      ? comparison.data
      : comparison.status === "loading" || comparison.status === "error"
        ? comparison.previous
        : undefined;

  return (
    <div className="workspace container">
      <header className="ws-head">
        <p className="eyebrow">Career decision</p>
        <h1>Stay or switch?</h1>
        <p className="muted lead">
          Compare the cash you would have if you stay in your current job
          versus taking a new offer, including a gap, moving costs and bonuses.
        </p>
        {isSample(form) && (
          <p className="notice notice--info" role="note">
            <strong>These are sample numbers, not yours.</strong> Replace them
            with your own figures, or clear them to start fresh.
          </p>
        )}
        <div className="row">
          <Button variant="ghost" small onClick={() => setForm(SAMPLE)}>
            Load sample
          </Button>
          <Button variant="ghost" small onClick={() => setForm(BLANK)}>
            Clear all
          </Button>
          <Button variant="ghost" small onClick={copyLink}>
            Copy link to this scenario
          </Button>
        </div>
        <p className="muted small" role="status">
          {linkState === "copied"
            ? "Link copied. Anyone with it can see these numbers; nothing is uploaded."
            : linkState === "manual"
              ? "Couldn't copy automatically. Select the link below and copy it."
              : "Share a link that reopens this scenario. Your numbers stay in the link, not on a server."}
        </p>
        {linkState === "manual" && (
          <input
            className="share-link"
            readOnly
            aria-label="Link to this scenario"
            value={scenarioLink(form, window.location)}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </header>

      <div className="ws-layout">
        <aside className="ws-aside">
          <Stepper steps={steps} />
        </aside>

        <div className="ws-inputs">
          <InputSections form={form} errors={errors} set={set} />
        </div>

        <section className="ws-results" aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h">Result</h2>

          {hasErrors && (
            <p className="notice notice--warn">
              Fix the highlighted fields to see a result.
            </p>
          )}
          {comparison.status === "error" && (
            <p className="notice notice--error" role="alert">
              {comparison.message}
            </p>
          )}
          {!result && !hasErrors && engine.phase === "loading" && (
            <EngineProgress status={engine} />
          )}
          {!result && comparison.status === "loading" && engine.phase !== "loading" && (
            <p className="muted">Calculating…</p>
          )}

          {result && request && (
            <div className="stack" data-stale={comparison.status !== "success" || hasErrors}>
              <ResultSummary
                summary={result.summary}
                horizonMonths={request.horizon_months}
                sample={isSample(form)}
              />
              <CashflowChart months={result.months} />
              <Disclosure title="Year by year" hint="income, costs and savings" defaultOpen>
                <AnnualTables stay={result.stay_annual} switchRows={result.switch_annual} />
              </Disclosure>
              <Disclosure title="Monthly cash flow" hint="every month in detail">
                <MonthlyTable months={result.months} />
              </Disclosure>
              <Disclosure
                title="How sensitive is this result?"
                hint="other growth, inflation and gap assumptions"
                onToggle={setSensitivityOpen}
              >
                <p className="muted small">
                  The difference between switching and staying under alternative
                  assumptions. Values other than your own are examples, not predictions.
                </p>
                {sensitivity.status === "error" && (
                  <p className="notice notice--error" role="alert">{sensitivity.message}</p>
                )}
                {sensitivity.status === "loading" && !sensitivity.previous && (
                  <p className="muted">Calculating…</p>
                )}
                {(sensitivity.status === "success" || "previous" in sensitivity) &&
                  (() => {
                    const data =
                      sensitivity.status === "success" ? sensitivity.data : sensitivity.previous;
                    return data ? <SensitivityGrid rows={data.rows} /> : null;
                  })()}
              </Disclosure>
            </div>
          )}

          <Assumptions compact />
        </section>
      </div>
    </div>
  );
}
