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
import type { FormsEncounter } from "../domain/forms";
import { localIsoDate } from "../domain/dates";

export interface FormsLetterDraft {
  date: string;
  recipient: string;
  recipientAddress: string;
  subject: string;
  paragraphs: string[];
  providerDisplayName: string;
  providerFullName: string;
  signatureMode: NonNullable<FormsEncounter["letterSignatureMode"]>;
  preparedBy: string;
  preparedLine?: string;
  signatureBlock: string;
  bodyText: string;
}

export const prettyDate = (iso: string): string => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const trimmed = (value?: string): string => (value ?? "").trim();

const providerDisplayName = (encounter: FormsEncounter): string =>
  trimmed(encounter.letterProviderName) ||
  trimmed(encounter.provider) ||
  "[Provider name]";

const providerFullName = (encounter: FormsEncounter): string => {
  const name = providerDisplayName(encounter);
  const creds = trimmed(encounter.letterCredentials);
  return creds ? `${name}, ${creds}` : name;
};

/** Faithful port of legacy-runtime.js's letterSubjectText() default-subject logic. */
export const letterSubjectText = (encounter: FormsEncounter): string => {
  const custom = trimmed(encounter.letterSubject);
  if (custom) return custom;
  switch (encounter.letterType) {
    case "offwork":
      return "Work Status Letter";
    case "return":
      return "Return to Work Letter";
    case "restrictions":
      return "Restrictions / Accommodation Letter";
    case "custom":
      return "Provider Letter";
    default:
      return "Diagnosis / Treatment Verification Letter";
  }
};

/** Faithful port of legacy-runtime.js's letterBodyParagraphs() per-letterType wording. */
export const letterBodyParagraphs = (encounter: FormsEncounter): string[] => {
  const patientName = trimmed(encounter.patient.name) || "[Patient name]";
  const dob = trimmed(encounter.patient.dob);
  const provider = providerFullName(encounter);
  const dx = trimmed(encounter.diagnosisWording);
  const restrictions = trimmed(encounter.restrictions);
  const offStart = prettyDate(trimmed(encounter.offWorkStart));
  const offEnd = prettyDate(trimmed(encounter.offWorkEnd));
  const returnDate = prettyDate(trimmed(encounter.returnDate));
  const patientPhrase = `${patientName}${dob ? ` (DOB ${dob})` : ""}`;
  const paragraphs: string[] = [];

  if (encounter.letterType === "dx") {
    paragraphs.push(
      `This letter is to verify that ${patientPhrase} is an established patient under the care of ${provider} at Inland Psychiatric Medical Group.`,
    );
    paragraphs.push(
      dx
        ? `Provider-approved clinical information: ${dx}`
        : "Clinical information or diagnosis wording should be completed by the provider if release is appropriate.",
    );
    if (restrictions) paragraphs.push(`Additional provider-approved note: ${restrictions}`);
  } else if (encounter.letterType === "offwork") {
    paragraphs.push(
      `${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`,
    );
    const range =
      offStart || offEnd
        ? ` from work${offStart ? ` beginning ${offStart}` : ""}${offEnd ? ` through ${offEnd}` : ""}`
        : " from work for the dates specified by the provider";
    paragraphs.push(
      `Based on provider review, the patient is excused${range}.${returnDate ? ` The anticipated return-to-work date is ${returnDate}.` : ""}`,
    );
    paragraphs.push(
      restrictions
        ? `Work restrictions / additional instructions: ${restrictions}`
        : "Any work restrictions or additional instructions should be completed by the provider before release.",
    );
  } else if (encounter.letterType === "return") {
    paragraphs.push(
      `${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`,
    );
    paragraphs.push(
      `Based on provider review, the patient may return to work${returnDate ? ` on ${returnDate}` : ""}.`,
    );
    paragraphs.push(
      restrictions
        ? `Restrictions / accommodations: ${restrictions}`
        : "No restrictions are listed in this draft unless added and approved by the provider.",
    );
  } else if (encounter.letterType === "restrictions") {
    paragraphs.push(
      `${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`,
    );
    paragraphs.push(
      `Provider-approved restrictions or accommodations: ${restrictions || "[Provider-approved restrictions/accommodations]"}`,
    );
    if (dx) paragraphs.push(`Clinical basis, if provider approves release: ${dx}`);
  } else {
    paragraphs.push(
      `${patientPhrase} is under the care of ${provider} at Inland Psychiatric Medical Group.`,
    );
    paragraphs.push(restrictions || dx || "[Provider to complete custom letter wording]");
  }

  return paragraphs;
};

/**
 * Presentation-independent equivalent of legacy-runtime.js's
 * letterDraftText()/renderLetterPreviewHtml(), for the new panel's live
 * letter preview. Not used by the print pipeline, which stays on the
 * legacy renderLetterSheet() for byte-identical output.
 */
export const formatProviderLetterDraft = (
  encounter: FormsEncounter,
): FormsLetterDraft => {
  const date = prettyDate(trimmed(encounter.letterDate)) || prettyDate(localIsoDate());
  const recipient = trimmed(encounter.letterRecipient) || "To Whom It May Concern";
  const recipientAddress = trimmed(encounter.letterRecipientAddress);
  const subject = letterSubjectText(encounter);
  const paragraphs = letterBodyParagraphs(encounter);
  const signatureMode = encounter.letterSignatureMode ?? "wet";
  const provider = providerFullName(encounter);
  const preparedBy = trimmed(encounter.letterPreparedBy) || trimmed(encounter.staff);

  const signatureBlock =
    signatureMode === "wet"
      ? "______________________________"
      : signatureMode === "electronic"
        ? `Electronically reviewed / approved by ${provider}`
        : "";

  const bodyText = [
    date,
    "",
    recipient,
    ...(recipientAddress ? [recipientAddress] : []),
    "",
    `RE: ${subject}`,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "Sincerely,",
    "",
    ...(signatureBlock ? [signatureBlock] : []),
    provider,
    "Inland Psychiatric Medical Group",
    ...(preparedBy ? ["", `Prepared by: ${preparedBy}`] : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return {
    date,
    recipient,
    recipientAddress,
    subject,
    paragraphs,
    providerDisplayName: providerDisplayName(encounter),
    providerFullName: provider,
    signatureMode,
    preparedBy,
    preparedLine: preparedBy ? `Prepared by: ${preparedBy}` : undefined,
    signatureBlock,
    bodyText,
  };
};

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

