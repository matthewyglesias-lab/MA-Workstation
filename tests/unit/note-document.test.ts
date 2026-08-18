import { describe, expect, it } from "vitest";

import {
  noteDocumentLines,
  noteDocumentStats,
  noteLineText,
} from "../../src/presentation/note-document";

const SAMPLES = [
  "",
  "\n",
  "Injection documentation draft — Invega Sustenna.\n\nVisit: Scheduled\nEncounter date: Jul 30, 2026",
  "PRE-ADMINISTRATION REVIEW\nPrevious dose date: Jul 2, 2026\nTiming review: Given 28 day(s) after the prior dose — within the labeled window (about 21–35 days).",
  "PRODUCT IDENTIFICATION\n→ Invega Sustenna\n  Dose: 156 mg\n  Lot: SAFETY-LOT\n\nFOLLOW-UP\nNext dose due: Aug 27, 2026\nOrdering provider: Syed, Hozair, MD",
  "Verification: Pt identity verified using two identifiers (full name & DOB).",
  "Date/time: 7/30/26 1030.",
  "Traceability: NDC 00000-0000-42 · Lot READY-2407 · Exp 12/2027.",
  "  indented plain prose with no colon at all",
  "A line: with: several: colons: in it",
  "NKDA",
  "Response: Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.",
  "   \n\t\n   ",
  "trailing spaces   ",
  "Ends with a colon:",
];

describe("note document lines", () => {
  /**
   * The one rule that cannot break. Staff copy this text into a chart, so the
   * viewer must render exactly the characters that get copied - a renderer that
   * silently drops or reorders a character would show a reviewer something
   * other than what lands in the record.
   */
  it("rejoins to the original text, character for character", () => {
    for (const sample of SAMPLES) {
      const rebuilt = noteDocumentLines(sample).map(noteLineText).join("\n");
      expect(rebuilt).toBe(sample);
    }
  });

  it("never drops, adds, or reorders a line", () => {
    const sample = SAMPLES[4]!;
    const lines = noteDocumentLines(sample);
    expect(lines).toHaveLength(sample.split("\n").length);
    expect(lines.map((line) => line.number)).toEqual(
      sample.split("\n").map((_, index) => index + 1),
    );
  });

  it("numbers lines from one within the section", () => {
    const lines = noteDocumentLines("a\nb\nc");
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3]);
  });

  it("recognises the run-in headings the generated note uses", () => {
    for (const heading of [
      "PRE-ADMINISTRATION REVIEW",
      "PRODUCT IDENTIFICATION",
      "FOLLOW-UP",
      "SAFETY & SCREENING",
    ]) {
      expect(noteDocumentLines(heading)[0]!.kind).toBe("heading");
    }
  });

  // A shouted value is still a value. Promoting it to a heading would claim a
  // structure the note does not have.
  it("keeps an upper-case labeled line a labeled line, not a heading", () => {
    const [line] = noteDocumentLines("ALLERGIES: NKDA");
    expect(line!.kind).toBe("labeled");
  });

  it("does not promote ordinary prose or a single word to a heading", () => {
    expect(noteDocumentLines("Pt presents today for an injection.")[0]!.kind).toBe("text");
    // One capital letter is an initial, not a heading.
    expect(noteDocumentLines("A")[0]!.kind).toBe("text");
  });

  it("splits a labeled line into its label and value", () => {
    const [line] = noteDocumentLines("Next dose due: Aug 27, 2026");
    expect(line!.kind).toBe("labeled");
    expect(line!.segments.find((s) => s.role === "label")?.text).toBe("Next dose due:");
    expect(line!.segments.find((s) => s.role === "value")?.text).toBe("Aug 27, 2026");
  });

  it("keeps the indent of an indented labeled line outside the label", () => {
    const [line] = noteDocumentLines("  Dose: 156 mg");
    expect(line!.segments[0]).toEqual({ text: "  ", role: "plain" });
    expect(line!.segments.find((s) => s.role === "label")?.text).toBe("Dose:");
  });

  // Prose that happens to contain a colon is not a field. Dressing it as one
  // would tell the reader the line is structured when it is not.
  it("does not treat a long prose prefix before a colon as a label", () => {
    const long =
      "Clinical review of the entire pre-administration screening process today: no findings";
    expect(noteDocumentLines(long)[0]!.kind).toBe("text");
  });

  it("marks whitespace-only lines blank without losing their characters", () => {
    const [line] = noteDocumentLines("   ");
    expect(line!.kind).toBe("blank");
    expect(noteLineText(line!)).toBe("   ");
  });
});

describe("note document stats", () => {
  it("counts sections and lines", () => {
    expect(noteDocumentStats(["a\nb", "c"])).toEqual({ sections: 2, lines: 3 });
  });

  it("ignores trailing blank padding so the count matches what is readable", () => {
    expect(noteDocumentStats(["a\nb\n\n\n"])).toEqual({ sections: 1, lines: 2 });
  });

  it("reports an empty document as no sections", () => {
    expect(noteDocumentStats([])).toEqual({ sections: 0, lines: 0 });
  });
});
