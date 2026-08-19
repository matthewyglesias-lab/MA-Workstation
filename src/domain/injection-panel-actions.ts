import {
  INJECTION_MEDICATIONS,
  preferredIntervalForDose,
  type InjectionIntervalKey,
  type InjectionMedicationKey,
} from "./injection-catalog";
import {
  emptyInjectionInitiation,
  injectionAdministrationReviewFingerprint,
  type InjectionAdministrationDetails,
  type InjectionDisposition,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
} from "./injection";
import type { InjectionDocumentationMetadata, InjectionNdcSelection } from "./injection-ndc";
import type { ClinicalEvaluation } from "./contracts";
import { isValidIsoDate } from "./dates";

export interface InjectionFieldChangePatch {
  encounter: Partial<InjectionEncounter>;
  details: Partial<InjectionAdministrationDetails & InjectionDocumentationMetadata>;
  /** True when this change overwrites a real prior selection, not a first-ever pick. */
  invalidated: boolean;
}

export function medicationChangePatch(
  encounter: InjectionEncounter,
  key: InjectionMedicationKey | "",
): InjectionFieldChangePatch {
  const catalogMedication = key && key !== "other" ? INJECTION_MEDICATIONS[key] : null;
  const defaultDose =
    catalogMedication?.doses.length === 1 ? (catalogMedication.doses[0] ?? "") : "";
  const defaultIntervalKey =
    catalogMedication && defaultDose
      ? preferredIntervalForDose(catalogMedication, defaultDose, catalogMedication.intervalKey)
      : (catalogMedication?.intervalKey ?? "");
  return {
    invalidated: Boolean(encounter.medicationKey && encounter.medicationKey !== key),
    encounter: {
      medicationKey: key,
      customMedication: "",
      dose: defaultDose,
      site: "",
      route: catalogMedication?.route ?? "",
      intervalKey: defaultIntervalKey,
      nextDoseDate: "",
      traceability: { ...encounter.traceability, ndc: "" },
      verifications: {},
      initiation: emptyInjectionInitiation(),
    },
    details: {
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
        pairedSecond: undefined,
      },
      nextDose: undefined,
    },
  };
}

export function doseChangePatch(encounter: InjectionEncounter, dose: string): InjectionFieldChangePatch {
  const catalogMedication =
    encounter.medicationKey && encounter.medicationKey !== "other"
      ? INJECTION_MEDICATIONS[encounter.medicationKey]
      : null;
  return {
    invalidated: Boolean(encounter.dose && encounter.dose !== dose),
    encounter: {
      dose,
      intervalKey: catalogMedication
        ? preferredIntervalForDose(catalogMedication, dose, encounter.intervalKey)
        : encounter.intervalKey,
      traceability: { ...encounter.traceability, ndc: "" },
    },
    details: {
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
      },
    },
  };
}

export function intervalChangePatch(intervalKey: InjectionIntervalKey | ""): Partial<InjectionEncounter> {
  return { intervalKey };
}

const suggestedNextDoseFrom = (
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
): string =>
  evaluation?.calculatedDates.expectedNextDoseDate ??
  evaluation?.calculatedDates.nextDoseDate ??
  evaluation?.calculatedDates.expectedNextDue ??
  "";

const nextDoseCalculationInputFor = (encounter: InjectionEncounter): string =>
  `${encounter.administrationDate}|${encounter.intervalKey}`;

export type NextDoseProvenanceDecision =
  | { kind: "legacy-review" }
  | { kind: "manual-override"; reason: string }
  | { kind: "one-time-no-return" }
  | { kind: "enter-return-date" }
  | { kind: "enter-administration-and-interval" }
  | { kind: "sustenna-day8"; administrationDate: string }
  | { kind: "cadence"; cadence: string; administrationDate: string };

/**
 * Decides *why* the next-dose field reads the way it does, without the
 * display-string formatting (`registerDate`/MM-DD-YY rendering), which stays
 * a presentation concern - this codebase's domain layer never imports from
 * presentation.
 */
