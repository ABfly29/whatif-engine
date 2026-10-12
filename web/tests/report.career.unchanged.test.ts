import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateReportPdf } from "../src/lib/report";
import { FIXED_DATE, FIXTURES, loadFixture } from "./report.helpers";

/**
 * The career report is the visual reference for every other report, so its output is pinned:
 * a fingerprint of each page's drawing instructions, recorded from the version that shipped
 * before the expense report existed. Shared drawing code may gain options, but with the
 * career report's own settings these pages must come out exactly the same.
 *
 * If you change the career report on purpose, update these fingerprints in the same commit.
 */
const GOLDEN: Record<(typeof FIXTURES)[number], string[]> = {
  sample: ["b92ffdb67b53c345", "4e5c57e40cc64d35", "e8a2397c53e6f090"],
  long: ["d74f598da9322199", "eb2edc13eee6c338", "f48d0289cec2a86c", "65abe7b22d124029"],
  negative: ["aa53c2159bbd6880", "54bca4ae2fbe57a4", "ad61c22089608d50"],
  minimal: ["36580309b7c550f3", "58dd1f74b41a850d", "5e2ab8b838848076"],
};

describe("career PDF report is unchanged", () => {
  it.each(FIXTURES)("%s: every page draws exactly what it always did", async (name) => {
    const doc = await generateReportPdf({ ...loadFixture(name), generatedAt: FIXED_DATE });
    const pages = (doc.internal as unknown as { pages: (string[] | undefined)[] }).pages;
    const fingerprints = Array.from({ length: doc.getNumberOfPages() }, (_, i) =>
      createHash("sha256")
        .update(pages[i + 1]!.join("\n"))
        .digest("hex")
        .slice(0, 16),
    );
    expect(fingerprints).toEqual(GOLDEN[name]);
  });
});
