import type { ClinicalEvaluation, ClinicalIssue } from "../domain/contracts";
import {
  hasCurrentInjectionAdministrationReview,
  injectionVerificationSatisfied,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
} from "../domain/injection";
import type { MedicationVerificationKey } from "../domain/injection-catalog";
import type { WorkstationRecordLifecycle } from "./workstation-projection";

export type InjectionProgressStepId = "identify" | "verify-order" | "prepare" | "site" | "administer" | "response" | "sign";
export type InjectionEditorTab = "order" | "product" | "administration" | "review";
export type InjectionStepCompletion = "not-started" | "in-progress" | "complete" | "review-again";
export interface InjectionProgressStep {
  id: InjectionProgressStepId;
  label: string;
  applicable: boolean;
  completion: InjectionStepCompletion;
  concerns: ClinicalIssue[];
  missingFields: string[];
  stateLabel: string;
}
export interface InjectionWorkflowProgress {
  steps: InjectionProgressStep[];
  concerns: ClinicalIssue[];
  completed: number;
  total: number;
  headline: string;
  lifecycleLabel: string;
  actionDetail?: string;
  canSign: boolean;
  canSaveHandoff: boolean;
  signed: boolean;
  nonAdministration: boolean;
}
const LABELS: Record<InjectionProgressStepId, string> = {
  identify: "Identify", "verify-order": "Verify order", prepare: "Prepare", site: "Site",
  administer: "Administer", response: "Response", sign: "Sign",
};
const VERIFICATION_OWNER: Record<MedicationVerificationKey, InjectionProgressStepId> = {
  opioidFree: "verify-order", naltrexHS: "verify-order", suppliedNeedle: "prepare",
  resuspend: "prepare", visualInspection: "prepare", invegaInit: "verify-order",
  oralOverlap: "verify-order", stabilized: "verify-order", paliperidoneTolerability: "verify-order",
  aripiprazoleTolerability: "verify-order", glutealOnly: "site", noMassage: "site", deepZtrack: "site",
};
/** Primary task ownership is distinct from the physical tab containing a field. */
export function injectionStepForField(field?: string): InjectionProgressStepId {
  if (!field) return "sign";
  const [head, sub] = field.split(".");
  switch (head) {
    case "patient": return "identify";
    case "attestations": return sub === "id2" ? "identify" : sub === "hygiene" ? "prepare" : "verify-order";
    case "verifications": return VERIFICATION_OWNER[sub as MedicationVerificationKey] ?? "sign";
    case "traceability": return "prepare";
    case "site": case "habitus": case "technique": return "site";
    case "administrationTime": case "secondAdministrationTime": case "administeredBy": return "administer";
    case "response": return "response";
    case "disposition": return sub === "kind" || !sub ? "administer" : "response";
    case "details":
      if (sub?.startsWith("exception") || sub === "administrationException" || sub?.startsWith("departure")) return "response";
      if (sub?.startsWith("waste") || sub?.startsWith("product") || sub?.startsWith("preparation")) return "prepare";
      if (sub?.startsWith("volume") || sub?.startsWith("device") || sub?.startsWith("siteCondition")) return "site";
      if (sub?.startsWith("lateDose") || sub === "purpose") return "verify-order";
      return "sign";
    case "initiation":
      if (sub === "second") {
        const part = field.split(".")[2];
        return part === "given" ? "administer" : part === "site" ? "site" : ["ndc", "lot", "expiration"].includes(part ?? "") ? "prepare" : "verify-order";
      }
      return "verify-order";
    case "orderingProvider": case "medicationKey": case "customMedication": case "dose":
    case "route": case "intervalKey": case "reason": case "priorDoseDate": case "priorSite":
    case "administrationDate": case "nextDoseDate": case "allergies":
    case "acuteSafetyScreenConfirmed": case "activeSafetyConcerns": return "verify-order";
    default: return "sign";
  }
}
/** One field route shared by corrections, preview sources and focused navigation. */
export function injectionTabForField(field?: string): InjectionEditorTab {
  const [head, sub] = (field ?? "").split(".");
  if (head === "traceability") return "product";
  if (["attestations", "verifications", "vitals", "allergies", "acuteSafetyScreenConfirmed", "activeSafetyConcerns",
    "site", "habitus", "administeredBy", "administrationTime", "secondAdministrationTime"].includes(head ?? "")) return "administration";
  if (head === "response" || head === "disposition") return "review";
  if (head === "details") {
    if (sub === "purpose" || sub?.startsWith("lateDose")) return sub === "purpose" ? "order" : "review";
    if (sub?.startsWith("product") || sub?.startsWith("waste") || sub?.startsWith("preparation")) return "product";
    if (sub?.startsWith("exception") || sub === "administrationException" || sub?.startsWith("volume") || sub?.startsWith("device") || sub?.startsWith("siteCondition")) return "administration";
    return "review";
  }
  return injectionStepForField(field) === "sign" ? "review" : "order";
}
export function injectionStepForIssue(issue: ClinicalIssue): InjectionProgressStepId {
  const fieldOwner = injectionStepForField(issue.field);
  if (fieldOwner !== "sign") return fieldOwner;
  // Unknown issues deliberately stay in general review, even with a named
  // unfamiliar section. No prose matching, severity conversion or rule copy.
  return "sign";
}
function present(encounter: InjectionEncounter, field: string): boolean {
  if (field === "response") return Boolean(encounter.response.kind);
  if (field.startsWith("verifications.")) return injectionVerificationSatisfied(encounter, field.slice(14) as MedicationVerificationKey);
  let value: unknown = encounter;
  for (const part of field.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  return typeof value === "string" ? Boolean(value.trim()) : value === true || (typeof value === "number" && Number.isFinite(value));
}

/** Positive applicable field evidence comes from the engine requirement map.
 * Engine issues supply validity/concerns, never the only completion evidence.
 * The existing verification predicate handles equivalent structured initiation
 * evidence. This projection grants no clinical or persistence permissions. */
export function projectInjectionWorkflowProgress({ encounter, evaluation, canSign, canSave, lifecycle, dirty = false,
  saving = false, capabilityDetail, reviewInvalidated = false,
}: {
  encounter: InjectionEncounter;
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>;
  canSign: boolean;
  canSave: boolean;
  lifecycle: WorkstationRecordLifecycle;
  dirty?: boolean;
  saving?: boolean;
  capabilityDetail?: string;
  reviewInvalidated?: boolean;
}): InjectionWorkflowProgress {
  const signed = lifecycle === "locked";
  const nonAdministration = Boolean(encounter.disposition.kind && encounter.disposition.kind !== "administered");
  const concerns = [...evaluation.stops, ...evaluation.warnings];
  const fields = Object.entries(evaluation.output.requirements)
    .filter(([, requirement]) => requirement.state === "required" || requirement.state === "pending")
    .map(([field]) => field);
  // Existing optional acknowledgements have their own evaluator advisories.
  // Present them truthfully without turning advisory absence into a sign gate.
  if (!nonAdministration && evaluation.output.medication) {
    for (const field of Object.keys(evaluation.output.requirements).filter(field => field.startsWith("attestations.") && field !== "attestations.prior")) fields.push(field);
  }
  const steps = (Object.keys(LABELS) as InjectionProgressStepId[]).map<InjectionProgressStep>(id => {
    const applicable = !(nonAdministration && ["prepare", "site", "administer"].includes(id));
    const ownedFields = fields.filter(field => injectionStepForField(field) === id);
    const missingFields = ownedFields.filter(field => !present(encounter, field));
    const ownedConcerns = concerns.filter(issue => injectionStepForIssue(issue) === id);
    const hasEvidence = ownedFields.some(field => present(encounter, field));
    let completion: InjectionStepCompletion = ownedFields.length && !missingFields.length && !ownedConcerns.some(issue => issue.severity === "stop")
      ? "complete" : hasEvidence ? "in-progress" : "not-started";
    if (id === "administer" && applicable && encounter.disposition.kind === "administered" &&
        !hasCurrentInjectionAdministrationReview(encounter)) completion = "review-again";
    if (id === "administer" && applicable && reviewInvalidated) completion = "review-again";
    if (id === "sign") completion = signed ? "complete" : "not-started";
    if (signed && applicable) completion = "complete"; // Immutable historical record; no retrospective new requirements.
    const stateLabel = !applicable ? "Not needed" : completion === "complete" ? "Documented" : completion === "review-again" ? "Review again"
      : completion === "in-progress" ? "In progress" : "Not started";
    return { id, label: nonAdministration && id === "sign" ? "Finish handoff" : LABELS[id], applicable, completion, concerns: ownedConcerns, missingFields, stateLabel };
  });
  const persistenceAvailable = !signed && !saving && lifecycle !== "saving" && lifecycle !== "error";
  const canSaveHandoff = persistenceAvailable && nonAdministration && evaluation.output.recordStatus === "handoff-ready" && canSave;
  const actionAvailable = persistenceAvailable && !nonAdministration && canSign;
  const sign = steps.find(step => step.id === "sign")!;
  sign.stateLabel = signed ? "Signed locally" : nonAdministration ? canSaveHandoff ? "Save handoff" : "Review handoff" : actionAvailable ? "Ready to sign" : "Review note";
  const clinicalSteps = steps.filter(step => step.applicable && step.id !== "sign");
  const completed = clinicalSteps.filter(step => step.completion === "complete").length;
  const lifecycleLabel = signed ? "Signed locally" : lifecycle === "error" ? "Save failed" : saving || lifecycle === "saving" ? "Saving locally…"
    : !dirty && lifecycle === "draft" ? nonAdministration ? "Handoff saved locally" : "Saved locally" : "Unsaved changes";
  const headline = signed ? "Signed locally" : saving || lifecycle === "saving" ? "Saving locally…" : lifecycle === "error" ? "Save failed"
    : nonAdministration ? canSaveHandoff ? "Handoff ready to save" : "Review handoff"
    : actionAvailable ? "Ready to sign" : evaluation.output.recordStatus === "ready-to-lock" ? "Signing unavailable" : "Documentation in progress";
  return { steps, concerns, completed, total: clinicalSteps.length, headline, lifecycleLabel,
    actionDetail: !actionAvailable && !canSaveHandoff && !signed ? capabilityDetail : undefined,
    canSign: actionAvailable, canSaveHandoff, signed, nonAdministration };
}
