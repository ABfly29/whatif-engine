import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { resetEngineClient } from "../src/lib/engineClient";
import { FakeWorker } from "./fakeWorker";
import type { CareerResponse, SensitivityResponse } from "../src/lib/types";

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return { ...actual, compareCareer: vi.fn(), careerSensitivity: vi.fn() };
});
import { careerSensitivity, compareCareer } from "../src/lib/api";

const annual = (year: number, income: string) => ({
  year,
  total_income: income,
  total_expenses: "600000.00",
  relocation_costs: "0.00",
  lost_bonus: "0.00",
  joining_bonus: "0.00",
  net_savings: "100000.00",
  ending_cash: "400000.00",
});

// Test fixture only; the real app never fabricates results.
const FIXTURE: CareerResponse = {
  summary: {
    stay_ending_cash: "1000000.00",
    switch_ending_cash: "1250000.00",
    ending_cash_difference: "250000.00",
    break_even_month: 9,
    stay_lowest_cash: "300000.00",
    switch_lowest_cash: "-50000.00",
    stay_first_negative_month: null,
    switch_first_negative_month: 2,
  },
  months: [1, 2, 3].map((month) => ({
    month,
    stay_income: "100000.00",
    stay_expenses: "40000.00",
    stay_cash: "360000.00",
    switch_income: "0.00",
    switch_expenses: "45000.00",
    switch_cash: "255000.00",
    switch_relocation: "0.00",
    switch_lost_bonus: "0.00",
    switch_joining_bonus: "0.00",
  })),
  stay_annual: [annual(1, "1200000.00")],
  switch_annual: [annual(1, "1500000.00")],
};
const SENS: SensitivityResponse = {
  rows: [
    {
      new_salary_growth_rate: "0.05",
      expense_inflation_rate: "0.04",
      employment_gap_months: 0,
      stay_ending_cash: "1000000.00",
      switch_ending_cash: "900000.00",
      ending_cash_difference: "-100000.00",
      switch_lowest_cash: "100000.00",
      switch_first_negative_month: null,
    },
  ],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// Section <header>s also map to the banner role in jsdom, so target the site bar.
const siteHeader = () => document.querySelector(".site-header") as HTMLElement;

beforeEach(() => {
  // The calculator warms the engine on mount; give it a fake worker.
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.mocked(compareCareer).mockReset().mockResolvedValue(FIXTURE);
  vi.mocked(careerSensitivity).mockReset().mockResolvedValue(SENS);
});

afterEach(() => {
  resetEngineClient();
  vi.unstubAllGlobals();
});

describe("landing page", () => {
  it("shows the headline and primary calls to action", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Make your next big financial move with clarity.",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Run a comparison" })[0]).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "See how it works" })).toBeInTheDocument();
    expect(screen.getByText(/No sign-up required/)).toBeInTheDocument();
  });

  it("scrolls to a section from an in-page link without changing the route", async () => {
    const user = userEvent.setup();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderAt("/");
    await user.click(screen.getByRole("link", { name: "See how it works" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect((scroll.mock.contexts.at(-1) as HTMLElement).id).toBe("how");
    scroll.mockRestore();
  });

  it("returns to the landing section when the link is used from the calculator", async () => {
    const user = userEvent.setup();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderAt("/app");
    const nav = within(siteHeader()).getByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("link", { name: "About" }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Make your next big financial move",
    );
    await waitFor(() =>
      expect((scroll.mock.contexts.at(-1) as HTMLElement | undefined)?.id).toBe("about"),
    );
    scroll.mockRestore();
  });

  it("explains the product with a labelled comparison illustration", () => {
    renderAt("/");
    expect(screen.getByText(/Illustration, not your numbers/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Switch path dips below Stay/ })).toBeInTheDocument();
  });

  it("has the required sections and marks future categories as coming soon", () => {
    renderAt("/");
    for (const name of [
      "From a gut feeling to a clear comparison",
      "Start with a career move",
      "Clear about what this is, and what it is not",
      "Ready to compare your options?",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("states assumptions and limitations", () => {
    renderAt("/");
    expect(screen.getByText(/not a forecast, a guarantee/i)).toBeInTheDocument();
    expect(screen.getByText(/Pay is take-home/i, { selector: "li" })).toBeInTheDocument();
  });
});

describe("header and footer", () => {
  it("offers navigation and a calculator CTA", () => {
    renderAt("/");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(main).toHaveTextContent("How it works");
    expect(main).toHaveTextContent("What you can compare");
    expect(main).toHaveTextContent("About");
    const cta = screen.getAllByRole("link", { name: "Try the calculator" })[0];
    expect(cta).toHaveAttribute("href", "/app");
  });

  it("toggles the mobile menu accessibly and closes on Escape", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const btn = screen.getByRole("button", { name: "Open menu" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps the footer disclaimer on every page", async () => {
    renderAt("/app");
    expect(await screen.findByText(/not financial, tax or investment advice/i)).toBeInTheDocument();
  });

  it("renders a grouped footer after the page content, outside <main>", () => {
    renderAt("/");
    const footer = screen.getByRole("contentinfo");
    expect(screen.getByRole("main")).not.toContainElement(footer);
    const nav = within(footer).getByRole("navigation", { name: "Footer" });
    expect(within(nav).getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "Transparency" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Calculator" })).toHaveAttribute("href", "/app");
    expect(within(footer).getByText(/results are not guarantees/i)).toBeInTheDocument();
  });

  it("shows the header CTA on the landing page", () => {
    renderAt("/");
    const header = siteHeader();
    expect(within(header).getByRole("link", { name: "Try the calculator" })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("hides the header CTA on the calculator, desktop and mobile menu", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const header = siteHeader();
    expect(within(header).queryByRole("link", { name: "Try the calculator" })).toBeNull();
    await user.click(within(header).getByRole("button", { name: "Open menu" }));
    expect(within(header).queryByRole("link", { name: "Try the calculator" })).toBeNull();
  });

  it("keeps the logo and nav links on the calculator, with the logo going home", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const header = siteHeader();
    const nav = within(header).getByRole("navigation", { name: "Main" });
    for (const name of ["How it works", "What you can compare", "About"]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    const logo = within(header).getByRole("link", { name: "WhatIf home" });
    expect(logo).toHaveAttribute("href", "/");
    await user.click(logo);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Make your next big financial move with clarity.",
      }),
    ).toBeInTheDocument();
    // CTA returns once back on the landing page.
    expect(
      within(siteHeader()).getByRole("link", { name: "Try the calculator" }),
    ).toBeInTheDocument();
  });

  it("closes the mobile menu after navigating from it", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const header = siteHeader();
    await user.click(within(header).getByRole("button", { name: "Open menu" }));
    const mobile = within(header).getByRole("navigation", { name: "Mobile" });
    await user.click(within(mobile).getByRole("link", { name: "Try the calculator" }));
    expect(await screen.findByRole("heading", { name: "Stay or switch?" })).toBeInTheDocument();
    expect(
      within(siteHeader()).getByRole("button", { name: "Open menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates from the header CTA to the calculator", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getAllByRole("link", { name: "Try the calculator" })[0]);
    expect(await screen.findByRole("heading", { name: "Stay or switch?" })).toBeInTheDocument();
  });
});

describe("decision workspace", () => {
  it("labels sample data and renders engine results", async () => {
    renderAt("/app");
    expect(await screen.findByText(/sample numbers, not yours/i)).toBeInTheDocument();
    expect(await screen.findByText(/₹2,50,000 better off/)).toBeInTheDocument();
    expect(screen.getByText("Month 9")).toBeInTheDocument();
    expect(screen.getByText(/drops below zero in month 2/)).toBeInTheDocument();
    expect(compareCareer).toHaveBeenCalledTimes(1);
  });

  it("sends the edited value to the API after the user types", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/better off/);
    const pay = screen.getAllByLabelText("Annual take-home pay")[1];
    await user.clear(pay);
    await user.type(pay, "2000000");
    await waitFor(() => {
      const last = vi.mocked(compareCareer).mock.calls.at(-1)![0];
      expect(last.new_job.annual_take_home).toBe("2000000");
    });
  });

  it("blocks the request and explains when required pay is missing", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/better off/);
    vi.mocked(compareCareer).mockClear();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(await screen.findByText(/Enter your current take-home pay/)).toBeInTheDocument();
    expect(screen.getByText(/Fix the highlighted fields/)).toBeInTheDocument();
    expect(screen.queryByText(/better off/)).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 450));
    expect(compareCareer).not.toHaveBeenCalled();
  });

  it("shows API errors instead of failing silently", async () => {
    vi.mocked(compareCareer).mockRejectedValue(
      new Error("Could not reach the calculation service."),
    );
    renderAt("/app");
    expect(await screen.findByRole("alert")).toHaveTextContent(/calculation service/);
  });

  it("loads sensitivity only when the section is opened", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/better off/);
    expect(careerSensitivity).not.toHaveBeenCalled();
    await user.click(screen.getByText(/How sensitive is this result/));
    await waitFor(() => expect(careerSensitivity).toHaveBeenCalled());
    expect(
      await screen.findByRole("region", { name: /Sensitivity analysis/ }),
    ).toBeInTheDocument();
  });
});

