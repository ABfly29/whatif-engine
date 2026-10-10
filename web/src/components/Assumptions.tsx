import { Disclosure } from "./ui/Disclosure";

export const ASSUMPTIONS: string[] = [
  "Pay is take-home. Income tax, PF and other deductions are not modelled.",
  "Pay growth and expense inflation change once a year, not month by month. The defaults (9.1% and 5%) are placeholders, not forecasts.",
  "Savings earn no interest and are not invested.",
  "Relocation cost and the bonus you give up are charged in month 1. The joining bonus arrives in your first month at the new job.",
  "Regular annual bonuses are not modelled except through the two bonus fields.",
  "Gap, relocation and bonus inputs apply only to the switch scenario.",
  "There are no unexpected expenses, job loss, health costs or changes in family circumstances.",
];

export function AssumptionList() {
  return (
    <ul className="assumption-list">
      {ASSUMPTIONS.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

/** Compact, expandable version for the workspace. */
export function Assumptions({ compact }: { compact?: boolean }) {
  if (!compact) return <AssumptionList />;
  return (
    <Disclosure title="Assumptions and limitations" defaultOpen>
      <p className="small">
        This is a <strong>projection based on the numbers you enter</strong>.
        It is not a forecast, a guarantee or financial advice.
      </p>
      <AssumptionList />
    </Disclosure>
  );
}
