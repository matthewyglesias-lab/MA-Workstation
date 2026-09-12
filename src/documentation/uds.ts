import { UDS_PRELIMINARY_CAVEAT } from "../domain/uds";
import {
  cleanText,
  compactText,
  documentationContribution,
  endSentence,
  joinBlocks,
  nonEmpty,
  noteLines,
  sentenceLines,
} from "./grammar";
import type {
  DocumentationEvaluation,
  DocumentationResult,
  UdsDocumentationInput,
  UdsResult,
  UdsResultGroup,
} from "./types";

/**
 * The UDS note is a chart encounter note, written as one block: an opening
 * line a reviewer can read alone, then the objective record of the collection
 * and the readings, then what happens next. It is not a handoff message and
 * not a transcription of the worksheet - the printed clinician report and
 * patient summary remain the documents for those jobs.
 *
 * Every sentence in the note is composed here rather than in the adapters.
 * Two different producers build the input (a typed UdsEncounter in the panel,
 * the legacy DOM in the compatibility mirror), and staff copy whichever one
 * their surface produced into the same chart, so the wording cannot live in
 * either producer without the two drifting apart.
 */

type UdsReading = "neg" | "pos" | "invalid" | "nt" | "other";

/**
 * Both producers state the reading outright. The label fallback exists only
 * for a caller that predates `state`; it matches the canonical result labels
 * and leaves anything else alone rather than guessing a reading from prose.
 */
const readingFor = (result: UdsResult): UdsReading => {
  if (result.state) return result.state;
  const label = cleanText(result.result).toLowerCase();
  if (/preliminary positive/.test(label)) return "pos";
  if (/invalid/.test(label)) return "invalid";
  if (/not tested|not documented/.test(label)) return "nt";
  if (/negative/.test(label)) return "neg";
  return "other";
};

interface GroupedReadings {
  positive: string[];
  invalid: string[];
  negative: string[];
  notTested: string[];
  /** Verbatim "analyte: result" for a reading this formatter cannot classify. */
  other: string[];
  /** Whether any reading at all was documented. */
  documented: boolean;
}

const groupReadings = (groups: readonly UdsResultGroup[]): GroupedReadings => {
  const grouped: GroupedReadings = {
    positive: [],
    invalid: [],
    negative: [],
    notTested: [],
    other: [],
    documented: false,
  };
  groups.forEach((group) => {
    (group.results ?? []).forEach((result) => {
      const analyte = compactText(result.analyte);
      const value = compactText(result.result);
      if (!analyte || !value) return;
      grouped.documented = true;
      switch (readingFor(result)) {
        case "pos":
          grouped.positive.push(analyte);
          return;
        case "invalid":
          grouped.invalid.push(analyte);
          return;
        case "neg":
          grouped.negative.push(analyte);
          return;
        case "nt":
          grouped.notTested.push(analyte);
          return;
        default:
          grouped.other.push(`${analyte}: ${value}`);
      }
    });
  });
  return grouped;
};

const list = (items: readonly string[]): string => items.join(", ");

/**
 * A picked label reads as a label ("Routine monitoring"); mid-sentence it
 * should read as prose. Only an ordinary capitalized word is lowered, so an
 * acronym or product name a staff member typed ("MDMA", "SAFE life") is never
 * altered.
 */
const leadingLowercase = (value: string): string =>
  /^[A-Z][a-z]/.test(value) ? `${value[0]?.toLowerCase() ?? ""}${value.slice(1)}` : value;

/** "Cannabinoids / THC" -> "+Cannabinoids / THC", the chart's own shorthand. */
const positiveList = (items: readonly string[]): string =>
  items.map((item) => `+${item}`).join(", ");

const validityClause = (
  input: UdsDocumentationInput,
): "acceptable" | "needs review" | "" => {
  const state = input.controlReview?.validityState;
  if (state === "acceptable" || state === "needs review") return state;
  if (state === "not documented") return "";
  const text = cleanText(input.controlReview?.validity).toLowerCase();
  if (text === "acceptable") return "acceptable";
  if (text === "needs review") return "needs review";
  return "";
};

const controlFailed = (input: UdsDocumentationInput): boolean => {
  const state = input.controlReview?.controlState;
  if (state) return state !== "valid";
  const text = cleanText(input.controlReview?.control);
  return Boolean(text) && /invalid|missing|not documented/i.test(text);
};

const alignmentFlagged = (input: UdsDocumentationInput): boolean => {
  const state = input.medicationAlignmentState;
  if (state) return state === "not aligned" || state === "needs review";
  return /not aligned|needs review/i.test(cleanText(input.medicationAlignment));
};

/**
 * The line a reviewer reads on its own: why the specimen was collected, what
 * it was read on, what it showed, whether it can be believed, and whether it
 * needs someone. Nothing about results appears until a reading is documented.
 */
