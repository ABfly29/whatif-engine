import { inr } from "../../lib/format";
import type { AnnualRow, MonthRow } from "../../lib/types";

function AnnualTable({ title, rows }: { title: string; rows: AnnualRow[] }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Income</th>
            <th scope="col">Living costs</th>
            <th scope="col">One-time costs</th>
            <th scope="col">Joining bonus</th>
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
              {/* Relocation and forfeited bonus are shown together; both are
                  engine outputs, only the join of two labels happens here. */}
              <td>
                {inr(r.relocation_costs)}
                {Number(r.lost_bonus) > 0 && (
                  <span className="muted small"> + {inr(r.lost_bonus)} bonus given up</span>
                )}
              </td>
              <td>{inr(r.joining_bonus)}</td>
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
        Saved = income − living costs − one-time costs + joining bonus.
      </p>
    </div>
  );
}

export function MonthlyTable({ months }: { months: MonthRow[] }) {
  return (
    <div className="table-scroll table-scroll--tall" tabIndex={0} role="region" aria-label="Monthly cash flow table">
      <table className="data">
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
