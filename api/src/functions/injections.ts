import { createHash } from "node:crypto";

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";

import {
  InjectionEngine,
  injectionAdministrationReviewFingerprint,
  type InjectionEncounter,
} from "../../../src/domain/injection";
import { INJECTION_MEDICATIONS } from "../../../src/domain/injection-catalog";
import {
  buildInjectionAvsHtml,
} from "../../../src/domain/injection-avs-render";
import { buildInjectionAvsModel } from "../../../src/domain/injection-avs-content";
import { formatInjectionDocumentation } from "../../../src/documentation/injection";
import { injectionEncounterToDocumentationInput } from "../../../src/documentation/adapters/injection-from-encounter";
import {
  POWER_APPS_INJECTION_SCHEMA_VERSION,
  POWER_APPS_ATTESTATION_STATEMENT_VERSION,
  evaluateInjectionForPowerApps,
  injectionEncounterToAvsInput,
  prepareInjectionFinalization,
  type CheckInAcknowledgement,
  type EvaluateInjectionRequest,
  type InjectionDocumentBundle,
  type InjectionSourceReference,
} from "../../../src/integrations/power-apps";
import { facilityDate, readApiConfiguration } from "../config";
import {
  DataverseClinicalActionStore,
  DataverseError,
  type DataverseBoardAcknowledgment,
  type DataverseClinicalAction,
} from "../dataverse";
import { authenticatedPrincipal, type AuthenticatedPrincipal } from "../http/auth";
import {
  apiError,
  correlationIdFor,
  json,
  zodDetails,
} from "../http/responses";
import {
  asSourceReference,
  avsPreviewHttpBodySchema,
  documentPreviewHttpBodySchema,
  evaluateHttpBodySchema,
  finalizeHttpBodySchema,
  generateFinalAvsHttpBodySchema,
  orderContextSchema,
  parseEncounterJson,
  patientContextSchema,
  recordLookupHttpBodySchema,
  storedDraftEnvelopeSchema,
  storedFinalEnvelopeSchema,
  utcInstant,
  type StoredFinalEnvelope,
} from "../http/schema";

const effectiveCorrelationId = (request: HttpRequest): string =>
  correlationIdFor(request.headers.get("x-correlation-id"));

const bodyJson = async (request: HttpRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

const auth = (
  request: HttpRequest,
  correlationId: string,
  options: { requireDataverse?: boolean } = {},
):
  | {
      ok: true;
      config: ReturnType<typeof readApiConfiguration>;
      principal: AuthenticatedPrincipal;
    }
  | { ok: false; response: HttpResponseInit } => {
  try {
    const config = readApiConfiguration(options);
    const principal = authenticatedPrincipal(request, config.requiredRole);
    if (!principal) {
      const hasPrincipal = Boolean(request.headers.get("x-ms-client-principal"));
      return {
        ok: false,
        response: apiError(
          hasPrincipal ? 403 : 401,
          hasPrincipal ? "forbidden" : "authentication-required",
          hasPrincipal
            ? "The authenticated user lacks the required injection role or scope."
            : "Entra authentication is required.",
          correlationId,
        ),
      };
    }
    // Authorization boundary: any principal holding the single configured
    // ENTRA_REQUIRED_ROLE is treated as an authorized injection staff member
    // for every clinical action this deployment serves. This build is
    // deliberately scoped to one facility (CLINIC_PROVIDER_REGISTER is
    // pinned to "san-bernardino-v1") behind a tightly controlled Entra app
    // role, rather than adding unproven per-record/per-facility
    // authorization. Expanding to multiple facilities or a broader staff
    // population is an explicit blocker requiring real record/facility
    // authorization first — see api/README.md "Authorization scope".
    return { ok: true, config, principal };
  } catch (error) {
    return {
      ok: false,
      response: apiError(
        503,
        "service-not-configured",
        error instanceof Error ? error.message : "The service is not configured.",
        correlationId,
      ),
    };
  }
};

const internalEvaluationRequest = (
  source: InjectionSourceReference,
  encounter: InjectionEncounter,
  timeZone: string,
): EvaluateInjectionRequest => ({
  schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
  source,
  encounter,
  facilityDate: facilityDate(timeZone),
});

/**
 * Binds Draft JSON's claimed check-in/patient/order identity to the
 * board/integration-owned protected Dataverse columns. Draft JSON is still
 * client-originated even after a reload — reloading it does not make it
 * authoritative — so the protected row columns, not the draft, are the
 * source of truth, and any disagreement fails closed.
 */
const resolveProtectedSource = (
  draftSource: {
    actionId: string;
    checkInId: string;
    patientId: string;
    orderId: string;
    patientRecordNumber?: string;
  },
  record: DataverseClinicalAction,
  injectionId: string,
  protectedPatientRecordNumber: string,
  correlationId: string,
):
  | { ok: true; source: InjectionSourceReference }
  | { ok: false; response: HttpResponseInit } => {
  if (
    draftSource.checkInId !== record.checkInId ||
    draftSource.patientId !== record.patientId ||
    draftSource.orderId !== record.orderId
  ) {
    return {
      ok: false,
      response: apiError(
        422,
        "source-identity-mismatch",
        "The saved check-in, patient, or order identifier does not match the protected clinical-action record.",
        correlationId,
      ),
    };
  }
  return {
    ok: true,
    source: {
      ...draftSource,
      checkInId: record.checkInId,
      patientId: record.patientId,
      orderId: record.orderId,
      actionId: injectionId,
      // The protected patient-context snapshot's MRN, never the Draft
      // JSON-supplied value — see resolveProtectedPatientContext.
      patientRecordNumber: protectedPatientRecordNumber,
      sourceRecordVersion: record.etag,
    },
  };
};

/**
 * Resolves the protected patient-identity snapshot (name/DOB/MRN) that must
 * back every final clinical note and AVS. DATAVERSE_PATIENT_CONTEXT_COLUMN
 * is a required configuration field (see api/src/config.ts), so this always
 * runs; it fails closed on a missing, malformed, or incomplete snapshot
 * rather than falling back to Canvas-supplied Draft JSON demographics.
 */
const resolveProtectedPatientContext = (
  record: DataverseClinicalAction,
  correlationId: string,
):
  | { ok: true; value: { name: string; dob: string; mrn: string } }
  | { ok: false; response: HttpResponseInit } => {
  let raw: unknown;
  try {
    raw = JSON.parse(record.patientContextJson);
  } catch {
    return {
      ok: false,
      response: apiError(
        422,
        "patient-context-invalid",
        "The protected patient-context snapshot could not be read.",
        correlationId,
      ),
    };
  }
  const parsed = patientContextSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        422,
        "patient-context-invalid",
        "The protected patient-context snapshot does not match the expected schema.",
        correlationId,
        zodDetails(parsed.error),
      ),
    };
  }
  return { ok: true, value: parsed.data };
};

