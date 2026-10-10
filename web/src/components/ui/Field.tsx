import { useId } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  /** "₹" prefix or "%" suffix. */
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  name?: string;
}

/** Text input with label, inline help and an error message tied by aria. */
export function Field({
  label,
  value,
  onChange,
  help,
  error,
  prefix,
  suffix,
  placeholder = "0",
  inputMode = "decimal",
  name,
}: Props) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [help && helpId, error && errId].filter(Boolean).join(" ");

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-wrap" data-invalid={error ? "true" : "false"}>
        {prefix && <span className="input-wrap__affix" aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          name={name}
          value={value}
          inputMode={inputMode}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="input-wrap__affix" aria-hidden="true">{suffix}</span>}
      </div>
      {error && (
        <span id={errId} className="field__error" role="alert">
          {error}
        </span>
      )}
      {help && (
        <span id={helpId} className="field__help">
          {help}
        </span>
      )}
    </div>
  );
}

type Preset = Omit<Props, "prefix" | "suffix" | "inputMode">;

export const MoneyField = (p: Preset) => <Field {...p} prefix="₹" />;
export const PercentField = (p: Preset) => <Field {...p} suffix="%" />;
export const MonthsField = (p: Preset) => (
  <Field {...p} suffix="months" inputMode="numeric" />
);
