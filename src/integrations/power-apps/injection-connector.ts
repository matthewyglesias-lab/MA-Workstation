import type { ClinicalEvaluation, ClinicalIssue } from "../../domain/contracts";
import {
  InjectionEngine,
  hasCompleteManualNextDoseProvenance,
  hasCurrentInjectionAdministrationReview,
  injectionAdministrationReviewFingerprint,
  injectionResponseHeadline,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
  type InjectionNeedleProjection,
} from "../../domain/injection";
import { isValidIsoDate } from "../../domain/dates";
import { INJECTION_CLINICAL_REFERENCE_VERSION } from "../../domain/injection-clinical-reference";
import {
  buildInjectionAvsModel,
  type InjectionAvsModel,
} from "../../domain/injection-avs-content";
import {
  buildInjectionAvsHtml,
  type InjectionAvsInput,
} from "../../domain/injection-avs-render";
import { resolveProviderDisplay } from "../../domain/provider-register";
import { formatInjectionDocumentation } from "../../documentation/injection";
import type { InjectionDocumentationResult } from "../../documentation/types";
import { injectionEncounterToDocumentationInput } from "../../documentation/adapters/injection-from-encounter";

export const POWER_APPS_INJECTION_SCHEMA_VERSION = "2026-08-30.1";
export const POWER_APPS_ATTESTATION_STATEMENT_VERSION = "clinical-action-v1";
export const POWER_APPS_NOTE_TEMPLATE_VERSION = "injection-note-rc6.1";
export const POWER_APPS_AVS_TEMPLATE_VERSION = "injection-avs-2026.08";

export type InjectionDocumentLocale = "en-US" | "es-US";

export type CheckInAcknowledgement =
  | {
      kind: "tebra";
      acknowledgedAtUtc: string;
      acknowledgedByUserId: string;
      acknowledgedByDisplayName: string;
    }
  | {
      kind: "manual";
      acknowledgedAtUtc: string;
      acknowledgedByUserId: string;
      acknowledgedByDisplayName: string;
      reason: string;
      source: string;
    };

export interface InjectionSourceReference {
  actionId: string;
  checkInId: string;
  patientId: string;
  orderId: string;
  sourceRecordVersion: string;
  patientRecordNumber?: string;
}

export interface InjectionClinicConfiguration {
  facilityName: string;
  facilityUnit: string;
  clinicPhone: string;
  timeZone: string;
}

export interface EvaluateInjectionRequest {
  schemaVersion: typeof POWER_APPS_INJECTION_SCHEMA_VERSION;
  source: InjectionSourceReference;
  encounter: InjectionEncounter;
  /** Server-resolved facility date in ISO yyyy-mm-dd form. */
  facilityDate: string;
  previousSite?: string;
}

export interface FinalizeInjectionRequest extends EvaluateInjectionRequest {
  acknowledgement: CheckInAcknowledgement;
  expectedEvaluationFingerprint: string;
  idempotencyKey: string;
  /** Assigned by the authenticated host, never trusted from a display field. */
  finalizedByUserId: string;
  finalizedByDisplayName: string;
  finalizedAtUtc: string;
}

export interface InjectionEvaluationResponse {
  schemaVersion: typeof POWER_APPS_INJECTION_SCHEMA_VERSION;
  source: InjectionSourceReference;
  evaluationFingerprint: string;
  readiness: ClinicalEvaluation<InjectionEvaluationOutput>["readiness"];
  stops: ClinicalIssue[];
  warnings: ClinicalIssue[];
  recommendations: ClinicalEvaluation<InjectionEvaluationOutput>["recommendations"];
  calculatedDates: Record<string, string>;
  canFinalize: boolean;
  recordStatus: InjectionEvaluationOutput["recordStatus"];
  allowedRoutes: string[];
  allowedSites: string[];
  recommendedSite: string;
  repeatsPreviousSite: boolean;
  requiredVerifications: InjectionEvaluationOutput["requiredVerifications"];
  requirements: InjectionEvaluationOutput["requirements"];
  guidance: InjectionEvaluationOutput["guidance"];
  needle: InjectionNeedleProjection;
  timing: InjectionEvaluationOutput["timing"];
  expectedNextDoseDate: string;
  clinicalReferenceVersion?: string;
}