/**
 * Checks the encounter against the order-context snapshot when the tenant
 * configures DATAVERSE_ORDER_CONTEXT_COLUMN. Whether the check runs at all
 * is a documented acceptance-gate limitation (`orderContextColumnConfigured`
 * false skips it entirely); once configured, a row's blank or malformed
 * order context is a failure, never treated the same as "not configured."
 */
const orderContextConflict = (
  record: DataverseClinicalAction,
  orderContextColumnConfigured: boolean,
  encounter: InjectionEncounter,
  correlationId: string,
): HttpResponseInit | null => {
  if (!orderContextColumnConfigured) return null;
  if (!record.orderContextJson.trim()) {
    return apiError(
      422,
      "order-context-invalid",
      "The linked order context is required but was not found on the clinical action.",
      correlationId,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(record.orderContextJson);
  } catch {
    return apiError(
      422,
      "order-context-invalid",
      "The linked order context could not be read.",
      correlationId,
    );
  }
  const parsed = orderContextSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      422,
      "order-context-invalid",
      "The linked order context does not match the expected schema.",
      correlationId,
      zodDetails(parsed.error),
    );
  }
  const mismatches: string[] = [];
  if (parsed.data.medicationKey !== encounter.medicationKey) mismatches.push("medication");
  if (parsed.data.dose.trim() !== encounter.dose.trim()) mismatches.push("dose");
  if (parsed.data.orderingProvider.trim() !== encounter.orderingProvider.trim()) {
    mismatches.push("orderingProvider");
  }
  if (parsed.data.route.trim() !== encounter.route.trim()) mismatches.push("route");
  if (parsed.data.intervalKey !== encounter.intervalKey) mismatches.push("interval");
  if (mismatches.length) {
    return apiError(
      422,
      "order-context-mismatch",
      `The encounter does not match the linked order (${mismatches.join(", ")}).`,
      correlationId,
    );
  }
  return null;
};

/**
 * Validates real Tebra board-acknowledgement provenance against the
 * protected record before it can be attached to a finalized envelope.
 * Partial (dataverse.ts's boardAcknowledgmentPartial), malformed, future-
 * dated, or check-in-mismatched provenance is rejected outright rather than
 * silently downgraded to "no board provenance" — a tenant that has wired
 * these columns is asserting they are meaningful, so broken data on a row
 * is a fail-closed condition.
 */
const validateBoardAcknowledgment = (
  record: DataverseClinicalAction,
  correlationId: string,
):
  | { ok: true; value: DataverseBoardAcknowledgment | null }
  | { ok: false; response: HttpResponseInit } => {
  if (record.boardAcknowledgmentPartial) {
    return {
      ok: false,
      response: apiError(
        422,
        "acknowledgement-provenance-invalid",
        "The board acknowledgement provenance on this clinical action is incomplete.",
        correlationId,
      ),
    };
  }
  const board = record.boardAcknowledgment;
  if (!board) return { ok: true, value: null };
  if (!utcInstant.safeParse(board.acknowledgedAtUtc).success) {
    return {
      ok: false,
      response: apiError(
        422,
        "acknowledgement-provenance-invalid",
        "The board acknowledgement timestamp is not a valid UTC instant.",
        correlationId,
      ),
    };
  }
  if (new Date(board.acknowledgedAtUtc).getTime() > Date.now()) {
    return {
      ok: false,
      response: apiError(
        422,
        "acknowledgement-provenance-invalid",
        "The board acknowledgement timestamp is in the future.",
        correlationId,
      ),
    };
  }
  if (board.checkInId !== record.checkInId) {
    return {
      ok: false,
      response: apiError(
        422,
        "acknowledgement-provenance-invalid",
        "The board acknowledgement check-in does not match the protected clinical-action record.",
        correlationId,
      ),
    };
  }
  return { ok: true, value: board };
};

