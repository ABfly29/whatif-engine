import type { ReactNode } from "react";
import type { FormState } from "../../lib/form";
import type { Errors } from "../../lib/validation";
import { Disclosure } from "../ui/Disclosure";
import { MoneyField, MonthsField, PercentField } from "../ui/Field";

interface Props {
  form: FormState;
  errors: Errors;
  set: (key: keyof FormState, value: string) => void;
}

function Section({
  id,
  step,
  title,
  intro,
  children,
}: {
  id: string;
  step: number;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="ws-section" id={id} aria-labelledby={`${id}-h`}>
      <header>
        <span className="ws-section__step" aria-hidden="true">{step}</span>
        <div>
          <h2 id={`${id}-h`}>{title}</h2>
          <p className="muted">{intro}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function CostGrid({
  prefix,
  form,
  errors,
  set,
}: Props & { prefix: "cur" | "new" }) {
  const k = (s: string) => `${prefix}${s}` as keyof FormState;
  const row = (suffix: string, label: string, help?: string) => (
    <MoneyField
      label={label}
      help={help}
      value={form[k(suffix)]}
      error={errors[k(suffix)]}
      onChange={(v) => set(k(suffix), v)}
    />
  );
  return (
    <div className="grid-2">
      {row("Rent", "Rent / month")}
      {row("Util", "Utilities / month", "Electricity, water, internet, phone.")}
      {row("Food", "Food / month")}
      {row("Trans", "Transport / month")}
      {row("Other", "Everything else / month", "EMIs, insurance, subscriptions…")}
    </div>
  );
}

export function InputSections({ form, errors, set }: Props) {
  return (
    <>
      <Section
        id="current"
        step={1}
        title="Your current job"
        intro="What you earn and have saved today."
      >
        <div className="grid-2">
          <MoneyField
            label="Annual take-home pay"
            help="What reaches your bank account in a year, after tax and PF."
            value={form.curPay}
            error={errors.curPay}
            onChange={(v) => set("curPay", v)}
          />
          <MoneyField
            label="Savings today"
            help="Cash you could draw on. It is the starting balance in both scenarios."
            value={form.savings}
            error={errors.savings}
            onChange={(v) => set("savings", v)}
          />
        </div>
      </Section>

      <Section
        id="offer"
        step={2}
        title="The new offer"
        intro="Use take-home pay, not the headline package."
      >
        <MoneyField
          label="Annual take-home pay"
          help="After tax and PF. CTC (cost to company) overstates what you receive."
          value={form.newPay}
          error={errors.newPay}
          onChange={(v) => set("newPay", v)}
        />
      </Section>

      <Section
        id="costs"
        step={3}
        title="Monthly living costs"
        intro="Edit each scenario separately — a new city often changes rent and commute."
      >
        <div className="cost-pair">
          <div>
            <h3>If you stay</h3>
            <CostGrid prefix="cur" form={form} errors={errors} set={set} />
          </div>
          <div>
            <h3>If you switch</h3>
            <CostGrid prefix="new" form={form} errors={errors} set={set} />
          </div>
        </div>
      </Section>

      <Section
        id="transition"
        step={4}
        title="Costs and bonuses of switching"
        intro="One-off items that apply only if you take the new job."
      >
        <div className="grid-2">
          <MonthsField
            label="Time without a salary"
            help="Gap between leaving and your first day at the new job."
            value={form.gap}
            error={errors.gap}
            onChange={(v) => set("gap", v)}
          />
          <MoneyField
            label="Relocation cost"
            help="Moving, deposits, travel and setup. Charged in month 1."
            value={form.reloc}
            error={errors.reloc}
            onChange={(v) => set("reloc", v)}
          />
          <MoneyField
            label="Bonus you give up"
            help="A bonus from your current employer that you would forfeit by leaving. Charged in month 1."
            value={form.lost}
            error={errors.lost}
            onChange={(v) => set("lost", v)}
          />
          <MoneyField
            label="Joining bonus"
            help="Paid by the new employer in your first month working there."
            value={form.join}
            error={errors.join}
            onChange={(v) => set("join", v)}
          />
        </div>
      </Section>

      <Disclosure
        title="Advanced assumptions"
        hint="projection length, pay growth, inflation"
      >
        <p className="muted small">
          These defaults are placeholders, not forecasts. Pay and costs change
          once a year in this model.
        </p>
        <div className="grid-2 mt">
          <Horizon form={form} errors={errors} set={set} />
          <PercentField
            label="Expense inflation per year"
            help="How fast living costs rise. Applied to both scenarios."
            value={form.inflation}
            error={errors.inflation}
            onChange={(v) => set("inflation", v)}
          />
          <PercentField
            label="Current job pay growth per year"
            value={form.curGrowth}
            error={errors.curGrowth}
            onChange={(v) => set("curGrowth", v)}
          />
          <PercentField
            label="New job pay growth per year"
            value={form.newGrowth}
            error={errors.newGrowth}
            onChange={(v) => set("newGrowth", v)}
          />
        </div>
      </Disclosure>
    </>
  );
}

function Horizon({ form, errors, set }: Props) {
  return (
    <MonthsField
      label="Projection length"
      help="Between 12 and 120 months."
      value={form.horizon}
      error={errors.horizon}
      onChange={(v) => set("horizon", v)}
    />
  );
}