const headlineFor = (
  input: UdsDocumentationInput,
  readings: GroupedReadings,
): string => {
  const explicit = cleanText(input.summary);
  if (explicit) return explicit;

  const reason = leadingLowercase(compactText(input.collection?.reason));
  const device = compactText(input.collection?.device);
  const validity = validityClause(input);
  const failedControl = controlFailed(input) && readings.documented;

  const finding = (): string => {
    if (failedControl) {
      return "invalid control line — result not interpretable";
    }
    if (!readings.documented) return "results not yet documented";
    const clauses: string[] = [];
    if (readings.positive.length) clauses.push(positiveList(readings.positive));
    if (readings.invalid.length) {
      clauses.push(`${list(readings.invalid)} invalid / unreadable`);
    }
    if (readings.negative.length) {
      clauses.push(
        clauses.length
          ? "all other tested panels negative"
          : `all ${readings.negative.length} tested panels negative`,
      );
    }
    return clauses.join(", ");
  };

  const action = (): string => {
    if (failedControl) return "repeat or confirmation needed";
    if (readings.invalid.length) return "repeat or confirmation needed";
    if (
      readings.positive.length ||
      validity === "needs review" ||
      alignmentFlagged(input)
    ) {
      return "provider review requested";
    }
    return "";
  };

  // With no readable control line, whether the validity markers looked fine is
  // beside the point and only competes with "not interpretable" for the
  // reader's attention. It stays on the quality-control line below.
  const validityClauseText =
    failedControl || validity === ""
      ? ""
      : validity === "acceptable"
        ? "validity acceptable"
        : "validity markers require review";

  const detail = nonEmpty([
    reason,
    device,
    finding(),
    validityClauseText,
    action(),
  ]).join("; ");

  return endSentence(
    detail ? `POC urine drug screen — ${detail}` : "POC urine drug screen",
  );
};

const collectionLine = (input: UdsDocumentationInput): string => {
  const specimen = compactText(input.collection?.specimen);
  const collectedAt = compactText(input.collection?.collectedAt);
  const collectedBy = compactText(input.collection?.collectedBy);
  const temperature = compactText(input.collection?.temperature);
  // "Collected." on its own states nothing; the line appears only once some
  // fact about the collection has actually been documented.
  if (!specimen && !collectedAt && !collectedBy && !temperature) return "";
  const lead = specimen ? `${specimen} specimen collected` : "Collected";
  const collected = nonEmpty([
    lead,
    collectedAt,
    collectedBy ? `by ${collectedBy}` : "",
  ]).join(" ");
  // "Not documented" is the absence of a temperature check, not a finding, so
  // it is left out rather than charted as one.
  const temperatureClause =
    temperature && !/not documented/i.test(temperature)
      ? `temperature ${temperature.toLowerCase()}`
      : "";
  const sentence = nonEmpty([collected, temperatureClause]).join("; ");
  return sentence ? `Collection: ${endSentence(sentence)}` : "";
};

const deviceLine = (input: UdsDocumentationInput): string => {
  const device = compactText(input.collection?.device);
  const lot = compactText(input.collection?.lot);
  const expiration = compactText(input.collection?.expiration);
  const parts = nonEmpty([
    device,
    lot ? `Lot ${lot}` : "",
    expiration ? `Exp ${expiration}` : "",
  ]);
  return parts.length ? `Device: ${endSentence(parts.join(" · "))}` : "";
};

const qualityControlLine = (input: UdsDocumentationInput): string => {
  const control = compactText(input.controlReview?.control);
  const validity = validityClause(input);
  const validityText =
    validity === "acceptable"
      ? "validity markers acceptable"
      : validity === "needs review"
        ? "validity markers require review"
        : "";
  const reading = nonEmpty([control, validityText]).join("; ");
  const integrity = nonEmpty(input.controlReview?.integrity ?? []).map(endSentence);
  const sentences = nonEmpty([reading ? endSentence(reading) : "", ...integrity]);
  return sentences.length ? `Quality control: ${sentences.join(" ")}` : "";
};

const resultsLine = (readings: GroupedReadings, interpretable: boolean): string => {
  if (!readings.documented) return "";
  const clauses = nonEmpty([
    readings.positive.length
      ? `${list(readings.positive)} preliminary positive`
      : "",
    readings.invalid.length
      ? `${list(readings.invalid)} invalid / unreadable`
      : "",
    readings.negative.length ? `Negative — ${list(readings.negative)}` : "",
    readings.notTested.length ? `Not tested — ${list(readings.notTested)}` : "",
    ...readings.other,
  ]).map(endSentence);
  if (!clauses.length) return "";
  // A failed control line means the cup cannot be read at all. What it
  // displayed is still recorded - it is what the staff member saw - but it is
  // recorded as readings, never as results a reviewer could act on.
  const label = interpretable
    ? "Results (preliminary/presumptive)"
    : "Readings (not interpretable — invalid control)";
  return `${label}: ${clauses.join(" ")}`;
};

