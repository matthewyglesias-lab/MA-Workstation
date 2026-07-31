import {
  ARROW,
  block,
  cleanText,
  documentationContribution,
  joinBlocks,
  labeledNarrative,
  row,
} from "./grammar";
import type {
  DocumentationEvaluation,
  DocumentationResult,
  FormsDocumentationInput,
} from "./types";

export const formatFormsDocumentation = (
  input: FormsDocumentationInput,
  evaluation?: DocumentationEvaluation,
): DocumentationResult => {
  const contribution = documentationContribution(evaluation);
  const summary = cleanText(input.summary);
  const request = block("Document / request", [
    row("Patient", input.patient),
    row("DOB", input.dob),
    row("Request category", input.requestCategory),
    row("Document type", input.documentType),
    row("Request date", input.requestDate),
    ...labeledNarrative("Request notes", input.requestNotes),
  ]);
  const status = block("Workflow status", [
    row("Status", input.status),
    row("Assigned provider", input.assignedProvider),
    row("Assigned staff", input.assignedStaff),
    row("Due / target date", input.targetDate),
    row("Fee status", input.feeStatus),
    row("Delivery / pickup", input.deliveryMethod),
    row("Patient notification", input.patientNotification),
    row("Approval / release", input.approvalStatus),
  ]);
  const actions = block("Action / follow-up", [
    ...(input.actions ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
    ...(input.followUp ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
    ...(contribution.note ?? []).map((item) => `${ARROW} ${cleanText(item)}`),
  ]);
  const content = joinBlocks([summary, request, status, actions]);

  return {
    workflow: "forms",
    sections: [
      {
        id: "forms-note",
        label: "Forms handoff note",
        destination: "Note",
        content,
      },
    ],
    text: content,
  };
};

