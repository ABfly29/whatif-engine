// Display formatting only. No financial calculation happens here.

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** "₹12,34,567" with Indian digit grouping; accepts the API's decimal strings. */
export function inr(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  // Avoid "-₹0" for tiny negatives that round to zero.
  const rounded = Math.round(n);
  return INR.format(rounded === 0 ? 0 : rounded).replace("-₹", "−₹");
}

/** Compact form for chart axes: ₹12L, ₹1.2Cr. */
export function inrCompact(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** Fraction string from the API ("0.091") to a percent label ("9.1%"). */
export function fractionToPercent(fraction: string): string {
  const pct = Number(fraction) * 100;
  return `${Number(pct.toFixed(2))}%`;
}

/** Form percent ("9.1") to the fraction string the API expects ("0.091"). */
export function percentToFraction(percent: string): string {
  const n = Number(percent) / 100;
  return String(Number(n.toFixed(6)));
}

export function monthsToYears(months: number): string {
  const years = months / 12;
  return `${Number(years.toFixed(1))} ${years === 1 ? "year" : "years"}`;
}
