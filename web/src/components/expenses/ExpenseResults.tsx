import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fractionToPercent, inr, inrCompact, inrWords, monthsLabel } from "../../lib/format";
import type {
  ExpenseRequest,
  ExpenseResponse,
  ExpenseScenario,
  ExpenseScenarioKey,
} from "../../lib/types";
import { EXPENSE_GLOSSARY, expenseAssumptionItems, scenarioLabels, warningText } from "../../lib/expenseLabels";
import { Disclosure } from "../ui/Disclosure";

const COLORS: Record<ExpenseScenarioKey, string> = {
  baseline: "#9db4d9",
  buy_now: "#2dd4bf",
  delay: "#fbbf24",
  cheaper: "#a78bfa",
};
const DASH: Record<ExpenseScenarioKey, string | undefined> = {
  baseline: "6 4",
  buy_now: undefined,
  delay: "2 3",
  cheaper: "10 3 2 3",
};

const dash = <span className="muted" aria-label="not applicable">—</span>;
const signed = (v: string) => `${Number(v) > 0 ? "+" : ""}${inr(v)}`;
const tone = (v: string) => (Number(v) > 0 ? "positive" : Number(v) < 0 ? "negative" : undefined);
const isZero = (v: string) => Number(v) === 0;

type Row = {
  label: string;
  cell: (s: ExpenseScenario) => React.ReactNode;
  tone?: (s: ExpenseScenario) => string | undefined;
};