export function nextDoseProvenanceDecision(
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
): NextDoseProvenanceDecision {
  const medication = encounter.medicationKey ? INJECTION_MEDICATIONS[encounter.medicationKey] : null;
  const manualReturnDate = medication?.key === "other";
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
  const nextDoseMetadata = documentationMetadata?.nextDose;
  const legacyOtherReturnDateNeedsReview = Boolean(
    manualReturnDate && encounter.nextDoseDate && !nextDoseMetadata?.source,
  );
  if (legacyOtherReturnDateNeedsReview) {
    return { kind: "legacy-review" };
  }
  if (nextDoseMetadata?.source === "manual") {
    return {
      kind: "manual-override",
      reason: nextDoseMetadata.overrideReason || "manual date requires review",
    };
  }
  const suggestedNextDose = suggestedNextDoseFrom(evaluation);
  if (!suggestedNextDose) {
    if (manualReturnDate) {
      const oneTimeOtherWithoutReturn = encounter.intervalKey === "once" && !encounter.nextDoseDate;
      return oneTimeOtherWithoutReturn ? { kind: "one-time-no-return" } : { kind: "enter-return-date" };
    }
    return { kind: "enter-administration-and-interval" };
  }
  if (encounter.initiation?.protocol === "sustenna-day1") {
    return { kind: "sustenna-day8", administrationDate: encounter.administrationDate };
  }
  const cadence = evaluation?.output.timing.cadenceLabel || encounter.intervalKey;
  return { kind: "cadence", cadence, administrationDate: encounter.administrationDate };
}

export interface NextDosePatch {
  encounter: Partial<InjectionEncounter>;
  details: Partial<InjectionAdministrationDetails & InjectionDocumentationMetadata>;
}

export function applyCalculatedNextDosePatch(encounter: InjectionEncounter, value: string): NextDosePatch {
  return {
    encounter: { nextDoseDate: value },
    details: {
      nextDose: {
        value,
        source: "calculated",
        calculatedFrom: nextDoseCalculationInputFor(encounter),
      },
    },
  };
}

export interface ManualNextDoseOverride {
  kind: "active-order" | "provider-direction";
  reason: string;
  provider?: string;
}

export function applyManualNextDosePatch(
  encounter: InjectionEncounter,
  value: string,
  override: ManualNextDoseOverride,
  recordedAt: string,
): NextDosePatch {
  return {
    encounter: { nextDoseDate: value },
    details: {
      nextDose: {
        value,
        source: "manual",
        calculatedFrom: nextDoseCalculationInputFor(encounter),
        overrideKind: override.kind,
        overrideReason: override.reason.trim(),
        overrideProvider: override.kind === "provider-direction" ? override.provider?.trim() : undefined,
        recordedAt,
      },
    },
  };
}

export interface NextDoseOverrideDraft {
  date: string;
  kind: "active-order" | "provider-direction";
  reason: string;
  provider: string;
}

/** Null when the draft fails the same validation the confirm button gates on. */
export function validatedNextDoseOverride(
  draft: NextDoseOverrideDraft,
): { value: string; override: ManualNextDoseOverride } | null {
  if (!isValidIsoDate(draft.date) || !draft.reason.trim()) return null;
  if (draft.kind === "provider-direction" && !draft.provider.trim()) return null;
  return { value: draft.date, override: { kind: draft.kind, reason: draft.reason, provider: draft.provider } };
}

export function selectDispositionPatch(
  encounter: InjectionEncounter,
  kind: InjectionDisposition["kind"],
  staffSignInValue: string,
  recordedAt: string,
): Partial<InjectionDisposition> {
  if (kind === "administered") {
    return {
      kind,
      provider: "",
      time: "",
      outcome: "",
      reviewedBy: staffSignInValue.trim() || encounter.administeredBy.trim(),
      reviewedAt: recordedAt,
      reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
    };
  }
  return { kind, reviewedBy: "", reviewedAt: "", reviewFingerprint: "" };
}

/** Reads the loosely-typed optional field the evaluator adds to its output at runtime. */
const clinicalReferenceVersionOf = (
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
): string | undefined => (evaluation?.output as { clinicalReferenceVersion?: string } | undefined)?.clinicalReferenceVersion;

