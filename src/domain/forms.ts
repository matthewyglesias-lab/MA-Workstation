import {
  issue,
  readinessFrom,
  uniqueIssues,
  type ClinicalEngine,
  type ClinicalEvaluation,
  type ClinicalIssue,
  type ClinicalRecommendation,
  type PatientIdentity,
} from "./contracts";

export type FormRequestType = "work" | "disability" | "fmla" | "records" | "med" | "other";
export type FormRequestStatus =
  | "received"
  | "provider_review"
  | "fee_pending"
  | "in_progress"
  | "ready"
  | "notified"
  | "completed";
export type LetterType = "dx" | "offwork" | "return" | "restrictions" | "custom";
export type LetterSignatureMode = "wet" | "electronic" | "none";

export interface FormsEncounter {
  patient: PatientIdentity;
  requestType: FormRequestType;
  status: FormRequestStatus;
  letterType: LetterType;
  requestDate: string;
  targetDate: string;
  provider: string;
  staff: string;
  feeStatus: string;
  deliveryMethod: string;
  notificationStatus: string;
  notes?: string;
  actionNotes?: string;
  followUpNotes?: string;
  diagnosisWording?: string;
  restrictions?: string;
  offWorkStart?: string;
  offWorkEnd?: string;
  returnDate?: string;
  providerApprovalConfirmed?: boolean;
  /** Letter-specific provider/signature name; falls back to `provider` when blank. */
  letterProviderName?: string;
  letterCredentials?: string;
  letterDate?: string;
  letterRecipient?: string;
  letterRecipientAddress?: string;
  /** Custom subject override; falls back to a per-letterType default when blank. */
  letterSubject?: string;
  letterSignatureMode?: LetterSignatureMode;
  /** Falls back to `staff` when blank. */
  letterPreparedBy?: string;
}

export interface FormsEngineContext {
  requireProviderApprovalForRelease?: boolean;
}

export interface FormsEvaluationOutput {
  trackingComplete: boolean;
  releaseAllowed: boolean;
  activityStatus: "completed" | "needs_review";
  requiresTargetDate: boolean;
}

const hasStarted = (encounter: FormsEncounter): boolean =>
  Boolean(
    encounter.patient.name.trim() ||
      encounter.provider.trim() ||
      encounter.staff.trim() ||
      encounter.notes?.trim(),
  );

export const FormsEngine: ClinicalEngine<
  FormsEncounter,
  FormsEngineContext,
  FormsEvaluationOutput
> = {
  evaluate(
    encounter: FormsEncounter,
    context: FormsEngineContext = {},
  ): ClinicalEvaluation<FormsEvaluationOutput> {
    const stops: ClinicalIssue[] = [];
    const warnings: ClinicalIssue[] = [];
    const recommendations: ClinicalRecommendation[] = [];
    const calculatedDates: Record<string, string> = {};
    const started = hasStarted(encounter);
    const requiresTargetDate = ["provider_review", "in_progress", "fee_pending"].includes(
      encounter.status,
    );

    if (started && !encounter.patient.name.trim()) {
      warnings.push(
        issue("warning", "forms.patient", "Document the patient name.", "patient.name", "request"),
      );
    }
    if (started && !encounter.provider.trim()) {
      warnings.push(
        issue(
          "warning",
          "forms.provider",
          "Document the provider/signature name.",
          "provider",
          "assignment",
        ),
      );
    }
    if (started && !encounter.staff.trim()) {
      warnings.push(
        issue(
          "warning",
          "forms.staff",
          "Document the prepared-by/assigned staff member.",
          "staff",
          "assignment",
        ),
      );
    }
    if (started && requiresTargetDate && !encounter.targetDate) {
      warnings.push(
        issue(
          "warning",
          "forms.target-date",
          "Document the target date for the active work item.",
          "targetDate",
          "tracking",
        ),
      );
    }
    if (encounter.status === "fee_pending") {
      warnings.push(
        issue(
          "warning",
          "forms.fee-pending",
          "Fee remains pending.",
          "feeStatus",
          "tracking",
        ),
      );
    }
    if (
      started &&
      ["offwork", "return", "restrictions"].includes(encounter.letterType) &&
      !encounter.restrictions?.trim() &&
      !encounter.returnDate &&
      !encounter.offWorkStart
    ) {
      warnings.push(
        issue(
          "warning",
          "forms.letter-details",
          "Document the provider-approved work-status dates or restriction details.",
          "restrictions",
          "letter",
        ),
      );
    }
    if (started && encounter.letterType === "dx" && !encounter.diagnosisWording?.trim()) {
      warnings.push(
        issue(
          "warning",
          "forms.clinical-wording",
          "Document provider-approved clinical wording before release.",
          "diagnosisWording",
          "letter",
        ),
      );
    }

    const requireApproval = context.requireProviderApprovalForRelease !== false;
    if (
      started &&
      requireApproval &&
      ["ready", "notified", "completed"].includes(encounter.status) &&
      !encounter.providerApprovalConfirmed
    ) {
      stops.push(
        issue(
          "stop",
          "forms.provider-approval",
          "Confirm provider approval before releasing clinical, work-status, restriction, or accommodation wording.",
          "providerApprovalConfirmed",
          "release",
        ),
      );
    }

    const uniqueStops = uniqueIssues(stops);
    const uniqueWarnings = uniqueIssues(warnings);
    const trackingComplete = started && uniqueWarnings.length === 0;
    const releaseAllowed =
      started &&
      uniqueStops.length === 0 &&
      (!requireApproval || Boolean(encounter.providerApprovalConfirmed));
    const terminal = encounter.status === "notified" || encounter.status === "completed";

    return {
      workflow: "forms",
      readiness: readinessFrom(started, uniqueStops, uniqueWarnings),
      stops: uniqueStops,
      warnings: uniqueWarnings,
      recommendations,
      calculatedDates,
      output: {
        trackingComplete,
        releaseAllowed,
        activityStatus: terminal && trackingComplete ? "completed" : "needs_review",
        requiresTargetDate,
      },
    };
  },
};

