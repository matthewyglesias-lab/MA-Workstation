import type {
  DocumentationContribution,
  DocumentationEvaluation,
  DocumentationEvaluationOutput,
} from "./types";

export const DOCUMENTATION_DIVIDER = "────────────────────────────────";
export const BULLET = "•";
export const ARROW = "→";
export const INDENT = "  ↳";
export const ALERT = "!";

export const cleanText = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";

export const compactText = (value: unknown): string =>
  cleanText(value).replace(/\s+/g, " ");

export const nonEmpty = (items: Array<string | undefined>): string[] =>
  items.map((item) => cleanText(item)).filter(Boolean);

export const noteLines = (items: Array<string | undefined>): string[] =>
  items
    .map((line) =>
      typeof line === "string" ? line.replace(/\r\n?/g, "\n").trimEnd() : "",
    )
    .filter((line) => Boolean(line.trim()));

export const row = (label: string, value: unknown): string => {
  const normalized = compactText(value);
  return normalized ? `${label}: ${normalized}` : "";
};

export const sentenceLines = (value: unknown): string[] =>
  cleanText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const labeledNarrative = (label: string, value: unknown): string[] => {
  const lines = sentenceLines(value);
  const first = lines[0];
  if (!first) return [];
  return [
    `${label}: ${first}`,
    ...lines.slice(1).map((line) => `${INDENT} ${line}`),
  ];
};

export const bullets = (items?: string[]): string[] =>
  nonEmpty(items ?? []).map((item) => `${BULLET} ${item}`);

export const alerts = (items?: string[]): string[] =>
  nonEmpty(items ?? []).map((item) => `${ALERT} ${item}`);

export const arrows = (items?: string[]): string[] =>
  nonEmpty(items ?? []).map((item) => `${ARROW} ${item}`);

export const heading = (value: string): string => compactText(value).toUpperCase();

export const block = (
  title: string,
  lines: Array<string | undefined>,
): string => {
  const content = noteLines(lines);
  return content.length ? [heading(title), ...content].join("\n") : "";
};

export const joinBlocks = (
  items: Array<string | undefined>,
  separator = "\n\n",
): string => nonEmpty(items).join(separator);

export const joinSectionBodies = (items: Array<string | undefined>): string =>
  joinBlocks(items, `\n\n${DOCUMENTATION_DIVIDER}\n\n`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/**
 * Only explicitly documentation-scoped engine output is eligible for a note.
 * Stops and warnings are intentionally not copied into the chart by default.
 */
export const documentationContribution = (
  evaluation?: DocumentationEvaluation,
): DocumentationContribution => {
  if (!evaluation || !isRecord(evaluation.output)) return {};
  const output = evaluation.output as DocumentationEvaluationOutput;
  if (!isRecord(output.documentation)) return {};
  return {
    cc: stringArray(output.documentation.cc),
    assessment: stringArray(output.documentation.assessment),
    plan: stringArray(output.documentation.plan),
    note: stringArray(output.documentation.note),
  };
};
