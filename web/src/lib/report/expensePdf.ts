import type { jsPDF } from "jspdf";
import {
  buildExpenseReportModel,
  type ExpenseReportInput,
  type ExpenseReportModel,
  type ReportTable,
} from "./expenseModel";
import {
  COLOR,
  CONTENT_W,
  FOOTER_Y,
  MARGIN,
  PAGE,
  drawTable,
  ensureSpace,
  eyebrow,
  installBackground,
  newPage,
  paragraph,
  paragraphHeight,
  registerFonts,
  rule,
  setType,
  type AutoTable,
  type Ctx,
} from "./pdf";
import type { ReportOptions } from "./pdf";

/**
 * A4 report for the Major Expense simulator. It follows the career report page for
 * page: a spacious summary with large figures, a "Financial breakdown" page, then
 * inputs and notes, using the same type, margins, rules, tables and footer (the
 * drawing helpers are the career report's own). Content comes from
 * `buildExpenseReportModel`; this file only lays it out.
 */

// First column, then the four scenario columns (No purchase, Buy now, delay, cheaper).
const SCENARIO_WIDTHS = [50, 30, 30, 30, 30];
const SCENARIO_NUMERIC = [1, 2, 3, 4];
const HORIZON_WIDTHS = [30, 14, 25, 25, 25, 25, 26];
const HORIZON_NUMERIC = [2, 3, 4, 5, 6];

// Approximate row heights (mm) of the two table styles, to decide whether a heading and its
// table fit on the page together. The table itself is also set to move whole (keepTogether).
const ROW = { normal: 8.9, compact: 6.3 };
const tableHeight = (rows: number, compact: boolean) => 8 + rows * (compact ? ROW.compact : ROW.normal);

/** Print `text` as large as fits `maxWidth`, starting at `start` pt and never below `min`. */
function fitText(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  start: number,
  min = 11,
) {
  let size = start;
  setType(c.doc, "serif", size);
  while (size > min && c.doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    setType(c.doc, "serif", size);
  }
  c.doc.text(text, x, y);
}

/** A row of large figures, each with a small label above it. */
function figures(
  c: Ctx,
  items: { label: string; value: string }[],
  labelY: number,
  valueY: number,
  size: number,
) {
  const col = CONTENT_W / items.length;
  items.forEach((item, i) => {
    const x = MARGIN + i * col;
    setType(c.doc, "sans", 8.5, COLOR.muted);
    c.doc.text(item.label, x, labelY);
    fitText(c, item.value, x, valueY, col - 4, size);
  });
}

// ---- Page 1: executive summary ----

function pageOne(c: Ctx, m: ExpenseReportModel) {
  const { doc } = c;

  setType(doc, "serif", 15);
  doc.text(m.brand, MARGIN, 24);
  eyebrow(c, "Major expense report", 24, PAGE.w - MARGIN - 40);
  rule(c, 29);

  eyebrow(c, "Executive summary", 48);
  setType(doc, "serif", 30);
  doc.text("Buying a vehicle", MARGIN, 62);

  const meta: [string, string][] = [
    ["Options compared", `${m.labels.buy_now}  ·  ${m.labels.delay}  ·  ${m.labels.cheaper}`],
    ["Payment", m.payment],
    ["Projection period", m.horizon.label],
    ["Report generated", m.generatedOn],
  ];
  meta.forEach(([label, value], i) => {
    const y = 76 + i * 6.5;
    setType(doc, "sans", 9, COLOR.muted);
    doc.text(label, MARGIN, y);
    setType(doc, "sans", 9.5);
    doc.text(value, MARGIN + 42, y, { maxWidth: CONTENT_W - 42 });
  });
  rule(c, 101);

  // Net worth for all four options, side by side.
  eyebrow(c, m.hero.netWorthLabel, 114);
  figures(c, m.hero.netWorth, 123, 134, 20);
  rule(c, 144);

  // The difference from not buying, clearly labelled.
  eyebrow(c, m.hero.differenceLabel, 157);
  figures(c, m.hero.difference, 166, 180, 26);
  setType(doc, "sans", 9, COLOR.muted);
  doc.text(m.hero.differenceNote, MARGIN, 189);
  rule(c, 197);

  // Neutral summary of the calculated results.
  eyebrow(c, "Summary", 208);
  let y = 217;
  for (const sentence of m.summary) {
    y = paragraph(c, sentence, y, { size: 10 }) + 2.4;
  }
  paragraph(c, "Projections based on the inputs listed in this report. Not a forecast or a guarantee.", y + 2, {
    size: 8,
    color: COLOR.muted,
  });
}

// ---- Page 2: financial breakdown ----

function table(c: Ctx, t: ReportTable, widths: number[], numeric: number[], compact: boolean) {
  drawTable(c, {
    head: t.head,
    body: t.rows,
    widths,
    numeric,
    compact,
    fontSize: 8,
    keepTogether: true,
  });
}

function note(c: Ctx, text: string) {
  c.y += 3;
  ensureSpace(c, paragraphHeight(c, text, 8, 0, 1.4));
  c.y = paragraph(c, text, c.y + 2, { size: 8, color: COLOR.muted, spacing: 1.4 });
}

