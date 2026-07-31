import {
  ARROW,
  BULLET,
  block,
  cleanText,
  documentationContribution,
  joinBlocks,
  labeledNarrative,
  noteLines,
  nonEmpty,
  row,
} from "./grammar";
import type {
  DocumentationEvaluation,
  DocumentationResult,
  SamplePackage,
  SamplePlanStep,
  SamplesDocumentationInput,
} from "./types";

const indentedRow = (label: string, value: unknown): string => {
  const content = row(label, value);
  return content ? `  ${content}` : "";
};

const packageHeading = (
  item: SamplePackage,
  index: number,
  total: number,
): string => {
  const name = nonEmpty([item.medication, item.strength]).join(" ");
  const label = cleanText(item.label);
  const prefix = total > 1 ? `Package ${index + 1}` : "Package";
  return `${ARROW} ${label || prefix}${name ? `: ${name}` : ""}`;
};

const packageLines = (
  item: SamplePackage,
  index: number,
  total: number,
): string[] => {
  const hasFacts = nonEmpty([
    item.label,
    item.medication,
    item.strength,
    item.dosageForm,
    item.quantity,
    item.packageId,
    item.ndc,
    item.lot,
    item.expiration,
  ]).length;
  if (!hasFacts) return [];
  return noteLines([
    packageHeading(item, index, total),
    indentedRow("Medication", item.medication),
    indentedRow("Strength", item.strength),
    indentedRow("Dosage form", item.dosageForm),
    indentedRow("Quantity / package", item.quantity),
    indentedRow("Package identifier", item.packageId),
    indentedRow("NDC / product code", item.ndc),
    indentedRow("Lot", item.lot),
    indentedRow("Expiration", item.expiration),
  ]);
};

const stepHeading = (
  item: SamplePlanStep,
  index: number,
  total: number,
): string => {
  const name = nonEmpty([item.medication, item.strength]).join(" ");
  const label = cleanText(item.label);
  const prefix = total > 1 ? `Step ${index + 1}` : "Dose plan";
  return `${ARROW} ${label || prefix}${name ? `: ${name}` : ""}`;
};

const stepLines = (
  item: SamplePlanStep,
  index: number,
  total: number,
): string[] => {
  const hasFacts = nonEmpty([
    item.label,
    item.medication,
    item.strength,
    item.quantity,
    item.dateRange,
    item.directions,
  ]).length;
  if (!hasFacts) return [];
  return noteLines([
    stepHeading(item, index, total),
    indentedRow("Medication", item.medication),
    indentedRow("Strength", item.strength),
    indentedRow("Quantity", item.quantity),
    indentedRow("Dates", item.dateRange),
    ...labeledNarrative("Directions", item.directions).map(
      (line) => `  ${line}`,
    ),
  ]);
};

export const formatSamplesDocumentation = (
  input: SamplesDocumentationInput,
  evaluation?: DocumentationEvaluation,
): DocumentationResult => {
  const contribution = documentationContribution(evaluation);
  const packages = input.packages ?? [];
  const steps = input.planSteps ?? [];
  const summary = cleanText(input.summary);
  const supply = block("Medication / supply", [
    row("Patient", input.patient),
    row("DOB", input.dob),
    row("Purpose", input.purpose),
    row("Prescriber", input.prescriber),
    row("Dispensed by", input.dispensedBy),
  ]);
  const traceability = block(
    "Package traceability",
    packages.flatMap((item, index) =>
      packageLines(item, index, packages.length),
    ),
  );
  const plan = block(
    "Patient instructions",
    steps.flatMap((item, index) => stepLines(item, index, steps.length)),
  );
  const instructions = block("Counseling", [
    ...(input.patientInstructions ?? []).map(
      (item) => `${BULLET} ${cleanText(item)}`,
    ),
    ...(input.counseling ?? []).map((item) => `${BULLET} ${cleanText(item)}`),
    ...labeledNarrative("Patient / comment context", input.patientContext),
    row("Patient handout", input.handoutStatus),
  ]);
  const review = block("Review confirmation", [
    row("Reviewed today", input.reviewedToday?.reviewedAt),
    row("Reviewed by", input.reviewedToday?.reviewedBy),
  ]);
  const followUp = block("Follow-up", [
    ...(input.followUp ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
    ...(contribution.note ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
  ]);
  const content = joinBlocks([
    summary,
    supply,
    traceability,
    plan,
    instructions,
    review,
    followUp,
  ]);

  return {
    workflow: "samples",
    sections: [
      {
        id: "samples-note",
        label: "Sample note",
        destination: "Note",
        content,
      },
    ],
    text: content,
  };
};
