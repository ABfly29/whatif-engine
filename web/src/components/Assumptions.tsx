import { ASSUMPTIONS } from "../lib/assumptions";
import { Disclosure } from "./ui/Disclosure";

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