export function applyPrimaryNdcPatch(
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
  value: string,
  selection: InjectionNdcSelection | undefined,
): NextDosePatch {
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
  return {
    encounter: { traceability: { ...encounter.traceability, ndc: value } },
    details: {
      clinicalReferenceVersion: clinicalReferenceVersionOf(evaluation) ?? documentationMetadata?.clinicalReferenceVersion,
      ndcSelection: { ...(documentationMetadata?.ndcSelection ?? {}), primary: selection },
    },
  };
}

export function applyPairedNdcPatch(
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
  value: string,
  selection: InjectionNdcSelection | undefined,
): NextDosePatch {
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
  const initiation = encounter.initiation ?? emptyInjectionInitiation();
  return {
    encounter: { initiation: { ...initiation, second: { ...initiation.second, ndc: value } } },
    details: {
      clinicalReferenceVersion: clinicalReferenceVersionOf(evaluation) ?? documentationMetadata?.clinicalReferenceVersion,
      ndcSelection: { ...(documentationMetadata?.ndcSelection ?? {}), pairedSecond: selection },
    },
  };
}

export interface LateDoseReviewDraft {
  choice: "provider-authorized" | "other";
  note: string;
  provider: string;
  time: string;
}

export function lateDoseReviewConfirmationPatch(
  draft: LateDoseReviewDraft,
  fingerprint: string,
): Partial<InjectionAdministrationDetails & InjectionDocumentationMetadata> {
  return {
    lateDoseReview: draft.choice,
    lateDoseReviewNote: draft.note.trim(),
    lateDoseReviewProvider: draft.choice === "provider-authorized" ? draft.provider.trim() : "",
    lateDoseReviewTime: draft.choice === "provider-authorized" ? draft.time.trim() : "",
    lateDoseReviewFingerprint: fingerprint,
  };
}

export type NextDoseAutoFillDecision =
  | { action: "noop" }
  | { action: "clear" }
  | { action: "sync-metadata"; value: string; calculatedFrom: string }
  | { action: "apply"; value: string };

/**
 * Decides whether the next-dose field should track the evaluator's
 * calculated suggestion, given the ref that remembers the last value *this
 * effect itself* wrote (so a staff-typed value is never mistaken for a
 * stale auto-fill and silently overwritten).
 *
 * - "clear": no suggestion currently applies and the stored value was this
 *   effect's own prior auto-fill (or tagged "calculated") - remove it
 *   rather than leave a stale date computed under a since-changed protocol.
 * - "sync-metadata": the field already reads the suggested value, but its
 *   provenance metadata does not yet say so - backfill the tag without
 *   touching the (already-correct) displayed date.
 * - "apply": the field should adopt the newly suggested date.
 * - "noop": a staff-entered value that doesn't match tracked auto-fill
 *   state is left alone.
 */
export function nextDoseAutoFillDecision(
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput> | null | undefined,
  autoCalculatedNextDue: string,
  locked: boolean | undefined,
): NextDoseAutoFillDecision {
  const nonAdministration = Boolean(
    encounter.disposition.kind && encounter.disposition.kind !== "administered",
  );
  if (locked || nonAdministration) return { action: "noop" };

  const current = encounter.nextDoseDate;
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
  const nextDoseSource = documentationMetadata?.nextDose?.source;
  const suggestedNextDose = suggestedNextDoseFrom(evaluation);

  if (!suggestedNextDose) {
    const wasAutoCalculated =
      Boolean(current) && (current === autoCalculatedNextDue || nextDoseSource === "calculated");
    return wasAutoCalculated ? { action: "clear" } : { action: "noop" };
  }

  const canReplace = !current || current === autoCalculatedNextDue || nextDoseSource === "calculated";
  if (!canReplace) return { action: "noop" };

  if (current === suggestedNextDose) {
    return nextDoseSource === "calculated"
      ? { action: "noop" }
      : { action: "sync-metadata", value: suggestedNextDose, calculatedFrom: nextDoseCalculationInputFor(encounter) };
  }

  return { action: "apply", value: suggestedNextDose };
}
