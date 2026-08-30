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
} from "../../../src/integrations/power-apps";
import { facilityDate, readApiConfiguration } from "../config";
import {
  DataverseClinicalActionStore,
  DataverseError,
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
  evaluateHttpBodySchema,
  finalizeHttpBodySchema,
  generateFinalAvsHttpBodySchema,
  parseEncounterJson,
  previewHttpBodySchema,
  recordLookupHttpBodySchema,
  storedDraftEnvelopeSchema,
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
  body: {
    schemaVersion: typeof POWER_APPS_INJECTION_SCHEMA_VERSION;
    source: ReturnType<typeof asSourceReference>;
  },
  encounter: InjectionEncounter,
  timeZone: string,
): EvaluateInjectionRequest => ({
  schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
  source: asSourceReference(body.source),
  encounter,
  facilityDate: facilityDate(timeZone),
});

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
  contentType: "text/html",
  fileName: `injection-avs-${bundle.source.actionId}.html`,
  html: bundle.patientDocument.html,
  generatedAt,
  kind: bundle.patientDocument.kind,
  locale: bundle.patientDocument.locale,
});

const replayFinal = (
  record: DataverseClinicalAction,
  idempotencyKey: string,
  correlationId: string,
): HttpResponseInit | null => {
  if (!record.finalJson) return null;
  if (record.idempotencyKey !== idempotencyKey) {
    return apiError(
      409,
      "idempotency-conflict",
      "This clinical action was already finalized with a different idempotency key.",
      correlationId,
    );
  }
  try {
    const stored = JSON.parse(record.finalJson) as Record<string, unknown>;
    return json(200, { ...stored, correlationId }, correlationId, {
      "Idempotency-Key": idempotencyKey,
      "Idempotency-Replayed": "true",
    });
  } catch {
    return apiError(
      503,
      "stored-result-invalid",
      "The stored finalization result could not be read.",
      correlationId,
    );
  }
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
    const source = {
      ...draft.data.source,
      actionId: parsed.data.injectionId,
      sourceRecordVersion: record.etag,
    };
    const internal = internalEvaluationRequest(
      { schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, source },
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

  const store = new DataverseClinicalActionStore(access.config.dataverse);
  try {
    let record = await store.load(parsed.data.injectionId);
    if (store.isFinal(record)) {
      return (
        replayFinal(record, idempotencyKey, correlationId) ??
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
    const encounter = structuredClone(encounterResult.data);
    const finalizedAt = new Date().toISOString();
    const source = {
      ...draft.data.source,
      actionId: parsed.data.injectionId,
      sourceRecordVersion: record.etag,
    };
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
    const acknowledgement: CheckInAcknowledgement =
      parsed.data.confirmation.acknowledgementKind === "manual"
        ? {
            kind: "manual",
            acknowledgedAtUtc: finalizedAt,
            acknowledgedByUserId: access.principal.userId,
            acknowledgedByDisplayName: access.principal.displayName,
            reason: parsed.data.confirmation.manualReason?.trim() ?? "",
            source: parsed.data.confirmation.manualSource?.trim() ?? "",
          }
        : {
            kind: "tebra",
            acknowledgedAtUtc: finalizedAt,
            acknowledgedByUserId: access.principal.userId,
            acknowledgedByDisplayName: access.principal.displayName,
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
    const responseBody = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      injectionId: parsed.data.injectionId,
      status: "finalized",
      disposition: prepared.value.disposition,
      evaluation: evaluation.evaluation,
      evaluationFingerprint: prepared.value.provenance.evaluationFingerprint,
      finalizedAt,
      attestation: {
        staff: access.principal.displayName,
        subject: access.principal.userId,
        timestamp: finalizedAt,
        statementVersion: POWER_APPS_ATTESTATION_STATEMENT_VERSION,
        acknowledgementKind: parsed.data.confirmation.acknowledgementKind,
        ...(parsed.data.confirmation.manualReason
          ? { manualReason: parsed.data.confirmation.manualReason }
          : {}),
        ...(parsed.data.confirmation.manualSource
          ? { manualSource: parsed.data.confirmation.manualSource }
          : {}),
      },
      documents: documentsFromBundle(prepared.value),
      avs: avsArtifact(prepared.value, finalizedAt),
      clinicalReferenceVersion: prepared.value.provenance.clinicalReferenceVersion,
      correlationId,
    };
    await store.finalize(record, idempotencyKey, JSON.stringify(responseBody));
    return json(200, responseBody, correlationId, {
      "Idempotency-Key": idempotencyKey,
      "Idempotency-Replayed": "false",
    });
  } catch (error) {
    if (error instanceof DataverseError && error.code === "concurrency-conflict") {
      try {
        const replay = await store.load(parsed.data.injectionId);
        if (store.isFinal(replay)) {
          return (
            replayFinal(replay, idempotencyKey, correlationId) ??
            apiError(409, error.code, error.message, correlationId)
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

const storedFinalResponse = async (
  request: HttpRequest,
  injectionId: string,
  correlationId: string,
): Promise<
  | { ok: true; value: Record<string, unknown> }
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
    const record = await new DataverseClinicalActionStore(access.config.dataverse).load(
      injectionId,
    );
    if (!record.finalJson) {
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
    return { ok: true, value: JSON.parse(record.finalJson) as Record<string, unknown> };
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
    const stored = await storedFinalResponse(
      request,
      lookup.data.injectionId,
      correlationId,
    );
    if (!stored.ok) return stored.response;
    return json(
      200,
      {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        injectionId: lookup.data.injectionId,
        mode: "final",
        documents: stored.value.documents,
        source: stored.value.source,
        evaluation: stored.value.evaluation,
        generatedAt: stored.value.finalizedAt,
        clinicalReferenceVersion: stored.value.clinicalReferenceVersion,
        correlationId,
      },
      correlationId,
    );
  }

  const access = auth(request, correlationId);
  if (!access.ok) return access.response;
  const preview = previewHttpBodySchema.safeParse(raw);
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
    preview.data,
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
    const stored = await storedFinalResponse(
      request,
      lookup.data.injectionId,
      correlationId,
    );
    if (!stored.ok) return stored.response;
    return json(
      200,
      {
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        injectionId: lookup.data.injectionId,
        mode: "final",
        source: stored.value.source,
        evaluation: stored.value.evaluation,
        avs: stored.value.avs,
        clinicalReferenceVersion: stored.value.clinicalReferenceVersion,
        correlationId,
      },
      correlationId,
    );
  }

  const access = auth(request, correlationId);
  if (!access.ok) return access.response;
  const preview = previewHttpBodySchema.safeParse(raw);
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
    preview.data,
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
  if (internal.encounter.disposition.kind === "administered") {
    input.dispositionKind = "";
  }
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
