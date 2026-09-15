import {
  getInjectionGuidance,
  INJECTION_GUIDANCE_VERSION,
} from "./injection-guidance.js";
import type {
  InjectionAssessment,
  InjectionInput,
  InjectionReview,
} from "./injections.js";

export function expectedInjectionGuidanceVersion(productName: string) {
  return (
    getInjectionGuidance(productName)?.version ||
    `${INJECTION_GUIDANCE_VERSION}:general`
  );
}

export function hasCurrentInjectionReview(
  review: InjectionReview | null | undefined,
): boolean {
  return (
    !!review?.assessment &&
    review.guidanceVersion ===
      expectedInjectionGuidanceVersion(review.productSnapshot.name)
  );
}

export const GENERAL_INJECTION_CHECKS = [
  {
    id: "interval_changes",
    label: "Changes since the last visit",
    prompt:
      "Review new medications, recent care, allergies, and other changes relevant to the ordered injection.",
  },
  {
    id: "previous_response",
    label: "Previous treatment response",
    prompt:
      "Review the prior injection response, adverse effects, and known tolerability; explain if there is no prior treatment history.",
  },
  {
    id: "current_symptoms",
    label: "Current symptoms and readiness",
    prompt:
      "Review current symptoms and concerns that require the ordering provider's assessment before administration.",
  },
] as const;

export function getInjectionReviewChecks(productName: string) {
  const guidance = getInjectionGuidance(productName);
  const checks = [
    ...GENERAL_INJECTION_CHECKS,
    ...(guidance?.clinicalChecks || []),
  ];
  // A duplicated guideline id must never cause an ambiguous clinical attestation.
  if (new Set(checks.map((check) => check.id)).size !== checks.length)
    throw new Error(
      "Injection guidance contains duplicate screening identifiers.",
    );
  return checks;
}

export interface InjectionReviewIssue {
  code: string;
  message: string;
}

/** These findings describe documentation readiness, never clinical clearance. */
export function reviewIssues(
  order: InjectionInput,
  assessment: InjectionAssessment | undefined,
  productName: string,
  now = Date.now(),
): InjectionReviewIssue[] {
  const issues: InjectionReviewIssue[] = [];
  if (getInjectionGuidance(productName)?.requiresSpecialistSetting)
    issues.push({
      code: "specialist_setting_required",
      message:
        "This medication requires a specialized administration setting that this console has not established. Use the authorized specialist workflow.",
    });
  if (!assessment)
    return [
      {
        code: "assessment_required",
        message: "Complete the structured clinical screening before review.",
      },
    ];
  const expected = getInjectionReviewChecks(productName);
  const provided = new Set(assessment.screening.map((check) => check.id));
  if (
    provided.size !== assessment.screening.length ||
    expected.length !== assessment.screening.length ||
    expected.some((check) => !provided.has(check.id))
  )
    issues.push({
      code: "screening_incomplete",
      message:
        "Answer every current screening item once for this medication. Refresh the review if the medication or guidance changed.",
    });
  if (
    assessment.screening.some(
      (check) => check.result !== "no_concern" && !check.detail?.trim(),
    )
  )
    issues.push({
      code: "screening_detail",
      message:
        "Describe each concern and explain each screening item marked not applicable.",
    });
  const communication = assessment.providerCommunication;
  const needsProvider =
    order.timingCategory !== "scheduled" ||
    (!!order.clinicalContext &&
      order.clinicalContext.phase !== "maintenance") ||
    assessment.screening.some((check) => check.result === "concern");
  if (needsProvider && communication?.decision !== "proceed_as_ordered")
    issues.push({
      code: "provider_plan_required",
      message:
        "Record the provider's instruction to proceed with this order for a concern, initiation, restart, switch, or nonroutine timing.",
    });
  else if (communication && communication.decision !== "proceed_as_ordered")
    issues.push({
      code: "provider_plan_unresolved",
      message:
        "The documented provider decision is to hold or clarify. Resolve the plan before review, or hold this injection.",
    });
  if (
    communication &&
    (!Number.isFinite(Date.parse(communication.contactedAt)) ||
      Date.parse(communication.contactedAt) > now)
  )
    issues.push({
      code: "future_provider_communication",
      message: "Provider contact time cannot be in the future.",
    });
  if (
    (order.lastAdministrationAt || order.lastAdministrationOn) &&
    !order.clinicalContext?.historySource
  )
    issues.push({
      code: "history_source_required",
      message:
        "Record the source used to verify the prior administration date.",
    });
  return issues;
}
