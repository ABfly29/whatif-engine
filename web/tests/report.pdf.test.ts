import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it } from "vitest";
import { generateReportPdf, reportFileName } from "../src/lib/report";
import { buildReportModel } from "../src/lib/report/model";
import { FIXED_DATE, FIXTURES, loadFixture, type FixtureName } from "./report.helpers";

/** Every string drawn, with the page it was drawn on. Lets tests check real page content. */
let drawn: { page: number; text: string }[] = [];

function recordText(doc: jsPDF) {
  const original = doc.text.bind(doc);
  doc.text = ((...args: Parameters<jsPDF["text"]>) => {
    const [value] = args;
    const page = doc.getCurrentPageInfo().pageNumber;
    for (const t of Array.isArray(value) ? value : [value]) drawn.push({ page, text: String(t) });
    return original(...args);
  }) as jsPDF["text"];
}

beforeEach(() => {
  drawn = [];
});

const build = (name: FixtureName) =>
  generateReportPdf({ ...loadFixture(name), generatedAt: FIXED_DATE }, { onDocumentCreated: recordText });

const onPage = (page: number) => drawn.filter((d) => d.page === page).map((d) => d.text);

describe("PDF report", () => {
  it.each(["sample", "negative", "minimal"] as const)("%s: is exactly three A4 pages", async (name) => {
    const doc = await build(name);
    expect(doc.getNumberOfPages()).toBe(3);
    const size = doc.internal.pageSize;
    expect(size.getWidth()).toBeCloseTo(210, 1);
    expect(size.getHeight()).toBeCloseTo(297, 1);
  });

  it("produces a real PDF file", async () => {
    const doc = await build("sample");
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000); // includes the embedded fonts
    expect(bytes.length).toBeLessThan(500_000);
  });

  it("paints every page black before drawing", async () => {
    for (const name of FIXTURES) {
      const doc = await build(name);
      const pages = (doc.internal as unknown as { pages: (string[] | undefined)[] }).pages;
      for (let i = 1; i <= doc.getNumberOfPages(); i++) {
        const stream = pages[i]!.join("\n");
        // A full-page black fill happens before any text is drawn on the page.
        // jsPDF writes: "0. g" (black), then a page-sized rectangle (595.28 x 841.89pt), then "f".
        const fill = stream.search(/0\. g\s+0\. [\d.]+ 595\.27\d* -841\.8\d* re\s+f/);
        const firstText = stream.indexOf("BT");
        expect(fill).toBeGreaterThanOrEqual(0);
        expect(firstText).toBeGreaterThan(fill);
      }
    }
  });

  it("page 1: branding, date, scenarios, period, ending cash, labelled difference, summary", async () => {
    const m = buildReportModel({ ...loadFixture("sample"), generatedAt: FIXED_DATE });
    await build("sample");
    const text = onPage(1);
    expect(text).toContain("WhatIf Engine");
    expect(text).toContain(m.generatedOn);
    expect(text).toContain(`${m.scenarios.stay} (current job)  ·  ${m.scenarios.switch} (new offer)`);
    expect(text).toContain(m.period);
    expect(text).toContain(m.headline.stayEnding);
    expect(text).toContain(m.headline.switchEnding);
    expect(text).toContain(m.headline.difference);
    expect(text.join(" ")).toContain("DIFFERENCE IN ENDING CASH (SWITCH MINUS STAY)");
    // Summary sentences are drawn (wrapped across lines).
    const joined = text.join(" ");
    expect(joined).toContain("Switch ends");
    expect(joined).toContain("Not a forecast or a guarantee");
  });

  it("page 2: totals and every year for both scenarios", async () => {
    const { result } = loadFixture("sample");
    await build("sample");
    const text = onPage(2).join("\n");
    expect(text).toContain("Financial breakdown");
    for (const label of ["Total income", "Total living costs", "Total saved", "Ending cash"]) {
      expect(text).toContain(label);
    }
    for (const row of [...result.stay_annual, ...result.switch_annual]) {
      expect(text).toContain(`Year ${row.year}`);
    }
  });

  it("page 3: inputs, methodology, limitations and the disclaimer", async () => {
    const m = buildReportModel({ ...loadFixture("sample"), generatedAt: FIXED_DATE });
    await build("sample");
    const text = onPage(3).join("\n");
    expect(text).toContain("Assumptions and notes");
    expect(text).toContain("Annual take-home pay");
    expect(text).toContain("Relocation cost (Switch only)");
    expect(text).toContain("METHODOLOGY");
    expect(text).toContain("LIMITATIONS");
    expect(text).toContain("Pay is take-home.");
    expect(text).toContain("not a forecast or a guarantee");
    expect(text).toContain(m.inputs.scenarioRows[0][1]);
  });

  it("puts a footer with the date and 'Page n of N' on every page", async () => {
    const doc = await build("sample");
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      expect(onPage(p)).toContain(`Page ${p} of ${total}`);
      expect(onPage(p).join(" ")).toContain("Report generated 11 October 2026");
    }
  });

  it("uses the rupee sign and a true minus for negative amounts", async () => {
    await build("negative");
    const all = drawn.map((d) => d.text).join(" ");
    expect(all).toContain("₹");
    expect(all).toContain("−₹");
    expect(all).not.toMatch(/-₹/);
  });

  it("long projections page-break cleanly: every year present, none dropped, still black", async () => {
    const { result } = loadFixture("long");
    const doc = await build("long");
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(6);
    const text = drawn.map((d) => d.text);
    for (const row of result.stay_annual) {
      // Each year appears in both the stay and switch tables.
      expect(text.filter((t) => t === `Year ${row.year}`)).toHaveLength(2);
    }
    // Assumptions start on their own page, after the tables.
    const assumptionsPage = drawn.find((d) => d.text === "Assumptions and notes")!.page;
    const lastYearPage = Math.max(...drawn.filter((d) => /^Year \d+$/.test(d.text)).map((d) => d.page));
    expect(assumptionsPage).toBeGreaterThan(lastYearPage);
    // Table headers repeat on continuation pages.
    const headerPages = new Set(drawn.filter((d) => d.text === "CASH AT YEAR END" || d.text === "Cash at year end").map((d) => d.page));
    expect(headerPages.size).toBeGreaterThanOrEqual(2);
  });

  it("handles missing optional fields without errors or blank pages", async () => {
    const doc = await build("minimal");
    expect(doc.getNumberOfPages()).toBe(3);
    const text = onPage(3).join("\n");
    expect(text).toContain("None"); // no time without a salary
    expect(text).toContain("—");
    for (let p = 1; p <= 3; p++) expect(onPage(p).length).toBeGreaterThan(5);
  });

  it("is deterministic apart from the PDF creation timestamp", async () => {
    await build("sample");
    const first = [...drawn];
    drawn = [];
    await build("sample");
    expect(drawn).toEqual(first);
  });

  it("names the file by date", () => {
    expect(reportFileName({ generatedAt: FIXED_DATE })).toBe("whatif-report-2026-10-11.pdf");
    expect(reportFileName()).toMatch(/^whatif-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  // Developer aid: REPORT_OUT_DIR=some/dir npx vitest run tests/report.pdf.test.ts
  it.skipIf(!process.env.REPORT_OUT_DIR)("writes sample PDFs for visual review", async () => {
    const dir = process.env.REPORT_OUT_DIR!;
    mkdirSync(dir, { recursive: true });
    for (const name of FIXTURES) {
      const doc = await build(name);
      writeFileSync(join(dir, `report-${name}.pdf`), Buffer.from(doc.output("arraybuffer")));
    }
  });
});
