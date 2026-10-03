import type { ClinicalIssue } from "../domain/contracts";
import type { InjectionProgressStep, InjectionWorkflowProgress } from "../application/injection-workflow-progress";

export type InjectionAttention = "requirement" | "stop" | "warning" | "info";

/** Presentation only. Exact known issue/field pairs AND positive missing-field
 * evidence are needed for a quiet documentation treatment. Clinical severity,
 * completion, order review and command capability are never modified here.
 * Safety confirmations, active exceptions and unknown issues remain exposed. */
const DOCUMENTATION_FIELDS: Readonly<Record<string, string>> = {
  "patient.name": "patient.name", "patient.dob": "patient.dob",
  "reason.required": "reason", "medication.required": "medicationKey",
  "medication.other-name": "customMedication", "dose.required": "dose",
  "route.required": "route", "site.required": "site",
  "interval.required": "intervalKey", "order.provider": "orderingProvider",
  "administration.date": "administrationDate", "administration.time": "administrationTime",
  "administration.second-time": "secondAdministrationTime", "administration.staff": "administeredBy",
  "administration.volume-required": "details.volume",
  "response.required": "response", "disposition.required": "disposition.kind",
  "timing.prior-dose": "priorDoseDate", "followup.next-dose": "nextDoseDate",
  "trace.ndc": "traceability.ndc", "trace.lot": "traceability.lot",
  "trace.expiration": "traceability.expiration", "trace.product-source": "details.productSource",
};

export function injectionAttention(issue: ClinicalIssue, missingFields: readonly string[]): InjectionAttention {
  const field = DOCUMENTATION_FIELDS[issue.code];
  return issue.severity === "stop" && field !== undefined && issue.field === field && missingFields.includes(field)
    ? "requirement" : issue.severity;
}

export function stepAttention(step: InjectionProgressStep): InjectionAttention | undefined {
  const kinds = step.concerns.map(issue => injectionAttention(issue, step.missingFields));
  if (kinds.includes("stop")) return "stop";
  if (kinds.includes("warning")) return "warning";
  if (kinds.includes("info")) return "info";
  return kinds.includes("requirement") ? "requirement" : undefined;
}

export function partitionInjectionAttention(progress: InjectionWorkflowProgress): {
  requirements: ClinicalIssue[]; concerns: ClinicalIssue[];
} {
  const missing = progress.steps.flatMap(step => step.missingFields);
  const requirements: ClinicalIssue[] = [], concerns: ClinicalIssue[] = [];
  for (const issue of progress.concerns) {
    (injectionAttention(issue, missing) === "requirement" ? requirements : concerns).push(issue);
  }
  return { requirements, concerns };
}