export interface InjectionDocumentProvenance {
  schemaVersion: typeof POWER_APPS_INJECTION_SCHEMA_VERSION;
  sourceRecordVersion: string;
  evaluationFingerprint: string;
  clinicalReferenceVersion: string;
  noteTemplateVersion: typeof POWER_APPS_NOTE_TEMPLATE_VERSION;
  avsTemplateVersion: typeof POWER_APPS_AVS_TEMPLATE_VERSION;
}

export interface InjectionDocumentBundle {
  source: InjectionSourceReference;
  status: "finalized";
  disposition: "administered" | "held" | "escalated" | "provider";
  finalizedBy: {
    userId: string;
    displayName: string;
    atUtc: string;
  };
  acknowledgement: CheckInAcknowledgement;
  clinicalNote: InjectionDocumentationResult;
  patientDocument: {
    kind: "patient-avs" | "care-handoff";
    locale: "en-US";
    model: InjectionAvsModel;
    html: string;
  };
  provenance: InjectionDocumentProvenance;
}

export type InjectionConnectorErrorCode =
  | "schema-version-mismatch"
  | "invalid-source"
  | "invalid-facility-date"
  | "invalid-clinic-configuration"
  | "invalid-acknowledgement"
  | "invalid-finalizer"
  | "invalid-idempotency-key"
  | "administration-review-required"
  | "stale-evaluation"
  | "clinical-stop"
  | "documentation-unavailable"
  | "locale-not-approved";

export interface InjectionConnectorError {
  code: InjectionConnectorErrorCode;
  message: string;
  stops?: ClinicalIssue[];
  currentEvaluationFingerprint?: string;
}

export type InjectionConnectorResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: InjectionConnectorError };

const nonEmpty = (value: string | undefined): boolean => Boolean(value?.trim());
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoInstant = (value: string): boolean => {
  if (!value.trim()) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
};

/**
 * A compact, non-reversible revision marker. This is a stale-data guard, not
 * an authorization or tamper-proofing mechanism; the host still reloads the
 * authoritative source and reruns the engine before persistence.
 */
const fnv1a64 = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
};

const evaluationFingerprint = (
  request: EvaluateInjectionRequest,
): string =>
  fnv1a64(
    [
      request.source.sourceRecordVersion,
      request.facilityDate,
      INJECTION_CLINICAL_REFERENCE_VERSION,
      injectionAdministrationReviewFingerprint(request.encounter),
      JSON.stringify(request.encounter.disposition),
    ].join("|"),
  );

const validateBaseRequest = (
  request: EvaluateInjectionRequest,
): InjectionConnectorError | null => {
  if (request.schemaVersion !== POWER_APPS_INJECTION_SCHEMA_VERSION) {
    return {
      code: "schema-version-mismatch",
      message: `Expected schema ${POWER_APPS_INJECTION_SCHEMA_VERSION}.`,
    };
  }
  const source = request.source;
  if (
    !source ||
    !nonEmpty(source.actionId) ||
    !nonEmpty(source.checkInId) ||
    !nonEmpty(source.patientId) ||
    !nonEmpty(source.orderId) ||
    !nonEmpty(source.sourceRecordVersion)
  ) {
    return {
      code: "invalid-source",
      message: "Action, check-in, patient, order, and source-version identifiers are required.",
    };
  }
  if (!ISO_DATE.test(request.facilityDate) || !isValidIsoDate(request.facilityDate)) {
    return {
      code: "invalid-facility-date",
      message: "The server-resolved facility date must use yyyy-mm-dd format.",
    };
  }
  return null;
};

