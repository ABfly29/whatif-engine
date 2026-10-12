import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { careerSensitivity, compareCareer, warmCalculator } from "../lib/api";
import { getEngineStatus, subscribeEngineStatus } from "../lib/engineClient";
import { BLANK, SAMPLE, isSample, toRequest, type FormState } from "../lib/form";
import { decodeForm, scenarioLink } from "../lib/share";
import type { CareerRequest, CareerResponse } from "../lib/types";
import { SECTION_FIELDS, validate, type SectionId } from "../lib/validation";
import { useApiQuery } from "../lib/useApiQuery";
import { useCalculation } from "../lib/useCalculation";
import { Button } from "../components/ui/Button";
import { Disclosure } from "../components/ui/Disclosure";
import { Stepper, type Step } from "../components/ui/Stepper";
import {
  CalculateBar,
  CalculatePrompt,
  StaleNotice,
} from "../components/workspace/CalculateBar";
import { EngineProgress } from "../components/workspace/EngineProgress";
import { InputSections } from "../components/workspace/InputSections";
import { ResultSummary } from "../components/workspace/ResultSummary";
import { CashflowChart } from "../components/workspace/CashflowChart";
import { ReportDownload } from "../components/workspace/ReportDownload";
import { AnnualTables, MonthlyTable } from "../components/workspace/AnnualTables";
import { SensitivityGrid } from "../components/workspace/SensitivityGrid";
import { Assumptions } from "../components/Assumptions";

const LABELS: Record<SectionId, string> = {
  current: "Current job",
  offer: "New offer",
  costs: "Living costs",
  transition: "Switching costs",
};

const SAMPLE_KEY = JSON.stringify(toRequest(SAMPLE));

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

  // Field errors appear once someone has tried to calculate, then follow their edits.
  const [attempted, setAttempted] = useState(false);
  const [focusErrors, setFocusErrors] = useState(0);
  const shownErrors = attempted ? errors : {};

  // Calculation happens only on submit. Editing the form never reaches the engine.
  const calc = useCalculation<CareerRequest, CareerResponse>((r, signal) =>
    compareCareer(r, signal),
  );
  const latest = calc.latest;
  // A result is current only if it was computed from exactly what the form says now.
  const isCurrent = latest !== null && latest.key === key;
  const stale = latest !== null && !isCurrent;

  // Sensitivity follows the calculated result, not the form, so typing never triggers it.
  const sensitivity = useApiQuery(
    latest?.key ?? null,
    (signal) => careerSensitivity(latest!.request, signal),
    0,
    sensitivityOpen,
  );

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

  // After a failed attempt, move focus to the first field that needs fixing.
  useEffect(() => {
    if (focusErrors === 0) return;
    document.querySelector<HTMLElement>('.ws-inputs [aria-invalid="true"]')?.focus();
  }, [focusErrors]);

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
    const hasError = fields.some((f) => shownErrors[f]);
    const required = id === "current" ? form.curPay : id === "offer" ? form.newPay : "x";
    return { id, label: LABELS[id], hasError, done: !hasError && required.trim() !== "" };
  });

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
          <Button variant="ghost" small onClick={copyLink} disabled={!isCurrent}>
            Copy link to this scenario
          </Button>
        </div>
        <p className="muted small" role="status">
          {!isCurrent
            ? "Calculate first: a shared link always matches the result on screen."
            : linkState === "copied"
              ? "Link copied. Anyone with it can see these numbers; nothing is uploaded."
              : linkState === "manual"
                ? "Couldn't copy automatically. Select the link below and copy it."
                : "Share a link that reopens this scenario. Your numbers stay in the link, not on a server."}
        </p>
        {isCurrent && linkState === "manual" && (
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

        <form
          className="ws-inputs"
          onSubmit={calculate}
          noValidate
          aria-label="Career decision inputs"
        >
          <InputSections form={form} errors={shownErrors} set={set} />
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
              {stale && (
                <StaleNotice extra="PDF download and link sharing are paused until then." />
              )}
              <ResultSummary
                summary={latest.data.summary}
                horizonMonths={latest.request.horizon_months}
                sample={latest.key === SAMPLE_KEY}
              />
              <CashflowChart months={latest.data.months} />
              {isCurrent && <ReportDownload request={latest.request} result={latest.data} />}
              <Disclosure title="Year by year" hint="income, costs and savings" defaultOpen>
                <AnnualTables
                  stay={latest.data.stay_annual}
                  switchRows={latest.data.switch_annual}
                />
              </Disclosure>
              <Disclosure title="Monthly cash flow" hint="every month in detail">
                <MonthlyTable months={latest.data.months} />
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
