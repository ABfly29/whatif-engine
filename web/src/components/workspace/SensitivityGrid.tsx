import { fractionToPercent, inr } from "../../lib/format";
import type { SensitivityRow } from "../../lib/types";

export function SensitivityGrid({ rows }: { rows: SensitivityRow[] }) {
  return (
    <div className="table-scroll table-scroll--tall" tabIndex={0} role="region" aria-label="Sensitivity analysis table">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">New job pay growth</th>
            <th scope="col">Cost inflation</th>
            <th scope="col">Months without salary</th>
            <th scope="col">Switch − stay</th>
            <th scope="col">Lowest cash (switch)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = Number(r.ending_cash_difference);
            return (
              <tr key={i}>
                <th scope="row">{fractionToPercent(r.new_salary_growth_rate)}</th>
                <td>{fractionToPercent(r.expense_inflation_rate)}</td>
                <td>{r.employment_gap_months}</td>
                <td data-tone={diff >= 0 ? "positive" : "negative"}>
                  {diff > 0 ? "+" : ""}
                  {inr(diff)}
                </td>
                <td>
                  {inr(r.switch_lowest_cash)}
                  {r.switch_first_negative_month !== null && (
                    <span className="muted small"> (negative from month {r.switch_first_negative_month})</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
