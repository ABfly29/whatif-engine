// Shared by the on-screen assumptions and the PDF report, so they never drift apart.
export const ASSUMPTIONS: string[] = [
  "Pay is take-home. Income tax, PF and other deductions are not modelled.",
  "Pay growth and expense inflation change once a year, not month by month. The defaults (9.1% and 5%) are placeholders, not forecasts.",
  "Savings earn no interest and are not invested.",
  "Relocation cost and the bonus you give up are charged in month 1. The joining bonus arrives in your first month at the new job.",
  "Regular annual bonuses are not modelled except through the two bonus fields.",
  "Gap, relocation and bonus inputs apply only to the switch scenario.",
  "There are no unexpected expenses, job loss, health costs or changes in family circumstances.",
];