const validClinicConfiguration = (
  clinic: InjectionClinicConfiguration,
): boolean => {
  if (
    !clinic ||
    !nonEmpty(clinic.facilityName) ||
    !nonEmpty(clinic.facilityUnit) ||
    !nonEmpty(clinic.clinicPhone) ||
    !nonEmpty(clinic.timeZone)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: clinic.timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

const validAcknowledgement = (value: CheckInAcknowledgement): boolean => {
  if (
    !value ||
    !nonEmpty(value.acknowledgedByUserId) ||
    !nonEmpty(value.acknowledgedByDisplayName) ||
    !isIsoInstant(value.acknowledgedAtUtc)
  ) {
    return false;
  }
  return value.kind === "tebra"
    ? true
    : value.kind === "manual" && nonEmpty(value.reason) && nonEmpty(value.source);
};

const evaluate = (
  request: EvaluateInjectionRequest,
): ClinicalEvaluation<InjectionEvaluationOutput> =>
  InjectionEngine.evaluate(request.encounter, {
    today: request.facilityDate,
    ...(request.previousSite ? { previousSite: request.previousSite } : {}),
  });

export const evaluateInjectionForPowerApps = (
  request: EvaluateInjectionRequest,
): InjectionConnectorResult<InjectionEvaluationResponse> => {
  const invalid = validateBaseRequest(request);
  if (invalid) return { ok: false, error: invalid };

  const evaluation = evaluate(request);
  return {
    ok: true,
    value: {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: request.source,
      evaluationFingerprint: evaluationFingerprint(request),
      readiness: evaluation.readiness,
      stops: evaluation.stops,
      warnings: evaluation.warnings,
      recommendations: evaluation.recommendations,
      calculatedDates: evaluation.calculatedDates,
      canFinalize: evaluation.output.canFinalize && evaluation.stops.length === 0,
      recordStatus: evaluation.output.recordStatus,
      allowedRoutes: evaluation.output.allowedRoutes,
      allowedSites: evaluation.output.allowedSites,
      recommendedSite: evaluation.output.recommendedSite,
      repeatsPreviousSite: evaluation.output.repeatsPreviousSite,
      requiredVerifications: evaluation.output.requiredVerifications,
      requirements: evaluation.output.requirements,
      guidance: evaluation.output.guidance,
      needle: evaluation.output.needle,
      timing: evaluation.output.timing,
      expectedNextDoseDate: evaluation.output.expectedNextDoseDate,
      ...(evaluation.output.clinicalReferenceVersion
        ? { clinicalReferenceVersion: evaluation.output.clinicalReferenceVersion }
        : {}),
    },
  };
};

const nextDoseDateForAvs = (encounter: InjectionEncounter): string => {
  if (encounter.medicationKey !== "other") return encounter.nextDoseDate;
  return hasCompleteManualNextDoseProvenance(
    encounter.details?.nextDose,
    encounter.nextDoseDate,
  )
    ? encounter.nextDoseDate
    : "";
};

export const injectionEncounterToAvsInput = (
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  source: InjectionSourceReference,
  clinic: InjectionClinicConfiguration,
): InjectionAvsInput => {
  const medication = evaluation.output.medication;
  const initiation = encounter.initiation;
  const second = initiation?.second;
  const medicationName =
    encounter.medicationKey === "other"
      ? encounter.customMedication?.trim() ?? ""
      : medication?.name || medication?.label || "";

  return {
    patientName: encounter.patient.name,
    patientDob: encounter.patient.dob,
    recordNumber: source.patientRecordNumber?.trim() || source.actionId,
    orderingProvider: resolveProviderDisplay(encounter.orderingProvider),
    administeredBy: encounter.administeredBy,
    medicationKey: encounter.medicationKey,
    medicationName,
    genericName: medication?.generic ?? "",
    dose: encounter.dose,
    route: encounter.route,
    site: encounter.site,
    intervalKey: encounter.intervalKey,
    administrationDate: encounter.administrationDate,
    administrationTime: encounter.administrationTime,
    nextDoseDate: nextDoseDateForAvs(encounter),
    lot: encounter.traceability.lot,
    expiration: encounter.traceability.expiration,
    responseLabel: injectionResponseHeadline(encounter.response),
    reason: encounter.reason,
    initiationProtocol: initiation?.protocol ?? "",
    day1Date: initiation?.day1Date ?? "",
    clinicPhone: clinic.clinicPhone,
    dispositionKind: encounter.disposition.kind,
    secondDose: second?.dose ?? "",
    secondSite: second?.site ?? "",
    secondLot: second?.lot ?? "",
    secondExpiration: second?.expiration ?? "",
    secondGiven: Boolean(second?.given),
    oralStatus: initiation?.oralStatus ?? "",
  };
};

/**
 * Produces the immutable payload a host persists after it has reloaded the
 * source record, enforced authorization/idempotency, and opened a transaction.
 * It deliberately performs no storage itself so browser-local persistence can
 * never be mistaken for a clinical system of record.
 */
export const prepareInjectionFinalization = (
  request: FinalizeInjectionRequest,
  clinic: InjectionClinicConfiguration,
  locale: InjectionDocumentLocale = "en-US",
): InjectionConnectorResult<InjectionDocumentBundle> => {
  const invalid = validateBaseRequest(request);
  if (invalid) return { ok: false, error: invalid };
  if (!validClinicConfiguration(clinic)) {
    return {
      ok: false,
      error: {
        code: "invalid-clinic-configuration",
        message: "Facility name, unit, phone, and a valid IANA time zone are required.",
      },
    };
  }
  if (!validAcknowledgement(request.acknowledgement)) {
    return {
      ok: false,
      error: {
        code: "invalid-acknowledgement",
        message: "A Tebra acknowledgement or documented manual acknowledgement is required.",
      },
    };
  }
  if (
    !nonEmpty(request.finalizedByUserId) ||
    !nonEmpty(request.finalizedByDisplayName) ||
    !isIsoInstant(request.finalizedAtUtc)
  ) {
    return {
      ok: false,
      error: {
        code: "invalid-finalizer",
        message: "The authenticated finalizer and server timestamp are required.",
      },
    };
  }
  if (
    !nonEmpty(request.idempotencyKey) ||
    request.idempotencyKey.trim().length < 16 ||
    request.idempotencyKey.length > 200
  ) {
    return {
      ok: false,
      error: {
        code: "invalid-idempotency-key",
        message: "An idempotency key is required for finalization.",
      },
    };
  }
  if (
    request.encounter.disposition.kind === "administered" &&
    (!request.encounter.disposition.reviewedBy?.trim() ||
      !request.encounter.disposition.reviewedAt?.trim() ||
      !request.encounter.disposition.reviewFingerprint?.trim() ||
      !hasCurrentInjectionAdministrationReview(request.encounter))
  ) {
    return {
      ok: false,
      error: {
        code: "administration-review-required",
        message: "A current, attributed final administration review is required.",
      },
    };
  }
  if (locale !== "en-US") {
    return {
      ok: false,
      error: {
        code: "locale-not-approved",
        message: "The Spanish AVS is blocked until its clinician-reviewed content library is installed.",
      },
    };
  }

  const evaluation = evaluate(request);
  const currentFingerprint = evaluationFingerprint(request);
  if (request.expectedEvaluationFingerprint !== currentFingerprint) {
    return {
      ok: false,
      error: {
        code: "stale-evaluation",
        message: "The injection record changed after review. Re-evaluate before finalizing.",
        currentEvaluationFingerprint: currentFingerprint,
      },
    };
  }
  if (!evaluation.output.canFinalize || evaluation.stops.length) {
    return {
      ok: false,
      error: {
        code: "clinical-stop",
        message: "The injection cannot be finalized while clinical requirements remain unresolved.",
        stops: evaluation.stops,
      },
    };
  }

  const noteInput = injectionEncounterToDocumentationInput(request.encounter, evaluation);
  if (!noteInput) {
    return {
      ok: false,
      error: {
        code: "documentation-unavailable",
        message: "The finalized encounter did not produce a complete clinical note input.",
      },
    };
  }
  const clinicalNote = formatInjectionDocumentation(noteInput, evaluation);
  if (!clinicalNote.text.trim()) {
    return {
      ok: false,
      error: {
        code: "documentation-unavailable",
        message: "The finalized encounter produced an empty clinical note.",
      },
    };
  }

  const avsInput = injectionEncounterToAvsInput(
    request.encounter,
    evaluation,
    request.source,
    clinic,
  );
  const model = buildInjectionAvsModel(avsInput);
  const html = buildInjectionAvsHtml(avsInput, {
    facilityName: clinic.facilityName,
    facilityUnit: clinic.facilityUnit,
    clinicPhone: clinic.clinicPhone,
  });
  const disposition = request.encounter.disposition.kind;
  if (!disposition) {
    return {
      ok: false,
      error: {
        code: "documentation-unavailable",
        message: "An explicit administration or non-administration disposition is required.",
      },
    };
  }

  return {
    ok: true,
    value: {
      source: request.source,
      status: "finalized",
      disposition,
      finalizedBy: {
        userId: request.finalizedByUserId,
        displayName: request.finalizedByDisplayName,
        atUtc: request.finalizedAtUtc,
      },
      acknowledgement: request.acknowledgement,
      clinicalNote,
      patientDocument: {
        kind: disposition === "administered" ? "patient-avs" : "care-handoff",
        locale: "en-US",
        model,
        html,
      },
      provenance: {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        sourceRecordVersion: request.source.sourceRecordVersion,
        evaluationFingerprint: currentFingerprint,
        clinicalReferenceVersion:
          evaluation.output.clinicalReferenceVersion ?? INJECTION_CLINICAL_REFERENCE_VERSION,
        noteTemplateVersion: POWER_APPS_NOTE_TEMPLATE_VERSION,
        avsTemplateVersion: POWER_APPS_AVS_TEMPLATE_VERSION,
      },
    },
  };
};