const ALIGNMENT_SENTENCES: Record<
  NonNullable<UdsDocumentationInput["medicationAlignmentState"]>,
  string
> = {
  "no unexpected": "",
  "not aligned":
    "Result is not explained by the available medication list; clinician review requested.",
  "needs review": "Requires clinician review against the medication list.",
  "patient explanation":
    "Unexpected result with a patient explanation documented; clinician review requested.",
  unavailable: "Medication list was not available at the time of the screen.",
};

const alignmentLine = (input: UdsDocumentationInput): string => {
  const state = input.medicationAlignmentState;
  const sentence = state
    ? ALIGNMENT_SENTENCES[state]
    : cleanText(input.medicationAlignment)
      ? endSentence(cleanText(input.medicationAlignment))
      : "";
  return sentence ? `Medication alignment: ${sentence}` : "";
};

const contextLine = (input: UdsDocumentationInput): string => {
  const lines = sentenceLines(input.patientContext);
  return lines.length ? `Patient context: ${lines.join(" ")}` : "";
};

const attentionLine = (input: UdsDocumentationInput): string => {
  const items = nonEmpty(input.clinicianAttention ?? []).map(endSentence);
  return items.length ? `Clinician attention: ${items.join(" ")}` : "";
};

const OUTSIDE_LAB_SENTENCES: Record<
  NonNullable<UdsDocumentationInput["outsideLabPlanState"]>,
  string
> = {
  ordered: "Outside laboratory confirmation ordered.",
  recommended: "Outside laboratory confirmation recommended if clinically indicated.",
  "not needed": "Outside laboratory confirmation not needed.",
};

/**
 * What happens next, and the one caveat a CLIA-waived screen always carries.
 * The flags that call for a person (a preliminary positive, an unreadable
 * panel, failed QC, a validity or alignment concern) become actions here
 * rather than a separate attention block restating the results above them.
 */
const planLine = (
  input: UdsDocumentationInput,
  readings: GroupedReadings,
  extra: readonly string[],
): string => {
  const validity = validityClause(input);
  const sentences: string[] = [];
  if (readings.documented) sentences.push(UDS_PRELIMINARY_CAVEAT);
  if (controlFailed(input) && readings.documented) {
    sentences.push(
      "Do not interpret. Repeat collection or use outside laboratory confirmation per provider direction.",
    );
  } else if (readings.invalid.length) {
    sentences.push(
      "Repeat the affected panel(s) or use outside laboratory confirmation per provider direction.",
    );
  } else if (readings.positive.length) {
    sentences.push(
      "Preliminary positive finding(s) routed for provider review in clinical context.",
    );
  }
  if (validity === "needs review") {
    sentences.push("Validity markers require provider review before interpretation.");
  }
  if (alignmentFlagged(input) && !input.medicationAlignmentState) {
    sentences.push("Medication alignment requires clinician review.");
  }
  const outsideLab = input.outsideLabPlanState
    ? OUTSIDE_LAB_SENTENCES[input.outsideLabPlanState]
    : cleanText(input.outsideLabPlan)
      ? `Outside laboratory plan: ${endSentence(cleanText(input.outsideLabPlan))}`
      : "";
  if (outsideLab) sentences.push(outsideLab);
  sentences.push(...nonEmpty([...extra]).map(endSentence));

  const unique = [...new Set(sentences)];
  return unique.length ? `Plan: ${unique.join(" ")}` : "";
};

export const formatUdsDocumentation = (
  input: UdsDocumentationInput,
  evaluation?: DocumentationEvaluation,
): DocumentationResult => {
  const contribution = documentationContribution(evaluation);
  const readings = groupReadings(input.resultGroups ?? []);
  const headline = headlineFor(input, readings);

  // One block, paragraphed the way the encounter reads: what was collected,
  // what it showed, what it means, what happens next.
  const content = joinBlocks([
    headline,
    noteLines([collectionLine(input), deviceLine(input), qualityControlLine(input)]).join(
      "\n",
    ),
    resultsLine(readings, !controlFailed(input)),
    noteLines([alignmentLine(input), contextLine(input), attentionLine(input)]).join(
      "\n",
    ),
    planLine(input, readings, [
      ...(input.plan ?? []),
      ...(contribution.note ?? []),
    ]),
  ]);

  return {
    workflow: "uds",
    sections: [
      {
        id: "uds-note",
        label: "UDS note",
        destination: "Note",
        content,
      },
    ],
    text: content,
    headline,
  };
};