function pageTwo(c: Ctx, m: ExpenseReportModel) {
  const { doc } = c;
  newPage(c);
  eyebrow(c, "Projections", c.y + 6);
  setType(doc, "serif", 22);
  doc.text("Financial breakdown", MARGIN, c.y + 18);
  c.y += 28;

  table(c, m.monthly, SCENARIO_WIDTHS, SCENARIO_NUMERIC, false);
  if (m.monthly.note) note(c, m.monthly.note);

  ensureSpace(c, 14 + tableHeight(m.outcome.rows.length, true));
  c.y += 12;
  eyebrow(c, "At the end of the period", c.y);
  setType(doc, "serif", 14);
  doc.text("What each option leaves you with", MARGIN, c.y + 8);
  c.y += 12;
  table(c, m.outcome, SCENARIO_WIDTHS, SCENARIO_NUMERIC, true);
  if (m.outcome.note) note(c, m.outcome.note);
}

// ---- Page 3 onward: horizons, warnings, inputs and notes ----

/** An eyebrow-only section label, as in the career report's notes page. */
function section(c: Ctx, title: string, needed: number) {
  ensureSpace(c, needed);
  c.y += 7;
  ensureSpace(c, needed);
  eyebrow(c, title, c.y);
  c.y += 5.5;
}

function bullets(c: Ctx, items: string[]) {
  for (const text of items) {
    ensureSpace(c, paragraphHeight(c, text, 8.5, 5, 1.45));
    setType(c.doc, "sans", 8.5);
    c.doc.text("•", MARGIN + 1, c.y);
    c.y = paragraph(c, text, c.y, { size: 8.5, indent: 5, spacing: 1.4 }) + 0.6;
  }
}

function pageThree(c: Ctx, m: ExpenseReportModel) {
  const { doc } = c;
  newPage(c);
  eyebrow(c, "Over time", c.y + 4);
  setType(doc, "serif", 20);
  doc.text("Projected position at each horizon", MARGIN, c.y + 14);
  c.y += 21;
  table(c, m.horizons, HORIZON_WIDTHS, HORIZON_NUMERIC, true);

  section(c, "Warnings", 26);
  if (m.warnings.length === 0) {
    c.y = paragraph(c, m.noWarningsNote, c.y, { size: 8.5, color: COLOR.muted, spacing: 1.45 }) + 1.6;
  } else {
    bullets(c, m.warnings);
    c.y =
      paragraph(
        c,
        "Warnings are prompts to look closer, not verdicts. They do not say whether a purchase is safe or affordable.",
        c.y + 1,
        { size: 8, color: COLOR.muted, spacing: 1.4 },
      ) + 1;
  }
}

function inputsAndNotes(c: Ctx, m: ExpenseReportModel) {
  section(c, "Your inputs", 60);
  m.inputs.forEach((group, i) => {
    ensureSpace(c, tableHeight(group.rows.length, true) + 4);
    drawTable(c, {
      head: [group.title, "Value"],
      body: group.rows,
      widths: [CONTENT_W - 70, 70],
      numeric: [1],
      compact: true,
      keepTogether: true,
    });
    if (i < m.inputs.length - 1) c.y += 4;
  });

  section(c, "Assumptions", 40);
  bullets(c, m.assumptions);

  section(c, "Methodology", 36);
  for (const text of m.methodology) {
    ensureSpace(c, paragraphHeight(c, text, 8.5, 0, 1.45));
    c.y = paragraph(c, text, c.y, { size: 8.5, spacing: 1.45 }) + 1.6;
  }

  section(c, "Limitations", 30);
  bullets(c, m.limitations);

  const boxHeight = paragraphHeight(c, m.disclaimer, 8, 0, 1.45) + 6;
  c.y += 2;
  ensureSpace(c, boxHeight);
  rule(c, c.y, COLOR.strongRule, 0.3);
  c.y = paragraph(c, m.disclaimer, c.y + 5, { size: 8, color: COLOR.muted, spacing: 1.45 });
}

/** "WhatIf Engine · Report generated 11 October 2026" and "Page 1 of 4" on every page. */
function addFooters(c: Ctx, m: ExpenseReportModel) {
  const { doc } = c;
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    rule(c, FOOTER_Y - 5);
    setType(doc, "sans", 7.5, COLOR.muted);
    doc.text(`${m.brand}  ·  Report generated ${m.generatedOn}`, MARGIN, FOOTER_Y);
    doc.text(`Page ${page} of ${total}`, PAGE.w - MARGIN, FOOTER_Y, { align: "right" });
  }
}

/** Build the expense report as a jsPDF document. */
export async function generateExpenseReportPdf(
  input: ExpenseReportInput,
  options: ReportOptions = {},
): Promise<jsPDF> {
  const model = buildExpenseReportModel(input);
  const [{ jsPDF: JsPdf }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPdf({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  options.onDocumentCreated?.(doc);
  await registerFonts(doc);
  installBackground(doc);
  doc.setProperties({
    title: `${model.brand}: Major expense report`,
    subject: "Vehicle purchase projection",
    author: model.brand,
    creator: model.brand,
  });

  const ctx: Ctx = { doc, autoTable: autoTable as AutoTable, y: MARGIN };
  pageOne(ctx, model);
  pageTwo(ctx, model);
  pageThree(ctx, model);
  inputsAndNotes(ctx, model);
  addFooters(ctx, model);
  return doc;
}

export async function generateExpenseReportBlob(
  input: ExpenseReportInput,
  options?: ReportOptions,
): Promise<Blob> {
  return (await generateExpenseReportPdf(input, options)).output("blob");
}
