import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it } from "vitest";
import { expenseReportFileName, generateReportPdf } from "../src/lib/report";
import { buildExpenseReportModel } from "../src/lib/report/expenseModel";
import { generateExpenseReportPdf } from "../src/lib/report/expensePdf";
import { EXPENSE_FIXTURES, loadExpenseFixture, type ExpenseFixtureName } from "./expense.report.helpers";
import { FIXED_DATE, loadFixture } from "./report.helpers";

/** Every string drawn, with the page it was drawn on. Lets tests check real page content. */
let drawn: { page: number; text: string; x: number; y: number }[] = [];

function recordInto(sink: typeof drawn) {
  return (doc: jsPDF) => {
    const original = doc.text.bind(doc);
    doc.text = ((...args: Parameters<jsPDF["text"]>) => {
      const [value, x, y] = args;
      const page = doc.getCurrentPageInfo().pageNumber;
      for (const t of Array.isArray(value) ? value : [value]) {
        sink.push({ page, text: String(t), x: Number(x), y: Number(y) });
      }
      return original(...args);
    }) as jsPDF["text"];
  };
}
const recordText = (doc: jsPDF) => recordInto(drawn)(doc);

beforeEach(() => {
  drawn = [];
});

const input = (name: ExpenseFixtureName) => ({ ...loadExpenseFixture(name), generatedAt: FIXED_DATE });
const build = (name: ExpenseFixtureName) => generateExpenseReportPdf(input(name), { onDocumentCreated: recordText });
const onPage = (page: number) => drawn.filter((d) => d.page === page).map((d) => d.text);
/** The PDF's own text (document info is not compressed), for checking metadata. */
const pdfText = (doc: jsPDF) => new TextDecoder("latin1").decode(new Uint8Array(doc.output("arraybuffer")));
/** Wrapped lines rejoined, so a sentence can be found even where it broke across lines. */
const everything = () => drawn.map((d) => d.text).join(" ").replace(/\s+/g, " ");

