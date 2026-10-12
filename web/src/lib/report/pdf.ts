import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import { buildReportModel } from "./model";
import type { ReportInput, ReportModel } from "./types";

/**
 * A4 report: black pages, white type, thin dividers.
 *
 * jspdf and jspdf-autotable are imported on demand so they add nothing to the
 * landing page or the calculator until a report is actually generated. The
 * fonts are small Noto subsets (SIL OFL) because jsPDF's built-in fonts cannot
 * draw the rupee sign.
 */

export type AutoTable = (doc: jsPDF, options: UserOptions) => void;
type RGB = [number, number, number];

// ---- Design tokens (mm and pt) ----
export const PAGE = { w: 210, h: 297 };
export const MARGIN = 20;
export const CONTENT_W = PAGE.w - MARGIN * 2;
export const FOOTER_Y = 285;
const BOTTOM_LIMIT = FOOTER_Y - 8; // content must end above the footer
const PT = 0.3528; // mm per point

export const COLOR = {
  bg: [0, 0, 0] as RGB,
  text: [255, 255, 255] as RGB,
  muted: [166, 166, 166] as RGB,
  rule: [82, 82, 82] as RGB,
  strongRule: [214, 214, 214] as RGB,
};

type FontKey = "serif" | "sans" | "bold";
const FONT: Record<FontKey, { family: string; style: "normal" | "bold" }> = {
  serif: { family: "NotoSerif", style: "normal" },
  sans: { family: "NotoSans", style: "normal" },
  bold: { family: "NotoSans", style: "bold" },
};

export interface Ctx {
  doc: jsPDF;
  autoTable: AutoTable;
  y: number;
}

// ---- Page and text primitives ----

function paintBackground(doc: jsPDF) {
  doc.setFillColor(...COLOR.bg);
  doc.rect(0, 0, PAGE.w, PAGE.h, "F");
  doc.setTextColor(...COLOR.text);
}

/** Every page, including ones the table plugin adds itself, starts black. */
export function installBackground(doc: jsPDF) {
  const addPage = doc.addPage.bind(doc);
  doc.addPage = ((...args: Parameters<jsPDF["addPage"]>) => {
    const result = addPage(...args);
    paintBackground(doc);
    return result;
  }) as jsPDF["addPage"];
  paintBackground(doc);
}

/** Load the PDF libraries and fonts ahead of time. Safe to call repeatedly. */
export function preloadReportAssets(): Promise<unknown> {
  return Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("./fonts/NotoSerif-Regular"),
    import("./fonts/NotoSans-Regular"),
    import("./fonts/NotoSans-Bold"),
  ]);
}

export async function registerFonts(doc: jsPDF) {
  const [serif, sans, bold] = await Promise.all([
    import("./fonts/NotoSerif-Regular"),
    import("./fonts/NotoSans-Regular"),
    import("./fonts/NotoSans-Bold"),
  ]);
  const add = (file: string, data: string, family: string, style: string) => {
    doc.addFileToVFS(file, data);
    doc.addFont(file, family, style);
  };
  add("NotoSerif-Regular.ttf", serif.NOTO_SERIF_REGULAR, "NotoSerif", "normal");
  add("NotoSans-Regular.ttf", sans.NOTO_SANS_REGULAR, "NotoSans", "normal");
  add("NotoSans-Bold.ttf", bold.NOTO_SANS_BOLD, "NotoSans", "bold");
}

