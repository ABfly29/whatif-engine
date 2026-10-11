import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CareerRequest, CareerResponse } from "../src/lib/types";

export type Fixture = { request: CareerRequest; result: CareerResponse };
export const FIXTURES = ["sample", "long", "negative", "minimal"] as const;
export type FixtureName = (typeof FIXTURES)[number];

/** Real engine output written by scripts/make_report_fixtures.py. */
export const loadFixture = (name: FixtureName): Fixture =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", `${name}.json`), "utf8"));

/** A fixed date so generated output is reproducible. */
export const FIXED_DATE = new Date(2026, 9, 11); // 11 October 2026
