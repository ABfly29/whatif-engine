import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpenseRequest, ExpenseResponse } from "../src/lib/types";

export type ExpenseFixture = { request: ExpenseRequest; result: ExpenseResponse };
export const EXPENSE_FIXTURES = ["expense", "expense-cash", "expense-strain"] as const;
export type ExpenseFixtureName = (typeof EXPENSE_FIXTURES)[number];

/** Real engine output written by scripts/make_expense_fixture.py. */
export const loadExpenseFixture = (name: ExpenseFixtureName): ExpenseFixture => {
  const raw = JSON.parse(readFileSync(join(__dirname, "fixtures", `${name}.json`), "utf8"));
  return { request: raw.request, result: raw.response };
};
