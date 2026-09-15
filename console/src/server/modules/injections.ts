import type { Actor, Lot, Patient, Product } from "../../shared/contracts.js";
import {
  injectionInput,
  type InjectionAdministrationInput,
  type InjectionAmendmentInput,
  type InjectionCase,
  type InjectionDispositionInput,
  type InjectionFilingInput,
  type InjectionInput,
  type InjectionReviewInput,
  type InjectionUpdate,
} from "../../shared/injections.js";
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
  return {
    ...advance(current),
    ...changes,
    status: "draft",
    review: null,
    disposition: null,
    handoff: "pending",
  };
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
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "draft",
    "injection_state",
    "Review a draft injection first.",
  );
  invariant(
    current.plannedOn === today,
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
    current.timingCategory !== "unknown",
    "timing_unresolved",
    "Resolve timing with the ordering provider before review.",
  );
  const { expectedVersion: _, ...review } = input;
  return {
    ...advance(current),
    status: "reviewed",
    review: {
      ...review,
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
}
export function administerInjectionCase(
  current: InjectionCase,
  input: InjectionAdministrationInput,
  actor: Actor,
  today: string,
  stockMovementId: string,
): InjectionCase {
  assertInjectionVersion(current, input.expectedVersion);
  invariant(
    current.status === "reviewed" && current.review,
    "injection_state",
    "Complete the injection review before administration.",
  );
  invariant(
    current.plannedOn === today,
    "review_date",
    "This review is from another day. Edit and review the injection again.",
  );
  const at = Date.parse(input.administeredAt);
  invariant(
    Number.isFinite(at) && at <= Date.now(),
    "future_administration",
    "Administration time cannot be in the future.",
    400,
  );
  invariant(
    at >= Date.parse(current.review.reviewedAt),
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
      input.delivery === "not_delivered"
        ? input.actualDose === 0
        : input.actualDose === null ||
            (input.actualDose > 0 && input.actualDose < current.dose),
      "actual_dose",
      "Record the delivered amount: zero for no delivery, or less than the ordered dose for partial delivery.",
      400,
    );
  }
  const { expectedVersion: _, ...administration } = input;
  // Parse only the order fields; freeze everything used to document this administration.
  const orderSnapshot = injectionInput.parse(
    Object.fromEntries(
      Object.keys(injectionInput.shape).map((key) => [
        key,
        current[key as keyof InjectionInput],
      ]),
    ),
  );
  return {
    ...advance(current),
    status: "administered",
    administration: {
      ...administration,
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