const publicEvaluation = (
  request: EvaluateInjectionRequest,
): {
  evaluation: Record<string, unknown>;
  evaluationFingerprint: string;
  clinicalReferenceVersion: string;
} => {
  const facade = evaluateInjectionForPowerApps(request);
  if (!facade.ok) throw new Error(facade.error.message);
  const raw = InjectionEngine.evaluate(request.encounter, {
    today: request.facilityDate,
  });
  const medication = request.encounter.medicationKey
    ? INJECTION_MEDICATIONS[request.encounter.medicationKey]
    : null;
  return {
    evaluation: {
      workflow: "injection",
      readiness: raw.readiness,
      stops: raw.stops,
      warnings: raw.warnings,
      recommendations: raw.recommendations,
      calculatedDates: raw.calculatedDates,
      output: {
        medication: medication
          ? {
              key: medication.key,
              name: medication.name || medication.label,
              genericName: medication.generic,
            }
          : undefined,
        timing: raw.output.timing,
        lateDoseWarning: raw.output.lateDoseWarning,
        allowedRoutes: raw.output.allowedRoutes,
        allowedSites: raw.output.allowedSites,
        recommendedSite: raw.output.recommendedSite,
        repeatsPreviousSite: raw.output.repeatsPreviousSite,
        administrationDocumented: raw.output.administrationDocumented,
        canFinalize: raw.output.canFinalize && raw.stops.length === 0,
        recordStatus: raw.output.recordStatus,
        initiationProtocol: raw.output.initiationProtocol,
        phase: raw.output.phase,
        requiredVerifications: raw.output.requiredVerifications,
        requirements: Object.entries(raw.output.requirements)
          .map(([field, requirement]) => ({ field, ...requirement }))
          .sort((left, right) => left.field.localeCompare(right.field)),
        guidance: raw.output.guidance,
        needle: raw.output.needle,
        expectedNextDoseDate: raw.output.expectedNextDoseDate,
      },
    },
    evaluationFingerprint: facade.value.evaluationFingerprint,
    clinicalReferenceVersion:
      facade.value.clinicalReferenceVersion ?? "unversioned-custom-medication",
  };
};

const connectorErrorStatus = (code: string): number => {
  if (code === "stale-evaluation") return 409;
  if (
    code === "clinical-stop" ||
    code === "documentation-unavailable" ||
    code === "administration-review-required" ||
    code === "locale-not-approved"
  ) {
    return 422;
  }
  return 400;
};

const documentsFromBundle = (bundle: InjectionDocumentBundle) => ({
  note: bundle.clinicalNote,
});

const avsArtifact = (
  bundle: InjectionDocumentBundle,
  generatedAt: string,
) => ({
  documentStatus: bundle.patientDocument.model.documentStatus,
  contentType: "text/html" as const,
  fileName: `injection-avs-${bundle.source.actionId}.html`,
  html: bundle.patientDocument.html,
  generatedAt,
  kind: bundle.patientDocument.kind,
  locale: bundle.patientDocument.locale,
});

/**
 * Binds a finalize attempt to its complete request content: schema version,
 * injection ID, the evaluated ETag, the evaluation fingerprint, the
 * normalized confirmation/acknowledgement data, and the authenticated Entra
 * subject. Two attempts sharing an Idempotency-Key must produce the same
 * fingerprint to replay; any difference — a different ETag, a different
 * evaluation fingerprint, different acknowledgement data, or a different
 * authenticated principal reusing the key — is a conflict, not a replay.
 */
const computeRequestFingerprint = (input: {
  schemaVersion: string;
  injectionId: string;
  sourceRecordVersion: string;
  evaluationFingerprint: string;
  acknowledgementKind: string;
  manualReason: string;
  manualSource: string;
  finalizedByUserId: string;
}): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        input.schemaVersion,
        input.injectionId.toLowerCase(),
        input.sourceRecordVersion,
        input.evaluationFingerprint,
        input.acknowledgementKind,
        input.manualReason,
        input.manualSource,
        input.finalizedByUserId,
      ]),
    )
    .digest("hex");

const publicFinalizeFields = (
  envelope: StoredFinalEnvelope,
  correlationId: string,
): Record<string, unknown> => ({
  schemaVersion: envelope.schemaVersion,
  source: envelope.source,
  injectionId: envelope.injectionId,
  status: envelope.status,
  disposition: envelope.disposition,
  evaluation: envelope.evaluation,
  evaluationFingerprint: envelope.evaluationFingerprint,
  finalizedAt: envelope.finalizedAt,
  attestation: envelope.attestation,
  documents: envelope.documents,
  avs: envelope.avs,
  clinicalReferenceVersion: envelope.clinicalReferenceVersion,
  correlationId,
});