export const FORM_REQUEST_TYPE_OPTIONS: ReadonlyArray<{
  key: FormRequestType;
  label: string;
  description: string;
}> = [
  { key: "work", label: "Work / school letter", description: "Work note, school note, accommodation wording." },
  { key: "disability", label: "Disability / EDD form", description: "Provider-completed form or supplemental paperwork." },
  { key: "fmla", label: "FMLA / leave paperwork", description: "Leave, intermittent leave, employer forms." },
  { key: "records", label: "Records / release", description: "Copy request, ROI, outside provider paperwork." },
  { key: "med", label: "Medication / treatment letter", description: "Medication list, treatment participation, clearance-style request." },
  { key: "other", label: "Other paperwork", description: "Custom form, letter, or administrative request." },
];

export const FORM_STATUS_OPTIONS: ReadonlyArray<{
  key: FormRequestStatus;
  label: string;
}> = [
  { key: "received", label: "Received" },
  { key: "provider_review", label: "Provider review" },
  { key: "fee_pending", label: "Fee pending" },
  { key: "in_progress", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "notified", label: "Patient notified" },
  { key: "completed", label: "Completed" },
];

export const LETTER_TYPE_OPTIONS: ReadonlyArray<{
  key: LetterType;
  label: string;
}> = [
  { key: "dx", label: "Diagnosis / treatment verification" },
  { key: "offwork", label: "Off-work letter" },
  { key: "return", label: "Return-to-work letter" },
  { key: "restrictions", label: "Restrictions / accommodations" },
  { key: "custom", label: "Custom provider letter" },
];

export const formRequestTypeLabel = (key: FormRequestType): string =>
  FORM_REQUEST_TYPE_OPTIONS.find((option) => option.key === key)?.label ?? key;

export const formStatusLabel = (key: FormRequestStatus): string =>
  FORM_STATUS_OPTIONS.find((option) => option.key === key)?.label ?? key;

export const letterTypeLabel = (key: LetterType): string =>
  LETTER_TYPE_OPTIONS.find((option) => option.key === key)?.label ?? key;

export const emptyFormsEncounter = (): FormsEncounter => ({
  patient: { name: "", dob: "" },
  requestType: "work",
  status: "received",
  letterType: "dx",
  requestDate: "",
  targetDate: "",
  provider: "",
  staff: "",
  feeStatus: "No fee / not applicable",
  deliveryMethod: "Patient pickup",
  notificationStatus: "Not yet notified",
  notes: "",
  actionNotes: "",
  followUpNotes: "",
  diagnosisWording: "",
  restrictions: "",
  offWorkStart: "",
  offWorkEnd: "",
  returnDate: "",
  providerApprovalConfirmed: false,
  letterProviderName: "",
  letterCredentials: "",
  letterDate: "",
  letterRecipient: "To Whom It May Concern",
  letterRecipientAddress: "",
  letterSubject: "",
  letterSignatureMode: "wet",
  letterPreparedBy: "",
});