describe("expense PDF report", () => {
  it.each(EXPENSE_FIXTURES)("%s: is a short A4 document", async (name) => {
    const doc = await build(name);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(6);
    const size = doc.internal.pageSize;
    expect(size.getWidth()).toBeCloseTo(210, 1);
    expect(size.getHeight()).toBeCloseTo(297, 1);
  });

  it("produces a real PDF file with embedded fonts, entirely local", async () => {
    const doc = await build("expense");
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(bytes.length).toBeLessThan(600_000);
    expect(pdfText(doc)).toContain("/Title (WhatIf Engine: Major expense report)");
  });

  it("paints every page black before drawing, like the career report", async () => {
    for (const name of EXPENSE_FIXTURES) {
      const doc = await build(name);
      const pages = (doc.internal as unknown as { pages: (string[] | undefined)[] }).pages;
      for (let i = 1; i <= doc.getNumberOfPages(); i++) {
        const stream = pages[i]!.join("\n");
        const fill = stream.search(/0\. g\s+0\. [\d.]+ 595\.27\d* -841\.8\d* re\s+f/);
        expect(fill).toBeGreaterThanOrEqual(0);
        expect(stream.indexOf("BT")).toBeGreaterThan(fill);
      }
    }
  });

  it("page 1: branding, date, options, payment, horizon, headline figures and summary", async () => {
    const m = buildExpenseReportModel(input("expense"));
    await build("expense");
    const text = onPage(1);
    expect(text).toContain("WhatIf Engine");
    expect(text.join(" ")).toContain("MAJOR EXPENSE REPORT");
    expect(text).toContain("Buying a vehicle");
    expect(text).toContain(m.generatedOn);
    expect(text).toContain("Loan at 9% a year over 60 months");
    expect(text).toContain("3 years");
    for (const label of Object.values(m.labels)) expect(text.join(" ")).toContain(label);
    // The large figures: net worth for every option, then the difference from not buying.
    for (const f of [...m.hero.netWorth, ...m.hero.difference]) {
      expect(text).toContain(f.value);
      expect(text).toContain(f.label);
    }
    expect(text.join(" ")).toContain("PROJECTED NET WORTH AFTER 3 YEARS");
    expect(text.join(" ")).toContain("DIFFERENCE IN NET WORTH VERSUS NOT BUYING");
    expect(text).toContain(m.hero.differenceNote);
    expect(text).toContain("₹23,39,670");
    expect(text).toContain("−₹9,82,267");
  });

  it("prints every figure of the comparison tables, with the engine's numbers", async () => {
    const m = buildExpenseReportModel(input("expense"));
    await build("expense");
    const strings = new Set(drawn.map((d) => d.text));
    for (const table of [m.monthly, m.outcome, m.horizons]) {
      for (const r of table.rows) for (const cell of r.slice(1)) expect(strings.has(cell), `${table.caption}: ${cell}`).toBe(true);
    }
    // Representative figures, from the Python engine's output for this scenario.
    const text = everything();
    for (const figure of ["₹16,607", "₹17,437", "₹11,625", "₹1,96,401", "₹16,893", "₹4,00,000", "4.8 months", "₹3,63,506", "₹6,14,125"]) {
      expect(text).toContain(figure);
    }
  });

  it("states resale value, outstanding debt and net worth at 1, 3 and 5 years", async () => {
    await build("expense");
    const text = everything();
    for (const label of ["Estimated resale value", "Loan still owed", "Net worth (savings + resale − loan)", "Projected position at each horizon"]) {
      expect(text).toContain(label);
    }
    for (const years of ["1 year", "3 years", "5 years"]) expect(onPage(3).concat(onPage(2)).join(" ")).toContain(years);
  });

  it("lists the inputs, editable assumptions, methodology, terms and limitations", async () => {
    const m = buildExpenseReportModel(input("expense"));
    await build("expense");
    const text = everything();
    for (const group of m.inputs) {
      expect(text).toContain(group.title);
      for (const [label, value] of group.rows) {
        expect(text).toContain(label);
        expect(text).toContain(value);
      }
    }
    expect(text).toContain("Salary grows 6% a year");
    expect(text).toContain("no interest or investment return is assumed");
    expect(text).toContain("The vehicle loses 15% of its value each year");
    expect(text).toContain("Real resale values vary a lot");
    expect(text).toContain("reducing-balance");
    expect(text).toContain("EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1)");
    expect(text).toContain("Equated Monthly Instalment");
    expect(text).toContain("outstanding principal");
    expect(text).toContain("Every figure is an estimate");
  });

  it("never says a purchase is safe or affordable", async () => {
    for (const name of EXPENSE_FIXTURES) {
      drawn = [];
      await build(name);
      const text = everything();
      expect(text).toContain("does not establish whether a purchase is safe or affordable");
      // Any sentence that mentions safety or affordability must be saying the report does not decide it.
      const sentences = text.split(/(?<=[.!?])\s+/).filter((t) => /\baffordable\b|\bsafe\b|can afford/i.test(t));
      expect(sentences.length).toBeGreaterThan(0);
      for (const sentence of sentences) expect(sentence).toMatch(/\b(not|nor|no)\b/i);
    }
  });

  it("strained finances: warnings are printed and the page flow stays intact", async () => {
    const m = buildExpenseReportModel(input("expense-strain"));
    await build("expense-strain");
    const text = everything();
    expect(m.warnings.length).toBeGreaterThanOrEqual(6);
    for (const w of m.warnings) expect(text).toContain(w);
    expect(text).toContain("Warnings are prompts to look closer, not verdicts");
    expect(text).toContain("−₹"); // negative amounts use a true minus
    expect(text).not.toMatch(/-₹/);
  });

  it("the low-cash warning and the negative-cash disclosure are printed, worded exactly as on screen", async () => {
    // Low cash after the purchase (B3)
    await build("expense-lowcash");
    let text = everything();
    const low = buildExpenseReportModel(input("expense-lowcash"));
    expect(low.warnings.some((w) => w.includes("critically low"))).toBe(true);
    for (const w of low.warnings) expect(text).toContain(w);
    expect(text).toContain("you would have ₹5,000 in liquid savings, about 0.1 months of your monthly spending");
    // Delayed vs immediate wording (B1) and the precise percentage (B2)
    expect(text).toContain("62.46% of what you currently save each month");
    expect(text).toContain("61.16% of what you would save then (per month)");
    // Negative cash (disclosure)
    drawn = [];
    await build("expense-strain");
    text = everything();
    expect(text).toContain("The shortfall peaks at ₹11,40,693 in month 60");
    expect(text).toContain("This model charges no interest on a negative balance");
  });

  it("calm finances: says no warnings were triggered, without calling that safe", async () => {
    await build("expense-cash");
    const text = everything();
    expect(text).toContain("No warnings were triggered. That is not a verdict");
    expect(text).toContain("Paid in cash");
    expect(text).toContain("paid in cash, so there is no EMI");
    expect(text).not.toContain("₹16,607");
  });

  it("puts a footer with the date and 'Page n of N' on every page", async () => {
    const doc = await build("expense");
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      expect(onPage(p)).toContain(`Page ${p} of ${total}`);
      expect(onPage(p).join(" ")).toContain("Report generated 11 October 2026");
    }
  });

  it("uses the rupee sign in the embedded font and no dollar amounts", async () => {
    await build("expense");
    const text = everything();
    expect(text).toContain("₹");
    expect(text).not.toMatch(/\$|USD/);
  });

  it("keeps the long comparison table together and every page non-empty", async () => {
    const doc = await build("expense");
    const horizonPages = new Set(
      drawn.filter((d) => d.text === "Buy now" || d.text === "Cheaper option now").filter((d) => /^(No purchase|Buy now|Buy in 12 months|Cheaper option now)$/.test(d.text)).map((d) => d.page),
    );
    expect(horizonPages.size).toBeGreaterThan(0);
    for (let p = 1; p <= doc.getNumberOfPages(); p++) expect(onPage(p).length).toBeGreaterThan(5);
  });

  it("is deterministic apart from the PDF creation timestamp", async () => {
    await build("expense");
    const first = [...drawn];
    drawn = [];
    await build("expense");
    expect(drawn).toEqual(first);
  });

  it("names the file differently from the career report", () => {
    expect(expenseReportFileName({ generatedAt: FIXED_DATE })).toBe("whatif-expense-report-2026-10-11.pdf");
    expect(expenseReportFileName()).toMatch(/^whatif-expense-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("leaves the career report exactly as it was: still three A4 pages with its own title", async () => {
    const doc = await generateReportPdf({ ...loadFixture("sample"), generatedAt: FIXED_DATE });
    expect(doc.getNumberOfPages()).toBe(3);
    expect(pdfText(doc)).toContain("/Title (WhatIf Engine: Stay or switch report)");
  });

  // Developer aid: REPORT_OUT_DIR=some/dir npx vitest run tests/expense.report.pdf.test.ts
  it.skipIf(!process.env.REPORT_OUT_DIR)("writes sample PDFs for visual review", async () => {
    const dir = process.env.REPORT_OUT_DIR!;
    mkdirSync(dir, { recursive: true });
    for (const name of EXPENSE_FIXTURES) {
      const doc = await build(name);
      writeFileSync(join(dir, `${name}.pdf`), Buffer.from(doc.output("arraybuffer")));
    }
  });
});

describe("expense report layout", () => {
  const FOOTER = /^WhatIf Engine {2}· {2}Report generated|^Page \d+ of \d+$/;

  it("the standard scenarios fit four A4 pages; the warning-heavy one needs a fifth for the notes", async () => {
    expect((await build("expense")).getNumberOfPages()).toBe(4);
    expect((await build("expense-cash")).getNumberOfPages()).toBe(4);
    const strained = await build("expense-strain");
    expect(strained.getNumberOfPages()).toBe(5);
    // The extra page carries the end of the notes, not a stray heading or an empty page.
    drawn = [];
    await build("expense-strain");
    const last = drawn.filter((d) => d.page === 5).map((d) => d.text);
    expect(last.join(" ")).toContain("LIMITATIONS");
    expect(last.join(" ")).toContain("does not establish whether a purchase is safe or affordable");
  });

  it("follows the career report's page structure: summary, breakdown, then inputs and notes", async () => {
    await build("expense");
    const page = (n: number) => onPage(n).join(" ");
    expect(page(1)).toContain("EXECUTIVE SUMMARY");
    expect(page(1)).toContain("SUMMARY");
    expect(page(2)).toContain("PROJECTIONS");
    expect(page(2)).toContain("Financial breakdown");
    expect(page(3)).toContain("Projected position at each horizon");
    expect(page(4)).toContain("METHODOLOGY");
    expect(page(4)).toContain("LIMITATIONS");
  });

  it("uses the same branding, header and footer positions as the career report on every page", async () => {
    const expense: typeof drawn = [];
    const career: typeof drawn = [];
    const e = await generateExpenseReportPdf(input("expense"), { onDocumentCreated: recordInto(expense) });
    const c = await generateReportPdf({ ...loadFixture("sample"), generatedAt: FIXED_DATE }, { onDocumentCreated: recordInto(career) });

    const at = (list: typeof drawn, page: number, test: (t: string) => boolean) =>
      list.find((d) => d.page === page && test(d.text));
    // Brand mark and its header rule line: same place, first page.
    const brandE = at(expense, 1, (t) => t === "WhatIf Engine")!;
    const brandC = at(career, 1, (t) => t === "WhatIf Engine")!;
    expect([brandE.x, brandE.y]).toEqual([brandC.x, brandC.y]);
    // Report-type label on the right, level with the brand.
    const labelE = at(expense, 1, (t) => /REPORT$/.test(t))!;
    const labelC = at(career, 1, (t) => /REPORT$/.test(t))!;
    expect(labelE.y).toBe(labelC.y);
    // Footer: identical positions for the brand line and the page counter.
    for (const [list, doc] of [[expense, e], [career, c]] as const) {
      for (let p = 1; p <= doc.getNumberOfPages(); p++) {
        const left = at(list, p, (t) => t.startsWith("WhatIf Engine  ·  Report generated"))!;
        const right = at(list, p, (t) => /^Page \d+ of \d+$/.test(t))!;
        expect([left.x, left.y]).toEqual([20, 285]);
        expect([right.x, right.y]).toEqual([190, 285]);
      }
    }
    // Both open with the same section label, title size family and meta rows.
    expect(at(expense, 1, (t) => t === "EXECUTIVE SUMMARY")!.y).toBe(at(career, 1, (t) => t === "EXECUTIVE SUMMARY")!.y);
    expect(at(expense, 1, (t) => t === "Report generated")!.x).toBe(at(career, 1, (t) => t === "Report generated")!.x);
  });

  it("never splits a table across pages: each header row is drawn exactly once", async () => {
    for (const name of EXPENSE_FIXTURES) {
      drawn = [];
      await build(name);
      const m = buildExpenseReportModel(input(name));
      const headers = [m.monthly.head[0], m.outcome.head[0], m.horizons.head[0], ...m.inputs.map((g) => g.title)];
      for (const header of headers) {
        const pages = drawn.filter((d) => d.text === header).map((d) => d.page);
        expect(pages, `${name}: "${header}"`).toHaveLength(1);
      }
    }
  });

  it("keeps every heading with the content that follows it on the same page", async () => {
    for (const name of EXPENSE_FIXTURES) {
      drawn = [];
      const doc = await build(name);
      const headings = ["WARNINGS", "YOUR INPUTS", "ASSUMPTIONS", "METHODOLOGY", "LIMITATIONS", "AT THE END OF THE PERIOD"];
      for (let p = 1; p <= doc.getNumberOfPages(); p++) {
        const texts = drawn.filter((d) => d.page === p && !FOOTER.test(d.text)).map((d) => d.text);
        texts.forEach((t, i) => {
          if (headings.includes(t)) {
            // At least a few lines of real content follow on this page, not just the page footer.
            expect(texts.length - i - 1, `${name} page ${p}: ${t}`).toBeGreaterThanOrEqual(3);
          }
        });
      }
    }
  });

  it("negative figures use a true minus in the large summary figures too", async () => {
    await build("expense-strain");
    const first = onPage(1).join(" ");
    expect(first).toContain("−₹4,76,913");
    expect(first).toContain("−₹1,30,913");
    expect(first).not.toMatch(/-₹/);
  });

  it("shows the horizon in the outcome table's header, matching the career report's titled tables", async () => {
    await build("expense-cash");
    const header = drawn.find((d) => d.text === "After 5 years" && d.page === 2);
    expect(header).toBeDefined();
    expect(drawn.some((d) => d.text === "Monthly picture" && d.page === 2)).toBe(true);
  });

  it("keeps type at the career report's sizes: nothing is shrunk to save pages", async () => {
    const sizes = new Set<number>();
    const doc = await generateExpenseReportPdf(input("expense"), {
      onDocumentCreated: (d) => {
        const original = d.setFontSize.bind(d);
        d.setFontSize = ((size: number) => {
          sizes.add(Number(size));
          return original(size);
        }) as jsPDF["setFontSize"];
      },
    });
    expect(doc.getNumberOfPages()).toBe(4);
    // Body copy and table text never go below the career report's smallest sizes (7.5pt labels, 8pt tables).
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(7);
    expect(sizes.has(8.5)).toBe(true);
    expect(sizes.has(30)).toBe(true); // the same large title size as the career report
  });
});