type StoredFinalParseResult =
  | { ok: true; envelope: StoredFinalEnvelope }
  | { ok: false; response: (correlationId: string) => HttpResponseInit };

/**
 * Validates persisted Final JSON against the strict stored-final envelope
 * schema before anything reads it. A malformed or schema-incomplete record
 * is rejected outright — its raw HTML/note content is never echoed to a
 * caller unvalidated.
 */
const parseStoredFinalEnvelope = (finalJson: string): StoredFinalParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(finalJson);
  } catch {
    return {
      ok: false,
      response: (correlationId) =>
        apiError(503, "stored-result-invalid", "The stored finalization result could not be read.", correlationId),
    };
  }
  const parsed = storedFinalEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: (correlationId) =>
        apiError(
          503,
          "stored-result-invalid",
          "The stored finalization result does not match the expected schema.",
          correlationId,
        ),
    };
  }
  return { ok: true, envelope: parsed.data };
};

const identityMismatchResponse = (correlationId: string): HttpResponseInit =>
  apiError(
    503,
    "stored-result-invalid",
    "The stored finalization result does not match the requested clinical action.",
    correlationId,
  );

/**
 * The single stored-final validation routine shared by idempotent finalize
 * replay, final clinical-note retrieval, and final AVS retrieval alike.
 * Parses and schema-validates the persisted envelope, then binds every
 * identity/linkage field it carries back to the protected Dataverse
 * record — not just the requested action ID and the envelope's own
 * injectionId/source.actionId, but source.checkInId/patientId/orderId
 * against the protected record's checkInId/patientId/orderId, and the
 * envelope's idempotencyKey against the protected Dataverse
 * idempotency-key column. Any mismatch, malformed envelope, or
 * stale/corrupted linkage fails closed and returns no stored artifact.
 */
const validateStoredFinal = (
  record: DataverseClinicalAction,
  injectionId: string,
  correlationId: string,
): { ok: true; envelope: StoredFinalEnvelope } | { ok: false; response: HttpResponseInit } => {
  const parsed = parseStoredFinalEnvelope(record.finalJson);
  if (!parsed.ok) return { ok: false, response: parsed.response(correlationId) };
  const { envelope } = parsed;
  if (
    envelope.injectionId.toLowerCase() !== injectionId.toLowerCase() ||
    envelope.source.actionId.toLowerCase() !== injectionId.toLowerCase() ||
    envelope.source.checkInId !== record.checkInId ||
    envelope.source.patientId !== record.patientId ||
    envelope.source.orderId !== record.orderId ||
    envelope.idempotencyKey !== record.idempotencyKey
  ) {
    return { ok: false, response: identityMismatchResponse(correlationId) };
  }
  return { ok: true, envelope };
};

const replayFinal = (
  record: DataverseClinicalAction,
  injectionId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  correlationId: string,
): HttpResponseInit | null => {
  if (!record.finalJson) return null;
  const validated = validateStoredFinal(record, injectionId, correlationId);
  if (!validated.ok) return validated.response;
  const { envelope } = validated;
  if (envelope.idempotencyKey !== idempotencyKey) {
    return apiError(
      409,
      "idempotency-conflict",
      "This clinical action was already finalized with a different idempotency key.",
      correlationId,
    );
  }
  if (envelope.requestFingerprint !== requestFingerprint) {
    return apiError(
      409,
      "idempotency-conflict",
      "This idempotency key was already used to finalize a different request for this clinical action.",
      correlationId,
    );
  }
  return json(200, publicFinalizeFields(envelope, correlationId), correlationId, {
    "Idempotency-Key": idempotencyKey,
    "Idempotency-Replayed": "true",
  });
};

