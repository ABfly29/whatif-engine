import type { ExpenseErrors, ExpenseForm } from "../../lib/expenseForm";
import { inrWords } from "../../lib/format";
import { Disclosure } from "../ui/Disclosure";
import { MoneyField, MonthsField, PercentField } from "../ui/Field";
import { Section } from "../workspace/InputSections";

interface Props {
  form: ExpenseForm;
  errors: ExpenseErrors;
  set: (key: keyof ExpenseForm, value: string) => void;
}

export function ExpenseInputs({ form, errors, set }: Props) {
  const money = (key: keyof ExpenseForm, label: string, help?: string) => (
    <MoneyField
      label={label}
      help={help}
      value={form[key]}
      error={errors[key]}
      onChange={(v) => set(key, v)}
    />
  );
  const percent = (key: keyof ExpenseForm, label: string, help?: string) => (
    <PercentField
      label={label}
      help={help}
      value={form[key]}
      error={errors[key]}
      onChange={(v) => set(key, v)}
    />
  );
  const loan = form.method === "loan";
  const tenure = Number(form.tenure);
  const priceWords = Number(form.price) >= 1e5 ? ` That is ${inrWords(form.price)}.` : "";

  return (
    <>
      <Section
        id="money"
        step={1}
        title="Your money today"
        intro="What comes in, what goes out and what you have set aside."
      >
        <div className="grid-2">
          {money("takeHome", "Monthly take-home salary", "What reaches your bank account each month, after tax and PF.")}
          {money("household", "Monthly household expenses", "Rent, food, bills, existing EMIs. Leave out the purchase.")}
          {money("savings", "Liquid savings", "Cash and savings you could use within days. Not property, gold or locked-in funds.")}
          {money("emergency", "Of which: emergency fund", "The part you want to keep untouched. It is part of your liquid savings.")}
        </div>
      </Section>

      <Section
        id="purchase"
        step={2}
        title="The purchase"
        intro="The vehicle you are thinking about, and how you would pay for it."
      >
        <div className="grid-2">
          {money(
            "price",
            "On-road price",
            `Ex-showroom plus registration, road tax, insurance and other charges: what you actually pay.${priceWords}`,
          )}
          {money("altPrice", "Cheaper alternative: on-road price", "A lower-priced option to compare with.")}
        </div>

        <fieldset className="choice">
          <legend className="field__label">How will you pay?</legend>
          <label>
            <input
              type="radio"
              name="method"
              checked={loan}
              onChange={() => set("method", "loan")}
            />
            Take a loan
          </label>
          <label>
            <input
              type="radio"
              name="method"
              checked={!loan}
              onChange={() => set("method", "cash")}
            />
            Pay in cash
          </label>
        </fieldset>

        {loan && (
          <div className="grid-2">
            {money("down", "Down payment", "Paid on day one. The rest of the price is the loan.")}
            {percent("rate", "Loan interest rate (per year)", "Use the rate you were offered. Nothing here is a lender's quote.")}
            <MonthsField
              label="Loan tenure"
              help={
                Number.isInteger(tenure) && tenure >= 12
                  ? `${tenure} months is ${Number((tenure / 12).toFixed(1))} years.`
                  : "How long you will take to repay it."
              }
              value={form.tenure}
              error={errors.tenure}
              onChange={(v) => set("tenure", v)}
            />
          </div>
        )}
      </Section>

      <Section
        id="running"
        step={3}
        title="Running costs"
        intro="What owning it costs each month, in today's rupees. Leave out anything that does not apply."
      >
        <div className="grid-2">
          {money("fuel", "Fuel / month")}
          {money("servicing", "Servicing and maintenance / month", "Average it out: a yearly service bill divided by 12.")}
          {money("parking", "Parking and tolls / month")}
          {money("otherRunning", "Other / month", "Cleaning, accessories, challans, anything else.")}
          {money("insurance", "Insurance renewal / year", "Paid each year after the first. The first year is already in the on-road price.")}
        </div>
      </Section>

      <Section
        id="scenarios"
        step={4}
        title="Compare and project"
        intro="Two alternatives to buying today, and how far ahead to look."
      >
        <div className="grid-2">
          <MonthsField
            label="Delay the purchase by"
            help="You keep saving meanwhile, but the price may rise."
            value={form.delay}
            error={errors.delay}
            onChange={(v) => set("delay", v)}
          />
          {percent("altRunning", "Cheaper option's running costs", "As a share of the running costs above. 100% means the same.")}
        </div>
        <fieldset className="choice">
          <legend className="field__label">Look ahead</legend>
          {(["1", "3", "5"] as const).map((y) => (
            <label key={y}>
              <input
                type="radio"
                name="horizon"
                checked={form.horizon === y}
                onChange={() => set("horizon", y)}
              />
              {y} {y === "1" ? "year" : "years"}
            </label>
          ))}
        </fieldset>

        <Disclosure title="Assumptions you can change" hint="growth, inflation, returns, depreciation" defaultOpen>
          <p className="muted small">
            Each of these is a separate assumption. They are starting points, not
            forecasts, so change them to match what you expect.
          </p>
          <div className="grid-2">
            {percent("salaryGrowth", "Salary growth (per year)", "Raises your take-home once a year.")}
            {percent("inflation", "Expense inflation (per year)", "Raises household and running costs once a year. EMIs stay fixed.")}
            {percent("savingsReturn", "Return on savings (per year)", "0% assumes your savings sit idle. Only enter a return you actually earn.")}
            {percent("depreciation", "Vehicle depreciation (per year)", "How fast the resale value falls. Resale prices are uncertain.")}
            {percent("priceIncrease", "Vehicle price rise (per year)", "Used only if you delay the purchase.")}
          </div>
        </Disclosure>
      </Section>
    </>
  );
}
