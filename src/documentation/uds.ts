import {
  ALERT,
  BULLET,
  ARROW,
  block,
  cleanText,
  documentationContribution,
  joinBlocks,
  labeledNarrative,
  nonEmpty,
  row,
} from "./grammar";
import type {
  DocumentationEvaluation,
  DocumentationResult,
  UdsDocumentationInput,
  UdsResultGroup,
} from "./types";

const resultLine = (group: UdsResultGroup): string => {
  const results = group.results
    .map((result) => {
      const analyte = cleanText(result.analyte);
      const value = cleanText(result.result);
      return analyte && value ? `${analyte}: ${value}` : "";
    })
    .filter(Boolean);
  const label = cleanText(group.label);
  if (!label || !results.length) return "";
  return `${BULLET} ${label.toUpperCase()} — ${results.join(" · ")}`;
};

export const formatUdsDocumentation = (
  input: UdsDocumentationInput,
  evaluation?: DocumentationEvaluation,
): DocumentationResult => {
  const contribution = documentationContribution(evaluation);
  const summary = cleanText(input.summary);
  const collection = block("Collection / device", [
    row("Patient", input.patient),
    row("DOB", input.dob),
    row("Reason", input.collection?.reason),
    row("Collected", input.collection?.collectedAt),
    row("Collected by", input.collection?.collectedBy),
    row("Specimen", input.collection?.specimen),
    row("Device", input.collection?.device),
    row("Lot", input.collection?.lot),
    row("Expiration", input.collection?.expiration),
    row("Temperature", input.collection?.temperature),
  ]);
  const control = block("Control / validity", [
    row("Control", input.controlReview?.control),
    row("Validity", input.controlReview?.validity),
    ...(input.controlReview?.integrity ?? []).map(
      (item) => `${BULLET} ${cleanText(item)}`,
    ),
  ]);
  const results = block(
    "Results",
    (input.resultGroups ?? []).map(resultLine),
  );
  const context = block("Staff context", [
    ...labeledNarrative("Medication alignment", input.medicationAlignment),
    ...labeledNarrative("Patient / comment context", input.patientContext),
  ]);
  const attention = block(
    "Clinician attention",
    (input.clinicianAttention ?? []).map(
      (item) => `${ALERT} ${cleanText(item)}`,
    ),
  );
  const plan = block("Plan", [
    ...(input.plan ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
    ...labeledNarrative("Outside laboratory plan", input.outsideLabPlan),
    ...(contribution.note ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
  ]);
  const content = joinBlocks([
    summary,
    collection,
    control,
    results,
    attention,
    context,
    plan,
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
  };
};