export const evaluateHandler = async (
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> => {
  const correlationId = effectiveCorrelationId(request);
  const access = auth(request, correlationId, { requireDataverse: true });
  if (!access.ok) return access.response;
  if (!access.config.dataverse) {
    return apiError(503, "service-not-configured", "Dataverse is required.", correlationId);
  }
  const parsed = evaluateHttpBodySchema.safeParse(await bodyJson(request));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid-request",
      "The evaluation request is invalid.",
      correlationId,
      zodDetails(parsed.error),
    );
  }
  const store = new DataverseClinicalActionStore(access.config.dataverse);
  try {
    const record = await store.load(parsed.data.injectionId);
    if (!store.isDraft(record)) {
      return apiError(
        409,
        "invalid-status",
        "Only a draft clinical action can be evaluated.",
        correlationId,
      );
    }
    let storedDraft: unknown;
    try {
      storedDraft = JSON.parse(record.draftJson);
    } catch {
      return apiError(
        422,
        "stored-draft-invalid",
        "The Dataverse draft JSON is malformed.",
        correlationId,
      );
    }
    const draft = storedDraftEnvelopeSchema.safeParse(storedDraft);
    if (!draft.success) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The Dataverse draft does not match the injection schema.",
        correlationId,
        zodDetails(draft.error),
      );
    }
    if (
      draft.data.source.actionId.toLowerCase() !==
      parsed.data.injectionId.toLowerCase()
    ) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The saved action identifier does not match the Dataverse row.",
        correlationId,
      );
    }
    const patientContext = resolveProtectedPatientContext(record, correlationId);
    if (!patientContext.ok) return patientContext.response;
    const resolvedSource = resolveProtectedSource(
      draft.data.source,
      record,
      parsed.data.injectionId,
      patientContext.value.mrn,
      correlationId,
    );
    if (!resolvedSource.ok) return resolvedSource.response;
    const encounter = parseEncounterJson(draft.data.encounterJson);
    if (!encounter.success) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The stored encounter JSON is invalid.",
        correlationId,
        zodDetails(encounter.error),
      );
    }
    // The protected patient-identity snapshot is authoritative over
    // Canvas-supplied Draft JSON demographics for every downstream
    // evaluation, note, and AVS surface.
    encounter.data.patient = { name: patientContext.value.name, dob: patientContext.value.dob };
    const orderConflict = orderContextConflict(
      record,
      Boolean(access.config.dataverse.orderContextColumn),
      encounter.data,
      correlationId,
    );
    if (orderConflict) return orderConflict;
    const internal = internalEvaluationRequest(
      resolvedSource.source,
      encounter.data,
      access.config.clinic.timeZone,
    );
    const output = publicEvaluation(internal);
    return json(
      200,
      {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: internal.source,
        ...output,
        evaluatedAt: new Date().toISOString(),
        sourceRecordVersion: internal.source.sourceRecordVersion,
        correlationId,
      },
      correlationId,
    );
  } catch (error) {
    if (error instanceof DataverseError) {
      return apiError(error.status, error.code, error.message, correlationId);
    }
    return apiError(
      500,
      "evaluation-failed",
      "Injection evaluation failed without changing the clinical action.",
      correlationId,
    );
  }
};

