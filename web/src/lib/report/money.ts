/**
 * Exact decimal helpers for the report.
 *
 * The engine returns money as decimal strings with two places ("2762167.20").
 * Where the report needs a total of those figures, they are added as integer
 * paise (BigInt) so there is no floating-point drift. This only adds up numbers
 * the engine already produced; no financial modelling happens here.
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** "1234.5" -> 123450n. Throws on anything that is not a plain decimal. */
export function toPaise(value: string): bigint {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new Error(`Not a decimal amount: "${value}"`);
  const [, sign, whole, fraction = ""] = match;
  // Round half away from zero at the third decimal, though the engine only sends two.
  const padded = (fraction + "00").slice(0, 2);
  const extra = fraction.length > 2 && fraction[2] >= "5" ? 1n : 0n;
  const paise = BigInt(whole) * 100n + BigInt(padded) + extra;
  return sign === "-" ? -paise : paise;
}

/** 123450n -> "1234.50" */
export function fromPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function sumAmounts(values: readonly string[]): string {
  return fromPaise(values.reduce((total, v) => total + toPaise(v), 0n));
}

export const isZeroAmount = (value: string): boolean => toPaise(value) === 0n;
