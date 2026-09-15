import type { Actor, Lot, Patient, Product } from "../../shared/contracts.js";
import {
  injectionInput,
  injectionAssessment,
  injectionFollowUp,
  type InjectionAdministrationInput,
  type InjectionAmendmentInput,
  type InjectionCase,
  type InjectionDispositionInput,
  type InjectionFilingInput,
  type InjectionInput,
  type InjectionReviewInput,
  type InjectionUpdate,
} from "../../shared/injections.js";
import {
  expectedInjectionGuidanceVersion,
  getInjectionReviewChecks,
  hasCurrentInjectionReview,
  reviewIssues,
} from "../../shared/injection-readiness.js";
import {
  workstationState,
  workstationOralComponentIssue,
  WORKSTATION_ENGINE_VERSION,
  type WorkstationState,
} from "../../shared/workstation-contracts.js";
import {
  evaluateWorkstationInjection,
  buildWorkstationEncounter,
  resolveWorkstationMedication,
  workstationStateForRecord,
  expectedPairedProduct,
  pairedProtocols,
  canonicalWorkstationSite,
  workstationLocalDate,
} from "../../shared/workstation-bridge.js";
import { injectionMuscleKey } from "../../shared/workstation/domain/injection-catalog.js";
import { injectionAdministrationReviewFingerprint } from "../../shared/workstation/domain/injection.js";
import { workstationPolicyReviewFingerprint } from "../../shared/workstation-clinical-policy.js";
import { invariant } from "../platform/errors.js";
const id = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();
export function assertInjectionVersion(
  current: InjectionCase,
  expected: number,
) {
  invariant(
    current.version === expected,
    "version_conflict",
    "This injection changed. Refresh before continuing.",
  );
}
function advance(current: InjectionCase): InjectionCase {
  return {
    ...structuredClone(current),
    version: current.version + 1,
    updatedAt: now(),
  };
}
function validateOrder(input: InjectionInput) {
  invariant(
    !input.lastAdministrationAt ||
      Date.parse(input.lastAdministrationAt) <= Date.now(),
    "future_administration",
    "Last administration cannot be in the future.",
    400,
  );
  invariant(
    !input.nextDueOn || input.nextDueOn >= input.plannedOn,
    "next_due",
    "Next dose date cannot precede this planned administration.",
    400,
  );
  invariant(
    !input.lastAdministrationOn ||
      input.lastAdministrationOn <= input.plannedOn,
    "prior_administration",
    "The prior administration date cannot follow this planned date.",
    400,
  );
}
function snapshotOrder(current: InjectionCase): InjectionInput {
  return injectionInput.parse(
    Object.fromEntries(
      Object.keys(injectionInput.shape)
        .filter((key) => current[key as keyof InjectionInput] !== undefined)
        .map((key) => [key, current[key as keyof InjectionInput]]),
    ),
  );
}
export function createInjectionCase(input: InjectionInput): InjectionCase {
  validateOrder(input);
  const at = now();
  return {
    ...input,
    id: id(),
    status: "draft",
    version: 1,
    review: null,
    administration: null,
    disposition: null,
    amendments: [],
    filings: [],
    handoff: "pending",
    createdAt: at,
    updatedAt: at,
  };
}
export function reviseInjection(
  current: InjectionCase,
  input: InjectionUpdate,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status !== "administered" && current.status !== "cancelled",
    "immutable_injection",
    "This injection cannot be edited. Add an amendment to an administration.",
  );
  const { expectedVersion: _, ...changes } = input;
  validateOrder(changes);
  const revised: InjectionCase = {
    ...advance(current),
    ...changes,
    status: "draft",
    review: null,
    disposition: null,
    handoff: "pending",
  };
  // This command replaces the order; omitted optional facts must not survive
  // from a prior medication or timing plan and appear newly verified.
  if (changes.clinicalContext === undefined) delete revised.clinicalContext;
  if (changes.workstation === undefined) delete revised.workstation;
  if (changes.lastAdministrationOn === undefined)
    delete revised.lastAdministrationOn;
  return revised;
}
const PAIR_COMPLETION_STOPS = new Set([
  "initiation.second.given",
  "administration.second-time",
]);
function retrospectiveRecording(
  order: InjectionInput,
  state: WorkstationState | undefined,
  today: string,
): boolean {
  if (state?.recordingMode !== "retrospective") return false;
  invariant(
    order.plannedOn < today,
    "retrospective_date",
    "Retrospective recording applies only to an actual injection from a past clinic date.",
    400,
  );
  invariant(
    state.retrospectiveReason?.trim() &&
      state.stockNotPreviouslyRecorded === true,
    "retrospective_context",
    "Explain the retrospective entry and confirm its package has not already been recorded as used.",
    400,
  );
  return true;
}
const POST_ADMINISTRATION_STOPS = new Set([
  "disposition.required",
  "administration.staff",
  "administration.time",
  "response.required",
  ...PAIR_COMPLETION_STOPS,
]);
function freezePairedCase(value: InjectionCase): InjectionCase {
  const snapshot = structuredClone(value);
  if (snapshot.review) delete snapshot.review.pairedCaseSnapshot;
  if (snapshot.administration) {
    delete snapshot.administration.pairedCaseSnapshot;
    delete snapshot.administration.reviewSnapshot.pairedCaseSnapshot;
  }
  if (snapshot.disposition?.reviewSnapshot)
    delete snapshot.disposition.reviewSnapshot.pairedCaseSnapshot;
  return snapshot;
}
function clinicalStateSignature(state: WorkstationState): string {
  const { response: _, details, ...clinical } = state;
  const preDetails = Object.fromEntries(
    Object.entries(details).filter(
      ([key]) =>
        key.startsWith("lateDose") ||
        ["nextDose", "clinicalReferenceVersion", "ndcSelection"].includes(key),
    ),
  );
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical({ ...clinical, details: preDetails }));
}
function bindProviderAuthorization(
  record: InjectionCase,
  state: WorkstationState,
  timezone: string,
) {
  if (state.details.lateDoseReview !== "provider-authorized") return;
  const communication = record.review?.assessment?.providerCommunication;
  invariant(
    communication?.decision === "proceed_as_ordered" &&
      Number.isFinite(Date.parse(communication.contactedAt)) &&
      Date.parse(communication.contactedAt) <= Date.now(),
    "provider_authorization_unbound",
    "Bind the timing authorization to a valid documented provider communication to proceed.",
    400,
  );
  const localContact = `${workstationLocalDate(communication.contactedAt, timezone)}T${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(communication.contactedAt))}`;
  const submittedTime = state.details.lateDoseReviewTime?.trim();
  const matchesTime =
    submittedTime === communication.contactedAt ||
    submittedTime === localContact;
  invariant(
    state.details.lateDoseReviewProvider?.trim() ===
      communication.provider.trim() &&
      state.details.lateDoseReviewNote?.trim() ===
        communication.instructions.trim() &&
      matchesTime,
    "provider_authorization_mismatch",
    "The timing review must match the documented provider, contact time, and exact instructions.",
    400,
  );
  const encounter = buildWorkstationEncounter(
    record,
    undefined,
    undefined,
    timezone,
  );
  invariant(
    state.details.lateDoseReviewFingerprint ===
      workstationPolicyReviewFingerprint(encounter, {
        indication: record.clinicalContext?.indication,
        priorDose: record.clinicalContext?.priorDose,
        priorProduct: record.clinicalContext?.priorProduct,
        priorMaintenanceDoses: state.priorMaintenanceDoses,
      }),
    "provider_authorization_stale",
    "The timing authorization no longer matches the medication, dates, dose, or verified history. Review the current facts again.",
    400,
  );
  state.details.lateDoseReviewProvider = communication.provider;
  state.details.lateDoseReviewTime = communication.contactedAt;
  state.details.lateDoseReviewNote = communication.instructions;
}
function assertWorkstationFacts(
  record: InjectionCase,
  state: WorkstationState,
  pair?: InjectionCase,
  retrospective = false,
  allowDraftPair = false,
  timezone = "America/Los_Angeles",
) {
  if (!retrospective) {
    const issue = workstationOralComponentIssue(
      state,
      record.plannedOn,
      timezone,
    );
    invariant(
      !issue,
      "oral_protocol_mismatch",
      issue || "Verify the oral component.",
      400,
    );
  }
  if (!retrospective && state.initiation.oralStatus) {
    invariant(
      state.oral && state.oral.status === state.initiation.oralStatus,
      "oral_fact_required",
      "Record the oral medication, exact dose, status, and verification source.",
      400,
    );
    invariant(
      state.oral.status !== "administered" ||
        (state.oral.administeredAt &&
          Date.parse(state.oral.administeredAt) <= Date.now()),
      "oral_time_required",
      "Record the actual oral administration time; it cannot be in the future.",
      400,
    );
    invariant(
      !state.oral.startOn ||
        !state.oral.endOn ||
        state.oral.startOn <= state.oral.endOn,
      "oral_continuation_dates",
      "Oral continuation end cannot precede its start.",
      400,
    );
  }
  if (pairedProtocols.has(state.initiation.protocol)) {
    // Historical missing components remain unconfirmed; any supplied linkage
    // still has to identify the correct patient, day and independent product.
    if (retrospective && !state.pairedCaseId) return;
    invariant(
      state.pairedCaseId && pair && pair.id === state.pairedCaseId,
      "paired_case_required",
      "Link the separately stocked injection component before reviewing this paired protocol.",
      400,
    );
    invariant(
      pair.id !== record.id &&
        pair.patientId === record.patientId &&
        pair.plannedOn === record.plannedOn,
      "paired_case_mismatch",
      "The linked component must be a separate injection for this patient on this clinic date.",
      400,
    );
    const review = pair.administration?.reviewSnapshot ?? pair.review;
    invariant(
      ((allowDraftPair || retrospective) && pair.status === "draft") ||
        (review &&
          (pair.status === "reviewed" || pair.status === "administered")),
      "paired_case_unreviewed",
      "Complete the linked component's independent medication and stock review first.",
      400,
    );
    if (pair.status === "reviewed")
      invariant(
        hasCurrentInjectionReview(review),
        "paired_review_outdated",
        "The linked component needs a current clinical engine review before this injection can proceed.",
        400,
      );
    const primary =
      record.administration?.reviewSnapshot.productSnapshot ??
      record.review?.productSnapshot;
    if (review)
      invariant(
        resolveWorkstationMedication(review.productSnapshot.name) ===
          expectedPairedProduct(
            state.initiation.protocol,
            resolveWorkstationMedication(primary?.name ?? ""),
          ),
        "paired_product",
        "The linked component's product does not match this initiation protocol.",
        400,
      );
    invariant(
      injectionMuscleKey(
        canonicalWorkstationSite(pair.administration?.actualSite ?? pair.site),
      ) !==
        injectionMuscleKey(
          canonicalWorkstationSite(
            record.administration?.actualSite ?? record.site,
          ),
        ),
      "paired_site",
      "Record separate injection muscles for paired components.",
      400,
    );
    invariant(
      !workstationStateForRecord(pair)?.pairedCaseId ||
        workstationStateForRecord(pair)?.pairedCaseId === record.id,
      "paired_case_reused",
      "The linked component is already assigned to a different injection.",
      400,
    );
  } else
    invariant(
      !state.pairedCaseId,
      "paired_protocol_required",
      "Choose the paired initiation protocol before linking a component.",
      400,
    );
}
export function reviewInjectionCase(
  current: InjectionCase,
  input: InjectionReviewInput,
  actor: Actor,
  patient: Patient,
  product: Product,
  lot: Lot,
  today: string,
  movementId: string,
  timezone = "America/Los_Angeles",
  pairedCase?: InjectionCase,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "draft",
    "injection_state",
    "Review a draft injection first.",
  );
  const suppliedState = input.workstation
    ? workstationState.parse(input.workstation)
    : undefined;
  const retrospective = retrospectiveRecording(current, suppliedState, today);
  invariant(
    current.plannedOn === today || retrospective,
    "review_date",
    "Review must be performed on the planned administration date.",
  );
  invariant(
    patient.id === current.patientId &&
      product.id === current.productId &&
      lot.productId === current.productId &&
      lot.id === input.lotId,
    "injection_product",
    "Patient, medication, and selected lot must match the order.",
  );
  invariant(
    ["syringe", "kit", "vial"].includes(product.unit),
    "injection_product",
    "Choose injectable stock.",
  );
  invariant(
    current.timingCategory !== "unknown" || retrospective,
    "timing_unresolved",
    "Resolve timing with the ordering provider before review.",
  );
  invariant(
    input.assessment,
    "assessment_required",
    "Complete the structured clinical screening before review.",
    400,
  );
  const assessment = injectionAssessment.parse(input.assessment);
  const findings = reviewIssues(current, assessment, product.name);
  const reviewBlockingFindings = retrospective
    ? findings.filter((finding) =>
        [
          "assessment_required",
          "screening_incomplete",
          "screening_detail",
          "future_provider_communication",
        ].includes(finding.code),
      )
    : findings;
  if (reviewBlockingFindings.length) {
    const finding = reviewBlockingFindings[0]!;
    invariant(false, finding.code, finding.message, 400);
  }
  const canonicalChecks = getInjectionReviewChecks(product.name);
  // Client labels are presentation only; freeze the server's versioned wording.
  const stampedAssessment = {
    ...assessment,
    screening: canonicalChecks.map((check) => ({
      ...assessment.screening.find((answer) => answer.id === check.id)!,
      label: check.label,
    })),
  };
  const { expectedVersion: _, ...review } = input;
  const state = suppliedState;
  const candidate: InjectionCase = {
    ...advance(current),
    status: "reviewed",
    review: {
      ...review,
      assessment: stampedAssessment,
      guidanceVersion: expectedInjectionGuidanceVersion(product.name),
      ...(state
        ? { workstation: state, engineVersion: WORKSTATION_ENGINE_VERSION }
        : {}),
      ...(pairedCase
        ? { pairedCaseSnapshot: freezePairedCase(pairedCase) }
        : {}),
      reviewedAt: now(),
      reviewedBy: actor.id,
      patientSnapshot: structuredClone(patient),
      productSnapshot: structuredClone(product),
      lotSnapshot: {
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        location: lot.location,
        ownership: lot.ownership,
        ownerPatientId: lot.ownerPatientId,
      },
      reservationMovementId: movementId,
    },
  };
  if (resolveWorkstationMedication(product.name) || state) {
    invariant(
      state,
      "workstation_review_required",
      "Complete the full medication engine review before reserving this injection.",
      400,
    );
    bindProviderAuthorization(candidate, state, timezone);
    assertWorkstationFacts(
      candidate,
      state,
      pairedCase,
      retrospective,
      true,
      timezone,
    );
    const evaluation = evaluateWorkstationInjection(
      candidate,
      patient,
      product,
      timezone,
      pairedCase,
    );
    const findings = evaluation.stops.filter(
      (finding) =>
        !POST_ADMINISTRATION_STOPS.has(finding.code) &&
        !(
          pairedCase?.status === "draft" &&
          [
            "initiation.second.order",
            "initiation.second.ndc",
            "initiation.second.lot",
            "initiation.second.expiration",
          ].includes(finding.code)
        ),
    );
    if (
      evaluation.output.medication?.clinicalReference?.administration
        .requiresHabitusAssessment &&
      evaluation.output.needle.resolution.unresolved
    )
      findings.push({
        code: "needle.unresolved",
        message:
          evaluation.output.needle.resolution.unresolvedReason ||
          "Complete the product-specific body habitus assessment.",
        severity: "stop",
      });
    candidate.review!.engineFindings = [
      ...reviewIssues(current, assessment, product.name),
      ...evaluation.stops.filter(
        (finding) => !POST_ADMINISTRATION_STOPS.has(finding.code),
      ),
    ].map(({ code, message }) => ({ code, message }));
    if (pairedCase?.status === "draft")
      candidate.review!.engineFindings.push({
        code: "workstation.paired-review-pending",
        message:
          "The linked component still requires its own clinical and stock review. Administration is blocked until that review is complete.",
      });
    invariant(
      retrospective || !findings.length,
      "workstation_review_blocked",
      findings.map((finding) => finding.message).join(" "),
      400,
    );
  }
  return candidate;
}
export function administerInjectionCase(
  current: InjectionCase,
  input: InjectionAdministrationInput,
  actor: Actor,
  today: string,
  stockMovementId: string,
  timezone = "America/Los_Angeles",
  pairedCase?: InjectionCase,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "reviewed" && current.review,
    "injection_state",
    "Complete the injection review before administration.",
  );
  invariant(
    hasCurrentInjectionReview(current.review),
    "review_outdated",
    "This saved review predates the current clinical screening. Edit and review the injection again before administration.",
  );
  const retrospective = retrospectiveRecording(
    current,
    current.review.workstation,
    today,
  );
  invariant(
    current.plannedOn === today || retrospective,
    "review_date",
    "This review is from another day. Edit and review the injection again.",
  );
  const at = Date.parse(input.administeredAt);
  invariant(
    workstationLocalDate(input.administeredAt, timezone) ===
      (retrospective ? current.plannedOn : today),
    "administration_date",
    "The actual administration must be on the reviewed clinic date.",
    400,
  );
  invariant(
    Number.isFinite(at) && at <= Date.now(),
    "future_administration",
    "Administration time cannot be in the future.",
    400,
  );
  invariant(
    retrospective || at >= Date.parse(current.review.reviewedAt),
    "administration_before_review",
    "Administration time must follow the completed review.",
    400,
  );
  invariant(
    !current.lastAdministrationAt ||
      Date.parse(current.lastAdministrationAt) < at,
    "prior_administration",
    "The prior administration must be before this administration.",
    400,
  );
  if (input.delivery === "complete")
    invariant(
      input.actualDose === null || input.actualDose === current.dose,
      "actual_dose",
      "Complete delivery must equal the ordered dose.",
      400,
    );
  else {
    invariant(
      input.issueAction,
      "delivery_issue",
      "Record the issue and provider follow-up plan.",
      400,
    );
    invariant(
      input.delivery === "error"
        ? input.actualDose === null ||
            (Number.isFinite(input.actualDose) &&
              input.actualDose >= 0 &&
              input.actualDose <= 1000000)
        : input.delivery === "not_delivered"
          ? input.actualDose === 0
          : input.actualDose === null ||
            (input.actualDose > 0 && input.actualDose < current.dose),
      "actual_dose",
      "Record the delivered amount: zero for no delivery, less than the ordered dose for partial delivery, or the actual amount if known for an administration error.",
      400,
    );
  }
  invariant(
    !input.actualRoute ||
      input.actualRoute === current.route ||
      input.delivery === "error",
    "actual_route",
    "An actual route different from the order must be recorded as an administration error with the issue and provider follow-up.",
    400,
  );
  if (input.followUp) injectionFollowUp.parse(input.followUp);
  const { expectedVersion: _, ...administration } = input;
  // Parse only the order fields; freeze everything used to document this administration.
  const orderSnapshot = snapshotOrder(current);
  const requiresEngine =
    !!resolveWorkstationMedication(current.review.productSnapshot.name) ||
    !!current.review.workstation;
  const state = input.workstation
    ? workstationState.parse(input.workstation)
    : current.review.workstation;
  if (requiresEngine) {
    invariant(
      state &&
        current.review.workstation &&
        current.review.engineVersion === WORKSTATION_ENGINE_VERSION,
      "workstation_review_outdated",
      "This injection needs a new full medication engine review.",
    );
    invariant(
      clinicalStateSignature(state) ===
        clinicalStateSignature(current.review.workstation),
      "workstation_review_changed",
      "Pre-administration engine facts changed. Edit and review the injection again.",
      400,
    );
    assertWorkstationFacts(
      current,
      state,
      pairedCase,
      retrospective,
      false,
      timezone,
    );
  }
  const pendingPair =
    !!state &&
    pairedProtocols.has(state.initiation.protocol) &&
    (!pairedCase?.administration ||
      pairedCase.administration.delivery !== "complete");
  invariant(
    !pendingPair || retrospective || input.followUp?.instructions?.trim(),
    "paired_component_plan",
    "Record follow-up instructions for the pending or incomplete linked injection component.",
    400,
  );
  const candidate: InjectionCase = {
    ...advance(current),
    status: "administered",
    administration: {
      ...administration,
      ...(state ? { workstation: state } : {}),
      ...(pairedCase
        ? { pairedCaseSnapshot: freezePairedCase(pairedCase) }
        : {}),
      actualDose:
        input.delivery === "complete"
          ? (input.actualDose ?? current.dose)
          : input.actualDose,
      id: id(),
      recordedAt: now(),
      actorId: actor.id,
      stockMovementId,
      orderSnapshot,
      reviewSnapshot: structuredClone(current.review),
    },
  };
  if (requiresEngine) {
    const evaluation = evaluateWorkstationInjection(
      candidate,
      undefined,
      undefined,
      timezone,
      pairedCase,
    );
    const findings = evaluation.stops.filter(
      (finding) => !PAIR_COMPLETION_STOPS.has(finding.code),
    );
    // Clinical discrepancies after a real partial/failed/error delivery must be
    // preserved as facts. The prospective reviewed facts remain immutable.
    if (input.delivery === "complete" && !retrospective)
      invariant(
        !findings.length,
        "workstation_administration_blocked",
        findings.map((finding) => finding.message).join(" "),
        400,
      );
    candidate.administration!.engineFindings = evaluation.stops.map(
      ({ code, message }) => ({ code, message }),
    );
    if (pendingPair)
      candidate.administration!.engineFindings.push({
        code: "workstation.pair-pending",
        message:
          "The linked injection component was not recorded as completely administered at the time of this entry. This record does not document a completed paired regimen.",
      });
    const encounter = buildWorkstationEncounter(
      candidate,
      undefined,
      undefined,
      timezone,
    );
    candidate.administration!.engineReviewFingerprint =
      injectionAdministrationReviewFingerprint(encounter);
  }
  return candidate;
}
export function disposeInjection(
  current: InjectionCase,
  input: InjectionDispositionInput,
  actor: Actor,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    ["draft", "reviewed", "held"].includes(current.status),
    "injection_state",
    "A completed or cancelled injection cannot be held or cancelled.",
  );
  return {
    ...advance(current),
    status: input.status,
    review: null,
    handoff: "pending",
    disposition: {
      status: input.status,
      reason: input.reason,
      actorId: actor.id,
      at: now(),
      reviewSnapshot: structuredClone(current.review),
      orderSnapshot: snapshotOrder(current),
    },
  };
}
export function amendInjectionCase(
  current: InjectionCase,
  input: InjectionAmendmentInput,
  actor: Actor,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "administered",
    "injection_state",
    "Amendments apply to recorded administrations.",
  );
  const value = advance(current);
  value.amendments.push({
    id: id(),
    text: input.text,
    reason: input.reason,
    actorId: actor.id,
    createdAt: now(),
  });
  value.handoff = "pending";
  return value;
}
export function fileInjectionCase(
  current: InjectionCase,
  input: InjectionFilingInput,
  actor: Actor,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "administered" ||
      current.status === "held" ||
      current.status === "cancelled",
    "injection_state",
    "Complete or hold the injection before marking documentation filed.",
  );
  invariant(
    current.handoff !== "filed",
    "already_filed",
    "This documentation is already marked filed.",
  );
  const value = advance(current);
  value.filings.push({
    id: id(),
    tebraReference: input.tebraReference,
    actorId: actor.id,
    filedAt: now(),
    amendmentCount: current.amendments.length,
  });
  value.handoff = "filed";
  return value;
}