export const finalizeHandler = async (
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> => {
  const correlationId = effectiveCorrelationId(request);
  const access = auth(request, correlationId, { requireDataverse: true });
  if (!access.ok) return access.response;
  if (!access.config.dataverse) {
    return apiError(503, "service-not-configured", "Dataverse is required.", correlationId);
  }
  const parsed = finalizeHttpBodySchema.safeParse(await bodyJson(request));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid-request",
      "The finalization request is invalid.",
      correlationId,
      zodDetails(parsed.error),
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    return apiError(
      400,
      "invalid-idempotency-key",
      "Idempotency-Key must contain 16 to 200 characters.",
      correlationId,
    );
  }
  const normalizedManualReason = parsed.data.confirmation.manualReason?.trim() ?? "";
  const normalizedManualSource = parsed.data.confirmation.manualSource?.trim() ?? "";
  const requestFingerprint = computeRequestFingerprint({
    schemaVersion: parsed.data.schemaVersion,
    injectionId: parsed.data.injectionId,
    sourceRecordVersion: parsed.data.sourceRecordVersion,
    evaluationFingerprint: parsed.data.evaluationFingerprint,
    acknowledgementKind: parsed.data.confirmation.acknowledgementKind,
    manualReason: normalizedManualReason,
    manualSource: normalizedManualSource,
    finalizedByUserId: access.principal.userId,
  });

  const store = new DataverseClinicalActionStore(access.config.dataverse);
  try {
    let record = await store.load(parsed.data.injectionId);
    if (store.isFinal(record)) {
      return (
        replayFinal(record, parsed.data.injectionId, idempotencyKey, requestFingerprint, correlationId) ??
        apiError(503, "stored-result-invalid", "Finalized data is missing.", correlationId)
      );
    }
    if (!store.isDraft(record)) {
      return apiError(
        409,
        "invalid-status",
        "Only a draft clinical action can be finalized.",
        correlationId,
      );
    }
    // A record whose status reads Draft but still carries a residual Final
    // JSON payload or persisted idempotency key was finalized and then reset
    // back to draft directly (e.g. a status-column edit), not through an
    // explicit, audited reset/new-action process. Finalizing over it would
    // silently overwrite the prior finalized artifact, so reject it before
    // any further processing or PATCH.
    if (store.hasResidualFinalArtifacts(record)) {
      return apiError(
        409,
        "stale-final-artifact",
        "This clinical action still carries a prior finalization artifact and cannot be finalized directly from draft status. Use the documented reset/new-action process first.",
        correlationId,
      );
    }
    if (
      parsed.data.confirmation.acknowledgementKind === "tebra" &&
      !record.tebraAcknowledged
    ) {
      return apiError(
        422,
        "check-in-acknowledgement-required",
        "The linked check-in is not acknowledged. Use the documented manual path if appropriate.",
        correlationId,
      );
    }
    if (record.etag !== parsed.data.sourceRecordVersion) {
      return apiError(
        409,
        "source-version-conflict",
        "The clinical action changed after evaluation. Refresh and review it again.",
        correlationId,
      );
    }

    let storedDraft: unknown;
    try {
      storedDraft = JSON.parse(record.draftJson);
    } catch {
      return apiError(
        422,
        "stored-draft-invalid",
        "The Dataverse draft JSON is malformed.",
        correlationId,
      );
    }
    const draft = storedDraftEnvelopeSchema.safeParse(storedDraft);
    if (!draft.success) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The Dataverse draft does not match the injection schema.",
        correlationId,
        zodDetails(draft.error),
      );
    }
    if (
      draft.data.source.actionId.toLowerCase() !==
      parsed.data.injectionId.toLowerCase()
    ) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The saved action identifier does not match the Dataverse row.",
        correlationId,
      );
    }
    const patientContext = resolveProtectedPatientContext(record, correlationId);
    if (!patientContext.ok) return patientContext.response;
    const resolvedSource = resolveProtectedSource(
      draft.data.source,
      record,
      parsed.data.injectionId,
      patientContext.value.mrn,
      correlationId,
    );
    if (!resolvedSource.ok) return resolvedSource.response;
    const encounterResult = parseEncounterJson(draft.data.encounterJson);
    if (!encounterResult.success) {
      return apiError(
        422,
        "stored-draft-invalid",
        "The stored encounter JSON is invalid.",
        correlationId,
        zodDetails(encounterResult.error),
      );
    }
    // The protected patient-identity snapshot is authoritative over
    // Canvas-supplied Draft JSON demographics for the final clinical note
    // and AVS. Applied before structuredClone so the server-stamped final
    // encounter carries it too.
    encounterResult.data.patient = {
      name: patientContext.value.name,
      dob: patientContext.value.dob,
    };
    const orderConflict = orderContextConflict(
      record,
      Boolean(access.config.dataverse.orderContextColumn),
      encounterResult.data,
      correlationId,
    );
    if (orderConflict) return orderConflict;
    const encounter = structuredClone(encounterResult.data);
    const finalizedAt = new Date().toISOString();
    const source = resolvedSource.source;
    const facilityDateAtFinalization = facilityDate(
      access.config.clinic.timeZone,
    );
    const authoritativeEvaluation = evaluateInjectionForPowerApps({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      encounter,
      facilityDate: facilityDateAtFinalization,
    });
    if (!authoritativeEvaluation.ok) {
      return apiError(
        422,
        authoritativeEvaluation.error.code,
        authoritativeEvaluation.error.message,
        correlationId,
      );
    }
    if (
      authoritativeEvaluation.value.evaluationFingerprint !==
      parsed.data.evaluationFingerprint
    ) {
      return apiError(
        409,
        "stale-evaluation",
        "The injection record changed after review. Re-evaluate before finalizing.",
        correlationId,
        {
          currentEvaluationFingerprint:
            authoritativeEvaluation.value.evaluationFingerprint,
        },
      );
    }

    // The final review attribution is server-owned. Validate the caller's
    // fingerprint against the untouched authoritative draft first, then bind
    // the finalized bundle to the server-stamped encounter fingerprint.
    if (encounter.disposition.kind === "administered") {
      encounter.disposition = {
        ...encounter.disposition,
        reviewedBy: access.principal.displayName,
        reviewedAt: finalizedAt,
        reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
      };
    }
    let validatedBoardAcknowledgment: DataverseBoardAcknowledgment | null = null;
    if (parsed.data.confirmation.acknowledgementKind === "tebra") {
      const boardCheck = validateBoardAcknowledgment(record, correlationId);
      if (!boardCheck.ok) return boardCheck.response;
      validatedBoardAcknowledgment = boardCheck.value;
    }
    const acknowledgement: CheckInAcknowledgement =
      parsed.data.confirmation.acknowledgementKind === "manual"
        ? {
            kind: "manual",
            acknowledgedAtUtc: finalizedAt,
            acknowledgedByUserId: access.principal.userId,
            acknowledgedByDisplayName: access.principal.displayName,
            reason: normalizedManualReason,
            source: normalizedManualSource,
          }
        : {
            kind: "tebra",
            acknowledgedAtUtc: finalizedAt,
            acknowledgedByUserId: access.principal.userId,
            acknowledgedByDisplayName: access.principal.displayName,
            // Real board-sourced provenance when the tenant has configured
            // the protected acknowledgement columns and the row's provenance
            // validated cleanly; otherwise this stays absent rather than
            // inventing a source/time/identity the check-in board never
            // actually supplied. validateBoardAcknowledgment already
            // rejected partial, malformed, future-dated, or check-in-
            // mismatched provenance above.
            ...(validatedBoardAcknowledgment
              ? {
                  boardSource: validatedBoardAcknowledgment.source,
                  boardAcknowledgedAtUtc: validatedBoardAcknowledgment.acknowledgedAtUtc,
                  boardAcknowledgedBy: validatedBoardAcknowledgment.acknowledgedBy,
                  boardCheckInId: validatedBoardAcknowledgment.checkInId,
                }
              : {}),
          };
    const internal: EvaluateInjectionRequest = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      encounter,
      facilityDate: facilityDateAtFinalization,
    };
    const evaluation = publicEvaluation(internal);
    const prepared = prepareInjectionFinalization(
      {
        ...internal,
        acknowledgement,
        expectedEvaluationFingerprint: evaluation.evaluationFingerprint,
        idempotencyKey,
        finalizedByUserId: access.principal.userId,
        finalizedByDisplayName: access.principal.displayName,
        finalizedAtUtc: finalizedAt,
      },
      access.config.clinic,
    );
    if (!prepared.ok) {
      return apiError(
        connectorErrorStatus(prepared.error.code),
        prepared.error.code,
        prepared.error.message,
        correlationId,
        prepared.error.stops,
      );
    }
    const envelope: StoredFinalEnvelope = storedFinalEnvelopeSchema.parse({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      injectionId: parsed.data.injectionId,
      status: "finalized",
      disposition: prepared.value.disposition,
      idempotencyKey,
      requestFingerprint,
      // The complete server-stamped final encounter (including the
      // administration review attribution above), persisted for audit
      // reconstruction. Never part of the public response contract.
      finalEncounter: encounter,
      evaluation: evaluation.evaluation,
      evaluationFingerprint: prepared.value.provenance.evaluationFingerprint,
      finalizedAt,
      attestation: {
        staff: access.principal.displayName,
        subject: access.principal.userId,
        timestamp: finalizedAt,
        statementVersion: POWER_APPS_ATTESTATION_STATEMENT_VERSION,
        acknowledgementKind: parsed.data.confirmation.acknowledgementKind,
        ...(normalizedManualReason ? { manualReason: normalizedManualReason } : {}),
        ...(normalizedManualSource ? { manualSource: normalizedManualSource } : {}),
      },
      acknowledgement,
      documents: documentsFromBundle(prepared.value),
      avs: avsArtifact(prepared.value, finalizedAt),
      clinicalReferenceVersion: prepared.value.provenance.clinicalReferenceVersion,
      noteTemplateVersion: prepared.value.provenance.noteTemplateVersion,
      avsTemplateVersion: prepared.value.provenance.avsTemplateVersion,
    });
    await store.finalize(record, idempotencyKey, JSON.stringify(envelope));
    return json(200, publicFinalizeFields(envelope, correlationId), correlationId, {
      "Idempotency-Key": idempotencyKey,
      "Idempotency-Replayed": "false",
    });
  } catch (error) {
    if (error instanceof DataverseError && error.code === "concurrency-conflict") {
      try {
        const replay = await store.load(parsed.data.injectionId);
        if (store.isFinal(replay)) {
          return (
            replayFinal(
              replay,
              parsed.data.injectionId,
              idempotencyKey,
              requestFingerprint,
              correlationId,
            ) ?? apiError(409, error.code, error.message, correlationId)
          );
        }
      } catch {
        // Return the original concurrency result without exposing the retry failure.
      }
    }
    if (error instanceof DataverseError) {
      return apiError(error.status, error.code, error.message, correlationId);
    }
    return apiError(
      500,
      "finalization-failed",
      "Injection finalization failed without changing the clinical action.",
      correlationId,
    );
  }
};