function CompareTable({
  caption,
  rows,
  columns,
  labels,
  note,
}: {
  caption: string;
  rows: Row[];
  columns: ExpenseScenario[];
  labels: Record<ExpenseScenarioKey, string>;
  note?: string;
}) {
  return (
    <div>
      <div className="table-scroll">
        <table className="data compare">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Measure</span>
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {labels[c.key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {columns.map((c) => (
                  <td key={c.key} data-tone={r.tone?.(c)}>
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="muted small mt">{note}</p>}
    </div>
  );
}

const money = (v: string) => (isZero(v) ? dash : inr(v));
const hasLoan = (s: ExpenseScenario) => !isZero(s.loan_principal);

function monthlyRows(): Row[] {
  const bought = (s: ExpenseScenario) => s.key === "baseline";
  return [
    { label: "Price paid (on-road)", cell: (s) => (bought(s) ? dash : inr(s.price)) },
    { label: "Paid upfront", cell: (s) => (bought(s) ? dash : inr(s.upfront_payment)) },
    { label: "Loan amount", cell: (s) => money(s.loan_principal) },
    { label: "Monthly EMI", cell: (s) => money(s.emi) },
    { label: "Total interest over the loan", cell: (s) => money(s.total_interest) },
    { label: "Monthly surplus before the purchase", cell: (s) => inr(s.surplus_before) },
    {
      label: "Monthly surplus after the purchase",
      cell: (s) => inr(s.surplus_after),
      tone: (s) => (Number(s.surplus_after) < 0 ? "negative" : undefined),
    },
    {
      label: "Cash left after the upfront payment",
      cell: (s) => inr(s.cash_after_upfront),
      tone: (s) => (Number(s.cash_after_upfront) < 0 ? "negative" : undefined),
    },
    {
      label: "Months of expenses that cash covers",
      cell: (s) => (s.cover_months === null ? dash : monthsLabel(s.cover_months)),
    },
    {
      label: "Short of your emergency fund by",
      cell: (s) => money(s.emergency_fund_shortfall),
      tone: (s) => (Number(s.emergency_fund_shortfall) > 0 ? "negative" : undefined),
    },
  ];
}

function yearRows(year: number): Row[] {
  const at = (s: ExpenseScenario) => s.snapshots.find((x) => x.year === year)!;
  const bought = (s: ExpenseScenario) => s.key === "baseline";
  return [
    { label: "Liquid savings", cell: (s) => inr(at(s).liquid_savings),
      tone: (s) => (Number(at(s).liquid_savings) < 0 ? "negative" : undefined) },
    // A repaid loan is ₹0, not "not applicable": only options with no loan show a dash.
    { label: "Loan still owed", cell: (s) => (hasLoan(s) ? inr(at(s).loan_balance) : dash) },
    { label: "Estimated resale value", cell: (s) => money(at(s).resale_value) },
    { label: "Net worth (savings + resale − loan)", cell: (s) => inr(at(s).net_worth) },
    { label: "Liquid savings vs no purchase",
      cell: (s) => (bought(s) ? dash : signed(at(s).liquid_vs_baseline)),
      tone: (s) => tone(at(s).liquid_vs_baseline) },
    { label: "Net worth vs no purchase",
      cell: (s) => (bought(s) ? dash : signed(at(s).net_worth_vs_baseline)),
      tone: (s) => tone(at(s).net_worth_vs_baseline) },
    { label: "Interest paid so far", cell: (s) => (hasLoan(s) ? inr(at(s).interest_paid) : dash) },
    { label: "Running costs paid so far", cell: (s) => money(at(s).running_costs_paid) },
    { label: "Estimated depreciation", cell: (s) => money(at(s).depreciation) },
    { label: "Ownership cost (interest + running + depreciation)",
      cell: (s) => money(at(s).ownership_cost) },
  ];
}

function ExpenseChart({
  data,
  labels,
  years,
}: {
  data: ExpenseResponse;
  labels: Record<ExpenseScenarioKey, string>;
  years: number;
}) {
  const [metric, setMetric] = useState<"liquid" | "net_worth">("liquid");
  const keys: ExpenseScenarioKey[] = ["baseline", "buy_now", "delay", "cheaper"];
  const rows = data.months
    .filter((m) => m.month <= years * 12)
    .map((m) => {
      const row: Record<string, number> = { month: m.month };
      for (const k of keys) row[k] = Number(m[metric][k]);
      return row;
    });
  const last = rows[rows.length - 1];
  const title = metric === "liquid" ? "Liquid savings over time" : "Net worth over time";

  return (
    <figure className="chart">
      <figcaption>
        <h3>{title}</h3>
        <p className="muted small">
          Month-end values for each option. Net worth adds the vehicle&apos;s estimated resale
          value and subtracts the loan.
        </p>
        <fieldset className="choice choice--inline">
          <legend className="visually-hidden">What to chart</legend>
          <label>
            <input type="radio" name="chart-metric" checked={metric === "liquid"}
              onChange={() => setMetric("liquid")} />
            Liquid savings
          </label>
          <label>
            <input type="radio" name="chart-metric" checked={metric === "net_worth"}
              onChange={() => setMetric("net_worth")} />
            Net worth
          </label>
        </fieldset>
      </figcaption>
      <div
        className="chart__canvas"
        role="img"
        aria-label={`Line chart of ${title.toLowerCase()} over ${years * 12} months. At month ${last.month}: ${keys
          .map((k) => `${labels[k]} ${inr(Number(last[k]))}`)
          .join("; ")}.`}
      >
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#223049" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" stroke="#6f7f99" tick={{ fill: "#9aa8bf", fontSize: 12 }}
              tickLine={false}
              label={{ value: "Month", position: "insideBottomRight", offset: -2, fill: "#6f7f99", fontSize: 12 }} />
            <YAxis stroke="#6f7f99" width={64} tick={{ fill: "#9aa8bf", fontSize: 12 }}
              tickLine={false} tickFormatter={inrCompact} />
            <ReferenceLine y={0} stroke="#fb7185" strokeDasharray="4 4" />
            <Tooltip
              formatter={(v, name) => [inr(Number(v)), labels[name as ExpenseScenarioKey]]}
              labelFormatter={(m) => `Month ${m}`}
              contentStyle={{ background: "#0f1829", border: "1px solid #31435f", borderRadius: 8 }}
            />
            <Legend formatter={(name) => labels[name as ExpenseScenarioKey]} />
            {keys.map((k) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[k]}
                strokeDasharray={DASH[k]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function ExpenseAssumptions({ request }: { request: ExpenseRequest }) {
  return (
    <ul className="assumption-list">
      {expenseAssumptionItems(request).map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export function ExpenseResults({
  data,
  request,
}: {
  data: ExpenseResponse;
  request: ExpenseRequest;
}) {
  const labels = scenarioLabels(request.delay_months);
  const columns = [data.baseline, ...data.scenarios];
  const horizon = data.horizon_years;
  const years = [1, 3, 5];
  const later = data.scenarios.find((s) => s.key === "delay")!;
  const warnings = data.scenarios.flatMap((s) =>
    s.warnings.map((w) => ({ key: `${s.key}-${w.code}`, text: warningText(w, labels[s.key], s) })),
  );
  const baseWarnings = data.baseline.warnings.map((w) => ({
    key: `base-${w.code}`,
    text: warningText(w, "Even without a purchase", data.baseline),
  }));

  return (
    <div className="stack">
      {[...baseWarnings, ...warnings].map((w) => (
        <p key={w.key} className="notice notice--warn">
          {w.text}
        </p>
      ))}
      {warnings.length + baseWarnings.length === 0 && (
        <p className="notice notice--info">
          No warnings were triggered. That is not a verdict: compare the figures below against your
          own comfort level.
        </p>
      )}

      <CompareTable
        caption="Monthly picture"
        columns={columns}
        labels={labels}
        rows={monthlyRows()}
        note={`The ${labels.delay.toLowerCase()} column shows the month after it is bought, in future rupees after the growth and inflation you entered. Running costs include insurance spread evenly over 12 months.`}
      />

      <CompareTable
        caption={`After ${horizon} ${horizon === 1 ? "year" : "years"}`}
        columns={columns}
        labels={labels}
        rows={yearRows(horizon)}
        note={
          later.purchase_month !== null && later.purchase_month > horizon * 12
            ? `${labels.delay}: the purchase happens after this period, so it shows no ownership yet.`
            : undefined
        }
      />

      <Disclosure title="Delaying and cheaper options" hint="what changes" defaultOpen>
        <ul className="assumption-list">
          <li>
            <strong>Delay:</strong> you keep earning and saving for {request.delay_months}{" "}
            {request.delay_months === 1 ? "month" : "months"} before paying. The price is assumed
            to rise to {inrWords(later.price)} (from {inrWords(request.purchase_price)}), so the
            loan and EMI are larger. You own it for less of the {horizon}-year period, so you
            pay less running cost and depreciation within it.
          </li>
          <li>
            <strong>Cheaper option:</strong> bought today at {inrWords(request.alternative_price)},
            with the same share paid upfront and running costs at {fractionToPercent(request.alternative_running_share)} of the main choice.
          </li>
        </ul>
      </Disclosure>

      <ExpenseChart data={data} labels={labels} years={horizon} />

      {years
        .filter((y) => y !== horizon)
        .map((y) => (
          <Disclosure key={y} title={`After ${y} ${y === 1 ? "year" : "years"}`} hint="same measures">
            <CompareTable caption={`After ${y} ${y === 1 ? "year" : "years"}`} columns={columns}
              labels={labels} rows={yearRows(y)} />
          </Disclosure>
        ))}

      <Disclosure title="What these terms mean" hint="EMI, depreciation, net worth">
        <dl className="glossary">
          {EXPENSE_GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}