export function setType(doc: jsPDF, font: FontKey, size: number, color: RGB = COLOR.text) {
  doc.setFont(FONT[font].family, FONT[font].style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

export function rule(c: Ctx, y: number, color: RGB = COLOR.rule, width = 0.2) {
  c.doc.setDrawColor(...color);
  c.doc.setLineWidth(width);
  c.doc.line(MARGIN, y, PAGE.w - MARGIN, y);
}

export function newPage(c: Ctx) {
  c.doc.addPage();
  c.y = MARGIN + 4;
}

/** Start a new page if `needed` mm would not fit above the footer. */
export function ensureSpace(c: Ctx, needed: number) {
  if (c.y + needed > BOTTOM_LIMIT) newPage(c);
}

export function eyebrow(c: Ctx, label: string, y: number, x = MARGIN) {
  setType(c.doc, "bold", 7.5, COLOR.muted);
  c.doc.setCharSpace(0.5);
  c.doc.text(label.toUpperCase(), x, y);
  c.doc.setCharSpace(0);
}

/** Wrapped paragraph; returns the y just below it. */
export function paragraph(
  c: Ctx,
  text: string,
  y: number,
  opts: { size?: number; color?: RGB; indent?: number; font?: FontKey; spacing?: number } = {},
): number {
  const { size = 10, color = COLOR.text, indent = 0, font = "sans", spacing = 1.55 } = opts;
  setType(c.doc, font, size, color);
  const lines = c.doc.splitTextToSize(text, CONTENT_W - indent) as string[];
  const lineHeight = size * PT * spacing;
  lines.forEach((line, i) => c.doc.text(line, MARGIN + indent, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

export function paragraphHeight(c: Ctx, text: string, size = 10, indent = 0, spacing = 1.55): number {
  setType(c.doc, "sans", size);
  const lines = c.doc.splitTextToSize(text, CONTENT_W - indent) as string[];
  return lines.length * size * PT * spacing;
}

// ---- Tables ----

const finalY = (doc: jsPDF) =>
  (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? MARGIN;

export function drawTable(
  c: Ctx,
  opts: {
    head: string[];
    body: string[][];
    widths: number[];
    /** Column indexes that hold numbers and are right-aligned. */
    numeric: number[];
    fontSize?: number;
    boldFirstColumn?: boolean;
    /** Tighter rows, used where a page carries a lot of content. */
    compact?: boolean;
    /** Move the whole table to the next page rather than split it, when it fits on one page. */
    keepTogether?: boolean;
  },
) {
  const { head, body, widths, numeric, compact = false } = opts;
  const fontSize = opts.fontSize ?? (compact ? 8 : 8.5);
  const pad = compact ? 1.5 : 2.8;
  const columnStyles: NonNullable<UserOptions["columnStyles"]> = {};
  widths.forEach((w, i) => (columnStyles[i] = { cellWidth: w }));

  c.autoTable(c.doc, {
    startY: c.y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: PAGE.h - BOTTOM_LIMIT },
    head: [head],
    body,
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    pageBreak: opts.keepTogether ? "avoid" : "auto", // "auto" is the library default
    tableWidth: CONTENT_W,
    styles: {
      font: FONT.sans.family,
      fontStyle: "normal",
      fontSize,
      textColor: COLOR.text,
      cellPadding: { top: pad, bottom: pad, left: 1.2, right: 1.2 },
      lineColor: COLOR.rule,
      lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: 7,
      textColor: COLOR.muted,
      lineColor: COLOR.strongRule,
      lineWidth: { top: 0, right: 0, bottom: 0.3, left: 0 },
    },
    columnStyles,
    didParseCell: (data) => {
      data.cell.styles.halign = numeric.includes(data.column.index) ? "right" : "left";
      if (data.section === "body" && data.column.index === 0 && opts.boldFirstColumn) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  c.y = finalY(c.doc);
}

// ---- Pages ----

function pageOne(c: Ctx, m: ReportModel) {
  const { doc } = c;
  const half = CONTENT_W / 2;

  setType(doc, "serif", 15);
  doc.text(m.brand, MARGIN, 24);
  eyebrow(c, "Career decision report", 24, PAGE.w - MARGIN - 44);
  rule(c, 29);

  eyebrow(c, "Executive summary", 48);
  setType(doc, "serif", 30);
  doc.text("Stay or switch?", MARGIN, 62);

  const meta: [string, string][] = [
    ["Scenarios", `${m.scenarios.stay} (current job)  ·  ${m.scenarios.switch} (new offer)`],
    ["Projection period", m.period],
    ["Report generated", m.generatedOn],
  ];
  meta.forEach(([label, value], i) => {
    const y = 76 + i * 7;
    setType(doc, "sans", 9, COLOR.muted);
    doc.text(label, MARGIN, y);
    setType(doc, "sans", 9.5);
    doc.text(value, MARGIN + 42, y);
  });
  rule(c, 101);

  // Ending cash, side by side.
  const columns: [string, string, number][] = [
    [`Projected ending cash · ${m.scenarios.stay}`, m.headline.stayEnding, MARGIN],
    [`Projected ending cash · ${m.scenarios.switch}`, m.headline.switchEnding, MARGIN + half],
  ];
  columns.forEach(([label, value, x]) => {
    eyebrow(c, label, 114, x);
    setType(doc, "serif", 25);
    doc.text(value, x, 128);
  });
  rule(c, 140);

  // The difference, clearly labelled.
  eyebrow(c, m.headline.differenceLabel, 153);
  setType(doc, "serif", 38);
  doc.text(m.headline.difference, MARGIN, 171);
  setType(doc, "sans", 9, COLOR.muted);
  doc.text(m.headline.differenceNote, MARGIN, 179);
  rule(c, 190);

  // Neutral summary of the calculated results.
  eyebrow(c, "Summary", 202);
  let y = 211;
  for (const sentence of m.summary) {
    y = paragraph(c, sentence, y, { size: 10 }) + 2.4;
  }
  paragraph(c, "Projections based on the inputs listed on page 3. Not a forecast or a guarantee.", y + 3, {
    size: 8,
    color: COLOR.muted,
  });
}

function pageTwo(c: Ctx, m: ReportModel) {
  const { doc } = c;
  newPage(c);
  eyebrow(c, "Projections", c.y + 6);
  setType(doc, "serif", 22);
  doc.text("Financial breakdown", MARGIN, c.y + 18);
  c.y += 28;

  drawTable(c, {
    head: m.totals.head,
    body: m.totals.rows,
    widths: [CONTENT_W - 100, 50, 50],
    numeric: [1, 2],
    boldFirstColumn: false,
  });

  let first = true;
  const yearly = (title: string, rows: string[][]) => {
    ensureSpace(c, 46);
    c.y += 12;
    ensureSpace(c, 46);
    if (first) eyebrow(c, "Year by year", c.y);
    first = false;
    setType(doc, "serif", 14);
    doc.text(title, MARGIN, c.y + 8);
    c.y += 12;
    drawTable(c, {
      head: m.yearly.head,
      body: rows,
      widths: [18, 28, 28, 42, 26, 28],
      numeric: [1, 2, 3, 4, 5],
      fontSize: 8,
    });
  };
  yearly(m.scenarios.stay, m.yearly.stay);
  yearly(m.scenarios.switch, m.yearly.switch);
}

function pageThree(c: Ctx, m: ReportModel) {
  const { doc } = c;
  newPage(c);
  eyebrow(c, "Inputs and method", c.y + 4);
  setType(doc, "serif", 20);
  doc.text("Assumptions and notes", MARGIN, c.y + 14);
  c.y += 21;

  drawTable(c, {
    head: m.inputs.head,
    body: m.inputs.scenarioRows,
    widths: [CONTENT_W - 100, 50, 50],
    numeric: [1, 2],
    compact: true,
  });
  c.y += 5;
  drawTable(c, {
    head: ["Shared and switch-only inputs", "Value"],
    body: m.inputs.sharedRows,
    widths: [CONTENT_W - 60, 60],
    numeric: [1],
    compact: true,
  });

  const section = (title: string, needed: number) => {
    ensureSpace(c, needed);
    c.y += 7;
    ensureSpace(c, needed);
    eyebrow(c, title, c.y);
    c.y += 5.5;
  };

  section("Methodology", 30);
  for (const text of m.methodology) {
    ensureSpace(c, paragraphHeight(c, text, 8.5, 0, 1.45));
    c.y = paragraph(c, text, c.y, { size: 8.5, spacing: 1.45 }) + 1.6;
  }

  section("Limitations", 24);
  for (const text of m.limitations) {
    ensureSpace(c, paragraphHeight(c, text, 8.5, 5, 1.45));
    setType(doc, "sans", 8.5);
    doc.text("•", MARGIN + 1, c.y);
    c.y = paragraph(c, text, c.y, { size: 8.5, indent: 5, spacing: 1.4 }) + 0.6;
  }

  const boxHeight = paragraphHeight(c, m.disclaimer, 8, 0, 1.45) + 6;
  c.y += 2;
  ensureSpace(c, boxHeight);
  rule(c, c.y, COLOR.strongRule, 0.3);
  c.y = paragraph(c, m.disclaimer, c.y + 5, { size: 8, color: COLOR.muted, spacing: 1.45 });
}

/** "WhatIf Engine · generated 11 October 2026" and "Page 1 of 3" on every page. */
function addFooters(c: Ctx, m: ReportModel) {
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

// ---- Public API ----

export interface ReportOptions {
  /** Called with the new document before anything is drawn (e.g. to observe drawing in tests). */
  onDocumentCreated?: (doc: jsPDF) => void;
}

/** Build the report as a jsPDF document. */
export async function generateReportPdf(
  input: ReportInput,
  options: ReportOptions = {},
): Promise<jsPDF> {
  const model = buildReportModel(input);
  const [{ jsPDF: JsPdf }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPdf({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  options.onDocumentCreated?.(doc);
  await registerFonts(doc);
  installBackground(doc);
  doc.setProperties({
    title: `${model.brand}: Stay or switch report`,
    subject: "Career decision projection",
    author: model.brand,
    creator: model.brand,
  });

  const ctx: Ctx = { doc, autoTable: autoTable as AutoTable, y: MARGIN };
  pageOne(ctx, model);
  pageTwo(ctx, model);
  pageThree(ctx, model);
  addFooters(ctx, model);
  return doc;
}

export async function generateReportBlob(input: ReportInput, options?: ReportOptions): Promise<Blob> {
  return (await generateReportPdf(input, options)).output("blob");
}

export { reportFileName } from "./filename";
