import type { ClinicalEvaluation, WorkflowKey } from "../domain/contracts";

export type DocumentationWorkflow = Extract<
  WorkflowKey,
  "injection" | "uds" | "samples" | "forms"
>;

export type TebraDestination = "CC" | "Assessment" | "Plan" | "Note";

export interface DocumentationSection {
  id: string;
  label: string;
  destination: TebraDestination;
  content: string;
}

export interface DocumentationResult {
  workflow: DocumentationWorkflow;
  sections: DocumentationSection[];
  /**
   * Section bodies joined for a single copy action. Tebra's existing outer
   * section headings are deliberately not repeated in this string.
   */
  text: string;
}

export interface DocumentationContribution {
  cc?: string[];
  assessment?: string[];
  plan?: string[];
  note?: string[];
}

export interface DocumentationEvaluationOutput {
  documentation?: DocumentationContribution;
}

export type DocumentationEvaluation = ClinicalEvaluation<unknown>;

export interface InjectionChiefComplaint {
  summary?: string;
  visitType?: string;
  purpose?: string;
  encounterDate?: string;
  context?: string[];
}

export interface InjectionVitals {
  bloodPressure?: string;
  heartRate?: string;
  temperature?: string;
  weight?: string;
}

export interface InjectionPreAdministration {
  orderPurpose?: string;
  orderVerification?: string;
  allergiesReview?: string;
  previousDoseDate?: string;
  previousSite?: string;
  timingReview?: string;
  vitals?: InjectionVitals;
  reviewItems?: string[];
  clinicianAttention?: string[];
}

export interface InjectionComponent {
  label?: string;
  medication?: string;
  dose?: string;
  route?: string;
  site?: string;
  administrationDate?: string;
  administrationTime?: string;
  administeredBy?: string;
  amount?: string;
  device?: string;
  siteCondition?: string;
  response?: string;
  ndc?: string;
  lot?: string;
  expiration?: string;
  quantity?: string;
  source?: string;
  preparation?: string;
}

export interface InjectionInitiationProtocol {
  kind:
    | "aripiprazole-two-injection"
    | "sustenna-day-8"
    | "oral-overlap"
    | "provider-directed";
  label?: string;
  orderVerification?: string;
  oralDose?: string;
  oralPlan?: string;
  day1Date?: string;
  day8TargetDate?: string;
  windowStart?: string;
  windowEnd?: string;
  scheduledOrAdministeredDate?: string;
  timingReview?: string;
  notes?: string[];
}

export interface InjectionProductHandling {
  source?: string;
  waste?: string;
  wasteWitness?: string;
  productIssue?: string;
  /** Immediate containment, quarantine, return, or other product disposition. */
  productIssueAction?: string;
  productIssueNotified?: string;
  productIssueNotificationTime?: string;
  productIssueDirection?: string;
  productIssueNextStep?: string;
}

export type InjectionDispositionKind =
  | "administered"
  | "held"
  | "escalated"
  | "provider-directed";

export interface InjectionDisposition {
  kind: InjectionDispositionKind;
  label?: string;
  reason?: string;
  notified?: string;
  decisionTime?: string;
  direction?: string;
  nextStep?: string;
}

export interface InjectionException {
  summary?: string;
  notified?: string;
  notificationTime?: string;
  direction?: string;
  nextStep?: string;
}

export interface InjectionFollowUp {
  nextDoseDate?: string;
  timingWindow?: string;
  orderingProvider?: string;
  education?: string[];
  returnInstructions?: string[];
  appointmentStatus?: string;
}

/**
 * Compact, clinical-shorthand facts for a completed administration - the
 * "RC6.1 fast injection workflow" note rhythm. Present only when medication
 * was actually administered; every field is optional and hidden from the
 * generated note when absent, per the approved plan's "no label with no
 * content" rule.
 */
export interface InjectionNoteFacts {
  headline?: string;
  presentation?: string;
  verification?: string;
  clinicalReview?: string;
  siteAssessment?: string;
  timing?: string;
  administration?: string;
  dateTime?: string;
  asepticTechnique?: string;
  /** Needle/technique documentation plus any product-specific technique
   * verifications (supplied needle, gluteal-only, no-massage, Z-track). */
  technique?: string;
  response?: string;
  observation?: string;
  departureStatus?: string;
  traceability?: string;
  followUp?: string;
  orderingProvider?: string;
  administeredBy?: string;
}

export interface InjectionDocumentationInput {
  chiefComplaint?: InjectionChiefComplaint;
  disposition?: InjectionDisposition;
  preAdministration?: InjectionPreAdministration;
  components?: InjectionComponent[];
  initiation?: InjectionInitiationProtocol;
  handling?: InjectionProductHandling;
  exception?: InjectionException;
  followUp?: InjectionFollowUp;
  noteFacts?: InjectionNoteFacts;
}

export interface InjectionDocumentationResult extends DocumentationResult {
  workflow: "injection";
  cc: string;
  assessment: string;
  plan: string;
  all: string;
}

export interface UdsCollection {
  reason?: string;
  collectedAt?: string;
  collectedBy?: string;
  specimen?: string;
  device?: string;
  lot?: string;
  expiration?: string;
  temperature?: string;
}

export interface UdsControlReview {
  control?: string;
  validity?: string;
  integrity?: string[];
}

export interface UdsResult {
  analyte: string;
  result: string;
}

export interface UdsResultGroup {
  label: string;
  results: UdsResult[];
}

export interface UdsDocumentationInput {
  summary?: string;
  patient?: string;
  dob?: string;
  collection?: UdsCollection;
  controlReview?: UdsControlReview;
  resultGroups?: UdsResultGroup[];
  medicationAlignment?: string;
  clinicianAttention?: string[];
  patientContext?: string;
  plan?: string[];
  outsideLabPlan?: string;
}

export interface SamplePackage {
  label?: string;
  medication?: string;
  strength?: string;
  dosageForm?: string;
  quantity?: string;
  packageId?: string;
  ndc?: string;
  lot?: string;
  expiration?: string;
}

export interface SamplePlanStep {
  label?: string;
  medication?: string;
  strength?: string;
  quantity?: string;
  dateRange?: string;
  directions?: string;
}

export interface SampleReviewConfirmation {
  reviewedAt: string;
  reviewedBy?: string;
}

export interface SamplesDocumentationInput {
  summary?: string;
  patient?: string;
  dob?: string;
  purpose?: string;
  prescriber?: string;
  dispensedBy?: string;
  packages?: SamplePackage[];
  planSteps?: SamplePlanStep[];
  patientInstructions?: string[];
  counseling?: string[];
  patientContext?: string;
  handoutStatus?: string;
  followUp?: string[];
  reviewedToday?: SampleReviewConfirmation;
}

export interface FormsDocumentationInput {
  summary?: string;
  patient?: string;
  dob?: string;
  requestCategory?: string;
  documentType?: string;
  requestDate?: string;
  requestNotes?: string;
  status?: string;
  assignedProvider?: string;
  assignedStaff?: string;
  targetDate?: string;
  feeStatus?: string;
  deliveryMethod?: string;
  patientNotification?: string;
  approvalStatus?: string;
  actions?: string[];
  followUp?: string[];
}

export interface DocumentationEncounterMap {
  injection: InjectionDocumentationInput;
  uds: UdsDocumentationInput;
  samples: SamplesDocumentationInput;
  forms: FormsDocumentationInput;
}
