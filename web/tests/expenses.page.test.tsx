import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { resetEngineClient } from "../src/lib/engineClient";
import type { ExpenseResponse } from "../src/lib/types";
import fixture from "./fixtures/expense.json";
import { FakeWorker } from "./fakeWorker";

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return { ...actual, simulateExpense: vi.fn(), compareCareer: vi.fn(), careerSensitivity: vi.fn() };
});
import { simulateExpense } from "../src/lib/api";

// The first test pays for the lazy import of the page and chart library; on a loaded
// machine that can pass vitest's default 5s limit even though the page itself is fine.
vi.setConfig({ testTimeout: 30_000 });

// Produced by the real engine: python scripts/make_expense_fixture.py
const RESPONSE = fixture.response as ExpenseResponse;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.mocked(simulateExpense).mockReset().mockResolvedValue(RESPONSE);
});
afterEach(() => {
  resetEngineClient();
  vi.unstubAllGlobals();
});

const open = async () => {
  renderAt("/expenses");
  await screen.findByRole("table", { name: "Monthly picture" }, { timeout: 10_000 });
};
const row = (table: HTMLElement, label: string) =>
  within(table).getByRole("row", { name: new RegExp(`^${label}`) });

describe("major expense page", () => {
  it("opens with labelled sample numbers and calculates from them", async () => {
    await open();
    expect(
      screen.getByRole("heading", { level: 1, name: "Can your finances carry this purchase?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/These are sample numbers, not yours/)).toBeInTheDocument();
    const req = vi.mocked(simulateExpense).mock.calls[0][0];
    expect(req.purchase_price).toBe("1000000");
    expect(req.loan_annual_rate).toBe("0.09");
  });

  it("shows EMI, interest, surplus and cover in Indian format for every option", async () => {
    await open();
    const table = screen.getByRole("table", { name: "Monthly picture" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Measure",
      "No purchase",
      "Buy now",
      "Buy in 12 months",
      "Cheaper option now",
    ]);
    expect(row(table, "Monthly EMI")).toHaveTextContent("₹16,607");
    expect(row(table, "Total interest over the loan")).toHaveTextContent("₹1,96,401");
    expect(row(table, "Paid upfront")).toHaveTextContent("₹2,00,000");
    expect(row(table, "Loan amount")).toHaveTextContent("₹8,00,000");
    expect(row(table, "Cash left after the upfront payment")).toHaveTextContent("₹4,00,000");
    expect(row(table, "Months of expenses that cash covers")).toHaveTextContent("4.8 months");
    expect(row(table, "Monthly surplus after the purchase")).toHaveTextContent("₹16,893");
  });

  it("shows the chosen horizon with net worth, loan and resale shown separately", async () => {
    await open();
    const table = screen.getByRole("table", { name: "After 3 years" });
    for (const label of [
      "Liquid savings",
      "Loan still owed",
      "Estimated resale value",
      "Net worth",
      "Net worth vs no purchase",
      "Ownership cost",
    ]) {
      expect(within(table).getAllByRole("rowheader", { name: new RegExp(`^${label}`) })[0]).toBeInTheDocument();
    }
    expect(row(table, "Net worth vs no purchase")).toHaveTextContent("−₹9,82,267");
    // The other years are available but collapsed.
    expect(screen.getAllByText("After 1 year").length).toBeGreaterThan(0);
    expect(screen.getAllByText("After 5 years").length).toBeGreaterThan(0);
  });

  it("shows a repaid loan as ₹0 and no loan as a dash", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getAllByText("After 5 years")[0]);
    const table = screen.getByRole("table", { name: "After 5 years" });
    // Buy now is repaid by month 60: ₹0 owed, not "not applicable".
    const cells = within(row(table, "Loan still owed")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("—"); // no purchase: there never was a loan
    expect(cells[1]).toBe("₹0");
  });

  it("surfaces warnings as prompts, never as a verdict", async () => {
    await open();
    expect(screen.getAllByText(/the purchase costs would take .*% of what you currently save/).length).toBe(3);
    expect(screen.queryByText(/affordable|safe to buy|you can afford it|can comfortably/i)).toBeNull();
  });

  it("explains delaying and the terms in plain English", async () => {
    await open();
    expect(screen.getByText(/price is assumed\s+to rise to ₹10.5 lakh/)).toBeInTheDocument();
    expect(screen.getByText(/Equated Monthly Instalment/)).toBeInTheDocument();
    expect(screen.getByText(/Outstanding principal/)).toBeInTheDocument();
  });

  it("discloses assumptions and says what is not modelled", async () => {
    await open();
    expect(screen.getByText(/no interest or investment return is assumed/)).toBeInTheDocument();
    expect(screen.getByText(/The vehicle loses 15% of its value each year/)).toBeInTheDocument();
    expect(screen.getByText(/Real resale values vary/)).toBeInTheDocument();
    expect(screen.getByText(/do not say whether you can afford the purchase/)).toBeInTheDocument();
  });

  it("switches the chart between liquid savings and net worth", async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.getByRole("heading", { name: "Liquid savings over time" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Net worth" }));
    expect(screen.getByRole("heading", { name: "Net worth over time" })).toBeInTheDocument();
  });

  it("hides the loan fields and sends a cash request when paying in cash", async () => {
    const user = userEvent.setup();
    await open();
    expect(screen.getByLabelText("Down payment")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Pay in cash" }));
    expect(screen.queryByLabelText("Down payment")).toBeNull();
    await waitFor(
      () => expect(vi.mocked(simulateExpense).mock.calls.at(-1)![0].payment_method).toBe("cash"),
      { timeout: 5000 },
    );
  });

  it("asks for a fix instead of calculating from invalid input", async () => {
    const user = userEvent.setup();
    await open();
    await user.clear(screen.getByLabelText("On-road price"));
    expect(screen.getByText("Fix the highlighted fields to see a result.")).toBeInTheDocument();
    expect(screen.getByText("Enter the on-road price.")).toBeInTheDocument();
  });

  it("reports an engine error", async () => {
    vi.mocked(simulateExpense).mockReset().mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("Engine said no.")), 0)),
    );
    renderAt("/expenses");
    expect(await screen.findByRole("alert", {}, { timeout: 10_000 })).toHaveTextContent("Engine said no.");
  });
});
