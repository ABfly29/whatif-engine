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

// Plain functions so these tests can observe a click without generating a real PDF.
let reportCalls: { request: { new_job: { annual_take_home: string } }; result: unknown }[] = [];
vi.mock("../src/lib/report/download", async (orig) => ({
  ...(await orig<typeof import("../src/lib/report/download")>()),
  downloadReport: async (input: (typeof reportCalls)[number]) => {
    reportCalls.push(input);
    return "whatif-report-test.pdf";
  },
  warmReport: () => {},
}));

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

// Nothing is calculated until this is pressed.
const calculate = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Calculate" }));

beforeEach(() => {
  reportCalls = [];
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
    expect(screen.getAllByText("Coming soon")).toHaveLength(1);
    expect(screen.getAllByText("Available")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Open the simulator/ })).toHaveAttribute("href", "/expenses");
    expect(screen.getByRole("link", { name: /Open the calculator/ })).toHaveAttribute("href", "/app");
  });

  it("states assumptions and limitations", () => {
    renderAt("/");
    expect(screen.getByText(/not a forecast, a guarantee/i)).toBeInTheDocument();
    expect(screen.getByText(/Pay is take-home/i, { selector: "li" })).toBeInTheDocument();
  });
});

describe("header and footer", () => {
  it("offers section navigation without a repeated calculator button", () => {
    renderAt("/");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(main).toHaveTextContent("How it works");
    expect(main).toHaveTextContent("What you can compare");
    expect(main).toHaveTextContent("About");
    // The calculators are reached from the landing page itself, not from a header button.
    expect(screen.queryByRole("link", { name: "Try the calculator" })).toBeNull();
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

  it("widens the shared layout on the calculator only", async () => {
    const { unmount } = renderAt("/");
    expect(document.querySelector(".layout")).not.toHaveClass("layout--wide");
    unmount();
    renderAt("/app");
    // First test to load the lazily imported calculator, so allow a cold import.
    await screen.findByRole("heading", { name: "Stay or switch?" }, { timeout: 10_000 });
    expect(document.querySelector(".layout")).toHaveClass("layout--wide");
    // Header, content and footer all sit inside the widened layout.
    expect(document.querySelector(".layout--wide .site-header")).not.toBeNull();
    expect(document.querySelector(".layout--wide .site-footer")).not.toBeNull();
  });

  it("has no calculator button in the header or mobile menu on any page", async () => {
    const user = userEvent.setup();
    for (const path of ["/", "/app", "/expenses"]) {
      const { unmount } = renderAt(path);
      const header = siteHeader();
      expect(within(header).queryByRole("link", { name: "Try the calculator" })).toBeNull();
      await user.click(within(header).getByRole("button", { name: "Open menu" }));
      const mobile = within(header).getByRole("navigation", { name: "Mobile" });
      expect(within(mobile).queryByRole("link", { name: "Try the calculator" })).toBeNull();
      // The mobile menu holds only the section links.
      expect(within(mobile).getAllByRole("link").map((l) => l.textContent)).toEqual([
        "How it works",
        "What you can compare",
        "About",
      ]);
      unmount();
    }
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
  });

  it("closes the mobile menu after navigating from it", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const header = siteHeader();
    await user.click(within(header).getByRole("button", { name: "Open menu" }));
    const mobile = within(header).getByRole("navigation", { name: "Mobile" });
    // A section link from the calculator is a route change back to the landing page.
    await user.click(within(mobile).getByRole("link", { name: "About" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Make your next big financial move with clarity.",
      }),
    ).toBeInTheDocument();
    expect(
      within(siteHeader()).getByRole("button", { name: "Open menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("reaches each calculator from the landing page cards", async () => {
    const user = userEvent.setup();
    const first = renderAt("/");
    await user.click(screen.getByRole("link", { name: /Open the calculator/ }));
    expect(await screen.findByRole("heading", { name: "Stay or switch?" })).toBeInTheDocument();
    first.unmount();

    renderAt("/");
    await user.click(screen.getByRole("link", { name: /Open the simulator/ }));
    expect(
      await screen.findByRole("heading", { name: "Can your finances carry this purchase?" }),
    ).toBeInTheDocument();
  });
});

describe("decision workspace", () => {
  it("opens with the sample inputs and a prompt, and does not calculate by itself", async () => {
    renderAt("/app");
    expect(await screen.findByText(/sample numbers, not yours/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready when you are/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate" })).toBeEnabled();
    // Give any stray automatic request time to show up before asserting there is none.
    await new Promise((r) => setTimeout(r, 450));
    expect(compareCareer).not.toHaveBeenCalled();
    expect(screen.queryByText(/better off/)).not.toBeInTheDocument();
  });

  it("labels sample data and renders engine results when Calculate is pressed", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    expect(await screen.findByText(/₹2,50,000 better off/)).toBeInTheDocument();
    expect(screen.getByText("Month 9")).toBeInTheDocument();
    expect(screen.getByText(/drops below zero in month 2/)).toBeInTheDocument();
    expect(compareCareer).toHaveBeenCalledTimes(1);
  });

  it("does not call the API while typing, and sends the latest values once on Calculate", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const pay = (await screen.findAllByLabelText("Annual take-home pay"))[1];
    await user.clear(pay);
    await user.type(pay, "2000000");
    await user.clear(screen.getAllByLabelText("Annual take-home pay")[0]);
    await user.type(screen.getAllByLabelText("Annual take-home pay")[0], "950000");
    await new Promise((r) => setTimeout(r, 450));
    expect(compareCareer).not.toHaveBeenCalled();

    await calculate(user);
    await screen.findByText(/better off/);
    expect(compareCareer).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(compareCareer).mock.calls[0][0];
    expect(sent.new_job.annual_take_home).toBe("2000000");
    expect(sent.current_job.annual_take_home).toBe("950000");
  });

  it("submits with the Enter key from an input", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const pay = (await screen.findAllByLabelText("Annual take-home pay"))[1];
    await user.clear(pay);
    await user.type(pay, "1750000{Enter}");
    await screen.findByText(/better off/);
    expect(compareCareer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(compareCareer).mock.calls[0][0].new_job.annual_take_home).toBe("1750000");
  });

  it("disables the button and shows progress while calculating, and ignores a second press", async () => {
    const user = userEvent.setup();
    let finish!: (r: CareerResponse) => void;
    vi.mocked(compareCareer).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    const button = screen.getByRole("button", { name: "Calculate" });
    await user.dblClick(button);
    const busy = await screen.findByRole("button", { name: "Calculating…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    await user.keyboard("{Enter}");
    expect(compareCareer).toHaveBeenCalledTimes(1);
    finish(FIXTURE);
    expect(await screen.findByText(/better off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate" })).toBeEnabled();
  });

  it("blocks the request and shows field errors when required pay is missing", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    // Nothing is flagged until someone tries to calculate.
    expect(screen.queryByText(/Enter your current take-home pay/)).not.toBeInTheDocument();
    await calculate(user);
    expect(await screen.findByText(/Enter your current take-home pay/)).toBeInTheDocument();
    expect(screen.getByText(/Fix the highlighted fields/)).toBeInTheDocument();
    expect(screen.queryByText(/better off/)).not.toBeInTheDocument();
    // Focus moves to the first field that needs fixing.
    await waitFor(() =>
      expect(screen.getAllByLabelText("Annual take-home pay")[0]).toHaveFocus(),
    );
    await new Promise((r) => setTimeout(r, 450));
    expect(compareCareer).not.toHaveBeenCalled();
  });

  it("keeps the previous result visible but marked out of date after an edit", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    await screen.findByText(/₹2,50,000 better off/);
    expect(screen.queryByText(/These results are out of date/)).not.toBeInTheDocument();

    await user.type(screen.getAllByLabelText("Annual take-home pay")[1], "0");
    expect(await screen.findByText(/These results are out of date/)).toBeInTheDocument();
    // The old figures stay readable, and nothing was requested.
    expect(screen.getByText(/₹2,50,000 better off/)).toBeInTheDocument();
    expect(compareCareer).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".stack")).toHaveAttribute("data-stale", "true");

    // Recalculating clears the warning and uses the new value.
    await calculate(user);
    await waitFor(() => expect(compareCareer).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(/These results are out of date/)).not.toBeInTheDocument(),
    );
    expect(vi.mocked(compareCareer).mock.calls[1][0].new_job.annual_take_home).toBe("16000000");
  });

  it("shows API errors instead of failing silently, keeping the form usable", async () => {
    const user = userEvent.setup();
    vi.mocked(compareCareer).mockRejectedValue(
      new Error("Could not reach the calculation service."),
    );
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/calculation service/);
    expect(screen.getByRole("button", { name: "Calculate" })).toBeEnabled();
  });

  it("loads sensitivity only when the section is opened", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    await screen.findByText(/better off/);
    expect(careerSensitivity).not.toHaveBeenCalled();
    await user.click(screen.getByText(/How sensitive is this result/));
    await waitFor(() => expect(careerSensitivity).toHaveBeenCalled());
    expect(
      await screen.findByRole("region", { name: /Sensitivity analysis/ }),
    ).toBeInTheDocument();
  });

  it("does not re-run sensitivity while the inputs are edited", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    await screen.findByText(/better off/);
    await user.click(screen.getByText(/How sensitive is this result/));
    await waitFor(() => expect(careerSensitivity).toHaveBeenCalledTimes(1));
    await user.type(screen.getAllByLabelText("Annual take-home pay")[1], "5");
    await new Promise((r) => setTimeout(r, 450));
    expect(careerSensitivity).toHaveBeenCalledTimes(1);
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
    screen.getAllByRole("link", { name: "Run a comparison" })[0].focus();
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
    expect(await screen.findByText(/Downloading the calculation engine/)).toBeInTheDocument();
    expect(screen.getByText(/50% · 5\.0 of 10\.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
    FakeWorker.last().reply({ type: "ready" });
    await waitFor(() =>
      expect(screen.queryByText(/calculation engine…/)).not.toBeInTheDocument(),
    );
  });

  it("shows an indeterminate bar before the size is known", async () => {
    vi.mocked(compareCareer).mockReturnValue(new Promise(() => {}));
    renderAt("/app");
    expect(await screen.findByText(/Downloading the calculation engine/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  });
});

describe("shareable links", () => {
  it("opens a shared scenario from the link, and calculates it only when asked", async () => {
    const user = userEvent.setup();
    renderAt("/app?curPay=900000&newPay=2000000&gap=2");
    await screen.findByText(/Ready when you are/);
    await new Promise((r) => setTimeout(r, 450));
    expect(compareCareer).not.toHaveBeenCalled();
    await calculate(user);
    await waitFor(() => expect(compareCareer).toHaveBeenCalledTimes(1));
    const req = vi.mocked(compareCareer).mock.calls.at(-1)![0];
    expect(req.current_job.annual_take_home).toBe("900000");
    expect(req.new_job.annual_take_home).toBe("2000000");
    expect(req.employment_gap_months).toBe(2);
    // Untouched fields keep their sample values; it is no longer "the sample".
    expect(req.new_costs.rent).toBe("25000");
    expect(screen.queryByText(/sample numbers, not yours/i)).not.toBeInTheDocument();
  });

  it("ignores junk in a link and falls back to the sample", async () => {
    renderAt("/app?curPay=<script>&zzz=1");
    expect(await screen.findByText(/sample numbers, not yours/i)).toBeInTheDocument();
  });

  it("cannot share until the result matches the inputs", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const share = await screen.findByRole("button", { name: "Copy link to this scenario" });
    expect(share).toBeDisabled();
    expect(screen.getByText(/Calculate first/)).toBeInTheDocument();
    await calculate(user);
    await screen.findByText(/better off/);
    await waitFor(() => expect(share).toBeEnabled());
    await user.type(screen.getAllByLabelText("Annual take-home pay")[0], "0");
    expect(share).toBeDisabled();
  });

  it("copies a link that reopens the calculated scenario", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAt("/app");
    const pay = (await screen.findAllByLabelText("Annual take-home pay"))[0];
    await user.clear(pay);
    await user.type(pay, "875000");
    await calculate(user);
    await screen.findByText(/better off/);
    await user.click(screen.getByRole("button", { name: "Copy link to this scenario" }));
    expect(writeText).toHaveBeenCalledOnce();
    const link = new URL(writeText.mock.calls[0][0]);
    expect(link.hash).toMatch(/^#\/app\?/);
    expect(new URLSearchParams(link.hash.split("?")[1]).get("curPay")).toBe("875000");
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
  });

  it("shows the link to copy by hand when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    await screen.findByText(/better off/);
    await user.click(await screen.findByRole("button", { name: "Copy link to this scenario" }));
    const field = await screen.findByLabelText("Link to this scenario");
    expect((field as HTMLInputElement).value).toContain("#/app");
  });

  it("says the engine is starting once the download is complete, not '100%'", async () => {
    vi.mocked(compareCareer).mockReturnValue(new Promise(() => {}));
    renderAt("/app");
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    FakeWorker.last().reply({ type: "progress", loaded: 10_485_760, total: 10_485_760 });
    FakeWorker.last().reply({ type: "stage", stage: "start" });
    expect(await screen.findByText(/Starting the calculation engine/)).toBeInTheDocument();
    expect(screen.getByText(/Download complete/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  });
});

describe("PDF report button in the calculator", () => {
  const reportButton = () => screen.queryByRole("button", { name: "Download PDF Report" });
  const calculated = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    return screen.findByRole("button", { name: "Download PDF Report" });
  };

  it("appears below the results after a successful calculation", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const button = await calculated(user);
    // It sits after the headline numbers and chart, inside the results column.
    const results = document.querySelector(".ws-results")!;
    expect(results).toContainElement(button);
    const verdict = screen.getByText(/better off/);
    expect(verdict.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is not shown before anything has been calculated", async () => {
    renderAt("/app");
    await screen.findByText(/Ready when you are/);
    expect(reportButton()).toBeNull();
  });

  it("is not shown when the inputs are invalid", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await calculated(user);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await calculate(user);
    await screen.findByText(/Fix the highlighted fields/);
    // The old result is out of date, so it cannot be exported either.
    expect(reportButton()).toBeNull();
  });

  it("is not shown when the first calculation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(compareCareer).mockRejectedValue(new Error("Could not reach the calculation service."));
    renderAt("/app");
    await screen.findByText(/sample numbers, not yours/i);
    await calculate(user);
    await screen.findByRole("alert");
    expect(reportButton()).toBeNull();
  });

  it("cannot export a stale result: hidden as soon as an input changes, back after recalculating", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    await calculated(user);
    await user.type(screen.getAllByLabelText("Annual take-home pay")[1], "0");
    // The old result is still on screen, but a report built now would mix the
    // new inputs with the old result.
    expect(reportButton()).toBeNull();
    expect(screen.getByText(/PDF download and link sharing are paused/)).toBeInTheDocument();
    await calculate(user);
    expect(await screen.findByRole("button", { name: "Download PDF Report" })).toBeInTheDocument();
  });

  it("generates the report from the inputs that were calculated and the engine's result", async () => {
    const user = userEvent.setup();
    renderAt("/app");
    const pay = (await screen.findAllByLabelText("Annual take-home pay"))[1];
    await user.clear(pay);
    await user.type(pay, "2100000");
    await calculate(user);
    await user.click(await screen.findByRole("button", { name: "Download PDF Report" }));

    await waitFor(() => expect(reportCalls).toHaveLength(1));
    expect(reportCalls[0].request.new_job.annual_take_home).toBe("2100000");
    // The very object the engine returned (the mocked engine resolves FIXTURE), not a copy.
    expect(reportCalls[0].result).toBe(FIXTURE);
    expect(await screen.findByText(/Downloaded whatif-report-test\.pdf/)).toBeInTheDocument();
  });
});
