import { describe, expect, it } from "vitest";
import { BLANK, SAMPLE, type FormState } from "../src/lib/form";
import { decodeForm, encodeForm, scenarioLink } from "../src/lib/share";
import { validate } from "../src/lib/validation";

const parse = (qs: string) => new URLSearchParams(qs);

describe("shareable scenario links", () => {
  it("round-trips any scenario", () => {
    const form: FormState = { ...SAMPLE, curPay: "950000", newPay: "1750000", gap: "3", join: "" };
    expect(decodeForm(parse(encodeForm(form)))).toEqual(form);
  });

  it("round-trips a fully blank scenario, including empty fields", () => {
    expect(decodeForm(parse(encodeForm(BLANK)))).toEqual(BLANK);
  });

  it("includes only fields that differ from the sample, so links stay short", () => {
    expect(encodeForm(SAMPLE)).toBe("");
    const qs = encodeForm({ ...SAMPLE, curPay: "1" });
    expect(qs).toBe("curPay=1");
  });

  it("returns null for a link with no scenario", () => {
    expect(decodeForm(parse(""))).toBeNull();
    expect(decodeForm(parse("utm_source=mail&x=1"))).toBeNull();
  });

  it("ignores unknown keys", () => {
    const form = decodeForm(parse("curPay=900000&evil=<script>"));
    expect(form).toEqual({ ...SAMPLE, curPay: "900000" });
    expect(Object.keys(form!)).not.toContain("evil");
  });

  it.each(["<script>alert(1)</script>", "1e9", "12abc", "../../x", "1,000", " 5", "9".repeat(40)])(
    "ignores unsafe or non-numeric value %j",
    (value) => {
      expect(decodeForm(parse(new URLSearchParams({ curPay: value }).toString()))).toBeNull();
    },
  );

  it("accepts decimals and negatives, which normal validation then judges", () => {
    const form = decodeForm(parse("inflation=6.5&reloc=-5"));
    expect(form).toMatchObject({ inflation: "6.5", reloc: "-5" });
    expect(validate(form!).reloc).toMatch(/negative/i);
  });

  it("builds an absolute link to the calculator", () => {
    const loc = { origin: "https://abfly29.github.io", pathname: "/whatif-engine/" };
    expect(scenarioLink({ ...SAMPLE, curPay: "900000" }, loc)).toBe(
      "https://abfly29.github.io/whatif-engine/#/app?curPay=900000",
    );
    expect(scenarioLink(SAMPLE, loc)).toBe("https://abfly29.github.io/whatif-engine/#/app");
  });
});