describe("engine warm-up and progress", () => {
  it("starts loading the engine when someone hovers the calculator CTA, once", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(FakeWorker.instances).toHaveLength(0);
    const cta = screen.getAllByRole("link", { name: "Run a comparison" })[0];
    await user.hover(cta);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.last().posted[0].kind).toBe("__warmup");
    await user.unhover(cta);
    await user.hover(cta);
    expect(FakeWorker.last().posted).toHaveLength(1);
  });

  it("also warms on keyboard focus", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.tab(); // skip link
    const header = siteHeader();
    within(header).getByRole("link", { name: "Try the calculator" }).focus();
    expect(FakeWorker.last().posted[0].kind).toBe("__warmup");
  });

  it("does not load the engine just by viewing the landing page", () => {
    renderAt("/");
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("shows real download progress in the calculator, then the result", async () => {
    vi.mocked(compareCareer).mockReturnValue(new Promise(() => {}));
    renderAt("/app");
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    FakeWorker.last().reply({ type: "progress", loaded: 5_242_880, total: 10_485_760 });
    expect(await screen.findByText(/Loading the calculation engine/)).toBeInTheDocument();
    expect(screen.getByText(/50% · 5\.0 of 10\.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
    FakeWorker.last().reply({ type: "ready" });
    await waitFor(() =>
      expect(screen.queryByText(/Loading the calculation engine/)).not.toBeInTheDocument(),
    );
  });

  it("shows an indeterminate bar before the size is known", async () => {
    vi.mocked(compareCareer).mockReturnValue(new Promise(() => {}));
    renderAt("/app");
    expect(await screen.findByText(/Loading the calculation engine/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  });
});
