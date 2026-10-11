import { SAMPLE, type FormState } from "./form";

/**
 * Shareable scenario links.
 *
 * The inputs travel in the URL fragment (`#/app?curPay=...`), which browsers
 * never send to a server, so sharing a link does not upload anything. Only
 * values that differ from the sample are included, so links stay short.
 */

const KEYS = Object.keys(SAMPLE) as (keyof FormState)[];

// Numbers only: digits, one optional leading minus, a decimal point. Keeps a
// crafted link from putting anything unexpected into an input.
const SAFE_VALUE = /^-?\d{0,15}(\.\d{0,6})?$/;

/** Query string (without "?") describing every field that differs from the sample. */
export function encodeForm(form: FormState): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    if (form[key] !== SAMPLE[key]) params.set(key, form[key]);
  }
  return params.toString();
}

/**
 * Rebuild a form from a link. Returns null when the link carries no scenario.
 * Unknown keys and unsafe values are ignored; the normal validation still runs
 * on whatever is loaded.
 */
export function decodeForm(params: URLSearchParams): FormState | null {
  let found = false;
  const form: FormState = { ...SAMPLE };
  for (const key of KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    if (!SAFE_VALUE.test(value)) continue;
    form[key] = value;
    found = true;
  }
  return found ? form : null;
}

/** Absolute URL for the current page that reopens this scenario. */
export function scenarioLink(form: FormState, location: Pick<Location, "origin" | "pathname">) {
  const query = encodeForm(form);
  return `${location.origin}${location.pathname}#/app${query ? `?${query}` : ""}`;
}
