/**
 * Line model for the note document viewer.
 *
 * The note is a Tebra deliverable: staff copy it verbatim into a chart. So the
 * one rule this module cannot break is that what it renders must be exactly
 * what gets copied. Every function here is therefore *lossless* - it splits and
 * labels the text, it never rewrites it - and `noteDocumentLines` is covered by
 * a test asserting the segments of every line rejoin to the original character
 * for character. Styling clinical text is safe; re-flowing it is not, because a
 * mis-parse would show a reviewer something different from what lands in the
 * record.
 *
 * Splitting on "\n" is the only structural operation performed, and it is
 * trivially reversible. Everything past that is classification for CSS.
 */

export type NoteSegmentRole = "plain" | "heading" | "label" | "value";

export interface NoteSegment {
  text: string;
  role: NoteSegmentRole;
}

export type NoteLineKind = "blank" | "heading" | "labeled" | "text";

export interface NoteDocumentLine {
  /** 1-based, counted within its own section, the way a terminal viewer pages. */
  number: number;
  kind: NoteLineKind;
  segments: NoteSegment[];
}

/**
 * A run-in heading inside the generated note - "PRE-ADMINISTRATION REVIEW",
 * "PRODUCT IDENTIFICATION", "FOLLOW-UP". Recognised only when the whole line is
 * upper case and carries no colon, so a shouted value ("Allergies: NKDA") stays
 * a labeled line and ordinary prose can never be promoted to a heading.
 */
const HEADING = /^[A-Z0-9][A-Z0-9 /&().,'-]*$/;

/**
 * "Label: value". The label is bounded deliberately: a long prefix before a
 * colon is prose containing a colon, not a field name, and dressing it as a
 * label would tell the reader this line is structured when it is not.
 */
const LABELED = /^(\s*)([A-Z][^:]{0,44}?)(:)(\s+)(.*)$/;

function segmentsFor(line: string): { kind: NoteLineKind; segments: NoteSegment[] } {
  if (!line.trim()) return { kind: "blank", segments: [{ text: line, role: "plain" }] };

  if (HEADING.test(line) && /[A-Z]{2}/.test(line)) {
    return { kind: "heading", segments: [{ text: line, role: "heading" }] };
  }

  const labeled = LABELED.exec(line);
  if (labeled) {
    const [, indent = "", label = "", colon = "", gap = "", value = ""] = labeled;
    return {
      kind: "labeled",
      segments: [
        ...(indent ? [{ text: indent, role: "plain" as const }] : []),
        { text: `${label}${colon}`, role: "label" },
        { text: gap, role: "plain" },
        ...(value ? [{ text: value, role: "value" as const }] : []),
      ],
    };
  }

  return { kind: "text", segments: [{ text: line, role: "plain" }] };
}

/** Split one section's text into numbered, classified lines. Lossless. */
export function noteDocumentLines(content: string): NoteDocumentLine[] {
  return content.split("\n").map((line, index) => ({
    number: index + 1,
    ...segmentsFor(line),
  }));
}

/** Rejoins a line's segments. The inverse of the split, used by its own test. */
export function noteLineText(line: NoteDocumentLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

/** The document status footer: what a terminal viewer puts on its bottom rule. */
export function noteDocumentStats(
  contents: readonly string[],
): { sections: number; lines: number } {
  return {
    sections: contents.length,
    // Trailing blank lines are padding in the generated text, not content the
    // reviewer has to read, so they are not counted.
    lines: contents.reduce(
      (total, content) => total + content.replace(/\n+$/, "").split("\n").length,
      0,
    ),
  };
}
