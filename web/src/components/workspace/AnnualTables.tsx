import { inr } from "../../lib/format";
import type { AnnualRow, MonthRow } from "../../lib/types";

/** One-time items for a year, shown only when non-zero. Engine values as-is. */
function OneTimeItems({ row }: { row: AnnualRow }) {
  const items: string[] = [];
  if (Number(row.relocation_costs) > 0) items.push(`${inr(row.relocation_costs)} relocation`);
  if (Number(row.lost_bonus) > 0) items.push(`${inr(row.lost_bonus)} bonus given up`);
  if (Number(row.joining_bonus) > 0) items.push(`+${inr(row.joining_bonus)} joining bonus`);
  if (items.length === 0) return <span className="muted">—</span>;
  return (
    <span className="items">
      {items.map((t) => (
        <span key={t}>{t}</span>
      ))}
    </span>
  );
}

function AnnualTable({ title, rows }: { title: string; rows: AnnualRow[] }) {
  return (
    <div className="table-scroll">
      <table className="data annual">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Income</th>
            <th scope="col">Living costs</th>
            <th scope="col">One-time items</th>
            <th scope="col">Saved</th>
            <th scope="col">Cash at year end</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <th scope="row">Year {r.year}</th>
              <td>{inr(r.total_income)}</td>
              <td>{inr(r.total_expenses)}</td>
              <td>
                <OneTimeItems row={r} />
              </td>
              <td>{inr(r.net_savings)}</td>
              <td>{inr(r.ending_cash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnnualTables({
  stay,
  switchRows,
}: {
  stay: AnnualRow[];
  switchRows: AnnualRow[];
}) {
  return (
    <div className="stack">
      <AnnualTable title="If you stay" rows={stay} />
      <AnnualTable title="If you switch" rows={switchRows} />
      <p className="muted small">
        Saved = income − living costs − relocation − bonus given up + joining bonus.
      </p>
    </div>
  );
}

export function MonthlyTable({ months }: { months: MonthRow[] }) {
  return (
    <div className="table-scroll table-scroll--tall" tabIndex={0} role="region" aria-label="Monthly cash flow table">
      <table className="data annual">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Stay: income</th>
            <th scope="col">Stay: costs</th>
            <th scope="col">Stay: cash</th>
            <th scope="col">Switch: income</th>
            <th scope="col">Switch: costs</th>
            <th scope="col">Switch: cash</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td>{inr(m.stay_income)}</td>
              <td>{inr(m.stay_expenses)}</td>
              <td>{inr(m.stay_cash)}</td>
              <td>{inr(m.switch_income)}</td>
              <td>{inr(m.switch_expenses)}</td>
              <td>{inr(m.switch_cash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
