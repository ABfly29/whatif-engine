import { inr, monthsToYears } from "../../lib/format";
import type { Summary } from "../../lib/types";

interface Props {
  summary: Summary;
  horizonMonths: number;
  sample: boolean;
}

export function ResultSummary({ summary, horizonMonths, sample }: Props) {
  const diff = Number(summary.ending_cash_difference);
  const horizon = monthsToYears(horizonMonths);

  let verdict: string;
  let tone: "positive" | "negative" | "neutral";
  if (diff > 0) {
    verdict = `After ${horizon}, switching leaves you ${inr(diff)} better off than staying.`;
    tone = "positive";
  } else if (diff < 0) {
    verdict = `After ${horizon}, switching leaves you ${inr(-diff)} worse off than staying.`;
    tone = "negative";
  } else {
    verdict = `After ${horizon}, switching and staying end with the same cash.`;
    tone = "neutral";
  }

  const breakEven =
    summary.break_even_month === null
      ? "Not reached"
      : `Month ${summary.break_even_month}`;

  return (
    <div className="result">
      {sample && (
        <p className="notice notice--info">
          Based on the <strong>sample numbers</strong>, not yours.
        </p>
      )}
      <p className="verdict" data-tone={tone} role="status">
        {verdict}
        <span className="verdict__note"> Under these assumptions; a projection, not a guarantee.</span>
      </p>

      <dl className="metrics">
        <Metric label="Cash if you stay" value={inr(summary.stay_ending_cash)} />
        <Metric label="Cash if you switch" value={inr(summary.switch_ending_cash)} />
        <Metric
          label="Difference (switch − stay)"
          value={`${diff > 0 ? "+" : ""}${inr(diff)}`}
          tone={tone}
        />
        <Metric
          label="Break-even"
          value={breakEven}
          note={
            summary.break_even_month === null
              ? `Switching does not catch up within ${horizonMonths} months.`
              : "From this month on, switching stays at least level with staying."
          }
        />
      </dl>

      {(
        [
          ["stay", summary.stay_first_negative_month],
          ["switch", summary.switch_first_negative_month],
        ] as const
      ).map(
        ([which, month]) =>
          month !== null && (
            <p key={which} className="notice notice--warn">
              If you {which}, your cash balance drops below zero in month {month}.
            </p>
          ),
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div className="metric" data-tone={tone}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
      {note && <p className="metric__note">{note}</p>}
    </div>
  );
}