const loadValidatedFinalRecord = async (
  request: HttpRequest,
  injectionId: string,
  correlationId: string,
): Promise<
  | { ok: true; envelope: StoredFinalEnvelope }
  | { ok: false; response: HttpResponseInit }
> => {
  const access = auth(request, correlationId, { requireDataverse: true });
  if (!access.ok) return { ok: false, response: access.response };
  if (!access.config.dataverse) {
    return {
      ok: false,
      response: apiError(503, "service-not-configured", "Dataverse is required.", correlationId),
    };
  }
  try {
    const store = new DataverseClinicalActionStore(access.config.dataverse);
    const record = await store.load(injectionId);
    // A row that is not exactly in the configured final status is treated
    // as not-finalized even if stale Final JSON remains on it (e.g. a
    // record reopened back to draft) — status is authoritative, not the
    // mere presence of Final JSON.
    if (!store.isFinal(record)) {
      return {
        ok: false,
        response: apiError(
          409,
          "not-finalized",
          "The injection has not been finalized.",
          correlationId,
        ),
      };
    }
    const validated = validateStoredFinal(record, injectionId, correlationId);
    if (!validated.ok) return { ok: false, response: validated.response };
    return { ok: true, envelope: validated.envelope };
  } catch (error) {
    if (error instanceof DataverseError) {
      return { ok: false, response: apiError(error.status, error.code, error.message, correlationId) };
    }
    return {
      ok: false,
      response: apiError(503, "stored-result-invalid", "Stored documents could not be read.", correlationId),
    };
  }
};

export const documentsHandler = async (
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> => {
  const correlationId = effectiveCorrelationId(request);
  const raw = await bodyJson(request);
  const lookup = recordLookupHttpBodySchema.safeParse(raw);
  if (lookup.success) {
    const stored = await loadValidatedFinalRecord(request, lookup.data.injectionId, correlationId);
    if (!stored.ok) return stored.response;
    return json(
      200,
      {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        injectionId: lookup.data.injectionId,
        mode: "final",
        documents: stored.envelope.documents,
        source: stored.envelope.source,
        evaluation: stored.envelope.evaluation,
        generatedAt: stored.envelope.finalizedAt,
        clinicalReferenceVersion: stored.envelope.clinicalReferenceVersion,
        correlationId,
      },
      correlationId,
    );
  }

  const access = auth(request, correlationId);
  if (!access.ok) return access.response;
  const preview = documentPreviewHttpBodySchema.safeParse(raw);
  if (!preview.success) {
    return apiError(
      400,
      "invalid-request",
      "Provide either a finalized injection ID or a valid preview encounter.",
      correlationId,
      zodDetails(preview.error),
    );
  }
  const encounter = parseEncounterJson(preview.data.encounterJson);
  if (!encounter.success) {
    return apiError(400, "invalid-encounter", "The encounter JSON is invalid.", correlationId, zodDetails(encounter.error));
  }
  const internal = internalEvaluationRequest(
    asSourceReference(preview.data.source),
    encounter.data,
    access.config.clinic.timeZone,
  );
  const rawEvaluation = InjectionEngine.evaluate(internal.encounter, {
    today: internal.facilityDate,
  });
  const noteInput = injectionEncounterToDocumentationInput(
    internal.encounter,
    rawEvaluation,
  );
  if (!noteInput) {
    return apiError(
      422,
      "documentation-unavailable",
      "Choose and complete a disposition before previewing the clinical note.",
      correlationId,
    );
  }
  const evaluation = publicEvaluation(internal);
  return json(
    200,
    {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: internal.source,
      mode: "preview",
      evaluation: evaluation.evaluation,
      documents: { note: formatInjectionDocumentation(noteInput, rawEvaluation) },
      generatedAt: new Date().toISOString(),
      clinicalReferenceVersion: evaluation.clinicalReferenceVersion,
      correlationId,
    },
    correlationId,
  );
};

export const avsHandler = async (
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> => {
  const correlationId = effectiveCorrelationId(request);
  const raw = await bodyJson(request);
  const lookup = generateFinalAvsHttpBodySchema.safeParse(raw);
  if (lookup.success) {
    const stored = await loadValidatedFinalRecord(request, lookup.data.injectionId, correlationId);
    if (!stored.ok) return stored.response;
    return json(
      200,
      {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        injectionId: lookup.data.injectionId,
        mode: "final",
        source: stored.envelope.source,
        evaluation: stored.envelope.evaluation,
        avs: stored.envelope.avs,
        clinicalReferenceVersion: stored.envelope.clinicalReferenceVersion,
        correlationId,
      },
      correlationId,
    );
  }

  const access = auth(request, correlationId);
  if (!access.ok) return access.response;
  const preview = avsPreviewHttpBodySchema.safeParse(raw);
  if (!preview.success) {
    return apiError(
      400,
      "invalid-request",
      "Provide either a finalized injection ID or a valid AVS preview encounter.",
      correlationId,
      zodDetails(preview.error),
    );
  }
  const encounter = parseEncounterJson(preview.data.encounterJson);
  if (!encounter.success) {
    return apiError(400, "invalid-encounter", "The encounter JSON is invalid.", correlationId, zodDetails(encounter.error));
  }
  const internal = internalEvaluationRequest(
    asSourceReference(preview.data.source),
    encounter.data,
    access.config.clinic.timeZone,
  );
  const rawEvaluation = InjectionEngine.evaluate(internal.encounter, {
    today: internal.facilityDate,
  });
  const input = injectionEncounterToAvsInput(
    internal.encounter,
    rawEvaluation,
    internal.source,
    access.config.clinic,
  );
  // Every preview — administered, held, escalated, or provider-review alike
  // — must be visibly distinguishable from a finalized document. This is
  // independent of dispositionKind, which stays the real clinical
  // disposition so the sheet's body wording remains accurate.
  input.previewMode = true;
  const model = buildInjectionAvsModel(input);
  const generatedAt = new Date().toISOString();
  const evaluation = publicEvaluation(internal);
  return json(
    200,
    {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: internal.source,
      mode: "preview",
      evaluation: evaluation.evaluation,
      avs: {
        documentStatus: model.documentStatus,
        contentType: "text/html",
        fileName: `injection-avs-preview-${internal.source.actionId}.html`,
        html: buildInjectionAvsHtml(input, {
          facilityName: access.config.clinic.facilityName,
          facilityUnit: access.config.clinic.facilityUnit,
          clinicPhone: access.config.clinic.clinicPhone,
        }),
        generatedAt,
      },
      clinicalReferenceVersion: evaluation.clinicalReferenceVersion,
      correlationId,
    },
    correlationId,
  );
};

app.http("EvaluateInjection", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/injections/evaluate",
  handler: evaluateHandler,
});

app.http("FinalizeInjection", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/injections/finalize",
  handler: finalizeHandler,
});

app.http("GetInjectionDocuments", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/injections/documents",
  handler: documentsHandler,
});

app.http("GenerateInjectionAvs", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/injections/avs",
  handler: avsHandler,
});
